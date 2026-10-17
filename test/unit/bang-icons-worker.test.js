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
