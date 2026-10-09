const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// The worker is an ES module (cloudflare/ping-worker/package.json sets
// type:module), so it's imported dynamically from this CJS test.
const WORKER_PATH = path.join(__dirname, '../../cloudflare/ping-worker/src/index.js');
let worker;
test.before(async () => {
  worker = (await import(pathToFileURL(WORKER_PATH))).default;
});

const RAW_ID = '01234567-89ab-4cde-8f01-23456789abcd';
const HEX64 = /^[0-9a-f]{64}$/;

// Faithful to Cloudflare's list-keys semantics: keys come back in
// lexicographic order, the opaque cursor resumes AFTER the last key returned
// (so deletes during iteration can't skip keys), and — explicitly permitted
// by the API — a page may be EMPTY with list_complete:false, which callers
// must page through rather than treat as done. emptyPageOnCall injects one
// such page on the Nth list() call.
function fakeKV({ pageSize = Infinity, emptyPageOnCall = 0 } = {}) {
  const map = new Map();
  const kv = {
    map,
    listCalls: 0,
    emptyPageServed: false,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '', cursor } = {}) {
      kv.listCalls++;
      if (kv.listCalls === emptyPageOnCall) {
        kv.emptyPageServed = true;
        return { keys: [], list_complete: false, cursor: cursor ?? 'after:' };
      }
      const after = cursor ? cursor.slice('after:'.length) : '';
      const remaining = [...map.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
      const page = remaining.slice(0, pageSize);
      const done = page.length === remaining.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: done,
        cursor: done ? undefined : `after:${page[page.length - 1]}`,
      };
    },
  };
  return kv;
}

// Runs one ping and resolves after the KV writes AND the waitUntil'd GA
// forward settle, capturing any GA fetch bodies.
async function ping(env, body, pathname = '/ping') {
  const gaCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    gaCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };
  const waited = [];
  const ctx = { waitUntil: (p) => waited.push(p) };
  try {
    const res = await worker.fetch(
      new Request(`https://ping.test${pathname}`, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.10', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env, ctx
    );
    await Promise.all(waited);
    return { res, gaCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const usageEvent = (env, body) => ping(env, body, '/event');

const PING_BODY = { installId: RAW_ID, sessionId: 42, version: '0.15.2', platform: 'darwin', arch: 'arm64' };

test('Mahjong play counts events and active installs without storing the raw id', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  const { res, gaCalls } = await usageEvent(env, { ...PING_BODY, event: 'mahjong_play' });
  assert.equal(res.status, 204);
  assert.equal(env.PINGS.map.get('usage:mahjong-play:total'), '1');
  assert.equal(
    [...env.PINGS.map.entries()].find(([key]) => key.startsWith('usage:mahjong-play:active:day:'))[1],
    '1',
  );
  assert.equal(gaCalls[0].body.events[0].name, 'mahjong_play');
  for (const key of env.PINGS.map.keys()) {
    assert.ok(!key.includes(RAW_ID), `raw id must not appear in any key: ${key}`);
  }
});

test('usage replay dedupes by install, session, and fixed metric', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  const first = await usageEvent(env, { ...PING_BODY, event: 'mahjong_play' });
  const replay = await usageEvent(env, { ...PING_BODY, event: 'mahjong_play' });
  const nextSession = await usageEvent(env, {
    ...PING_BODY, sessionId: 43, event: 'mahjong_play',
  });
  assert.equal(first.gaCalls.length, 1);
  assert.equal(replay.gaCalls.length, 0);
  assert.equal(nextSession.gaCalls.length, 1);
  assert.equal(env.PINGS.map.get('usage:mahjong-play:total'), '2');
  assert.equal(
    [...env.PINGS.map.entries()].find(([key]) => key.startsWith('usage:mahjong-play:active:day:'))[1],
    '1',
  );
});

test('new-tab layouts use separate allowlisted counters and appear in stats', async () => {
  const env = {
    PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga', STATS_TOKEN: 't',
  };
  const ledger = await usageEvent(env, {
    ...PING_BODY, event: 'newtab_layout', layout: 'ledger',
  });
  const shelf = await usageEvent(env, {
    ...PING_BODY, event: 'newtab_layout', layout: 'shelf',
  });
  assert.equal(ledger.gaCalls[0].body.events[0].params.layout, 'ledger');
  assert.equal(shelf.gaCalls[0].body.events[0].params.layout, 'shelf');

  const res = await worker.fetch(
    new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer t' } }),
    env, { waitUntil() {} },
  );
  const stats = await res.json();
  assert.equal(stats.productUsage.newtabLayouts.ledger.events.total, 1);
  assert.equal(stats.productUsage.newtabLayouts.shelf.events.total, 1);
  assert.equal(stats.productUsage.newtabLayouts.billboard.events.total, 0);
  assert.equal(Object.values(stats.productUsage.newtabLayouts.ledger.activeUsers.daily)[0], 1);
  assert.deepEqual(Object.keys(stats.productUsage.newtabLayouts), ['ledger', 'billboard', 'shelf', 'tally']);
});

test('unknown usage events and layout values are rejected without usage writes', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  assert.equal((await usageEvent(env, { ...PING_BODY, event: 'anything' })).res.status, 400);
  assert.equal((await usageEvent(env, {
    ...PING_BODY, sessionId: 43, event: 'newtab_layout', layout: 'anything',
  })).res.status, 400);
  assert.equal((await usageEvent(env, {
    ...PING_BODY, sessionId: 44, event: 'newtab_layout',
  })).res.status, 400);
  assert.equal((await usageEvent(env, {
    ...PING_BODY, sessionId: 45, event: 'newtab_layout', layout: 'mahjong',
  })).res.status, 400);
  assert.equal([...env.PINGS.map.keys()].filter((key) => key.startsWith('usage:')).length, 0);
});

