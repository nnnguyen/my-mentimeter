// Load-test the full audience flow: N simulated users JOIN the /audience
// socket room for a topic AND submit a word-cloud response to the currently
// active question, all around the same time — the "300 người quét cùng 1 QR
// và trả lời cùng lúc" scenario.
//
// Usage:
//   LOAD_TEST_CODE=ABC123 LOAD_TEST_COUNT=300 node scripts/load-test-answer.mjs
//
// Env vars:
//   LOAD_TEST_URL             backend base URL (default http://localhost:3001)
//   LOAD_TEST_CODE            a real topic join code with an ACTIVE question (required)
//   LOAD_TEST_COUNT           total simulated users (default 50)
//   LOAD_TEST_BATCH           how many users to start per batch (default 20)
//   LOAD_TEST_BATCH_DELAY_MS  pause between batches in ms (default 300)
//   LOAD_TEST_SPOOF_IP        "true" (default) sets a unique X-Forwarded-For
//                             per simulated user so the per-IP rate limiter
//                             (20 req/min/IP — see ip-rate-limit.guard.ts)
//                             treats them as distinct devices, matching real
//                             audience members on different networks. Set to
//                             "false" to test as-if all 300 came from this
//                             one machine's IP instead.
//
// Verifies, beyond raw pass/fail counts: that the aggregate word cloud total
// the presenter would see (observed via the `wordcloud:update` socket event)
// ends up matching the number of responses actually accepted — i.e. no lost
// updates under concurrency.

import 'dotenv/config';
import { io } from 'socket.io-client';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.LOAD_TEST_URL ?? 'http://localhost:3001';
const CODE = process.env.LOAD_TEST_CODE;
const TARGET = Number(process.env.LOAD_TEST_COUNT ?? 50);
const BATCH = Number(process.env.LOAD_TEST_BATCH ?? 20);
const BATCH_DELAY_MS = Number(process.env.LOAD_TEST_BATCH_DELAY_MS ?? 300);
const SPOOF_IP = (process.env.LOAD_TEST_SPOOF_IP ?? 'true') !== 'false';

if (!CODE) {
  console.error('Missing LOAD_TEST_CODE. Usage:');
  console.error('  LOAD_TEST_CODE=ABC123 LOAD_TEST_COUNT=300 node scripts/load-test-answer.mjs');
  process.exit(1);
}

const WORD_POOL = [
  'trung thực', 'yêu thương', 'can đảm', 'kỷ luật', 'kiên trì',
  'tự do', 'công bằng', 'khiêm tốn', 'trách nhiệm', 'sáng tạo',
  'tôn trọng', 'biết ơn', 'chính trực', 'kiên nhẫn', 'vị tha',
  'quyết tâm', 'chân thành', 'nhân ái', 'dũng cảm', 'cầu tiến',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeIpFor(index) {
  // 10.0.0.0/8 private range, unique per simulated user.
  return `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255 || 1}`;
}

const results = {
  connectOk: 0,
  connectFailed: 0,
  joinOk: 0,
  joinFailed: 0,
  responseOk: 0,
  responseConflict: 0, // 409 duplicate word from same session
  responseRateLimited: 0, // 429
  responseOtherFailed: 0,
  connectMs: [],
  joinMs: [],
  responseMs: [],
};
const sockets = [];

async function fetchActiveQuestion() {
  const res = await fetch(`${BASE_URL}/api/public/topics/${CODE}`);
  if (!res.ok) {
    throw new Error(`GET /api/public/topics/${CODE} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.currentQuestion) {
    throw new Error(`Topic ${CODE} has no current question set.`);
  }
  if (data.currentQuestion.status !== 'ACTIVE') {
    throw new Error(
      `Current question is ${data.currentQuestion.status}, not ACTIVE — responses would be rejected (409).`,
    );
  }
  return data.currentQuestion;
}

function startObserver(questionId) {
  const observer = { events: 0, lastPayload: null, socket: null };
  const socket = io(`${BASE_URL}/audience`, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });
  observer.socket = socket;
  sockets.push(socket);

  socket.on('connect', () => {
    socket.emit('join', { code: CODE });
  });
  socket.on('wordcloud:update', (payload) => {
    if (payload?.questionId === questionId) {
      observer.events++;
      observer.lastPayload = payload;
    }
  });
  return observer;
}

async function simulateUser(index) {
  const start = Date.now();
  const socket = io(`${BASE_URL}/audience`, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });
  sockets.push(socket);

  await new Promise((resolve) => {
    socket.on('connect_error', (err) => {
      results.connectFailed++;
      console.log(`#${index} connect_error: ${err.message}`);
      resolve();
    });
    socket.on('connect', async () => {
      results.connectOk++;
      results.connectMs.push(Date.now() - start);
      const joinStart = Date.now();
      try {
        const ack = await socket.timeout(5000).emitWithAck('join', { code: CODE });
        if (ack?.ok) {
          results.joinOk++;
          results.joinMs.push(Date.now() - joinStart);
        } else {
          results.joinFailed++;
          console.log(`#${index} join rejected: ${ack?.message}`);
        }
      } catch (err) {
        results.joinFailed++;
        console.log(`#${index} join timeout/error: ${err.message}`);
      }
      resolve();
    });
  });

  const participantSessionId = randomUUID();
  const text = WORD_POOL[index % WORD_POOL.length];
  const headers = { 'Content-Type': 'application/json' };
  if (SPOOF_IP) {
    headers['X-Forwarded-For'] = fakeIpFor(index);
  }

  const respStart = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/public/questions/${GLOBAL.questionId}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, participantSessionId }),
    });
    results.responseMs.push(Date.now() - respStart);
    if (res.status === 200 || res.status === 201) {
      results.responseOk++;
    } else if (res.status === 409) {
      results.responseConflict++;
    } else if (res.status === 429) {
      results.responseRateLimited++;
      if (results.responseRateLimited <= 3) {
        const body = await res.text().catch(() => '');
        const server = res.headers.get('server') ?? 'n/a';
        console.log(`#${index} 429 body="${body}" server-header="${server}"`);
      }
    } else {
      results.responseOtherFailed++;
      const body = await res.text().catch(() => '');
      console.log(`#${index} response failed: ${res.status} ${body}`);
    }
  } catch (err) {
    results.responseOtherFailed++;
    console.log(`#${index} response error: ${err.message}`);
  }
}

