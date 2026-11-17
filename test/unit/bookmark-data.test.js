const assert = require('node:assert/strict');
const test = require('node:test');
const {
  addImported, applySaveFavorite, applySetFolder, applyRenameFolder, applyRemoveFolder, canonicalizeFolders,
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
const { favoriteChildKey, folderChildKey } = require('../../src/main/favorites-tree');
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

// --- Import with paths (F63) ---

const ICTX = { ...CTX, makeId: (() => { let n = 0; return () => `new${++n}`; })() };

test('import keeps full paths and the source order in the folders it creates', () => {
  const r = addImported(state([]), [
    { url: 'https://z.example/', title: 'Z', folder: 'Work › Clients', addedAt: 5 },
    { url: 'https://a.example/', title: 'A', folder: 'Work › Clients', addedAt: 9 },
    { url: 'https://m.example/', title: 'M', folder: 'Work', addedAt: 1 },
    { url: 'https://t.example/', title: 'T', folder: null, addedAt: 2 },
    { url: 'https://h.example/', title: 'H', folder: 'Home', addedAt: 3 },
  ], ICTX);
  assert.deepEqual([r.added, r.skipped, r.moved, r.shortened, r.orderDropped, r.changed], [5, 0, 0, 0, 0, true]);
  const key = favoriteChildKey;
  assert.deepEqual(r.layout.folders['work › clients'].order, [key('https://z.example/'), key('https://a.example/')]);
  assert.deepEqual(r.layout.folders.work.order, ['f:clients', key('https://m.example/')]);
  assert.deepEqual(r.layout.folders[''].order, ['f:work', key('https://t.example/'), 'f:home']);
});

test('importing again repairs a flattened favorite once', () => {
  const s = state([fav('https://a.example/', 'Acme', 1, 'a')]);
  const entries = [{ url: 'https://a.example/', title: 'A', folder: 'Work › Clients › Acme' }];
  const r = addImported(s, entries, ICTX);
  assert.equal(r.items[0].folder, 'Work › Clients › Acme');
  assert.equal(r.items[0].updatedAt, 9);
  assert.deepEqual([r.added, r.moved, r.skipped, r.changed], [0, 1, 0, true]);
  const again = addImported(r, entries, ICTX);
  assert.deepEqual([again.added, again.moved, again.skipped, again.changed], [0, 0, 1, false]);
  assert.equal(again.items, r.items);
  assert.equal(again.layout, r.layout);
});

test('a favorite the person moved elsewhere, or saved at the top, is left alone', () => {
  const s = state([fav('https://a.example/', 'Reading', 1, 'a'), fav('https://b.example/', null, 1, 'b')]);
  const r = addImported(s, [
    { url: 'https://a.example/', title: 'A', folder: 'Work › Acme' },
    { url: 'https://b.example/', title: 'B', folder: 'Work › Acme' },
  ], ICTX);
  assert.deepEqual(r.items.map((i) => i.folder), ['Reading', null]);
  assert.deepEqual([r.skipped, r.moved, r.changed], [2, 0, false]);
});

test('import keeps source order after existing children, and adopts existing spelling', () => {
  const s = applyReorder(state([fav('https://old.example/', 'W', 1)]), 'W', [favoriteChildKey('https://old.example/')], CTX);
  const r = addImported(s, [{ url: 'https://z.example/', folder: 'w' }, { url: 'https://b.example/', folder: 'w › New' }, { url: 'https://c.example/', folder: 'W › new' }], ICTX);
  assert.deepEqual(r.layout.folders.w.order, [favoriteChildKey('https://old.example/'), favoriteChildKey('https://z.example/'), 'f:new']);
  assert.deepEqual(r.items.map((i) => i.folder).sort(), ['W', 'W', 'W › New', 'W › New']);
});

test('import counts entries placed higher because their path was too long', () => {
  const r = addImported(state([]), [{ url: 'https://d.example/', folder: 'Other', shortened: true }], ICTX);
  assert.equal(r.shortened, 1);
});

test('import says when the collection is too large to keep every order', () => {
  const entries = [];
  for (let f = 0; f < 3; f += 1) for (let i = 0; i < 5000; i += 1) entries.push({ url: `https://e${f}.example/${i}`, folder: `Folder ${f}` });
  const r = addImported(state([]), entries, ICTX);
  assert.equal(r.added, 15000);
  assert.ok(r.orderDropped >= 1);
});

test('before the manager ships, import uses the parser\'s flat name and writes no order', () => {
  const s = state([fav('https://a.example/', 'Acme', 1, 'a')]);
  const r = addImported(s, [
    { url: 'https://a.example/', title: 'A', folder: 'Work › Clients › Acme', flatFolder: 'Acme' },
    { url: 'https://n.example/', title: 'N', folder: 'Work › Clients', flatFolder: 'Clients' },
  ], { ...ICTX, paths: false });
  assert.deepEqual(r.items.map((i) => i.folder), ['Acme', 'Clients']);
  assert.deepEqual([r.added, r.skipped, r.moved], [1, 1, 0]);
  assert.equal(r.layout, s.layout);
});

// --- Review findings (import) ---

const { parseNetscapeBookmarks: parseHtml } = require('../../src/main/bookmark-import');
const { parseChromiumBookmarks: parseChromium } = require('../../src/main/browser-data-import');

test('before the manager ships, import stores exactly the folder names it always did', () => {
  const long = ['Development resources', 'JavaScript frameworks', 'React state management', 'Redux Toolkit tutorials'];
  const html = `<DL><DT><H3>Bookmarks bar</H3><DL>${long.map((n) => `<DT><H3>${n}</H3><DL>`).join('')}`
    + `<DT><A HREF="https://deep.example/">D</A>${'</DL>'.repeat(long.length)}`
    + '<DT><H3>News › Tech</H3><DL><DT><A HREF="https://nt.example/">N</A></DL>'
    + '<DT><H3>   </H3><DL><DT><A HREF="https://blank.example/">B</A></DL>'
    + '<DL><DT><A HREF="https://unnamed.example/">U</A></DL>'
    + `<DT><H3>${'x'.repeat(101)}</H3><DL><DT><A HREF="https://over.example/">O</A></DL>`
    + '</DL></DL>';
  const flat = (entries) => {
    const r = addImported(state([]), entries, { ...ICTX, paths: false });
    assert.deepEqual([r.shortened, r.moved, r.orderDropped], [0, 0, 0]);
    return Object.fromEntries(r.items.map((i) => [i.url, i.folder]));
  };
  assert.deepEqual(flat(parseHtml(html)), {
    'https://deep.example/': 'Redux Toolkit tutorials',
    'https://nt.example/': 'News › Tech',
    'https://blank.example/': null,
    'https://unnamed.example/': null,
    'https://over.example/': null,
  });
  const data = { roots: { bookmark_bar: { name: 'Bookmarks bar', children: [
    { type: 'folder', name: 'p'.repeat(60), children: [
      { type: 'folder', name: 'q'.repeat(60), children: [{ type: 'url', name: 'Q', url: 'https://q.example/' }] }] },
    { type: 'folder', name: 'A›B', children: [{ type: 'url', name: 'AB', url: 'https://ab.example/' }] },
    { type: 'folder', name: 'y'.repeat(101), children: [{ type: 'url', name: 'Y', url: 'https://y.example/' }] },
    { type: 'url', name: 'Top', url: 'https://top.example/' },
  ] } } };
  assert.deepEqual(flat(parseChromium(data, { t: (k) => k })), {
    'https://q.example/': 'q'.repeat(60),
    'https://ab.example/': 'A›B',
    'https://y.example/': 'Bookmarks bar',
    'https://top.example/': 'Bookmarks bar',
  });
  // An entry given directly (the Arc import) keeps its folder as written.
  assert.equal(flat([{ url: 'https://x.example/', folder: 'X › Y' }])['https://x.example/'], 'X › Y');
  // Spelling still follows an existing flat folder, whole name only.
  const existing = state([fav('https://e.example/', 'A › B', 1), fav('https://f.example/', 'a›b', 1)]);
  const r = addImported(existing, [{ url: 'https://g.example/', folder: 'a' }, { url: 'https://h.example/', folder: 'A›B' }], { ...ICTX, paths: false });
  const folderOf = (url) => r.items.find((i) => i.url === url).folder;
  assert.deepEqual([folderOf('https://g.example/'), folderOf('https://h.example/')], ['a', 'a›b']);
});

test('a large import gives up its own order, never the orders already chosen', () => {
  let s = state([fav('https://mine.example/1', 'Mine', 1), fav('https://mine.example/2', 'Mine', 2)]);
  const mine = ['https://mine.example/1', 'https://mine.example/2'].map(favoriteChildKey);
  s = applyReorder(s, 'Mine', mine, { now: 1, tie: 't' });
  const entries = [{ url: 'https://small.example/', folder: 'Small' }];
  for (let i = 0; i < 12000; i += 1) entries.push({ url: `https://big.example/${i}`, folder: 'Big' });
  const r = addImported(s, entries, ICTX);
  assert.deepEqual(r.layout.folders.mine.order, mine);
  assert.equal(r.orderDropped, 1);
  assert.deepEqual(r.layout.folders.big?.order ?? [], []);
  assert.equal(r.layout.folders.small.order.length, 1);
});

test('repair leaves alone a favorite changed since the manager arrived', () => {
  const s = state([fav('https://old.example/', 'Work', 100, 'old'), fav('https://moved.example/', 'Work', 100, 'moved')]);
  s.items[1].updatedAt = 600;   // the person moved it to top-level Work after the manager arrived at 500
  const r = addImported(s, [
    { url: 'https://old.example/', folder: 'Bar › Work' },
    { url: 'https://moved.example/', folder: 'Bar › Work' },
  ], { ...ICTX, repairBefore: 500 });
  assert.deepEqual(r.items.map((i) => i.folder), ['Bar › Work', 'Work']);
  assert.deepEqual([r.moved, r.skipped], [1, 1]);
});

// --- Earlier "minor" findings, fixed ---

test('repair finds a favorite by the flat name the old import stored, even when it is not the last folder', () => {
  const s = state([fav('https://q.example/', 'q'.repeat(60), 1, 'q'), fav('https://nt.example/', 'News › Tech', 1, 'nt')]);
  const r = addImported(s, [
    { url: 'https://q.example/', folder: `Bookmarks bar › ${'p'.repeat(60)}`, shortened: true, flatFolder: 'q'.repeat(60) },
    { url: 'https://nt.example/', folder: 'Bookmarks bar › News > Tech', flatFolder: 'News › Tech' },
  ], ICTX);
  assert.deepEqual(r.items.map((i) => i.folder), [`Bookmarks bar › ${'p'.repeat(60)}`, 'Bookmarks bar › News > Tech']);
  assert.equal(r.moved, 2);
});

test('repair removes the old flat folder it emptied, even when that folder had its own order', () => {
  let s = state([fav('https://a.example/', 'Dev', 1, 'a'), fav('https://keep.example/', 'Keep', 1, 'k')]);
  s = applyReorder(s, 'Dev', [favoriteChildKey('https://a.example/')], { now: 1, tie: 't' });
  s = applyReorder(s, 'Keep', [favoriteChildKey('https://keep.example/')], { now: 1, tie: 't' });
  const r = addImported(s, [{ url: 'https://a.example/', folder: 'Bar › Dev' }], ICTX);
  assert.equal(r.layout.folders.dev.gone, true);
  assert.equal(r.layout.folders.keep.gone, undefined);
  const { buildTree: tree } = require('../../src/main/favorites-tree');
  assert.deepEqual(tree(r.items, r.layout).children.filter((c) => c.kind === 'folder').map((c) => c.folder.name).sort(), ['Bar', 'Keep']);
});

// --- The Favorites menu and /save paths (F63) ---

const { favoritesMenuModel, resolveSavePath } = require('../../src/main/bookmark-data');

const kinds = (model) => model.map((x) => x.kind);

test('menu nests in tree order', () => {
  const m = favoritesMenuModel([fav('a', 'Work › Clients', 1), fav('b', null, 2)], EMPTY_LAYOUT);
  assert.deepEqual(kinds(m), ['folder', 'separator', 'favorite']);
  assert.equal(m[0].name, 'Work');
  assert.equal(m[0].children[0].name, 'Clients');
  assert.equal(m[0].children[0].children[0].item.url, 'a');
});

test('menu: an untouched profile reads as it always did', () => {
  const items = [fav('a', 'Zeta', 1), fav('b', 'alpha', 5), fav('c', 'alpha', 3), fav('d', null, 2), fav('e', null, 9)];
  const m = favoritesMenuModel(items, EMPTY_LAYOUT);
  assert.deepEqual(m.map((x) => x.name ?? x.item?.url ?? '|'), ['alpha', 'Zeta', '|', 'e', 'd']);
  assert.deepEqual(m[0].children.map((x) => x.item.url), ['b', 'c']);
});

test('menu follows a chosen order, and no separator once a favorite leads a folder', () => {
  let s = state([fav('a', 'Work', 1), fav('b', null, 2)]);
  s = applyReorder(s, null, [favoriteChildKey('b'), folderChildKey('Work')], CTX);
  const m = favoritesMenuModel(s.items, s.layout);
  assert.deepEqual(kinds(m), ['favorite', 'folder']);
});

test('menu leaves out folders holding no favorites at any depth', () => {
  let s = state([fav('a', null, 1)]);
  s = applyCreateFolder(s, null, 'Empty', CTX);
  s = applyCreateFolder(s, 'Empty', 'Deeper', CTX);
  assert.equal(s.changed, true);
  assert.deepEqual(kinds(favoritesMenuModel(s.items, s.layout)), ['favorite']);
  assert.deepEqual(favoritesMenuModel([], EMPTY_LAYOUT), []);
});

test('/save resolves a unique leaf, then creates from the top', () => {
  const items = [fav('a', 'Work › Clients', 1)];
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'clients'), 'Work › Clients');
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'Work > New'), 'Work › New');
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'Recipes'), 'Recipes');
});

