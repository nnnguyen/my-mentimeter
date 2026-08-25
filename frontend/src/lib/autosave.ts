export interface AutosaveOptions<TPatch> {
  save: (id: string, patch: TPatch) => Promise<void>;
  delayMs?: number;
  onSaving?: (id: string) => void;
  onSaved?: (id: string) => void;
  onError?: (id: string, error: unknown) => void;
}

export interface AutosaveController<TPatch> {
  update(id: string, patch: TPatch): void;
  flush(id: string): void;
  flushAll(): void;
}

// Framework-free debounced autosave, keyed by id (e.g. question id).
// Each id gets its own debounce timer and its own serialized send queue, so:
// - editing question A then quickly switching to question B never lets B's
//   patch land on A (or vice versa) — timers/pending are per-id.
// - two sends for the SAME id (e.g. a debounced send followed by a flush)
//   are chained through `inFlight`, so an earlier request can never resolve
//   after — and overwrite the effect of — a later one.
export function createAutosaveController<TPatch extends object>(
  options: AutosaveOptions<TPatch>,
): AutosaveController<TPatch> {
  const { save, delayMs = 800, onSaving, onSaved, onError } = options;

  const pending = new Map<string, TPatch>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<string, Promise<void>>();

  function sendNow(id: string): void {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }

    const patch = pending.get(id);
    if (!patch) return;
    pending.delete(id);

    const previous = inFlight.get(id) ?? Promise.resolve();
    const next = previous
      .then(() => {
        onSaving?.(id);
        return save(id, patch);
      })
      .then(() => {
        onSaved?.(id);
      })
      .catch((error) => {
        onError?.(id, error);
      });

    inFlight.set(id, next);
  }

  return {
    update(id, patch) {
      const merged = { ...(pending.get(id) as TPatch | undefined), ...patch };
      pending.set(id, merged);

      const existingTimer = timers.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      timers.set(
        id,
        setTimeout(() => sendNow(id), delayMs),
      );
    },
    flush(id) {
      sendNow(id);
    },
    flushAll() {
      for (const id of Array.from(timers.keys())) {
        sendNow(id);
      }
    },
  };
}
