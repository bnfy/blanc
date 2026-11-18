'use strict';
// Editing a favorite's name and address on the Favorites page (support
// request, November 18, 2026): bookmark-data.applyEditFavorite and the typed
// address rules in bookmark-validate.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEditFavorite } = require('../../src/main/bookmark-data');
const { editableAddress, editableTitle } = require('../../src/main/bookmark-validate');
const { favoriteChildKey } = require('../../src/main/favorites-tree');
const { EMPTY_LAYOUT, setFolderOrder, layoutEntry } = require('../../src/main/favorites-layout-model');

const NOW = Date.UTC(2026, 10, 18, 12);
const ctx = { now: NOW, tie: 't' };
const ICON = 'data:image/png;base64,AAAA';

const fav = (over) => ({
  id: 'a', url: 'https://example.com/docs', title: 'Docs — Example', favicon: ICON,
  addedAt: 100, updatedAt: 200, folder: null, ...over,
});

test('editableAddress keeps web addresses and reads a bare name as https', () => {
  assert.equal(editableAddress('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(editableAddress('  http://example.com  '), 'http://example.com/');
  assert.equal(editableAddress('example.com/path'), 'https://example.com/path');
  assert.equal(editableAddress('localhost:3000'), 'https://localhost:3000/');
  assert.equal(editableAddress('HTTPS://Example.COM'), 'https://example.com/');
});

test('editableAddress refuses anything that is not a web page', () => {
  for (const typed of ['', '   ', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/hosts',
    'blanc://settings/', 'chrome://version', 'ftp://example.com/', 'https://user:pw@example.com/',
    'exa mple.com', 'https://', 7, null, undefined, `https://example.com/${'x'.repeat(5000)}`]) {
    assert.equal(editableAddress(typed), null, String(typed).slice(0, 40));
  }
});

test('editableTitle trims and caps a name', () => {
  assert.equal(editableTitle('  Team wiki  '), 'Team wiki');
  assert.equal(editableTitle('   '), '');
  assert.equal(editableTitle(42), '');
  assert.equal(editableTitle('x'.repeat(900)).length, 500);
});

test('renaming changes the name and its clock, nothing else', () => {
  const state = { items: [fav(), fav({ id: 'b', url: 'https://other.test/' })], tombstones: [], layout: EMPTY_LAYOUT };
  const res = applyEditFavorite(state, 'a', { title: '  Wiki ' }, ctx);
  assert.equal(res.changed, true);
  assert.deepEqual(res.items[0], { ...fav(), title: 'Wiki', updatedAt: NOW });
  assert.equal(res.items[1], state.items[1]);
  assert.deepEqual(res.tombstones, []);
  assert.equal(res.layout, state.layout);
  assert.equal(res.key, favoriteChildKey('https://example.com/docs'));
  assert.deepEqual(res.edited, {
    from: { url: 'https://example.com/docs', title: 'Docs — Example' },
    to: { url: 'https://example.com/docs', title: 'Wiki' },
    key: res.key,
  });
});

test('a blank name falls back to the address, as saving does', () => {
  const res = applyEditFavorite({ items: [fav()], tombstones: [] }, 'a', { title: '  ' }, ctx);
  assert.equal(res.items[0].title, 'https://example.com/docs');
});

test('saving what is already there changes nothing', () => {
  const state = { items: [fav()], tombstones: [], layout: EMPTY_LAYOUT };
  const res = applyEditFavorite(state, 'a', { title: 'Docs — Example', url: ' https://example.com/docs ' }, ctx);
  assert.equal(res.changed, false);
  assert.equal(res.items, state.items);
  // The same page typed another way is the same address.
  assert.equal(applyEditFavorite({ items: [fav({ url: 'https://example.com/' })], tombstones: [] }, 'a',
    { title: 'Docs — Example', url: 'example.com' }, ctx).changed, false);
});

test('a new address replaces the favorite in its folder and leaves a tombstone for sync', () => {
  const state = {
    items: [fav({ folder: 'Work › Docs' })],
    tombstones: [{ url: 'https://example.com/v2', deletedAt: 50 }, { url: 'https://gone.test/', deletedAt: 60 }],
    layout: EMPTY_LAYOUT,
  };
  const res = applyEditFavorite(state, 'a', { url: 'example.com/v2', title: 'Docs v2' }, ctx);
  assert.equal(res.changed, true);
  assert.deepEqual(res.items, [{
    id: 'a', url: 'https://example.com/v2', title: 'Docs v2', favicon: ICON, addedAt: 100, updatedAt: NOW, folder: 'Work › Docs',
  }]);
  // The old address is deleted everywhere; an old delete of the new one no longer applies.
  assert.deepEqual(res.tombstones, [
    { url: 'https://gone.test/', deletedAt: 60 },
    { url: 'https://example.com/docs', deletedAt: NOW },
  ]);
  assert.equal(res.key, favoriteChildKey('https://example.com/v2'));
  assert.equal(res.edited.from.url, 'https://example.com/docs');
});

test('another site drops the old icon; the same site keeps it', () => {
  const other = applyEditFavorite({ items: [fav()], tombstones: [] }, 'a', { url: 'https://elsewhere.test/' }, ctx);
  assert.equal(other.items[0].favicon, null);
  const same = applyEditFavorite({ items: [fav()], tombstones: [] }, 'a', { url: 'https://example.com/other' }, ctx);
  assert.equal(same.items[0].favicon, ICON);
});

test('a new address keeps its place in the order the person chose', () => {
  const first = fav({ id: 'x', url: 'https://first.test/' });
  const last = fav({ id: 'z', url: 'https://last.test/' });
  const order = [favoriteChildKey(first.url), favoriteChildKey('https://example.com/docs'), favoriteChildKey(last.url), 'f:inbox'];
  for (const folder of [null, 'Work']) {
    const items = [first, fav({ folder }), last].map((it) => ({ ...it, folder }));
    const layout = setFolderOrder(EMPTY_LAYOUT, folder, order, { at: 10 });
    const res = applyEditFavorite({ items, tombstones: [], layout }, 'a', { url: 'https://example.com/new' }, ctx);
    assert.deepEqual(layoutEntry(res.layout, folder).order,
      [order[0], favoriteChildKey('https://example.com/new'), order[2], 'f:inbox'], String(folder));
    assert.ok(layoutEntry(res.layout, folder).at > 10);
  }
});

test('refusals change nothing', () => {
  const state = { items: [fav(), fav({ id: 'b', url: 'https://taken.test/' })], tombstones: [], layout: EMPTY_LAYOUT };
  assert.equal(applyEditFavorite(state, 'nope', { title: 'x' }, ctx).error, 'missing');
  assert.equal(applyEditFavorite(state, 'a', { url: 'javascript:alert(1)' }, ctx).error, 'invalid-url');
  assert.equal(applyEditFavorite(state, 'a', { url: '' }, ctx).error, 'invalid-url');
  const taken = applyEditFavorite(state, 'a', { url: 'taken.test', title: 'Renamed too' }, ctx);
  assert.equal(taken.error, 'exists');
  assert.equal(taken.changed, false);
  assert.equal(taken.items, state.items);
});