const GLOBAL = {};

function summarize(label, arr) {
  if (!arr.length) return `${label}: n/a`;
  const avg = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  const max = Math.max(...arr);
  return `${label}: avg ${avg}ms, max ${max}ms (n=${arr.length})`;
}

async function main() {
  console.log(`Looking up active question for code ${CODE} on ${BASE_URL}...`);
  const question = await fetchActiveQuestion();
  GLOBAL.questionId = question.id;
  console.log(`Question: "${question.prompt}" (id ${question.id})`);
  console.log(
    `Simulating ${TARGET} users (join + answer), batch size ${BATCH}, ` +
      `delay ${BATCH_DELAY_MS}ms, IP spoofing: ${SPOOF_IP ? 'ON' : 'OFF'}\n`,
  );

  const observer = startObserver(question.id);
  await sleep(1000); // let observer join before load starts

  for (let i = 0; i < TARGET; i += BATCH) {
    const batchEnd = Math.min(i + BATCH, TARGET);
    const batchPromises = [];
    for (let j = i; j < batchEnd; j++) {
      batchPromises.push(simulateUser(j));
    }
    await Promise.all(batchPromises);
    console.log(
      `Progress: ${batchEnd}/${TARGET} — ` +
        `connected=${results.connectOk} joined=${results.joinOk} ` +
        `responseOk=${results.responseOk} 409=${results.responseConflict} ` +
        `429=${results.responseRateLimited} otherFail=${results.responseOtherFailed}`,
    );
    await sleep(BATCH_DELAY_MS);
  }

  console.log('\nWaiting 5s for the last wordcloud:update events to arrive...');
  await sleep(5000);

  console.log('\n=== RESULT ===');
  console.log(`Attempted:          ${TARGET}`);
  console.log(`Socket connected:   ${results.connectOk} (failed: ${results.connectFailed})`);
  console.log(`Room joined:        ${results.joinOk} (failed: ${results.joinFailed})`);
  console.log(`Response accepted:  ${results.responseOk}`);
  console.log(`Response 409 (dup): ${results.responseConflict}`);
  console.log(`Response 429 (rate):${results.responseRateLimited}`);
  console.log(`Response other fail:${results.responseOtherFailed}`);
  console.log(summarize('Connect time', results.connectMs));
  console.log(summarize('Join time', results.joinMs));
  console.log(summarize('Response time', results.responseMs));

  console.log(`\nObserver received ${observer.events} wordcloud:update event(s).`);
  if (observer.lastPayload) {
    console.log(
      `Last payload (lifetime total for this question, includes any earlier test runs): ` +
        `totalResponses=${observer.lastPayload.totalResponses}, ` +
        `words=${observer.lastPayload.words?.length ?? 'n/a'}`,
    );
    // Each accepted response triggers exactly one broadcastSnapshot() call
    // server-side, so — unlike totalResponses, which is a lifetime counter —
    // the EVENT COUNT should equal accepted responses from this run with no
    // socket ever dropped, confirming no update was lost under concurrency.
    if (observer.events !== results.responseOk) {
      console.log(
        `⚠️  MISMATCH: observer got ${observer.events} update event(s) but ${results.responseOk} ` +
          `responses were accepted this run — an update may have been lost, or the observer ` +
          `socket dropped/reconnected mid-run.`,
      );
    } else {
      console.log('✅ Event count matches accepted response count — no lost updates.');
    }
  } else {
    console.log('⚠️  No wordcloud:update received by observer — check socket connectivity.');
  }

  sockets.forEach((s) => s.disconnect());
  process.exit(0);
}

main().catch((err) => {
  console.error('Load test failed:', err.message);
  sockets.forEach((s) => s.disconnect());
  process.exit(1);
});
