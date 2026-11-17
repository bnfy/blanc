const assert = require('node:assert/strict');
const test = require('node:test');
const {
  addImported, applySaveFavorite, applySetFolder, applyRenameFolder, applyRemoveFolder, canonicalizeFolders,
  groupFavoritesForMenu,
} = require('../../src/main/bookmark-data');

const NOW = 2000;
let seq = 0;
const makeId = () => `id${++seq}`;
const opts = { now: NOW, makeId };
test.beforeEach(() => { seq = 0; });

const snap = (items, tombstones = []) => ({ items, tombstones });

test('addImported: dedupe vs existing and intra-batch, first occurrence wins', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: null }]);
  const entries = [
    { url: 'https://a.com/', title: 'dup existing', addedAt: 5, folder: 'X' },
    { url: 'https://b.com/', title: 'B', addedAt: 10, folder: 'Work' },
    { url: 'https://b.com/', title: 'dup batch', addedAt: 11, folder: 'work' },
  ];
  const res = addImported(cur, entries, opts);
  assert.equal(res.added, 1);
  assert.equal(res.skipped, 2);
  assert.equal(res.changed, true);
  const b = res.items.find((it) => it.url === 'https://b.com/');
  assert.equal(b.title, 'B');
  assert.equal(b.folder, 'Work');
  assert.equal(b.updatedAt, NOW);
  // existing item untouched
  assert.equal(res.items.find((it) => it.url === 'https://a.com/').folder, null);
  // result oldest-first by addedAt
  assert.deepEqual(res.items.map((it) => it.addedAt), [1, 10]);
});

test('addImported: adopts existing folder spelling; all-duplicate => changed:false', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' }]);
  const res = addImported(cur, [{ url: 'https://c.com/', title: 'C', addedAt: 3, folder: 'WORK' }], opts);
  assert.equal(res.items.find((it) => it.url === 'https://c.com/').folder, 'Work'); // existing spelling wins

  const res2 = addImported(cur, [{ url: 'https://a.com/', title: 'dup', addedAt: 9, folder: 'X' }], opts);
  assert.equal(res2.changed, false);
  assert.equal(res2.added, 0);
  assert.equal(res2.skipped, 1);
});

test('addImported: clears tombstone for re-added url', () => {
  const cur = snap([], [{ url: 'https://a.com/', deletedAt: 100 }]);
  const res = addImported(cur, [{ url: 'https://a.com/', title: 'A', addedAt: 5, folder: null }], opts);
  assert.equal(res.tombstones.length, 0);
});

