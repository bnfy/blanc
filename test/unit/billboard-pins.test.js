'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/billboard-pins.js'), 'utf8');
const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const { MAX_PINS, pinFor, readPins, addPin, removePin, billboardSites } = sandbox.blancBillboardPins;
// Results come from the vm's realm; compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));

const site = (key, extra = {}) => ({
  key,
  url: `https://${key}/latest/page?q=1`,
  title: `${key} title`,
  favicon: null,
  ...extra,
});

test('a pin keeps only the hostname key and the origin', () => {
  assert.deepEqual(plain(pinFor('https://www.YouTube.com/watch?v=abc#t=1')), {
    key: 'youtube.com',
    url: 'https://www.youtube.com/',
  });
  assert.deepEqual(plain(pinFor('http://localhost:8080/app')), { key: 'localhost', url: 'http://localhost:8080/' });
  for (const url of ['javascript:alert(1)', 'blanc://settings/', 'file:///etc/passwd', 'not a url', null, 42]) {
    assert.equal(pinFor(url), null, String(url));
  }
});

test('saved pins are re-derived, de-duplicated and bounded to the row', () => {
  const saved = [
    { key: 'youtube.com', url: 'https://www.youtube.com/' },
    { key: 'youtube.com', url: 'https://youtube.com/' },
    { key: 'evil.example', url: 'https://bank.example/' },
    { key: 'script', url: 'javascript:alert(1)' },
    { key: 'deep.example', url: 'https://deep.example/private/path?token=1' },
    null,
    'cnet.com',
    ...Array.from({ length: 10 }, (_, i) => ({ key: `site-${i}.example`, url: `https://site-${i}.example/` })),
  ];
  const pins = plain(readPins(saved));
  assert.equal(pins.length, MAX_PINS);
  assert.deepEqual(pins.slice(0, 2), [
    { key: 'youtube.com', url: 'https://www.youtube.com/' },
    // A stored path is never kept, even from a hand-edited entry.
    { key: 'deep.example', url: 'https://deep.example/' },
  ]);
  assert.deepEqual(plain(readPins('not an array')), []);
  assert.deepEqual(plain(readPins(undefined)), []);
});

test('pinning adds a site once, at the end, up to the row size', () => {
  let pins = [];
  pins = addPin(pins, site('youtube.com'));
  pins = addPin(pins, site('cnet.com'));
  pins = addPin(pins, site('youtube.com'));
  assert.deepEqual(plain(pins), [
    { key: 'youtube.com', url: 'https://youtube.com/' },
    { key: 'cnet.com', url: 'https://cnet.com/' },
  ]);
  // A key that doesn't match its own URL is refused.
  assert.equal(addPin(pins, { key: 'cnet.com', url: 'https://other.example/' }), pins);
  for (let i = 0; i < 10; i++) pins = addPin(pins, site(`site-${i}.example`));
  assert.equal(pins.length, MAX_PINS);
  assert.deepEqual(plain(removePin(pins, 'cnet.com')).map((pin) => pin.key).slice(0, 2), ['youtube.com', 'site-0.example']);
});

test('pinned sites lead the row in pin order; the rest follow their ranking', () => {
  const ranked = ['youtube.com', 'cnet.com', 'mdn.example', 'nintendo.com', 'scroll.example', 'blanc.day', 'extra.example']
    .map((key) => site(key, { favicon: `data:image/png;base64,${key}` }));
  const pins = [
    { key: 'nintendo.com', url: 'https://nintendo.com/' },
    { key: 'cnet.com', url: 'https://cnet.com/' },
  ];
  const row = plain(billboardSites(pins, ranked, new Set(['mdn.example'])));
  assert.deepEqual(row.map((entry) => [entry.key, entry.pinned]), [
    ['nintendo.com', true],
    ['cnet.com', true],
    ['youtube.com', false],
    ['scroll.example', false],
    ['blanc.day', false],
    ['extra.example', false],
  ]);
  // A ranked pin draws its ranked page, title and icon like any tile.
  assert.equal(row[0].url, 'https://nintendo.com/latest/page?q=1');
  assert.equal(row[0].title, 'nintendo.com title');
  assert.equal(row[0].favicon, 'data:image/png;base64,nintendo.com');
});

test('a pin history no longer holds still shows, opening its origin', () => {
  const row = plain(billboardSites(
    [{ key: 'gone.example', url: 'https://gone.example/' }],
    [site('youtube.com')],
    new Set(),
  ));
  assert.deepEqual(row[0], { key: 'gone.example', url: 'https://gone.example/', title: '', favicon: null, pinned: true });
  assert.equal(row[1].key, 'youtube.com');
});

test('the row never exceeds its limit', () => {
  const ranked = Array.from({ length: 20 }, (_, i) => site(`site-${i}.example`));
  assert.equal(billboardSites([], ranked, new Set()).length, 6);
  assert.equal(billboardSites([], ranked, new Set(), 4).length, 4);
});