test('usage without a hashing secret keeps aggregates but skips uniques and GA', async () => {
  const env = { PINGS: fakeKV(), GA_API_SECRET: 'ga' };
  const { res, gaCalls } = await usageEvent(env, { ...PING_BODY, event: 'mahjong_play' });
  assert.equal(res.status, 204);
  assert.equal(gaCalls.length, 0);
  assert.equal(env.PINGS.map.get('usage:mahjong-play:total'), '1');
  assert.equal(
    [...env.PINGS.map.keys()].filter((key) =>
      key.startsWith('usage:mahjong-play:active:') ||
      key.startsWith('usage:mahjong-play:seen:') ||
      key.startsWith('usage:mahjong-play:event:')).length,
    0,
  );
});

test('the raw install id never reaches storage — only the keyed hash does', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  const { res } = await ping(env, PING_BODY);
  assert.equal(res.status, 204);

  const seenKeys = [...env.PINGS.map.keys()].filter((k) => k.startsWith('seen:'));
  assert.equal(seenKeys.length, 3, 'day, week, and month markers');
  for (const key of seenKeys) {
    const segment = key.slice(key.lastIndexOf(':') + 1);
    assert.match(segment, HEX64, key);
  }
  for (const key of env.PINGS.map.keys()) {
    assert.ok(!key.includes(RAW_ID), `raw id must not appear in any key: ${key}`);
  }
});

test('the hash is stable per install, so dedup still works', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  await ping(env, PING_BODY);
  await ping(env, { ...PING_BODY, sessionId: 43 });
  // Second launch same day: the seen flag answers, the unique counter stays 1.
  const dayCounter = [...env.PINGS.map.entries()].find(([k]) => k.startsWith('active:day:'));
  assert.equal(dayCounter[1], '1');
  // A different secret re-buckets: different hash for the same install.
  const other = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'other-secret' };
  await ping(other, PING_BODY);
  const seenA = [...env.PINGS.map.keys()].find((k) => k.startsWith('seen:day:'));
  const seenB = [...other.PINGS.map.keys()].find((k) => k.startsWith('seen:day:'));
  assert.notEqual(seenA.slice(seenA.lastIndexOf(':') + 1), seenB.slice(seenB.lastIndexOf(':') + 1));
});

test('GA receives only the hashed token as client_id', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga-secret' };
  const { gaCalls } = await ping(env, PING_BODY);
  assert.equal(gaCalls.length, 1);
  const { client_id } = gaCalls[0].body;
  assert.match(client_id, HEX64);
  assert.notEqual(client_id, RAW_ID);
  // The KV marker and the GA client_id must be the SAME hash — that's the
  // stable-per-install property GA's active-user metrics rely on.
  const seenKey = [...env.PINGS.map.keys()].find((k) => k.startsWith('seen:day:'));
  assert.equal(client_id, seenKey.slice(seenKey.lastIndexOf(':') + 1));
});