test('applySetFolder: explicit null ungroups; invalid string is a no-op (not ungroup)', () => {
  const cur = snap([{ id: 'a', url: 'u', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' }]);
  assert.equal(applySetFolder(cur, 'a', null, opts).items[0].folder, null);
  assert.equal(applySetFolder(cur, 'a', '   ', opts).changed, false);       // blank
  assert.equal(applySetFolder(cur, 'a', 'x'.repeat(101), opts).changed, false); // too long
  assert.equal(applySetFolder(cur, 'missing', 'Y', opts).changed, false);   // unknown id
  assert.equal(applySetFolder(cur, 'a', 'Work', opts).changed, false);      // unchanged
});

test('applySetFolder: adopts existing spelling for a case-variant target', () => {
  const cur = snap([
    { id: 'a', url: 'ua', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Reading' },
    { id: 'b', url: 'ub', title: 'B', favicon: null, addedAt: 2, updatedAt: 2, folder: null },
  ]);
  const res = applySetFolder(cur, 'b', 'READING', opts);
  assert.equal(res.items.find((it) => it.id === 'b').folder, 'Reading');
});

test('applyRenameFolder: merge-on-collision, case-only re-spell, rejects invalid', () => {
  const cur = snap([
    { id: 'a', url: 'ua', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'news' },
    { id: 'b', url: 'ub', title: 'B', favicon: null, addedAt: 2, updatedAt: 2, folder: 'Reading' },
  ]);
  const merged = applyRenameFolder(cur, 'News', 'Reading', opts); // collision -> merge
  assert.equal(merged.items.find((it) => it.id === 'a').folder, 'Reading');
  assert.equal(merged.items.find((it) => it.id === 'a').updatedAt, NOW);

  // case-only rename: stored 'news' re-spelled to 'News' (a real change)
  const respell = applyRenameFolder(cur, 'news', 'News', opts);
  assert.equal(respell.items.find((it) => it.id === 'a').folder, 'News');
  assert.equal(respell.changed, true);

  assert.equal(applyRenameFolder(cur, 'News', '   ', opts).changed, false);        // blank rejected
  assert.equal(applyRenameFolder(cur, 'Nope', 'Whatever', opts).changed, false);   // unknown folder
});

test('applyRemoveFolder: ungroups all in folder; empty => changed:false', () => {
  const cur = snap([
    { id: 'a', url: 'ua', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' },
    { id: 'b', url: 'ub', title: 'B', favicon: null, addedAt: 2, updatedAt: 2, folder: 'Work' },
  ]);
  const res = applyRemoveFolder(cur, 'work', opts);
  assert.equal(res.changed, true);
  assert.equal(res.items.every((it) => it.folder === null), true);
  assert.equal(applyRemoveFolder(cur, 'Ghost', opts).changed, false);
});

test('canonicalizeFolders: mixed spellings collapse deterministically without touching updatedAt', () => {
  const items = [
    { id: 'a', url: 'ua', title: 'A', favicon: null, addedAt: 5, updatedAt: 5, folder: 'work' },
    { id: 'b', url: 'ub', title: 'B', favicon: null, addedAt: 2, updatedAt: 2, folder: 'Work' }, // oldest -> canonical
    { id: 'c', url: 'uc', title: 'C', favicon: null, addedAt: 9, updatedAt: 9, folder: null },
  ];
  const out = canonicalizeFolders(items);
  assert.equal(out.find((it) => it.id === 'a').folder, 'Work');
  assert.equal(out.find((it) => it.id === 'a').updatedAt, 5); // NOT bumped
  assert.equal(out.find((it) => it.id === 'c').folder, null);
  // idempotent / convergent
  assert.deepEqual(canonicalizeFolders(out).map((it) => it.folder), out.map((it) => it.folder));
});

test('groupFavoritesForMenu: folders alphabetical (case-insensitive) + newest-first, then ungrouped newest-first', () => {
  const items = [
    { id: '1', url: 'ua', title: 'A', addedAt: 1, folder: 'Zeta' },
    { id: '2', url: 'ub', title: 'B', addedAt: 5, folder: 'alpha' },
    { id: '3', url: 'uc', title: 'C', addedAt: 3, folder: 'alpha' },
    { id: '4', url: 'ud', title: 'D', addedAt: 2, folder: null },
    { id: '5', url: 'ue', title: 'E', addedAt: 9, folder: null },
  ];
  const { folders, ungrouped } = groupFavoritesForMenu(items);
  assert.deepEqual(folders.map((f) => f.name), ['alpha', 'Zeta']); // case-insensitive alpha order
  assert.deepEqual(folders[0].items.map((b) => b.title), ['B', 'C']); // newest-first (addedAt 5, 3)
  assert.deepEqual(ungrouped.map((b) => b.title), ['E', 'D']); // newest-first (addedAt 9, 2)
});

test('groupFavoritesForMenu: empty and all-ungrouped inputs', () => {
  assert.deepEqual(groupFavoritesForMenu([]), { folders: [], ungrouped: [] });
  const only = [{ id: '1', url: 'u', title: 'T', addedAt: 1, folder: null }];
  const r = groupFavoritesForMenu(only);
  assert.equal(r.folders.length, 0);
  assert.equal(r.ungrouped.length, 1);
});

test('applySaveFavorite: new url adds at top level (folder null)', () => {
  const res = applySaveFavorite(snap([]), { url: 'https://a.com/', title: 'A', favicon: null, folder: null }, opts);
  assert.equal(res.changed, true);
  assert.equal(res.items.length, 1);
  const a = res.items[0];
  assert.equal(a.url, 'https://a.com/');
  assert.equal(a.folder, null);
  assert.equal(a.addedAt, NOW);
  assert.equal(a.updatedAt, NOW);
  assert.equal(a.id, 'id1');
});

test('applySaveFavorite: new url into a folder adopts existing canonical spelling', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' }]);
  const res = applySaveFavorite(cur, { url: 'https://b.com/', title: 'B', favicon: null, folder: 'WORK' }, opts);
  assert.equal(res.changed, true);
  assert.equal(res.items.find((it) => it.url === 'https://b.com/').folder, 'Work'); // canonical spelling
});

test('applySaveFavorite: new url with a fresh folder keeps its trimmed spelling', () => {
  const res = applySaveFavorite(snap([]), { url: 'https://a.com/', title: 'A', favicon: null, folder: '  Reading List  ' }, opts);
  assert.equal(res.items[0].folder, 'Reading List');
});

test('applySaveFavorite: over-long folder is rejected — nothing added', () => {
  const res = applySaveFavorite(snap([]), { url: 'https://a.com/', title: 'A', favicon: null, folder: 'x'.repeat(101) }, opts);
  assert.equal(res.changed, false);
  assert.equal(res.items.length, 0); // never falls back to a top-level save
});

test('applySaveFavorite: already saved + bare save is a no-op', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' }]);
  const res = applySaveFavorite(cur, { url: 'https://a.com/', title: 'A2', favicon: null, folder: null }, opts);
  assert.equal(res.changed, false);
  assert.equal(res.items[0].folder, 'Work'); // untouched
  assert.equal(res.items[0].title, 'A');     // not overwritten
});

test('applySaveFavorite: already saved + named folder moves it (updatedAt bumped)', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: null }]);
  const res = applySaveFavorite(cur, { url: 'https://a.com/', title: 'A', favicon: null, folder: 'Work' }, opts);
  assert.equal(res.changed, true);
  assert.equal(res.items[0].folder, 'Work');
  assert.equal(res.items[0].updatedAt, NOW);
});

