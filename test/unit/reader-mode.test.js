'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizeAppearance, webUrl, eligible, validArticle } = require('../../src/main/reader-model');
const { createReaderImageBroker, fetchPublicRaster, rasterDimensions } = require('../../src/main/reader-images');

test('reader appearance admits only supported finite choices and sizes', () => {
  assert.deepEqual(normalizeAppearance({ theme: 'sepia', font: 'sans', size: 28, width: 'wide' }),
    { theme: 'sepia', font: 'sans', size: 28, width: 'wide' });
  for (const size of [true, '20', 17, 30, Infinity, NaN, null]) assert.equal(normalizeAppearance({ size }).size, 20);
  assert.deepEqual(normalizeAppearance({ theme: 'url(x)', font: 'remote', width: '100vw' }), normalizeAppearance(null));
});
test('reader URL and eligibility reject privileged, credentialed, inherited and sleeping documents', () => {
  for (const url of ['file:///tmp/x', 'blanc://settings/', 'javascript:alert(1)', 'https://u:p@example.com/']) assert.equal(webUrl(url), null);
  assert.equal(webUrl('../article', 'https://example.com/news/a'), 'https://example.com/article');
  const wc = { isDestroyed: () => false, getURL: () => 'https://example.com/article' };
  assert.equal(eligible({}, wc), true);
  for (const flag of ['asleep', 'sleeping', 'inert', 'inheritsDocumentPolicy', 'isLoading']) assert.equal(eligible({ [flag]: true }, wc), false);
  assert.equal(validArticle({ content: '<p>ok</p>', textContent: 'a'.repeat(200), images: [] }), true);
  assert.equal(validArticle({ content: '<p>ok</p>', textContent: 'short', images: [] }), false);
});
test('image requests pin DNS and never connect to a non-public resolution or accept SVG', async () => {
  let requests = 0;
  const request = (_url, options, respond) => {
    requests++;
    options.lookup('example.com', { all: true }, (_error, addresses) => assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]));
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Referer, undefined);
    const req = new EventEmitter(); req.setTimeout = () => {}; req.end = () => {
      const response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'image/svg+xml' };
      response.destroy = () => {}; respond(response);
    }; return req;
  };
  assert.equal(await fetchPublicRaster('https://example.com/x', {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }], request,
  }), null);
  assert.equal(requests, 0);
  assert.equal(await fetchPublicRaster('https://example.com/x', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }], request,
  }), null);
  assert.equal(requests, 1);
});
function record() {
  return { tab: {}, article: { images: ['https://example.com/image'] }, closed: false,
    imageCache: new Map(), imageControllers: new Set(), imageActive: 0, imageCount: 0, imageBytes: 0 };
}
test('image broker fails closed on provider denial/error and bounds per-article downloads', async () => {
  let fetches = 0;
  for (const allowImage of [async () => false, async () => { throw Error('provider unavailable'); }]) {
    const broker = createReaderImageBroker({ allowImage, fetchImage: async () => { fetches++; }, decode: () => null });
    assert.equal(await broker(record(), 0), null);
  }
  assert.equal(fetches, 0);
  const broker = createReaderImageBroker({ allowImage: async () => true,
    fetchImage: async () => { fetches++; return Buffer.from('raster'); }, dimensions: () => ({width:1,height:1}), decode: bytes => bytes });
  const state = record();
  assert.equal((await broker(state, 0)).toString(), 'raster');
  assert.equal((await broker(state, 0)).toString(), 'raster');
  assert.equal(fetches, 1);
  state.imageCache.clear(); state.imageCount = 30;
  assert.equal(await broker(state, 0), null);
  state.imageCount = 0; state.closed = true;
  assert.equal(await broker(state, 0), null);
});

test('raster dimensions are checked from bounded headers before native decoding', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  assert.deepEqual(rasterDimensions(png), { width: 640, height: 480 });
  png.writeUInt32BE(100000, 16); png.writeUInt32BE(100000, 20);
  assert.ok(rasterDimensions(png).width * rasterDimensions(png).height > 16 * 1024 * 1024);
  assert.equal(rasterDimensions(Buffer.from('<svg width="999999"/>')), null);
  assert.equal(rasterDimensions(Buffer.alloc(8)), null);
});

test('both provider choices receive the original image context and proxy routes are never bypassed', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const start = source.indexOf('  allowImage: async (tab, url) => {');
  const end = source.indexOf('  resolveImageHost:', start);
  const fn = source.slice(start, end).trim().replace(/^allowImage:\s*/, '').replace(/,$/, '');
  for (const providerId of ['blanc', 'ublock-origin']) {
    let decision = { cancel: false }, proxy = 'DIRECT';
    const calls = [];
    const wc = { id: 42, mainFrame: { marker: 'original frame' }, getURL: () => 'https://publisher.example/article',
      session: { resolveProxy: async () => proxy } };
    const tab = { providerId };
    const sandbox = { liveContents: () => wc, readerImageSeq: 0,
      blockingProviders: { effectiveForTab: received => {
        assert.equal(received, tab);
        return { decide: async (event, details) => { calls.push({ event, details }); return decision; } };
      } } };
    vm.runInNewContext(`this.imageAllowed = ${fn}`, sandbox);
    assert.equal(await sandbox.imageAllowed(tab, 'https://cdn.example/photo.png'), true);
    assert.equal(calls[0].event, 'onBeforeRequest');
    assert.equal(calls[0].details.resourceType, 'image');
    assert.equal(calls[0].details.webContentsId, wc.id);
    assert.equal(calls[0].details.frame, wc.mainFrame);
    assert.equal(calls[0].details.referrer, wc.getURL());
    for (const blocked of [{ cancel: true }, { redirectURL: 'https://elsewhere.example/' }, null]) {
      decision = blocked;
      assert.equal(await sandbox.imageAllowed(tab, 'https://cdn.example/photo.png'), false);
    }
    proxy = 'PROXY corporate.example:8080';
    const before = calls.length;
    assert.equal(await sandbox.imageAllowed(tab, 'https://cdn.example/photo.png'), false);
    assert.equal(calls.length, before);
  }
});