test('no hashing secret fails closed: launches count, uniques and GA are skipped', async () => {
  const env = { PINGS: fakeKV(), GA_API_SECRET: 'ga-secret' }; // INSTALL_HASH_SECRET unset
  const { res, gaCalls } = await ping(env, PING_BODY);
  assert.equal(res.status, 204);
  assert.equal(gaCalls.length, 0, 'the raw id must never fall through to GA');
  const keys = [...env.PINGS.map.keys()];
  assert.equal(keys.filter((k) => k.startsWith('seen:')).length, 0);
  assert.equal(keys.filter((k) => k.startsWith('active:')).length, 0);
  assert.equal(env.PINGS.map.get('total'), '1', 'aggregate launch counts still work');
});

test('purge-legacy-ids deletes raw-UUID markers and nothing else', async () => {
  const env = { PINGS: fakeKV(), STATS_TOKEN: 'stats-token' };
  const hashed = 'a'.repeat(64);
  env.PINGS.map.set(`seen:month:2026-06:${RAW_ID}`, '1'); // legacy, old 800d TTL era
  env.PINGS.map.set(`seen:day:2026-07-10:${RAW_ID}`, '1'); // legacy
  env.PINGS.map.set(`seen:day:2026-07-11:${hashed}`, '1'); // post-migration
  env.PINGS.map.set('active:month:2026-06', '17'); // aggregate — must survive
  env.PINGS.map.set('total', '99');

  const res = await worker.fetch(
    new Request('https://ping.test/admin/purge-legacy-ids', {
      method: 'POST',
      headers: { Authorization: 'Bearer stats-token' },
    }),
    env, { waitUntil: () => {} }
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.done, true);
  assert.equal(body.deleted, 2);

  const keys = [...env.PINGS.map.keys()];
  assert.ok(!keys.some((k) => k.includes(RAW_ID)), 'legacy markers gone');
  assert.ok(keys.includes(`seen:day:2026-07-11:${hashed}`), 'hashed markers survive');
  assert.equal(env.PINGS.map.get('active:month:2026-06'), '17', 'aggregates survive');
});

test('purging more than one budget of legacy keys takes multiple calls to done:true', async () => {
  // 100-key pages force real cursor handling (805 legacy keys ≈ 9 pages),
  // and the third list() call returns Cloudflare's permitted empty page
  // with list_complete:false — the worker must page through it, not stop.
  const env = { PINGS: fakeKV({ pageSize: 100, emptyPageOnCall: 3 }), STATS_TOKEN: 'stats-token' };
  const hashed = 'b'.repeat(64);
  // 805 legacy markers — 800 is the per-invocation delete budget, so the
  // real migration path is call → done:false → call again → done:true.
  for (let i = 0; i < 805; i++) {
    const suffix = String(i).padStart(12, '0');
    env.PINGS.map.set(`seen:day:2026-07-10:01234567-89ab-4cde-8f01-${suffix}`, '1');
  }
  env.PINGS.map.set(`seen:day:2026-07-11:${hashed}`, '1');
  env.PINGS.map.set('active:day:2026-07-10', '805');

  const purge = () => worker.fetch(
    new Request('https://ping.test/admin/purge-legacy-ids', {
      method: 'POST',
      headers: { Authorization: 'Bearer stats-token' },
    }),
    env, { waitUntil: () => {} }
  ).then((res) => res.json());

  const first = await purge();
  assert.equal(first.done, false, 'the budget stops the first call short');
  assert.equal(first.deleted, 800);
  assert.ok(env.PINGS.listCalls >= 9, 'the worker actually paged (100-key pages)');
  assert.equal(env.PINGS.emptyPageServed, true, 'the empty list_complete:false page was served mid-run');

  const second = await purge();
  assert.equal(second.done, true);
  assert.equal(second.deleted, 5, 'the rerun finishes the remainder');

  const keys = [...env.PINGS.map.keys()];
  assert.equal(keys.filter((k) => k.startsWith('seen:') && !k.endsWith(hashed)).length, 0);
  assert.ok(keys.includes(`seen:day:2026-07-11:${hashed}`), 'hashed markers survive both passes');
  assert.equal(env.PINGS.map.get('active:day:2026-07-10'), '805', 'aggregates survive both passes');
});

