'use strict';

// The bang icons Worker (cloudflare/bang-icons-worker): the icon server the
// /bangs page draws its site icons from. It answers only for hosts in Blanc's
// pinned bang list, fetches like the app's own favicon rules, and serves only
// sniffed raster bytes.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.resolve(__dirname, '../../cloudflare/bang-icons-worker/src');
const load = (file) => import(pathToFileURL(path.join(SRC, file)));
const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);

test('hostFromPath accepts only one lowercase host', async () => {
  const { hostFromPath } = await load('rules.js');
  assert.equal(hostFromPath('/bang-icons/www.youtube.com'), 'www.youtube.com');
  for (const pathname of [
    '/bang-icons/',
    '/bang-icons/WWW.YOUTUBE.COM',
    '/bang-icons/www.youtube.com/x',
    '/bang-icons/..',
    '/bang-icons/localhost',
    '/other/www.youtube.com',
  ]) assert.equal(hostFromPath(pathname), null, pathname);
});

test('isPublicUrl refuses private and odd destinations', async () => {
  const { isPublicUrl } = await load('rules.js');
  for (const url of ['https://www.youtube.com/', 'http://example.org:80/']) assert.equal(isPublicUrl(new URL(url)), true, url);
  for (const url of [
    'ftp://example.org/',
    'https://user:pw@example.org/',
    'https://example.org:8443/',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://[::1]/',
    'http://localhost/',
    'http://printer.local/',
    'http://nas.lan/',
  ]) assert.equal(isPublicUrl(new URL(url)), false, url);
});

test('sniffImageType rejects HTML and SVG', async () => {
  const { sniffImageType } = await load('rules.js');
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'image/png');
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffImageType(text('GIF89a....')), 'image/gif');
  assert.equal(sniffImageType(text('GIF87a....')), 'image/gif');
  assert.equal(sniffImageType(text('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(sniffImageType(bytes(0, 0, 1, 0, 1, 0)), 'image/x-icon');
  assert.equal(sniffImageType(text('<!doctype html><title>x</title>')), null);
  assert.equal(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
});

test('iconCandidates prefers a sharp declared icon and ends with favicon.ico', async () => {
  const { iconCandidates } = await load('rules.js');
  const html = `<!doctype html><html><head>
    <link rel="icon" sizes="16x16" href="/16.png">
    <link rel="icon" href="/192.png" sizes="192x192">
    <link rel="apple-touch-icon" href="/touch.png">
    <link rel="mask-icon" href="/m.svg" color="#000">
    <link rel="icon" type="image/svg+xml" href="/i.svg">
    <link rel="shortcut icon" href="//cdn.example.org/s.ico">
    <link rel="stylesheet" href="/site.css">
  </head></html>`;
  assert.deepEqual(iconCandidates(html, 'https://example.org/a/'), [
    'https://example.org/touch.png',
    'https://example.org/192.png',
    'https://cdn.example.org/s.ico',
    'https://example.org/16.png',
    'https://example.org/favicon.ico',
  ]);
});

// A fetch stub serving a fixed map of URL → response maker, recording calls.
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const route = routes[String(url)];
    return route ? route() : new Response('', { status: 404 });
  };
  return { fetchImpl, calls };
}
const PNG_BYTES = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3);
const ICO_BYTES = bytes(0, 0, 1, 0, 1, 0, 16, 16);
const image = (body) => () => new Response(body, { headers: { 'content-type': 'image/png' } });
const page = (html) => () => new Response(html, { headers: { 'content-type': 'text/html' } });
const DDG = 'https://icons.duckduckgo.com/ip3/example.org.ico';

test("the site's declared icon wins", async () => {
  const { findIcon } = await load('find-icon.js');
  const { fetchImpl, calls } = stubFetch({
    'https://example.org/': page('<link rel="apple-touch-icon" href="/t.png">'),
    'https://example.org/t.png': image(PNG_BYTES),
  });
  const icon = await findIcon('example.org', fetchImpl);
  assert.equal(icon.source, 'site');
  assert.equal(icon.type, 'image/png');
  assert.deepEqual([...icon.bytes], [...PNG_BYTES]);
  assert.ok(!calls.includes(DDG), 'DuckDuckGo was asked');
});

test('favicon.ico, then DuckDuckGo, when the site declares nothing usable', async () => {
  const { findIcon } = await load('find-icon.js');
  const { fetchImpl, calls } = stubFetch({
    'https://example.org/': page('<link rel="icon" href="/i.svg">'),
    [DDG]: image(ICO_BYTES),
  });
  const icon = await findIcon('example.org', fetchImpl);
  assert.equal(icon.source, 'duckduckgo');
  assert.equal(icon.type, 'image/x-icon');
  assert.ok(calls.includes('https://example.org/favicon.ico'));
});

test('a redirect into a private address is refused', async () => {
  const { findIcon } = await load('find-icon.js');
  const { fetchImpl, calls } = stubFetch({
    'https://example.org/': () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/' } }),
    'https://example.org/favicon.ico': image(PNG_BYTES),
  });
  const icon = await findIcon('example.org', fetchImpl);
  assert.ok(!calls.some((url) => url.includes('10.0.0.5')), 'the private address was fetched');
  assert.equal(icon.source, 'site');
});

