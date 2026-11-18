'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SEP, MAX_PATH, cleanSegment, splitPath, joinPath, validPath, pathKey, parentPath, leafName,
  isWithin, fitSegments, parseTypedPath, folderChildKey, favoriteChildKey,
  buildTree, shownPath, listFolderPaths,
} = require('../../src/main/favorites-tree');

const EMPTY = { version: 1, folders: {} };

test('a top-level name is a one-segment path', () => {
  assert.equal(validPath('  Work '), 'Work');
  assert.deepEqual(splitPath('Work › Clients › Acme'), ['Work', 'Clients', 'Acme']);
  assert.deepEqual(splitPath(null), []);
  assert.equal(joinPath(['Work', 'Clients']), `Work${SEP}Clients`);
  assert.equal(joinPath([]), null);
});

test('segments never contain ›', () => {
  assert.equal(cleanSegment('A›B'), 'A>B');
  assert.equal(cleanSegment('   '), null);
  assert.equal(cleanSegment(7), null);
  assert.equal(cleanSegment('a'.repeat(101)), null);
});

test('a path over 100 code units is invalid', () => {
  assert.equal(MAX_PATH, 100);
  assert.equal(validPath(`${'a'.repeat(60)} › ${'b'.repeat(38)}`), null);
  assert.equal(validPath(`${'a'.repeat(60)} › ${'b'.repeat(37)}`).length, 100);
  assert.equal(validPath('Work ›  › Acme'), null);
  assert.equal(validPath(null), null);
  assert.equal(validPath(''), null);
});

test('validPath trims each segment', () => {
  assert.equal(validPath('Work ›   Clients  '), 'Work › Clients');
});

test('keys ignore case per segment', () => {
  assert.equal(pathKey('Work › CLIENTS'), 'work › clients');
  assert.equal(pathKey(null), '');
  assert.equal(isWithin('work › Clients › Acme', 'Work › clients'), true);
  assert.equal(isWithin('Work', 'work'), true);
  assert.equal(isWithin('Workshop', 'Work'), false);
  assert.equal(isWithin('Work', null), true);
});

test('parent and leaf', () => {
  assert.equal(parentPath('Work › Clients › Acme'), 'Work › Clients');
  assert.equal(parentPath('Work'), null);
  assert.equal(parentPath(null), null);
  assert.equal(leafName('Work › Clients'), 'Clients');
  assert.equal(leafName(null), '');
});

test('fitSegments keeps the deepest ancestor that fits', () => {
  const long = ['a'.repeat(50), 'b'.repeat(40), 'c'.repeat(20)];
  assert.deepEqual(fitSegments(long), { path: `${long[0]} › ${long[1]}`, shortened: true });
  assert.deepEqual(fitSegments(['Work']), { path: 'Work', shortened: false });
  assert.deepEqual(fitSegments([]), { path: null, shortened: false });
});

test('fitSegments cleans names and skips unusable ones', () => {
  assert.deepEqual(fitSegments(['A › B', '  ', 'C']), { path: 'A > B › C', shortened: false });
});

test('typed paths accept > and ›', () => {
  assert.equal(parseTypedPath('Work>Clients ›  Acme'), 'Work › Clients › Acme');
  assert.equal(parseTypedPath('  Recipes '), 'Recipes');
  assert.equal(parseTypedPath(' > '), null);
});

test('child keys', () => {
  assert.equal(folderChildKey(' Clients '), 'f:clients');
  assert.match(favoriteChildKey('https://example.com/'), /^u:[A-Za-z0-9_-]{8}$/);
  assert.notEqual(favoriteChildKey('https://a.example/'), favoriteChildKey('https://b.example/'));
});

// --- The display tree ---

const fav = (url, folder, addedAt, id = url) => ({ id, url, title: url, folder, addedAt, updatedAt: addedAt });
const names = (node) => node.children.map((c) => (c.kind === 'folder' ? `[${c.folder.name}]` : c.item.url));

test('an unordered profile looks like today: folders A–Z, then newest first', () => {
  const tree = buildTree([fav('a', null, 1), fav('b', null, 2), fav('c', 'Zoo', 3), fav('d', 'apps', 4)], EMPTY);
  assert.deepEqual(names(tree), ['[apps]', '[Zoo]', 'b', 'a']);
  assert.equal(tree.path, null);
  assert.equal(tree.key, '');
});

test('paths nest', () => {
  const tree = buildTree([fav('a', 'Work › Clients › Acme', 1)], EMPTY);
  const work = tree.children[0].folder;
  assert.equal(work.path, 'Work');
  assert.equal(work.children[0].folder.children[0].folder.path, 'Work › Clients › Acme');
  assert.deepEqual(names(work.children[0].folder.children[0].folder), ['a']);
});

test('prefix spellings merge in the tree only', () => {
  const items = [fav('a', 'work', 1), fav('b', 'Work › Clients', 2)];
  const tree = buildTree(items, EMPTY);
  assert.deepEqual(names(tree), ['[work]']);
  assert.equal(shownPath(items, 'WORK › clients'), 'work › Clients');
  assert.equal(items[1].folder, 'Work › Clients');
});

test('shownPath keeps the given spelling for a folder nobody uses yet', () => {
  assert.equal(shownPath([fav('a', 'work', 1)], 'WORK › New'), 'work › New');
});

test('listed children follow unlisted ones, in list order', () => {
  const items = [fav('a', 'W', 1), fav('b', 'W', 2), fav('c', 'W', 3)];
  const layout = { version: 1, folders: { w: { path: 'W', order: [favoriteChildKey('a'), 'u:gone', favoriteChildKey('b')], at: 5, tie: '' } } };
  assert.deepEqual(names(buildTree(items, layout).children[0].folder), ['c', 'a', 'b']);
});

test('folders and favorites share one order', () => {
  const items = [fav('a', null, 1), fav('b', 'Z', 2)];
  const layout = { version: 1, folders: { '': { path: null, order: [favoriteChildKey('a'), folderChildKey('Z')], at: 5, tie: '' } } };
  assert.deepEqual(names(buildTree(items, layout)), ['a', '[Z]']);
});

test('an empty folder exists through the layout; a gone entry does not', () => {
  const layout = { version: 1, folders: {
    empty: { path: 'Empty', order: [], at: 1, tie: '' },
    old: { path: 'Old', order: [], at: 1, tie: '', gone: true },
  } };
  assert.deepEqual(names(buildTree([], layout)), ['[Empty]']);
});

test('buildTree tolerates a missing layout and odd folder values', () => {
  const tree = buildTree([fav('a', '   ', 1), fav('b', 5, 2)], undefined);
  assert.deepEqual(names(tree), ['b', 'a']);
});

test('listFolderPaths walks depth-first', () => {
  const tree = buildTree([fav('a', 'Work › Clients', 1), fav('b', 'Home', 2)], EMPTY);
  assert.deepEqual(listFolderPaths(tree), ['Home', 'Work', 'Work › Clients']);
});

// --- Earlier "minor" findings, fixed ---

test('a favorite with an unreadable date counts as oldest for spelling, as flat folders do', () => {
  const items = [fav('a', 'work', NaN, 'a'), fav('b', 'Work', 5, 'b')];
  assert.equal(shownPath(items, 'WORK'), 'work');
});

test('each child carries the key order lists name it by', () => {
  const tree = buildTree([fav('https://a.example/', 'W', 1)], EMPTY);
  assert.equal(tree.children[0].key, 'f:w');
  assert.equal(tree.children[0].folder.children[0].key, favoriteChildKey('https://a.example/'));
});