test('applySaveFavorite: already saved + same folder (case-variant) is a no-op', () => {
  const cur = snap([{ id: 'a', url: 'https://a.com/', title: 'A', favicon: null, addedAt: 1, updatedAt: 1, folder: 'Work' }]);
  const res = applySaveFavorite(cur, { url: 'https://a.com/', title: 'A', favicon: null, folder: 'work' }, opts);
  assert.equal(res.changed, false);
});

test('applySaveFavorite: adding clears a prior tombstone for that url', () => {
  const cur = snap([], [{ url: 'https://a.com/', deletedAt: 100 }]);
  const res = applySaveFavorite(cur, { url: 'https://a.com/', title: 'A', favicon: null, folder: null }, opts);
  assert.equal(res.changed, true);
  assert.equal(res.tombstones.length, 0);
});

// --- Nested folders (F63) ---

const {
  applyCreateFolder, applyMoveFolder, applyMoveFavorites, applyReorder, applyRemoveFavorites, keepEmptiedFolders,
} = require('../../src/main/bookmark-data');
const { favoriteChildKey } = require('../../src/main/favorites-tree');
const { EMPTY_LAYOUT } = require('../../src/main/favorites-layout-model');

const CTX = { now: 9, tie: 't' };
const fav = (url, folder, addedAt, id = url) => ({ id, url, title: url, favicon: null, folder, addedAt, updatedAt: addedAt });
const state = (items, layout = EMPTY_LAYOUT) => ({ items, tombstones: [], layout });

