'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, settle, until, plain } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const recovery = { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 2000 };
let nextRequest = 1;
const request = (h, extra = {}) => h.provider.decide('onBeforeRequest',
  { id: nextRequest++, url: `https://example.org/r${nextRequest}`, resourceType: 'script', method: 'GET', webContentsId: 9, ...extra });
const unanswered = (h, answered) => h.requests().filter(item => !answered.has(item.message.id));

test('a request during recovery waits and is decided by the restarted uBO', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const held = request(h);
  assert.equal(await settle(held, 50), 'pending', 'held, not cancelled');
  await until(() => h.provider.status().phase === 'ready');
  await until(() => h.requests().length === 1);
  h.answer(h.requests()[0].message.id, {});
  assert.deepEqual(plain(await held), {});
});

test('512 held requests drain with bounded concurrency and none is cancelled', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const results = Array.from({ length: 512 }, () => request(h));
  await until(() => h.provider.status().phase === 'ready');
  const answered = new Set(); let peak = 0;
  while (answered.size < 512) {
    await until(() => unanswered(h, answered).length > 0 || answered.size === 512);
    const open = unanswered(h, answered);
    peak = Math.max(peak, open.length);
    for (const item of open) { answered.add(item.message.id); h.answer(item.message.id, {}); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const decided = await Promise.all(results);
  assert.equal(decided.filter(value => value.cancel).length, 0);
  assert(peak <= 224, `peak ${peak} stays under MAX_PENDING - DRAIN_RESERVE`);
});

test('a burst after the queue empties joins it while drained decisions are pending', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const first = Array.from({ length: 224 }, () => request(h));
  await until(() => h.provider.status().phase === 'ready');
  await until(() => h.requests().length === 224); // queue empty, 224 still pending
  const burst = Array.from({ length: 100 }, () => request(h));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.requests().length, 224, 'the burst waits instead of bypassing the drain');
  const answered = new Set();
  while (answered.size < 324) {
    await until(() => unanswered(h, answered).length > 0);
    for (const item of unanswered(h, answered)) { answered.add(item.message.id); h.answer(item.message.id, {}); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const decided = await Promise.all([...first, ...burst]);
  assert.equal(decided.filter(value => value.cancel).length, 0, 'no ubo-request-capacity cancellations');
});

test('the 513th held request is cancelled', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.stall.ready = 'never';
  h.crashBackground();
  Array.from({ length: 512 }, () => request(h));
  assert.deepEqual(plain(await request(h)), { cancel: true });
});

test('held requests are cancelled when the episode deadline passes', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 120 } });
  await h.provider.initialize();
  h.stall.ready = 'never';
  h.crashBackground();
  assert.deepEqual(plain(await request(h)), { cancel: true });
  assert.equal(h.provider.status().phase, 'failed');
});

test('without an episode a failed provider still cancels at once', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ limit: 0 }), deadlineMs: 2000 } });
  await h.provider.initialize();
  h.crashBackground();
  assert.deepEqual(plain(await request(h)), { cancel: true });
});
