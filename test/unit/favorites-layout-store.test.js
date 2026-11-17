'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-favorites-layout-'));
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
const { EMPTY_LAYOUT, setFolderOrder, layoutsEqual } = require('../../src/main/favorites-layout-model');
const { favoriteChildKey } = require('../../src/main/favorites-tree');

test.after(() => {
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const names = (node) => node.children.map((c) => (c.kind === 'folder' ? `[${c.folder.name}]` : c.item.url));
const reset = () => {
  bookmarks.removeBookmarks(bookmarks.listBookmarks().map((b) => b.id));
  layout.setLayout(EMPTY_LAYOUT);
};

test('a never-touched profile exports nothing', () => {
  assert.equal(layout.exportForSync(), null);
  assert.ok(layoutsEqual(layout.getLayout(), EMPTY_LAYOUT));
});

test('a local change stamps a clock and tells listeners once', () => {
  let changes = 0;
  layout.onChanged(() => { changes += 1; });
  const next = setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:1'], { at: 50, tie: 'me' });
  assert.equal(layout.setLayout(next), true);
  assert.equal(layout.setLayout(next), false);
  assert.equal(changes, 1);
  const out = layout.exportForSync();
  assert.ok(out.at > 0);
  assert.deepEqual(out.value.folders.home.order, ['u:1']);
});

test('a merge that changes the value raises the clock above both sides', () => {
  layout.setLayout(setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:2'], { at: 50, tie: 'me' }));
  const before = layout.exportForSync().at;
  const remoteValue = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 60, tie: 'them' });
  let merges = 0;
  layout.onMerged(() => { merges += 1; });
  assert.equal(layout.mergeFromSync({ value: remoteValue, at: before + 1000, tie: 'them' }), true);
  const out = layout.exportForSync();
  assert.ok(out.at > before + 1000);
  assert.ok(out.value.folders.home && out.value.folders.work);
  assert.equal(merges, 1);
});

test('a merge that equals the remote adopts its clock and does not rise', () => {
  const mine = layout.exportForSync();
  const at = mine.at + 5000;
  layout.mergeFromSync({ value: mine.value, at, tie: 'them' });
  const out = layout.exportForSync();
  assert.equal(out.at, at);
  assert.equal(out.tie, 'them');
  // An older copy of the same value changes nothing.
  layout.mergeFromSync({ value: mine.value, at: at - 10, tie: 'old' });
  assert.equal(layout.exportForSync().at, at);
  assert.equal(layout.exportForSync().tie, 'them');
});

test('a remote without the value is ignored', () => {
  const before = layout.exportForSync();
  assert.equal(layout.mergeFromSync({ value: undefined, at: undefined, tie: undefined }), false);
  assert.equal(layout.mergeFromSync(null), false);
  assert.deepEqual(layout.exportForSync(), before);
});

test('an unreadable remote value keeps ours and outranks it', () => {
  const before = layout.exportForSync();
  layout.mergeFromSync({ value: 'nonsense', at: before.at + 100, tie: 'x' });
  const out = layout.exportForSync();
  assert.ok(layoutsEqual(out.value, before.value));
  assert.ok(out.at > before.at + 100);
});

test('folder operations write both stores and report errors', () => {
  reset();
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Work › Clients');
  bookmarks.saveFavorite('https://b.example/', 'B', null, 'Work › Clients');
  assert.deepEqual(bookmarks.createFolder('Work', 'Empty'), { ok: true, path: 'Work › Empty' });
  assert.deepEqual(bookmarks.renameFolder('Work', 'Jobs'), { ok: true });
  assert.deepEqual(bookmarks.listBookmarks().map((b) => b.folder), ['Jobs › Clients', 'Jobs › Clients']);
  assert.deepEqual(bookmarks.moveFolder('Jobs', 'Jobs › Clients'), { ok: false, error: 'cycle' });
  const keys = ['https://a.example/', 'https://b.example/'].map(favoriteChildKey);
  assert.deepEqual(bookmarks.reorderFolder('Jobs › Clients', keys), { ok: true });
  const jobs = bookmarks.getTree().children[0].folder;
  assert.deepEqual(names(jobs), ['[Clients]', '[Empty]']);
  const clients = jobs.children[0].folder;
  assert.deepEqual(names(clients), ['https://a.example/', 'https://b.example/']);
  assert.equal(clients.children[0].item.key, keys[0]);
  assert.deepEqual(bookmarks.removeFolder('Jobs › Clients'), { ok: true });
  assert.deepEqual(bookmarks.listBookmarks().map((b) => b.folder), ['Jobs', 'Jobs']);
});

test('toggle keeps the emptied folder', () => {
  reset();
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Solo');
  assert.equal(bookmarks.toggleBookmark('https://a.example/', 'A', null), false);
  assert.deepEqual(names(bookmarks.getTree()), ['[Solo]']);
});

test('removing by id and moving several keep emptied folders too', () => {
  reset();
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'One');
  bookmarks.saveFavorite('https://b.example/', 'B', null, 'Two');
  const [a, b] = bookmarks.listBookmarks();
  bookmarks.removeBookmark(a.id);
  assert.deepEqual(bookmarks.moveFavorites([b.id], null), { ok: true });
  assert.deepEqual(names(bookmarks.getTree()), ['[One]', '[Two]', 'https://b.example/']);
  assert.deepEqual(bookmarks.exportForSync().tombstones.map((t) => t.url).includes('https://a.example/'), true);
});

test('a favorites change notifies once per operation', () => {
  reset();
  let changes = 0;
  bookmarks.onChanged(() => { changes += 1; });
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Solo');
  bookmarks.setBookmarkFolder(bookmarks.listBookmarks()[0].id, null);
  bookmarks.setBookmarkFolder(bookmarks.listBookmarks()[0].id, null);
  assert.equal(changes, 2);
});