test('purge-legacy-ids is bearer-gated and fails closed without a token', async () => {
  const kv = fakeKV();
  kv.map.set(`seen:day:2026-07-10:${RAW_ID}`, '1');
  for (const env of [
    { PINGS: kv, STATS_TOKEN: 'stats-token' }, // wrong header
    { PINGS: kv }, // no token configured at all
  ]) {
    const res = await worker.fetch(
      new Request('https://ping.test/admin/purge-legacy-ids', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      }),
      env, { waitUntil: () => {} }
    );
    assert.equal(res.status, 401);
  }
  assert.ok(kv.map.has(`seen:day:2026-07-10:${RAW_ID}`), 'nothing deleted on denial');
});

test('OS version is bucketed per platform, so macOS 11 and Windows 11 never merge', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  await ping(env, { ...PING_BODY, platform: 'darwin', osVersion: '11' });
  await ping(env, { ...PING_BODY, sessionId: 43, platform: 'win32', osVersion: '11' });
  assert.equal(env.PINGS.map.get('os:darwin:11'), '1');
  assert.equal(env.PINGS.map.get('os:win32:11'), '1');
});

test('a malformed or absent osVersion degrades to unknown rather than opening the key space', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  // Pre-osVersion clients still ping; they must count as launches.
  await ping(env, { ...PING_BODY, sessionId: 42 });
  // A forged body must not become a KV key.
  await ping(env, { ...PING_BODY, sessionId: 43, osVersion: '../../etc/passwd' });
  await ping(env, { ...PING_BODY, sessionId: 44, osVersion: '26.1.4' });
  await ping(env, { ...PING_BODY, sessionId: 45, osVersion: 26 });
  assert.equal(env.PINGS.map.get('os:darwin:unknown'), '4');
  assert.equal(env.PINGS.map.get('total'), '4');
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('os:')).length, 1);
});

test('GA receives the OS version as a user property and an event param', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  const { gaCalls } = await ping(env, { ...PING_BODY, osVersion: '26' });
  assert.equal(gaCalls.length, 1);
  assert.equal(gaCalls[0].body.user_properties.os_version.value, '26');
  assert.equal(gaCalls[0].body.events[0].params.os_version, '26');
});

test('exact session replays are ignored before counters and GA forwarding', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  const first = await ping(env, PING_BODY);
  const replay = await ping(env, PING_BODY);
  assert.equal(first.gaCalls.length, 1);
  assert.equal(replay.gaCalls.length, 0);
  assert.equal(env.PINGS.map.get('total'), '1');
});

test('ping ingestion requires an edge client address and enforces the daily cap', async () => {
  const env = {
    PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', PING_DAILY_LIMIT: '1',
  };
  const ctx = { waitUntil() {} };
  const missingIp = await worker.fetch(new Request('https://ping.test/ping', {
    method: 'POST', body: JSON.stringify(PING_BODY),
  }), env, ctx);
  assert.equal(missingIp.status, 400);
  assert.equal((await ping(env, PING_BODY)).res.status, 204);
  assert.equal((await ping(env, { ...PING_BODY, sessionId: 43 })).res.status, 503);
});

test('/stats exposes the OS-version breakdown', async () => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', STATS_TOKEN: 't' };
  await ping(env, { ...PING_BODY, osVersion: '26' });
  await ping(env, { ...PING_BODY, sessionId: 43, osVersion: '27' });
  const res = await worker.fetch(
    new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer t' } }),
    env, { waitUntil() {} }
  );
  const stats = await res.json();
  assert.deepEqual(stats.launches.byOsVersion, { 'darwin:26': 1, 'darwin:27': 1 });
});

test('/stats reports next-day return per new-install cohort from the first tracked day', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', STATS_TOKEN: 't' };
  const OTHER_ID = '11111111-2222-4333-8444-555555555555';
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-03T15:00:00Z') });
  await ping(env, PING_BODY);
  await ping(env, { ...PING_BODY, installId: OTHER_ID });
  // An earlier cohort with no return counter must be omitted, not shown as 0%.
  await env.PINGS.put('new:day:2026-10-02', '5');

  t.mock.timers.setTime(Date.parse('2026-10-04T09:00:00Z'));
  await ping(env, { ...PING_BODY, sessionId: 43 });
  await ping(env, { ...PING_BODY, sessionId: 44 }); // second launch the same day

  const read = async () => (await worker.fetch(
    new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer t' } }),
    env, { waitUntil() {} },
  )).json();

  let stats = await read();
  assert.equal(stats.nextDayReturn.firstCohort, '2026-10-03');
  assert.deepEqual(Object.keys(stats.nextDayReturn.byDay), ['2026-10-03']);
  assert.deepEqual(stats.nextDayReturn.byDay['2026-10-03'], {
    newInstalls: 2, returnedNextDay: 1, rate: 0.5, complete: false,
  });

  t.mock.timers.setTime(Date.parse('2026-10-05T00:30:00Z'));
  stats = await read();
  assert.equal(stats.nextDayReturn.byDay['2026-10-03'].complete, true);
  for (const key of env.PINGS.map.keys()) {
    assert.ok(!key.includes(RAW_ID), `raw id must not appear in any key: ${key}`);
  }
});