test('rename rewrites every descendant and stamps it', () => {
  const s = state([fav('a', 'Work', 1), fav('b', 'Work › Clients', 1), fav('c', 'Workshop', 1)]);
  const r = applyRenameFolder(s, 'Work', 'Jobs', CTX);
  assert.equal(r.changed, true);
  assert.deepEqual(r.items.map((i) => [i.folder, i.updatedAt]), [['Jobs', 9], ['Jobs › Clients', 9], ['Workshop', 1]]);
});

test('rename of a nested folder changes one segment', () => {
  const s = state([fav('a', 'Work › Clients › Acme', 1)]);
  assert.equal(applyRenameFolder(s, 'work › clients', 'Customers', CTX).items[0].folder, 'Work › Customers › Acme');
});

test('rename onto a sibling merges and adopts its spelling', () => {
  const s = state([fav('a', 'Work › New', 2), fav('b', 'Work › clients', 1)]);
  assert.equal(applyRenameFolder(s, 'Work › New', 'CLIENTS', CTX).items[0].folder, 'Work › clients');
});

test('rename unifies a prefix that was spelled two ways', () => {
  const s = state([fav('a', 'work', 1), fav('b', 'Work › Clients', 2)]);
  assert.deepEqual(applyRenameFolder(s, 'Work', 'Jobs', CTX).items.map((i) => i.folder), ['Jobs', 'Jobs › Clients']);
});

test('too-long rename changes nothing', () => {
  const s = state([fav('a', `Work › ${'c'.repeat(90)}`, 1)]);
  const r = applyRenameFolder(s, 'Work', 'Much longer name', CTX);
  assert.equal(r.error, 'too-long');
  assert.equal(r.changed, false);
  assert.equal(r.items, s.items);
  assert.equal(r.layout, s.layout);
});

test('renaming an empty folder moves its layout entry', () => {
  const made = applyCreateFolder(state([]), null, 'Empty', CTX);
  const r = applyRenameFolder(made, 'Empty', 'Later', CTX);
  assert.equal(r.changed, true);
  assert.equal(r.layout.folders.later.gone, undefined);
  assert.equal(r.layout.folders.empty.gone, true);
});

test('a folder cannot move into itself', () => {
  const s = state([fav('a', 'Work › Clients', 1)]);
  assert.equal(applyMoveFolder(s, 'Work', 'Work › Clients', CTX).error, 'cycle');
  assert.equal(applyMoveFolder(s, 'Work', 'work', CTX).error, 'cycle');
});

test('move a folder under another, and back to the top', () => {
  const s = state([fav('a', 'Work › Clients', 1), fav('b', 'Home', 1)]);
  const r = applyMoveFolder(s, 'Work › Clients', 'Home', CTX);
  assert.deepEqual(r.items.map((i) => i.folder), ['Home › Clients', 'Home']);
  assert.equal(applyMoveFolder(r, 'Home › Clients', null, CTX).items[0].folder, 'Clients');
  assert.equal(applyMoveFolder(s, 'Work › Clients', 'Work', CTX).changed, false);
  assert.equal(applyMoveFolder(s, 'Nope', 'Home', CTX).error, 'missing');
});

test('delete moves contents up one level', () => {
  const s = state([fav('a', 'Work › Clients', 1), fav('b', 'Work › Clients › Acme', 1), fav('c', 'Solo', 1)]);
  const r = applyRemoveFolder(s, 'Work › Clients', CTX);
  assert.deepEqual(r.items.map((i) => i.folder), ['Work', 'Work › Acme', 'Solo']);
  assert.equal(r.layout.folders['work › clients'].gone, true);
  assert.equal(applyRemoveFolder(r, 'Solo', CTX).items[2].folder, null);
});

test('delete carries a sub-folder order with it', () => {
  let s = state([fav('a', 'Work › Clients › Acme', 1), fav('b', 'Work › Clients › Acme', 2)]);
  const keys = [favoriteChildKey('a'), favoriteChildKey('b')];
  s = applyReorder(s, 'Work › Clients › Acme', keys, CTX);
  const r = applyRemoveFolder(s, 'Work › Clients', CTX);
  assert.deepEqual(r.layout.folders['work › acme'].order, keys);
});

