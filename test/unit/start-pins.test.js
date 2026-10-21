'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/start-pins.js'), 'utf8');
const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const {
  MAX_SITE_PINS,
  MAX_FAVORITE_PINS,
  pinFor,
  readPins,
  addPin,
  removePin,
  billboardSites,
  readFavoritePins,
  addFavoritePin,
  removeFavoritePin,
  livingFavoritePins,
  favoriteTiles,
} = sandbox.blancStartPins;
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
  assert.equal(pins.length, MAX_SITE_PINS);
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
  assert.equal(pins.length, MAX_SITE_PINS);
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

const favorite = (n) => ({ id: `id-${n}`, url: `https://favorite-${n}.example/page?ref=${n}`, title: `Favorite ${n}` });

test('saved favorite pins are bounded strings, without repeats', () => {
  const saved = [
    favorite(1).url,
    favorite(1).url,
    '',
    42,
    null,
    'x'.repeat(8193),
    ...Array.from({ length: 12 }, (_, i) => favorite(i + 2).url),
  ];
  const pins = plain(readFavoritePins(saved));
  assert.equal(pins.length, MAX_FAVORITE_PINS);
  assert.deepEqual(pins.slice(0, 2), [favorite(1).url, favorite(2).url]);
  assert.deepEqual(plain(readFavoritePins({})), []);
});

test('pinning a favorite adds it once, at the end, up to Shelf\'s eight', () => {
  let pins = [];
  pins = addFavoritePin(pins, favorite(3).url);
  pins = addFavoritePin(pins, favorite(1).url);
  pins = addFavoritePin(pins, favorite(3).url);
  assert.deepEqual(plain(pins), [favorite(3).url, favorite(1).url]);
  for (let n = 10; n < 20; n++) pins = addFavoritePin(pins, favorite(n).url);
  assert.equal(pins.length, MAX_FAVORITE_PINS);
  assert.deepEqual(plain(removeFavoritePin(pins, favorite(3).url)).slice(0, 2), [favorite(1).url, favorite(10).url]);
});

test('pinned favorites lead in pin order; the rest keep their Favorites order', () => {
  const favorites = Array.from({ length: 9 }, (_, i) => favorite(i + 1));
  const pins = [favorite(7).url, 'https://deleted.example/', favorite(2).url];
  const tiles = plain(favoriteTiles(pins, favorites, 5));
  assert.deepEqual(tiles.map((tile) => [tile.id, tile.pinned]), [
    ['id-7', true],
    ['id-2', true],
    ['id-1', false],
    ['id-3', false],
    ['id-4', false],
  ]);
  assert.equal(tiles[0].url, favorite(7).url);
  assert.equal(tiles[0].title, 'Favorite 7');
  // A pin can bring a favorite past a layout's limit onto it.
  assert.equal(plain(favoriteTiles([favorite(9).url], favorites, 5))[0].id, 'id-9');
  assert.equal(favoriteTiles([], favorites, 8).length, 8);
});

test('a deleted favorite\'s pin is dropped', () => {
  const favorites = [favorite(1), favorite(2)];
  assert.deepEqual(
    plain(livingFavoritePins([favorite(2).url, 'https://deleted.example/', favorite(1).url], favorites)),
    [favorite(2).url, favorite(1).url],
  );
  assert.deepEqual(plain(livingFavoritePins([favorite(1).url], [])), []);
});
