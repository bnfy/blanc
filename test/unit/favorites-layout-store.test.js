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
  layout.resetForTests();
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

test('equal clocks settle on the smaller tie from either side', () => {
  const mine = layout.exportForSync();                       // tie 'them'
  layout.mergeFromSync({ value: mine.value, at: mine.at, tie: 'zzz' });
  assert.equal(layout.exportForSync().tie, 'them');
  layout.mergeFromSync({ value: mine.value, at: mine.at, tie: 'aaa' });
  assert.equal(layout.exportForSync().tie, 'aaa');
  assert.equal(layout.exportForSync().at, mine.at);
});

test('a remote clock at the limit never leaves the record without a valid clock', () => {
  const limit = Date.UTC(3000, 0, 1) - 1;
  const other = setFolderOrder(EMPTY_LAYOUT, 'Limit', ['u:1'], { at: 70, tie: 'x' });
  layout.mergeFromSync({ value: other, at: limit, tie: 'x' });
  const out = layout.exportForSync();
  assert.ok(out, 'still exported');
  assert.ok(out.value.folders.limit);
  layout.resetForTests();
});

test('a remote without the value is ignored', () => {
  layout.setLayout(setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:4'], { at: 50, tie: 'me' }));
  const before = layout.exportForSync();
  assert.equal(layout.mergeFromSync({ value: undefined, at: undefined, tie: undefined }), false);
  assert.equal(layout.mergeFromSync(null), false);
  assert.deepEqual(layout.exportForSync(), before);
});

test('an unreadable remote value keeps ours and outranks it', () => {
  layout.setLayout(setFolderOrder(EMPTY_LAYOUT, 'Home', ['u:3'], { at: 50, tie: 'me' }));
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

// A host whose Favorites page has no tree (setManagerLive(false)): emptying a
// folder leaves nothing behind, as before paths.
test('with the manager off, toggle does not keep an emptied folder', (t) => {
  bookmarks.setManagerLive(false);
  t.after(() => bookmarks.setManagerLive(true));
  reset();
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'Solo');
  assert.equal(bookmarks.toggleBookmark('https://a.example/', 'A', null), false);
  assert.deepEqual(names(bookmarks.getTree()), []);
  assert.equal(layout.exportForSync(), null);
});

test('with the manager off, removing by id and moving several leave no empty folders either', (t) => {
  bookmarks.setManagerLive(false);
  t.after(() => bookmarks.setManagerLive(true));
  reset();
  bookmarks.saveFavorite('https://a.example/', 'A', null, 'One');
  bookmarks.saveFavorite('https://b.example/', 'B', null, 'Two');
  const [a, b] = bookmarks.listBookmarks();
  bookmarks.removeBookmark(a.id);
  assert.deepEqual(bookmarks.moveFavorites([b.id], null), { ok: true });
  assert.deepEqual(names(bookmarks.getTree()), ['https://b.example/']);
  assert.deepEqual(bookmarks.exportForSync().tombstones.map((t) => t.url), ['https://a.example/']);
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

// --- Import (the manager switch) ---

test('with the manager off, import flattens as before and writes no order', (t) => {
  bookmarks.setManagerLive(false);
  t.after(() => bookmarks.setManagerLive(true));
  reset();
  const counts = bookmarks.importBookmarks([
    { url: 'https://a.example/', title: 'A', folder: 'Work › Clients › Acme', flatFolder: 'Acme' },
    { url: 'https://a.example/', title: 'again', folder: 'Elsewhere' },
  ]);
  assert.deepEqual(counts, { added: 1, skipped: 1, moved: 0, shortened: 0, orderDropped: 0 });
  assert.deepEqual(bookmarks.listBookmarks().map((b) => b.folder), ['Acme']);
  assert.equal(layout.exportForSync(), null);
});

test('with the manager live, import repairs the flattened favorite, keeps order, and emptied folders stay', async (t) => {
  // Repair covers favorites unchanged since the manager first ran here: as
  // on a device updating from a version without it.
  layout.resetForTests();
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  bookmarks.setManagerLive(true);
  let changes = 0;
  bookmarks.onChanged(() => { changes += 1; });
  const counts = bookmarks.importBookmarks([
    { url: 'https://z.example/', title: 'Z', folder: 'Work › Clients › Acme' },
    { url: 'https://a.example/', title: 'A', folder: 'Work › Clients › Acme' },
    { url: 'https://deep.example/', title: 'D', folder: 'Work', shortened: true },
  ]);
  assert.deepEqual(counts, { added: 2, skipped: 0, moved: 1, shortened: 1, orderDropped: 0 });
  assert.equal(changes, 1);
  const work = bookmarks.getTree().children[0].folder;
  assert.deepEqual(names(work), ['[Clients]', 'https://deep.example/']);
  assert.deepEqual(names(work.children[0].folder.children[0].folder), ['https://z.example/', 'https://a.example/']);
  assert.ok(layout.exportForSync());
  assert.deepEqual(bookmarks.importBookmarks([{ url: 'https://z.example/', folder: 'Work › Clients › Acme' }]),
    { added: 0, skipped: 1, moved: 0, shortened: 0, orderDropped: 0 });
  // Emptying a folder keeps it once the manager can show it.
  const deep = bookmarks.listBookmarks().find((b) => b.url === 'https://deep.example/');
  bookmarks.moveFavorites(bookmarks.listBookmarks().filter((b) => b.folder === 'Work › Clients › Acme').map((b) => b.id), null);
  bookmarks.removeBookmark(deep.id);
  // Work and everything under it now holds nothing, and is still there.
  const top = bookmarks.getTree();
  assert.deepEqual(names(top).filter((n) => n.startsWith('[')), ['[Work]']);
  assert.deepEqual(names(top.children.find((c) => c.kind === 'folder').folder), ['[Clients]']);
});