test('create makes an empty folder once', () => {
  const r = applyCreateFolder(state([]), 'Work', 'Clients', CTX);
  assert.equal(r.changed, true);
  assert.equal(r.path, 'Work › Clients');
  assert.equal(r.layout.folders['work › clients'].gone, undefined);
  const again = applyCreateFolder(r, 'work', 'CLIENTS', CTX);
  assert.equal(again.changed, false);
  assert.equal(again.path, 'Work › Clients');
  assert.equal(applyCreateFolder(state([]), null, '  ', CTX).error, 'invalid');
  assert.equal(applyCreateFolder(state([]), 'a'.repeat(95), 'bbbbbb', CTX).error, 'too-long');
});

test('moving the last favorite out keeps the folder', () => {
  const s = state([fav('a', 'Solo', 1, 'id-a')]);
  const r = applyMoveFavorites(s, ['id-a'], null, CTX);
  assert.equal(r.items[0].folder, null);
  assert.ok(r.layout.folders.solo && !r.layout.folders.solo.gone);
});

test('move several favorites, adopting the folder spelling', () => {
  const s = state([fav('a', null, 1, 'id-a'), fav('b', 'Other', 1, 'id-b'), fav('c', 'work', 0, 'id-c')]);
  const r = applyMoveFavorites(s, ['id-a', 'id-b', 'nope'], 'WORK', CTX);
  assert.deepEqual(r.items.map((i) => [i.folder, i.updatedAt]), [['work', 9], ['work', 9], ['work', 0]]);
  assert.equal(applyMoveFavorites(s, ['id-a'], 'x'.repeat(101), CTX).error, 'invalid');
  assert.equal(applyMoveFavorites(r, ['id-c'], 'work', CTX).changed, false);
});

test('removing favorites leaves tombstones and keeps the emptied folder', () => {
  const s = state([fav('https://a/', 'Solo', 1, 'id-a'), fav('https://b/', null, 1, 'id-b')]);
  const r = applyRemoveFavorites(s, ['id-a'], CTX);
  assert.deepEqual(r.items.map((i) => i.id), ['id-b']);
  assert.deepEqual(r.tombstones, [{ url: 'https://a/', deletedAt: 9 }]);
  assert.ok(r.layout.folders.solo && !r.layout.folders.solo.gone);
  assert.equal(applyRemoveFavorites(s, ['nope'], CTX).changed, false);
});

test('reorder writes the whole order', () => {
  const s = state([fav('a', 'W', 1), fav('b', 'W', 2)]);
  const keys = [favoriteChildKey('a'), favoriteChildKey('b')];
  const r = applyReorder(s, 'W', keys, CTX);
  assert.deepEqual(r.layout.folders.w.order, keys);
  assert.equal(applyReorder(r, 'w', keys, CTX).changed, false);
  assert.equal(applyReorder(s, 'Nope', keys, CTX).error, 'missing');
  assert.deepEqual(applyReorder(s, null, ['f:w'], CTX).layout.folders[''].order, ['f:w']);
});

test('saving into a path, and moving a saved favorite, keep emptied folders', () => {
  const saved = applySaveFavorite(state([]), { url: 'https://a/', title: 'A', folder: 'Work › Clients' }, { ...CTX, makeId: () => 'x' });
  assert.equal(saved.items[0].folder, 'Work › Clients');
  const moved = applySaveFavorite(saved, { url: 'https://a/', title: 'A', folder: 'Home' }, { ...CTX, makeId: () => 'y' });
  assert.equal(moved.items[0].folder, 'Home');
  assert.ok(moved.layout.folders['work › clients'] && !moved.layout.folders['work › clients'].gone);
});