test('a day-one signal counts once, only on the install day, and never reaches GA', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', GA_API_SECRET: 'ga' };
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  await ping(env, PING_BODY); // first seen 2027-01-10

  const first = await usageEvent(env, { ...PING_BODY, event: 'day1_default' });
  const repeat = await usageEvent(env, { ...PING_BODY, sessionId: 43, event: 'day1_default' });
  const browsed = await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' });
  assert.equal(first.res.status, 204);
  assert.equal(repeat.res.status, 204);
  assert.equal(browsed.res.status, 204);
  assert.equal(env.PINGS.map.get('d1had:default:2027-01-10'), '1');
  assert.equal(env.PINGS.map.get('d1had:browsed:2027-01-10'), '1');
  assert.equal(first.gaCalls.length + repeat.gaCalls.length + browsed.gaCalls.length, 0);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('usage:')).length, 0,
    'day-one signals never enter productUsage metrics');
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1sig:default:2027-01-10:')).length, 1);
  for (const key of env.PINGS.map.keys()) {
    assert.ok(!key.includes(RAW_ID), `raw id must not appear in any key: ${key}`);
  }
});

test('a day-one signal after the install day, or for an unknown install, stores nothing', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret' };
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  const unknown = await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' });
  assert.equal(unknown.res.status, 204);
  await ping(env, PING_BODY);
  t.mock.timers.setTime(Date.parse('2027-01-11T01:00:00Z'));
  const late = await usageEvent(env, { ...PING_BODY, sessionId: 43, event: 'day1_browsed' });
  assert.equal(late.res.status, 204);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1')).length, 0);
});

test('a day-one signal without a hashing secret stores nothing', async () => {
  const env = { PINGS: fakeKV() };
  const { res } = await usageEvent(env, { ...PING_BODY, event: 'day1_default' });
  assert.equal(res.status, 204);
  assert.equal([...env.PINGS.map.keys()].filter((k) => k.startsWith('d1')).length, 0);
});

test('/stats splits next-day return by day-one signal from the first signal cohort', async (t) => {
  const env = { PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', STATS_TOKEN: 't' };
  const B = '11111111-2222-4333-8444-555555555555';
  const C = '22222222-3333-4444-8555-666666666666';
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-10T15:00:00Z') });
  for (const installId of [RAW_ID, B, C]) await ping(env, { ...PING_BODY, installId });
  await usageEvent(env, { ...PING_BODY, event: 'day1_default' }); // A: default
  await usageEvent(env, { ...PING_BODY, event: 'day1_browsed' }); // A: browsed
  await usageEvent(env, { ...PING_BODY, installId: B, event: 'day1_browsed' }); // B: browsed
  // An older cohort must carry no signals section at all.
  await env.PINGS.put('new:day:2026-10-04', '3');

  t.mock.timers.setTime(Date.parse('2027-01-11T09:00:00Z'));
  await ping(env, { ...PING_BODY, sessionId: 50 }); // A returns
  await ping(env, { ...PING_BODY, installId: C, sessionId: 51 }); // C returns, no signals

  t.mock.timers.setTime(Date.parse('2027-01-12T09:00:00Z'));
  const stats = await (await worker.fetch(
    new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer t' } }),
    env, { waitUntil() {} },
  )).json();
  assert.deepEqual(stats.nextDayReturn.byDay['2027-01-10'], {
    newInstalls: 3, returnedNextDay: 2, rate: 0.6667, complete: true,
    signals: {
      default: { had: 1, returnedNextDay: 1 },
      browsed: { had: 2, returnedNextDay: 1 },
    },
  });
  assert.equal('signals' in stats.nextDayReturn.byDay['2026-10-04'], false);
  assert.equal(env.PINGS.map.get('return:d1:2027-01-10'), '2', 'the overall counter is untouched');
});
