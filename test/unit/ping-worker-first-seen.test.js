'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}
async function bump(kv, key) {
  const current = parseInt((await kv.get(key)) ?? '0', 10);
  await kv.put(key, String(current + 1));
}

test('markFirstSeen', async (t) => {
  const { markFirstSeen } = await import('../../cloudflare/ping-worker/src/first-seen.js');

  await t.test('first ever ping counts the install as new and marks it', async () => {
    const kv = fakeKv();
    assert.equal(await markFirstSeen(kv, 'abc123', '2026-08-28', bump), true);
    assert.equal(kv.store.get('new:day:2026-08-28'), '1');
    assert.equal(kv.store.get('first:abc123'), '2026-08-28');
  });

  await t.test('subsequent pings are no-ops, even on later days', async () => {
    const kv = fakeKv();
    await markFirstSeen(kv, 'abc123', '2026-08-28', bump);
    assert.equal(await markFirstSeen(kv, 'abc123', '2026-08-29', bump), false);
    assert.equal(kv.store.get('new:day:2026-08-29'), undefined);
    assert.equal(kv.store.get('first:abc123'), '2026-08-28');
  });

  await t.test('a backfilled marker suppresses counting entirely', async () => {
    const kv = fakeKv();
    await kv.put('first:old1', '2026-07'); // coarse month value from backfill
    assert.equal(await markFirstSeen(kv, 'old1', '2026-08-28', bump), false);
    assert.equal(kv.store.get('new:day:2026-08-28'), undefined);
  });
});

test('markNextDayReturn', async (t) => {
  const { markFirstSeen, markNextDayReturn } =
    await import('../../cloudflare/ping-worker/src/first-seen.js');

  await t.test('an install back the day after its first ping counts once', async () => {
    const kv = fakeKv();
    await markFirstSeen(kv, 'abc123', '2026-10-02', bump);
    assert.equal(await markNextDayReturn(kv, 'abc123', '2026-10-03', '2026-10-02', bump), true);
    assert.equal(await markNextDayReturn(kv, 'abc123', '2026-10-03', '2026-10-02', bump), false);
    assert.equal(kv.store.get('return:d1:2026-10-02'), '1');
  });

  await t.test('the install day itself and later days never count', async () => {
    const kv = fakeKv();
    await markFirstSeen(kv, 'abc123', '2026-10-02', bump);
    assert.equal(await markNextDayReturn(kv, 'abc123', '2026-10-02', '2026-10-01', bump), false);
    assert.equal(await markNextDayReturn(kv, 'abc123', '2026-10-04', '2026-10-03', bump), false);
    assert.deepEqual([...kv.store.keys()].filter((k) => k.startsWith('return:')), []);
  });

  await t.test('unknown and backfilled installs never count', async () => {
    const kv = fakeKv();
    await kv.put('first:old1', '2026-09'); // coarse month value from backfill
    assert.equal(await markNextDayReturn(kv, 'old1', '2026-10-01', '2026-09-30', bump), false);
    assert.equal(await markNextDayReturn(kv, 'nobody', '2026-10-03', '2026-10-02', bump), false);
    assert.deepEqual([...kv.store.keys()].filter((k) => k.startsWith('return:')), []);
  });
});
