const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// Blanc for iPhone's launch ping (M18 design §7.2): the phone is counted
// entirely apart from desktop, under an `ios:` key prefix, with only
// `platform:ios` shared; it never reaches Google Analytics or the first-day
// signals, and it gets a 30-day return count for the kill criteria.
const WORKER_PATH = path.join(__dirname, '../../cloudflare/ping-worker/src/index.js');
let worker;
test.before(async () => {
  worker = (await import(pathToFileURL(WORKER_PATH))).default;
});

function fakeKV() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); },
    async delete(key) { map.delete(key); },
    async list({ prefix = '', cursor } = {}) {
      const keys = [...map.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { keys: keys.map((name) => ({ name })), list_complete: true, cursor };
    },
  };
}

const env = () => ({ PINGS: fakeKV(), INSTALL_HASH_SECRET: 'test-secret', STATS_TOKEN: 'tok' });
const INSTALL = '01234567-89ab-4cde-8f01-23456789abcd';
let session = 1;
const phone = (over = {}) => ({
  installId: INSTALL, sessionId: session++, version: '1.0.0', platform: 'ios', arch: 'arm64', osVersion: '26', ...over,
});
const mac = (over = {}) => ({
  installId: '11111111-2222-4333-8444-555555555555', sessionId: session++, version: '1.45.1',
  platform: 'darwin', arch: 'arm64', osVersion: '26', ...over,
});

async function send(e, body, pathname = '/ping') {
  const gaCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { gaCalls.push(String(url)); return new Response(null, { status: 204 }); };
  const waited = [];
  try {
    const res = await worker.fetch(new Request(`https://ping.test${pathname}`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.10', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), e, { waitUntil: (p) => waited.push(p) });
    await Promise.all(waited);
    return { res, gaCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
const countKeys = (e) => [...e.PINGS.map.keys()].filter((k) => !k.startsWith('ingest:'));
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test('an iPhone ping is accepted and counted under ios:, with platform:ios shared', async () => {
  const e = env();
  const { res } = await send(e, phone());
  assert.equal(res.status, 204);
  assert.equal(await e.PINGS.get('ios:total'), '1');
  assert.equal(await e.PINGS.get('ios:version:1.0.0'), '1');
  assert.equal(await e.PINGS.get('ios:os:26'), '1');
  assert.equal(await e.PINGS.get(`ios:day:${day(0)}`), '1');
  assert.equal(await e.PINGS.get(`ios:active:day:${day(0)}`), '1');
  assert.equal(await e.PINGS.get(`ios:new:day:${day(0)}`), '1');
  assert.equal(await e.PINGS.get('platform:ios'), '1');
  const unprefixed = countKeys(e).filter((k) => !k.startsWith('ios:') && k !== 'platform:ios');
  assert.deepEqual(unprefixed, [], 'nothing desktop reads moves');
});

test('iPhone 1.0.0 never adds to desktop 1.0.0, and desktop keys are unchanged', async () => {
  const e = env();
  await send(e, mac({ version: '1.0.0' }));
  const desktopKeys = countKeys(e).sort();
  await send(e, phone({ version: '1.0.0' }));
  assert.equal(await e.PINGS.get('version:1.0.0'), '1');
  assert.equal(await e.PINGS.get('total'), '1');
  const desktopAfter = countKeys(e).filter((k) => !k.startsWith('ios:') && k !== 'platform:ios').sort();
  assert.deepEqual(desktopAfter, desktopKeys);
});

test('an iPhone ping never reaches Google Analytics', async () => {
  const e = { ...env(), GA_API_SECRET: 'ga' };
  const { gaCalls } = await send(e, phone());
  assert.deepEqual(gaCalls.filter((u) => u.includes('google-analytics')), []);
  const desktop = await send(e, mac());
  assert.ok(desktop.gaCalls.some((u) => u.includes('google-analytics')), 'desktop still mirrors');
});

test('an iPhone install is never in the first-day groups, whatever its version', async () => {
  const e = env();
  await send(e, phone({ version: '1.31.0' }));
  assert.deepEqual(countKeys(e).filter((k) => k.includes('d1sig') || k.includes('d1had')), []);
});

test('the phone sends no product events', async () => {
  const e = env();
  const { res } = await send(e, { ...phone(), event: 'mahjong_play' }, '/event');
  assert.equal(res.status, 400);
  const signal = await send(e, { ...phone(), event: 'day1_browsed' }, '/event');
  assert.equal(signal.res.status, 400);
});

test('a return 28 to 34 days after the first launch counts once as 30-day return', async () => {
  for (const [offset, counted] of [[-27, false], [-28, true], [-30, true], [-34, true], [-35, false]]) {
    const e = env();
    await send(e, phone());
    const firstKey = [...e.PINGS.map.keys()].find((k) => k.startsWith('ios:first:'));
    await e.PINGS.put(firstKey, day(offset));
    await send(e, phone());
    await send(e, phone());
    assert.equal(await e.PINGS.get(`ios:return:m1:${day(offset)}`), counted ? '1' : null, `day ${-offset}`);
  }
});

test('/stats reports the phone in its own block and leaves desktop alone', async () => {
  const e = env();
  await send(e, mac());
  await send(e, phone());
  await send(e, phone({ installId: '22222222-3333-4444-8555-666666666666' }));
  const res = await worker.fetch(new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer tok' } }), e, {});
  const stats = await res.json();
  assert.equal(stats.launches.total, 1);
  assert.equal(stats.ios.launches.total, 2);
  assert.deepEqual(stats.ios.launches.byVersion, { '1.0.0': 2 });
  assert.equal(stats.ios.activeUsers.daily[day(0)], 2);
  assert.equal(stats.ios.newInstalls.byDay[day(0)], 2);
  assert.ok(stats.ios.weekTwoReturn && stats.ios.monthReturn, 'both retention figures');
  assert.equal(stats.launches.byPlatform.ios, 2, 'platform:ios is the shared key');
});