test('an oversized icon is refused', async () => {
  const { findIcon } = await load('find-icon.js');
  const big = new Uint8Array(102401);
  big.set(PNG_BYTES);
  const { fetchImpl } = stubFetch({
    'https://example.org/': page('<link rel="icon" sizes="192x192" href="/big.png"><link rel="icon" sizes="32x32" href="/small.png">'),
    'https://example.org/big.png': image(big),
    'https://example.org/small.png': image(PNG_BYTES),
  });
  const icon = await findIcon('example.org', fetchImpl);
  assert.equal(icon.bytes.length, PNG_BYTES.length);
});

test('nothing usable is a miss', async () => {
  const { findIcon } = await load('find-icon.js');
  const { fetchImpl } = stubFetch({});
  assert.equal(await findIcon('example.org', fetchImpl), null);
});

// Workers KV, as the Worker uses it: binary values with metadata.
class FakeKV {
  constructor() { this.values = new Map(); this.puts = []; }
  async getWithMetadata(key) {
    const entry = this.values.get(key);
    return entry ? { value: entry.value, metadata: entry.metadata } : { value: null, metadata: null };
  }
  async put(key, value, options = {}) {
    this.puts.push({ key, options });
    this.values.set(key, { value, metadata: options.metadata ?? null });
  }
}

let hostListCount = 0;
// Each test gets its own host-list address, so the Worker's in-memory copy of
// one test's list never answers another test.
function environment() {
  hostListCount += 1;
  return { ICONS: new FakeKV(), HOSTS_URL: `https://blanc.day/bang-hosts.json?test=${hostListCount}` };
}

async function serve(worker, env, url, method = 'GET') {
  const pending = [];
  const response = await worker.fetch(new Request(url, { method }), env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  return response;
}

// Swaps the global fetch for a stub for one test.
function withFetch(t, routes) {
  const original = globalThis.fetch;
  const stub = stubFetch(routes);
  globalThis.fetch = stub.fetchImpl;
  t.after(() => { globalThis.fetch = original; });
  return stub.calls;
}
const hostList = (...hosts) => () => new Response(JSON.stringify({ hosts }), { headers: { 'content-type': 'application/json' } });

function assertLockedDown(response) {
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-site');
}

test('a known host is fetched once, then served from KV', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  const calls = withFetch(t, {
    [env.HOSTS_URL]: hostList('example.org'),
    'https://example.org/': page('<link rel="apple-touch-icon" href="/t.png">'),
    'https://example.org/t.png': image(PNG_BYTES),
  });
  const worker = createWorker({ heldBack: [] });
  const first = await serve(worker, env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('content-type'), 'image/png');
  assert.equal(first.headers.get('cache-control'), 'public, max-age=604800');
  assertLockedDown(first);
  assert.deepEqual([...new Uint8Array(await first.arrayBuffer())], [...PNG_BYTES]);
  assert.equal(env.ICONS.puts[0].key, 'icon:example.org');
  assert.equal(env.ICONS.puts[0].options.expirationTtl, 2592000);
  assert.equal(env.ICONS.puts[0].options.metadata.type, 'image/png');
  assert.equal(env.ICONS.puts[0].options.metadata.source, 'site');
  const before = calls.length;
  const second = await serve(worker, env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(second.status, 200);
  assert.deepEqual([...new Uint8Array(await second.arrayBuffer())], [...PNG_BYTES]);
  assert.equal(calls.length, before, 'the second request fetched upstream');
});

test('an unknown or held-back host is a 404 without fetching anything', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  const calls = withFetch(t, { [env.HOSTS_URL]: hostList('example.org', 'held.example.org') });
  const worker = createWorker({ heldBack: ['held.example.org'] });
  for (const host of ['other.example.org', 'held.example.org']) {
    const response = await serve(worker, env, `https://blanc.day/bang-icons/${host}`);
    assert.equal(response.status, 404, host);
    assertLockedDown(response);
  }
  assert.deepEqual(calls.filter((url) => url !== env.HOSTS_URL), []);
  assert.equal(env.ICONS.puts.length, 0);
});

test('a miss is remembered for a day', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, { [env.HOSTS_URL]: hostList('example.org') });
  let lookups = 0;
  const worker = createWorker({ heldBack: [], findIconImpl: async () => { lookups += 1; return null; } });
  const first = await serve(worker, env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(first.status, 404);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(env.ICONS.puts[0].options.expirationTtl, 86400);
  assert.deepEqual(env.ICONS.puts[0].options.metadata, { miss: true });
  assert.equal((await serve(worker, env, 'https://blanc.day/bang-icons/example.org')).status, 404);
  assert.equal(lookups, 1);
});

