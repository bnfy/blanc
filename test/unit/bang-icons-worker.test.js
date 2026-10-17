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