test('/save: an existing full path wins over a leaf elsewhere', () => {
  const items = [fav('a', 'Work › Clients', 1), fav('b', 'Clients', 1)];
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'clients'), 'Clients');
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'work › clients'), 'Work › Clients');
});

test('/save: a name used by two nested folders creates it at the top level', () => {
  const items = [fav('a', 'Work › Clients', 1), fav('b', 'Home › Clients', 1)];
  assert.equal(resolveSavePath(items, EMPTY_LAYOUT, 'Clients'), 'Clients');
});

test('/save: an empty folder from the layout counts as existing', () => {
  const s = applyCreateFolder(applyCreateFolder(state([]), null, 'Work', CTX), 'Work', 'Drafts', CTX);
  assert.equal(s.changed, true);
  assert.equal(resolveSavePath(s.items, s.layout, 'drafts'), 'Work › Drafts');
});

test('/save refuses an empty name or a path past the limit', () => {
  assert.equal(resolveSavePath([], EMPTY_LAYOUT, 'Work > > x'), null);
  assert.equal(resolveSavePath([], EMPTY_LAYOUT, 'a'.repeat(60) + ' > ' + 'b'.repeat(60)), null);
  assert.equal(resolveSavePath([], EMPTY_LAYOUT, '   '), null);
});

test('/save files a page into the one nested folder its name matches', () => {
  const s = state([fav('https://a/', 'Work › Clients', 1)]);
  const r = applySaveFavorite(s, { url: 'https://b/', title: 'B', folder: 'clients' }, { ...CTX, makeId: () => 'x' });
  assert.equal(r.items.find((i) => i.url === 'https://b/').folder, 'Work › Clients');
  const typed = applySaveFavorite(s, { url: 'https://c/', title: 'C', folder: 'work > New' }, { ...CTX, makeId: () => 'y' });
  assert.equal(typed.items.find((i) => i.url === 'https://c/').folder, 'Work › New');
});
