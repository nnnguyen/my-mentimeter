// Load-test the /audience Socket.IO namespace: ramps up N concurrent
// connections against a real topic join code and reports how many
// successfully connect and join the room, plus timing.
//
// Usage:
//   LOAD_TEST_CODE=ABC123 LOAD_TEST_COUNT=200 node scripts/load-test-join.mjs
//
// Env vars:
//   LOAD_TEST_URL         backend base URL (default http://localhost:3001)
//   LOAD_TEST_CODE        a real topic join code to connect to (required)
//   LOAD_TEST_COUNT       total connections to attempt (default 50)
//   LOAD_TEST_BATCH       how many to open per batch (default 10)
//   LOAD_TEST_BATCH_DELAY_MS  pause between batches in ms (default 500)
//
// Only tests connection + room-join capacity (the "how many people can be on
// /join at once" question), not response submission throughput.

import 'dotenv/config';
import { io } from 'socket.io-client';

const BASE_URL = process.env.LOAD_TEST_URL ?? 'http://localhost:3001';
const CODE = process.env.LOAD_TEST_CODE;
const TARGET = Number(process.env.LOAD_TEST_COUNT ?? 50);
const BATCH = Number(process.env.LOAD_TEST_BATCH ?? 10);
const BATCH_DELAY_MS = Number(process.env.LOAD_TEST_BATCH_DELAY_MS ?? 500);

if (!CODE) {
  console.error('Missing LOAD_TEST_CODE. Usage:');
  console.error('  LOAD_TEST_CODE=ABC123 LOAD_TEST_COUNT=200 node scripts/load-test-join.mjs');
  process.exit(1);
}

const results = { connected: 0, joinOk: 0, joinFailed: 0, connectFailed: 0, connectMs: [] };
const sockets = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectOne(index) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = io(`${BASE_URL}/audience`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 10000,
    });
    sockets.push(socket);

    socket.on('connect_error', (err) => {
      results.connectFailed++;
      console.log(`#${index} connect_error: ${err.message}`);
      resolve();
    });

    socket.on('connect', async () => {
      results.connected++;
      results.connectMs.push(Date.now() - start);
      try {
        const ack = await socket.timeout(5000).emitWithAck('join', { code: CODE });
        if (ack?.ok) {
          results.joinOk++;
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
}

async function main() {
  console.log(`Ramping up ${TARGET} audience connections to ${BASE_URL} (code ${CODE})...`);
  console.log(`Batch size: ${BATCH}, delay between batches: ${BATCH_DELAY_MS}ms\n`);

  for (let i = 0; i < TARGET; i += BATCH) {
    const batchEnd = Math.min(i + BATCH, TARGET);
    const batchPromises = [];
    for (let j = i; j < batchEnd; j++) {
      batchPromises.push(connectOne(j));
    }
    await Promise.all(batchPromises);
    console.log(
      `Progress: ${batchEnd}/${TARGET} attempted — ` +
        `connected=${results.connected} joinOk=${results.joinOk} ` +
        `connectFailed=${results.connectFailed} joinFailed=${results.joinFailed}`,
    );
    await sleep(BATCH_DELAY_MS);
  }

  const avgConnectMs = results.connectMs.length
    ? (results.connectMs.reduce((a, b) => a + b, 0) / results.connectMs.length).toFixed(1)
    : 'n/a';
  const maxConnectMs = results.connectMs.length ? Math.max(...results.connectMs) : 'n/a';

  console.log('\n=== RESULT ===');
  console.log(`Attempted:       ${TARGET}`);
  console.log(`Connected:       ${results.connected}`);
  console.log(`Joined OK:       ${results.joinOk}`);
  console.log(`Connect failed:  ${results.connectFailed}`);
  console.log(`Join failed:     ${results.joinFailed}`);
  console.log(`Avg connect time: ${avgConnectMs}ms, Max: ${maxConnectMs}ms`);

  console.log(
    '\nHolding all connections open for 8s — check the presenter screen\'s ' +
      '"người đã join" counter and your server\'s CPU/memory now...',
  );
  await sleep(8000);

  sockets.forEach((s) => s.disconnect());
  process.exit(0);
}

main();
