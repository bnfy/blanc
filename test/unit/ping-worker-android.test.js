const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// Blanc for Android's launch ping (A5c): counted like the iPhone's, apart from
// desktop and from the iPhone, under an `android:` key prefix, with only
// `platform:android` shared; never Google Analytics, first-day signals or
// product events, and a 30-day return count.
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
const android = (over = {}) => ({
  installId: INSTALL, sessionId: session++, version: '1.0.0', platform: 'android', arch: 'arm64', osVersion: '16',
  device: 'phone', ...over,
});
const iphone = (over = {}) => ({
  installId: '33333333-4444-4555-8666-777777777777', sessionId: session++, version: '1.0.0', platform: 'ios',
  arch: 'arm64', osVersion: '26', ...over,
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

test('an Android ping is accepted and counted under android:, with platform:android shared', async () => {
  const e = env();
  const { res } = await send(e, android());
  assert.equal(res.status, 204);
  assert.equal(await e.PINGS.get('android:total'), '1');
  assert.equal(await e.PINGS.get('android:version:1.0.0'), '1');
  assert.equal(await e.PINGS.get('android:os:16'), '1');
  assert.equal(await e.PINGS.get('android:device:phone'), '1');
  assert.equal(await e.PINGS.get(`android:active:day:${day(0)}`), '1');
  assert.equal(await e.PINGS.get(`android:new:day:${day(0)}`), '1');
  assert.equal(await e.PINGS.get('platform:android'), '1');
  const unprefixed = countKeys(e).filter((k) => !k.startsWith('android:') && k !== 'platform:android');
  assert.deepEqual(unprefixed, [], 'nothing desktop or the iPhone reads moves');
});

test('Android 1.0.0 adds to neither desktop 1.0.0 nor iPhone 1.0.0', async () => {
  const e = env();
  await send(e, mac({ version: '1.0.0' }));
  await send(e, iphone());
  const before = countKeys(e).sort();
  await send(e, android());
  assert.equal(await e.PINGS.get('version:1.0.0'), '1');
  assert.equal(await e.PINGS.get('ios:version:1.0.0'), '1');
  const after = countKeys(e).filter((k) => !k.startsWith('android:') && k !== 'platform:android').sort();
  assert.deepEqual(after, before);
});

test('phones and tablets are counted apart; anything else counts with no device', async () => {
  const e = env();
  await send(e, android({ device: 'tablet' }));
  await send(e, android({ device: 'iphone' }));
  await send(e, android({ device: undefined }));
  await send(e, iphone({ device: 'phone' }));
  assert.equal(await e.PINGS.get('android:device:tablet'), '1');
  assert.equal(await e.PINGS.get('android:device:phone'), null);
  assert.equal(await e.PINGS.get('android:total'), '3');
  assert.equal(await e.PINGS.get('ios:device:phone'), null, 'Android devices never reach the iPhone');
});

test('an x86_64 emulator counts as x64; a 32-bit ARM phone is refused rather than miscounted', async () => {
  const e = env();
  assert.equal((await send(e, android({ arch: 'x64' }))).res.status, 204);
  assert.equal((await send(e, android({ arch: 'arm' }))).res.status, 400);
});

test('an Android ping never reaches Google Analytics or the first-day groups', async () => {
  const e = { ...env(), GA_API_SECRET: 'ga' };
  const { gaCalls } = await send(e, android({ version: '1.31.0' }));
  assert.deepEqual(gaCalls.filter((u) => u.includes('google-analytics')), []);
  assert.deepEqual(countKeys(e).filter((k) => k.includes('d1sig') || k.includes('d1had')), []);
});

test('Android sends no product events or first-day signals', async () => {
  const e = env();
  assert.equal((await send(e, { ...android(), event: 'mahjong_play' }, '/event')).res.status, 400);
  assert.equal((await send(e, { ...android(), event: 'day1_browsed' }, '/event')).res.status, 400);
});

test('a return 28 to 34 days after the first launch counts once as 30-day return', async () => {
  const e = env();
  await send(e, android());
  const firstKey = [...e.PINGS.map.keys()].find((k) => k.startsWith('android:first:'));
  await e.PINGS.put(firstKey, day(-30));
  await send(e, android());
  await send(e, android());
  assert.equal(await e.PINGS.get(`android:return:m1:${day(-30)}`), '1');
});

test('/stats reports Android in its own block beside the iPhone and desktop', async () => {
  const e = env();
  await send(e, mac());
  await send(e, iphone());
  await send(e, android());
  await send(e, android({ installId: '22222222-3333-4444-8555-666666666666', device: 'tablet' }));
  const res = await worker.fetch(new Request('https://ping.test/stats', { headers: { Authorization: 'Bearer tok' } }), e, {});
  const stats = await res.json();
  assert.equal(stats.launches.total, 1);
  assert.equal(stats.ios.launches.total, 1);
  assert.equal(stats.android.launches.total, 2);
  assert.deepEqual(stats.android.launches.byDevice, { phone: 1, tablet: 1 });
  assert.equal(stats.android.activeUsers.daily[day(0)], 2);
  assert.equal(stats.launches.byPlatform.android, 2, 'platform:android is the shared key');
});
