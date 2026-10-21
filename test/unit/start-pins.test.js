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
const { siteKey, billboardSites, favoriteTiles, samePins } = sandbox.blancStartPins;
// Results come from the vm's realm; compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));

const site = (key, extra = {}) => ({
  key,
  url: `https://${key}/latest/page?q=1`,
  title: `${key} title`,
  favicon: null,
  ...extra,
});
const pin = (url, title, favicon = null) => ({ url, title, favicon });

test('sites are keyed by host, the way main ranks them', () => {
  assert.equal(siteKey('https://www.YouTube.com/watch?v=abc'), 'youtube.com');
  assert.equal(siteKey('http://localhost:8080/app'), 'localhost');
  for (const url of ['javascript:alert(1)', 'blanc://settings/', 'not a url', null]) {
    assert.equal(siteKey(url), null, String(url));
  }
});

test('Billboard: every pin leads in pin order; a pinned site drops its ranked tile', () => {
  const ranked = ['youtube.com', 'cnet.com', 'mdn.example', 'nintendo.com', 'scroll.example', 'blanc.day', 'extra.example']
    .map((key) => site(key));
  const pins = [
    pin('https://nintendo.com/', 'Nintendo', 'data:image/png;base64,n'),
    pin('https://docs.example/a/b?c=1', 'A document'),
  ];
  const row = plain(billboardSites(pins, ranked, new Set(['mdn.example'])));
  assert.deepEqual(row.map((entry) => [entry.key, entry.pinned]), [
    ['nintendo.com', true],
    ['docs.example', true],
    ['youtube.com', false],
    ['cnet.com', false],
    ['scroll.example', false],
    ['blanc.day', false],
  ]);
  // A pin opens exactly what was pinned, under its own name.
  assert.deepEqual(row[0], {
    key: 'nintendo.com', url: 'https://nintendo.com/', title: 'Nintendo', favicon: 'data:image/png;base64,n', pinned: true,
  });
  assert.equal(row[1].url, 'https://docs.example/a/b?c=1');
});

test('Billboard: a pin shows even when its site is hidden or history holds nothing', () => {
  const row = plain(billboardSites([pin('https://hidden.example/', 'Hidden')], [], new Set(['hidden.example'])));
  assert.deepEqual(row.map((entry) => entry.key), ['hidden.example']);
  assert.equal(billboardSites([], Array.from({ length: 20 }, (_, i) => site(`s${i}.example`)), new Set()).length, 6);
});

const favorite = (n) => ({ id: `id-${n}`, url: `https://favorite-${n}.example/`, title: `Favorite ${n}`, favicon: null });

test('favorites layouts: pins lead in pin order, then Favorites in their own order', () => {
  const favorites = Array.from({ length: 9 }, (_, i) => favorite(i + 1));
  const pins = [
    pin(favorite(7).url, 'Old name', 'data:image/png;base64,7'),
    pin('https://not-a-favorite.example/page', 'From a tab'),
    pin(favorite(2).url, 'Favorite 2'),
  ];
  const tiles = plain(favoriteTiles(pins, favorites, 5));
  assert.deepEqual(tiles.map((tile) => [tile.url, tile.pinned]), [
    [favorite(7).url, true],
    ['https://not-a-favorite.example/page', true],
    [favorite(2).url, true],
    [favorite(1).url, false],
    [favorite(3).url, false],
  ]);
  // A pinned Favorite draws as that Favorite, borrowing the pin's icon only
  // when it has none of its own.
  assert.equal(tiles[0].id, 'id-7');
  assert.equal(tiles[0].title, 'Favorite 7');
  assert.equal(tiles[0].favicon, 'data:image/png;base64,7');
  // A pinned page that isn't a Favorite draws from the pin.
  assert.deepEqual(tiles[1], { url: 'https://not-a-favorite.example/page', title: 'From a tab', favicon: null, pinned: true });
  // A pin brings a favorite past a layout's limit onto it.
  assert.equal(plain(favoriteTiles([pin(favorite(9).url, 'Favorite 9')], favorites, 5))[0].id, 'id-9');
  assert.equal(favoriteTiles([], favorites, 8).length, 8);
  assert.equal(favoriteTiles([pin('https://only.example/', 'Only')], [], 6).length, 1);
});

test('a change notice that brings nothing new is recognized', () => {
  const a = [pin('https://a.test/', 'A'), pin('https://b.test/', 'B', 'data:image/png;base64,b')];
  assert.equal(samePins(a, a.map((entry) => ({ ...entry }))), true);
  assert.equal(samePins(a, [a[1], a[0]]), false);
  assert.equal(samePins(a, [a[0]]), false);
  assert.equal(samePins(a, [a[0], { ...a[1], favicon: null }]), false);
  assert.equal(samePins([], []), true);
});
