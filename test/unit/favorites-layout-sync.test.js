'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-favorites-sync-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};
for (const name of ['store', 'favorites-layout', 'bookmarks']) {
  delete require.cache[require.resolve(`../../src/main/${name}`)];
}
const layout = require('../../src/main/favorites-layout');
const bookmarks = require('../../src/main/bookmarks');
const {
  EMPTY_LAYOUT, RESTORE_INTERVAL_MS, setFolderOrder, layoutsEqual, withFavoritesLayout, settingsEqualsWithLayout,
} = require('../../src/main/favorites-layout-model');
const { favoriteChildKey } = require('../../src/main/favorites-tree');

test.after(() => {
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const names = (node) => node.children.map((c) => (c.kind === 'folder' ? `[${c.folder.name}]` : c.item.url));
const payloadWith = (values) => ({
  values: { ...values },
  meta: Object.fromEntries(Object.keys(values).map((k) => [k, 5])),
  tieBreakers: {},
});
// settings.syncPayloadEquals compares every clocked value; this stands in for it.
const baseEquals = (a, b) => JSON.stringify([a.values, a.meta]) === JSON.stringify([b.values, b.meta]);

// An older desktop: keeps only the favorite fields it knows (a folder over
// 100 characters becomes none) and uploads settings without favoritesLayout.
const olderDesktop = (blob) => ({
  bookmarks: {
    tombstones: blob.bookmarks.tombstones,
    items: blob.bookmarks.items.map(({ id, url, title, favicon, addedAt, updatedAt, folder }) => ({
      id, url, title, favicon, addedAt, updatedAt,
      folder: typeof folder === 'string' && folder.trim().length >= 1 && folder.trim().length <= 100 ? folder.trim() : null,
    })),
  },
  settings: { values: {}, meta: {}, tieBreakers: {} },
});

test('the payload carries the record only once it has a clock', () => {
  const base = payloadWith({ theme: 'dark' });
  assert.equal(withFavoritesLayout(base, null), base);
  const out = withFavoritesLayout(base, { value: EMPTY_LAYOUT, at: 9, tie: 't' });
  assert.deepEqual(out.values.favoritesLayout, EMPTY_LAYOUT);
  assert.equal(out.meta.favoritesLayout, 9);
  assert.equal(out.tieBreakers.favoritesLayout, 't');
  assert.equal(base.values.favoritesLayout, undefined);
});

test('older client round trip keeps paths and brings order back', () => {
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Work › Clients');
  bookmarks.saveFavorite('https://b.example/', 'B', null, 'Work › Clients');
  const keys = ['https://a.example/', 'https://b.example/'].map(favoriteChildKey);
  bookmarks.reorderFolder('Work › Clients', keys);
  const before = names(bookmarks.getTree().children[0].folder.children[0].folder);
  assert.deepEqual(before, ['https://a.example/', 'https://b.example/']);

  const uploaded = { bookmarks: bookmarks.exportForSync(), settings: withFavoritesLayout(payloadWith({}), layout.exportForSync()) };
  const rewritten = olderDesktop(JSON.parse(JSON.stringify(uploaded)));
  assert.equal(rewritten.settings.values.favoritesLayout, undefined);

  bookmarks.mergeFromSync(rewritten.bookmarks);
  layout.mergeFromSync({
    value: rewritten.settings.values.favoritesLayout,
    at: rewritten.settings.meta.favoritesLayout,
    tie: rewritten.settings.tieBreakers.favoritesLayout,
  });
  assert.deepEqual(bookmarks.listBookmarks().map((b) => b.folder), ['Work › Clients', 'Work › Clients']);
  assert.deepEqual(names(bookmarks.getTree().children[0].folder.children[0].folder), before);
  const next = withFavoritesLayout(payloadWith({}), layout.exportForSync());
  assert.deepEqual(next.values.favoritesLayout.folders['work › clients'].order, keys);
});

test('a client that keeps the value whole settles', () => {
  // Another desktop's record, held whole by an iPhone or the fork.
  let kept = { value: setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:9'], { at: 40, tie: 'other' }), at: 100, tie: 'other' };
  const keeper = (exported) => { if (exported.at > kept.at) kept = JSON.parse(JSON.stringify(exported)); };
  const pass = () => { layout.mergeFromSync(kept); const out = layout.exportForSync(); keeper(out); return out; };

  const first = pass();
  assert.ok(first.at > 100);
  assert.ok(first.value.folders.home && first.value.folders['work › clients']);
  const second = pass();
  const third = pass();
  assert.equal(second.at, first.at);
  assert.equal(third.at, first.at);
  assert.ok(layoutsEqual(third.value, kept.value));
});

// payloadWith stamps every value with clock 5.
const uploaded = (clock, at) => ({ clock, at });

test('restore is bounded to once per ten minutes after a successful upload of the same record', () => {
  assert.equal(RESTORE_INTERVAL_MS, 600000);
  const exported = payloadWith({ theme: 'dark', favoritesLayout: EMPTY_LAYOUT });
  const remote = payloadWith({ theme: 'dark' });
  const ask = (lastUpload, now) => settingsEqualsWithLayout(exported, remote, { baseEquals, lastUpload, now });
  assert.equal(ask(uploaded(0, 0), 1_000_000), false);                         // never uploaded
  assert.equal(ask(uploaded(5, 1_000_000), 1_000_000 + 599_999), true);        // just restored this record
  assert.equal(ask(uploaded(5, 1_000_000), 1_000_000 + 600_000), false);       // due again
});

test('a local edit since the last upload is never held back', () => {
  const exported = payloadWith({ theme: 'dark', favoritesLayout: EMPTY_LAYOUT });
  const remote = payloadWith({ theme: 'dark' });
  // The record uploaded last had clock 4; this one has clock 5.
  assert.equal(settingsEqualsWithLayout(exported, remote, { baseEquals, lastUpload: uploaded(4, 1_000_000), now: 1_000_001 }), false);
});

test('another difference still uploads, and equal payloads do not', () => {
  const exported = payloadWith({ theme: 'dark', favoritesLayout: EMPTY_LAYOUT });
  const recent = { baseEquals, lastUpload: uploaded(5, 9e12), now: 9e12 };
  assert.equal(settingsEqualsWithLayout(exported, payloadWith({ theme: 'light' }), recent), false);
  assert.equal(settingsEqualsWithLayout(exported, payloadWith({ theme: 'dark', favoritesLayout: { version: 1, folders: { x: 1 } } }), recent), false);
  assert.equal(settingsEqualsWithLayout(exported, exported, { baseEquals, lastUpload: uploaded(0, 0), now: 5 }), true);
  assert.equal(settingsEqualsWithLayout(payloadWith({ theme: 'dark' }), payloadWith({ theme: 'dark' }), { baseEquals, lastUpload: uploaded(0, 0), now: 5 }), true);
});

test('sync.js stamps the restore time only after the upload succeeds', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/sync.js'), 'utf8');
  const equals = source.match(/function settingsSyncEquals\(exported, remote\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(equals, /lastLayoutUpload = /);
  assert.match(source, /stored: noteSettingsStored,/);
  assert.match(source, /function noteSettingsStored\(payload\) \{[\s\S]*?if \(!settingsPutPending\) return;[\s\S]*?lastLayoutUpload = /);
});