test('keepEmptiedFolders only adds folders that lost everything', () => {
  const before = [fav('a', 'Work › Clients', 1), fav('b', 'Work', 1)];
  const after = [fav('a', null, 1), fav('b', 'Work', 1)];
  const l = keepEmptiedFolders(before, after, EMPTY_LAYOUT, CTX);
  assert.deepEqual(Object.keys(l.folders), ['work › clients']);
});

test('flat callers without a layout still work', () => {
  const r = applySetFolder({ items: [fav('a', null, 1, 'id-a')] }, 'id-a', 'Work', CTX);
  assert.equal(r.items[0].folder, 'Work');
  assert.deepEqual(r.layout, EMPTY_LAYOUT);
});

// --- Review findings ---

test('folders named like object internals work', () => {
  for (const name of ['constructor', '__proto__', 'toString']) {
    const made = applyCreateFolder(state([]), null, name, CTX);
    assert.equal(made.changed, true);
    assert.equal(Object.hasOwn(made.layout.folders, name.toLowerCase()), true, name);
    assert.equal(applyCreateFolder(made, null, name, CTX).changed, false);
    const s = state([fav('a', `${name} › x`, 1)]);
    assert.equal(applyRenameFolder(s, `${name} › x`, 'y', CTX).items[0].folder, `${name} › y`);
    assert.equal(applyReorder(s, name, ['u:1'], CTX).changed, true);
  }
});

test('a rename that an empty descendant cannot follow is refused whole', () => {
  const made = applyCreateFolder(state([fav('a', 'A', 1)]), 'A', 'L'.repeat(90), CTX);
  const r = applyRenameFolder(made, 'A', 'B'.repeat(20), CTX);
  assert.equal(r.error, 'too-long');
  assert.equal(r.items, made.items);
  assert.equal(r.layout, made.layout);
  const other = applyCreateFolder(made, null, 'C'.repeat(20), CTX);
  assert.equal(applyMoveFolder(other, 'A', 'C'.repeat(20), CTX).error, 'too-long');
});

test('deleting a folder keeps a same-named sub-folder that takes its place', () => {
  let s = applyCreateFolder(state([fav('a', 'A', 1)]), 'A', 'A', CTX);
  s = applyReorder(s, 'A › A', ['u:q'], CTX);
  const r = applyRemoveFolder(s, 'A', CTX);
  assert.equal(r.layout.folders.a.gone, undefined);
  assert.deepEqual(r.layout.folders.a.order, ['u:q']);
  assert.equal(r.layout.folders['a › a'].gone, true);
});

test('a flat name saved with a bare › can still be renamed and removed', () => {
  const s = state([fav('a', 'a›b', 1), fav('b', 'x ›  › y', 1)]);
  assert.equal(applyRenameFolder(s, 'a›b', 'c', CTX).items[0].folder, 'c');
  assert.equal(applyRemoveFolder(s, 'a›b', CTX).items[0].folder, null);
  assert.equal(applyRenameFolder(s, 'x ›  › y', 'z', CTX).items[1].folder, 'x › z');
});

test('an undefined folder is not a move to the top level', () => {
  const s = state([fav('a', 'Work', 1, 'id-a')]);
  assert.equal(applySetFolder(s, 'id-a', undefined, CTX).changed, false);
});

test('keeping emptied folders can be switched off, and an invalid save folder is an error', () => {
  const s = state([fav('a', 'Solo', 1, 'id-a')]);
  const r = applyMoveFavorites(s, ['id-a'], null, { ...CTX, keepEmptied: false });
  assert.equal(r.items[0].folder, null);
  assert.equal(r.layout, s.layout);
  assert.equal(applyRemoveFavorites(s, ['id-a'], { ...CTX, keepEmptied: false }).layout, s.layout);
  const bad = applySaveFavorite(state([]), { url: 'https://a/', title: 'A', folder: '   ' }, { ...CTX, makeId: () => 'x' });
  assert.deepEqual([bad.changed, bad.error], [false, 'invalid']);
});
