import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaveController } from './autosave.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('coalesces rapid updates for the same id into one save with the merged patch', async () => {
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 20,
    save: async (id, patch) => {
      calls.push({ id, patch });
    },
  });

  autosave.update('q1', { prompt: 'a' });
  autosave.update('q1', { maxWordLength: 10 });
  autosave.update('q1', { prompt: 'b' });

  await sleep(60);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { id: 'q1', patch: { prompt: 'b', maxWordLength: 10 } });
});

test('flush sends immediately and cancels the pending debounce timer', async () => {
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 50,
    save: async (id, patch) => {
      calls.push({ id, patch });
    },
  });

  autosave.update('q1', { prompt: 'a' });
  autosave.flush('q1');
  await sleep(5);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { id: 'q1', patch: { prompt: 'a' } });

  // Wait past the original debounce delay to prove no second, stale send fires.
  await sleep(80);
  assert.equal(calls.length, 1);
});

test('switching ids never lets a later id receive an earlier id patch (cross-id race)', async () => {
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 30,
    save: async (id, patch) => {
      calls.push({ id, patch });
    },
  });

  // Simulate: user edits question q1, then quickly switches to q2 before
  // q1's debounce timer would have fired — the editor must flush q1 on
  // switch and start a fresh, independently-keyed debounce for q2.
  autosave.update('q1', { prompt: 'q1 edit' });
  autosave.flush('q1');
  autosave.update('q2', { prompt: 'q2 edit' });

  await sleep(60);

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.find((c) => c.id === 'q1'),
    { id: 'q1', patch: { prompt: 'q1 edit' } },
  );
  assert.deepEqual(
    calls.find((c) => c.id === 'q2'),
    { id: 'q2', patch: { prompt: 'q2 edit' } },
  );
});

test('two sends for the same id are serialized so an earlier one cannot resolve after a later one', async () => {
  const started: string[] = [];
  const finished: string[] = [];
  // Held on an object (rather than a bare `let`) so TS doesn't narrow the
  // type to `null` at the read site below — the only assignment happens
  // inside a nested closure.
  const gate: { releaseFirst: (() => void) | null } = { releaseFirst: null };

  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 10,
    save: async (id, patch) => {
      const label = `${id}:${JSON.stringify(patch)}`;
      started.push(label);
      if (started.length === 1) {
        // Block the first save until the test explicitly releases it, to
        // prove the second flush() call below waits its turn instead of
        // racing ahead and resolving first.
        await new Promise<void>((resolve) => {
          gate.releaseFirst = resolve;
        });
      }
      finished.push(label);
    },
  });

  autosave.update('q1', { count: 1 });
  autosave.flush('q1');
  await sleep(5); // let the first save start and block on releaseFirst

  autosave.update('q1', { count: 2 });
  autosave.flush('q1');
  await sleep(5); // second save is queued but must not have started yet

  assert.deepEqual(started, ['q1:{"count":1}']);
  assert.deepEqual(finished, []);

  gate.releaseFirst?.();
  await sleep(20);

  assert.deepEqual(started, ['q1:{"count":1}', 'q1:{"count":2}']);
  assert.deepEqual(finished, ['q1:{"count":1}', 'q1:{"count":2}']);
});

test('flushAll sends every id with pending changes', async () => {
  const calls: string[] = [];
  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 1000,
    save: async (id) => {
      calls.push(id);
    },
  });

  autosave.update('q1', { a: 1 });
  autosave.update('q2', { b: 2 });
  autosave.flushAll();
  await sleep(5);

  assert.deepEqual(calls.sort(), ['q1', 'q2']);
});

test('onSaving/onSaved/onError callbacks fire around a successful and a failing save', async () => {
  const events: string[] = [];
  const autosave = createAutosaveController<Record<string, unknown>>({
    delayMs: 10,
    save: async (id) => {
      if (id === 'bad') throw new Error('boom');
    },
    onSaving: (id) => events.push(`saving:${id}`),
    onSaved: (id) => events.push(`saved:${id}`),
    onError: (id, error) => events.push(`error:${id}:${(error as Error).message}`),
  });

  autosave.update('good', { a: 1 });
  autosave.update('bad', { a: 1 });
  await sleep(30);

  assert.ok(events.includes('saving:good'));
  assert.ok(events.includes('saved:good'));
  assert.ok(events.includes('saving:bad'));
  assert.ok(events.includes('error:bad:boom'));
});