test('a 200 HTML page is never served as an icon', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, {
    [env.HOSTS_URL]: hostList('example.org'),
    'https://example.org/': page('<link rel="icon" href="/t.png">'),
    'https://example.org/t.png': page('<!doctype html><title>Not found</title>'),
    'https://example.org/favicon.ico': page('<!doctype html><title>Not found</title>'),
    [DDG]: page('<!doctype html><title>Not found</title>'),
  });
  const response = await serve(createWorker({ heldBack: [] }), env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(response.status, 404);
});

test('an unreachable host list answers 503 and caches nothing', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, { [env.HOSTS_URL]: () => new Response('down', { status: 502 }) });
  const response = await serve(createWorker({ heldBack: [] }), env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(env.ICONS.puts.length, 0);
});

test('only GET and HEAD', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, { [env.HOSTS_URL]: hostList('example.org') });
  const response = await serve(createWorker({ heldBack: [] }), env, 'https://blanc.day/bang-icons/example.org', 'POST');
  assert.equal(response.status, 405);
});

test('the hold-back list is reviewed and names only real bang hosts', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '../..');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const heldBack = read('cloudflare/bang-icons-worker/src/held-back.json');
  const hosts = new Set(read('site/public/bang-hosts.json').hosts);
  const data = read('site/src/data/bangs.json');
  const popularHosts = new Set(data.popular.map((code) => data.entries.find((entry) => entry[0] === code || entry[1].includes(code))[3]));
  assert.match(String(heldBack.reviewed), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(heldBack.hosts.length > 0, 'the list is empty');
  assert.deepEqual(heldBack.hosts, [...heldBack.hosts].sort(), 'keep the list sorted');
  for (const host of heldBack.hosts) {
    assert.ok(hosts.has(host), `${host} is not a bang host`);
    assert.ok(!popularHosts.has(host), `${host} is a featured host`);
  }
});

// Review fixes: a hostile homepage, trailing-dot names, cancelled requests and
// the security inventories.

test('a hostile homepage cannot burn CPU or crash the parser', async () => {
  const { iconCandidates } = await load('rules.js');
  const timed = (html) => {
    const started = Date.now();
    const result = iconCandidates(html, 'https://example.org/');
    return { result, ms: Date.now() - started };
  };
  const longName = timed(`<link rel="icon" ${'a'.repeat(262144)}>`);
  assert.ok(longName.ms < 300, `a 256 KiB attribute run took ${longName.ms} ms`);
  const unclosed = timed('<link'.repeat(52428));
  assert.ok(unclosed.ms < 300, `256 KiB of unclosed <link took ${unclosed.ms} ms`);
  const farClose = timed(`${'<link '.repeat(40000)}>`);
  assert.ok(farClose.ms < 300, `<link tags closed far away took ${farClose.ms} ms`);
  const sizes = timed(`<link rel="icon" sizes="${'1x1 '.repeat(150000)}" href="/a.png">`);
  assert.ok(Array.isArray(sizes.result), 'a huge sizes attribute threw');
});

test('a lookup that throws is a miss, not a crash', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, { [env.HOSTS_URL]: hostList('example.org') });
  const worker = createWorker({ heldBack: [], findIconImpl: async () => { throw new RangeError('boom'); } });
  const response = await serve(worker, env, 'https://blanc.day/bang-icons/example.org');
  assert.equal(response.status, 404);
  assert.deepEqual(env.ICONS.puts[0].options.metadata, { miss: true });
});

test('trailing-dot local names are refused, as the app refuses them', async () => {
  const { isPublicUrl } = await load('rules.js');
  for (const url of ['http://localhost./', 'http://printer.local./', 'http://nas.lan./', 'http://foo.internal./', 'http://intranet./']) {
    assert.equal(isPublicUrl(new URL(url)), false, url);
  }
  assert.equal(isPublicUrl(new URL('https://example.org./')), true);
});

test('the lookup is kept alive past a cancelled request', async (t) => {
  const { createWorker } = await load('index.js');
  const env = environment();
  withFetch(t, { [env.HOSTS_URL]: hostList('example.org') });
  let finish;
  const worker = createWorker({ heldBack: [], findIconImpl: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = [];
  const replied = worker.fetch(new Request('https://blanc.day/bang-icons/example.org'), env, { waitUntil: (promise) => pending.push(promise) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(pending.length, 1, 'the lookup was not handed to waitUntil before it finished');
  finish({ bytes: PNG_BYTES, type: 'image/png', source: 'site' });
  await Promise.all(pending);
  assert.equal(env.ICONS.puts.length, 1, 'the icon was not kept');
  assert.equal((await replied).status, 200);
});

test('the security inventories list the bang icons Worker', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '../..');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const flow = read('security/network-data-inventory.json').flows.find((entry) => entry.id === 'bang-icons');
  assert.ok(flow, 'no bang-icons flow');
  assert.equal(flow.surface, 'website');
  assert.ok(flow.code.includes('cloudflare/bang-icons-worker/src/index.js'));
  const boundaries = read('security/audit-surface-inventory.json').boundaries.map((entry) => entry.file);
  for (const file of ['find-icon.js', 'hosts.js', 'index.js', 'rules.js']) {
    assert.ok(boundaries.includes(`cloudflare/bang-icons-worker/src/${file}`), `${file} is not a boundary`);
  }
});
