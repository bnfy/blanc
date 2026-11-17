'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  findFolder, breadcrumb, listFolders, searchFavorites, selectionAfterClick,
  orderAfterDrop, orderAfterStep, canDropInto, isWithinPath, parentOf,
} = require('../../src/renderer/pages/favorites-manager-model');
const { buildTree } = require('../../src/main/favorites-tree');

const fav = (url, folder, addedAt, title = url) => ({ id: url, url, title, folder, addedAt, updatedAt: addedAt });
const tree = buildTree([
  fav('https://acme.example/', 'Work › Clients', 1, 'Acme portal'),
  fav('https://home.example/', 'Home', 2, 'Home page'),
  fav('https://top.example/', null, 3, 'Top'),
], { version: 1, folders: {} });

test('find a folder by path, without regard to case', () => {
  assert.equal(findFolder(tree, null), tree);
  assert.equal(findFolder(tree, 'work › CLIENTS').path, 'Work › Clients');
  assert.equal(findFolder(tree, 'Nope'), null);
});

test('breadcrumb names each folder down to the open one', () => {
  assert.deepEqual(breadcrumb(tree, 'Work › Clients'), [{ name: 'Work', path: 'Work' }, { name: 'Clients', path: 'Work › Clients' }]);
  assert.deepEqual(breadcrumb(tree, null), []);
});

test('listFolders walks depth-first with depth', () => {
  assert.deepEqual(listFolders(tree).map((f) => [f.path, f.depth]), [['Home', 0], ['Work', 0], ['Work › Clients', 1]]);
});

test('search reports each match with its path', () => {
  assert.deepEqual(searchFavorites(tree, 'ACME').map((m) => m.path), ['Work › Clients']);
  assert.deepEqual(searchFavorites(tree, 'top.example').map((m) => m.path), [null]);
  assert.deepEqual(searchFavorites(tree, '   '), []);
});

test('shift-click selects a range from the anchor; ctrl/cmd-click toggles; a plain click selects one', () => {
  const keys = ['a', 'b', 'c', 'd'];
  const range = selectionAfterClick(keys, new Set(['a']), 'c', { range: true, anchor: 'a' });
  assert.deepEqual([...range.selected], ['a', 'b', 'c']);
  assert.equal(range.anchor, 'a');
  const toggled = selectionAfterClick(keys, new Set(['a', 'c']), 'c', { toggle: true, anchor: 'a' });
  assert.deepEqual([...toggled.selected], ['a']);
  assert.equal(toggled.anchor, 'c');
  const plain = selectionAfterClick(keys, new Set(['a', 'c']), 'd', {});
  assert.deepEqual([...plain.selected], ['d']);
  const upward = selectionAfterClick(keys, new Set(), 'b', { range: true, anchor: 'd' });
  assert.deepEqual([...upward.selected], ['b', 'c', 'd']);
});

test('drop keeps the moved rows together and in order', () => {
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c', 'd'], ['d', 'b'], 'a'), ['b', 'd', 'a', 'c']);
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c'], ['a'], null), ['b', 'c', 'a']);
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c'], ['b'], 'b'), ['a', 'b', 'c']);
  assert.deepEqual(orderAfterDrop(['a', 'b', 'c'], ['a', 'b'], 'b'), ['a', 'b', 'c']);
});

test('step moves one place and stops at the ends', () => {
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  assert.deepEqual(orderAfterStep(['a', 'b', 'c'], 'x', 1), ['a', 'b', 'c']);
});

test('a folder cannot drop into itself or its own descendant', () => {
  assert.equal(canDropInto('Work › Clients', ['Work']), false);
  assert.equal(canDropInto('work', ['Work']), false);
  assert.equal(canDropInto('Home', ['Work']), true);
  assert.equal(canDropInto(null, ['Work']), true);
  assert.equal(isWithinPath('Workshop', 'Work'), false);
  assert.equal(parentOf('Work › Clients'), 'Work');
  assert.equal(parentOf('Work'), null);
});

const { remapPath, combineOrder, joinPath, leafOf } = require('../../src/renderer/pages/favorites-manager-model');

test('paths join, split and follow a renamed ancestor', () => {
  assert.equal(joinPath(null, 'Work'), 'Work');
  assert.equal(joinPath('Work', 'Clients'), 'Work › Clients');
  assert.equal(leafOf('Work › Clients'), 'Clients');
  assert.equal(remapPath('work › Clients › Acme', 'Work', 'Jobs'), 'Jobs › Clients › Acme');
  assert.equal(remapPath('Work', 'work', 'Jobs'), 'Jobs');
  assert.equal(remapPath('Home', 'Work', 'Jobs'), 'Home');
});

test('combineOrder keeps folders first and replaces one kind\'s order', () => {
  const children = [
    { kind: 'favorite', key: 'u:1' }, { kind: 'folder', key: 'f:a' }, { kind: 'favorite', key: 'u:2' }, { kind: 'folder', key: 'f:b' },
  ];
  assert.deepEqual(combineOrder(children, 'favorite', ['u:2', 'u:1']), ['f:a', 'f:b', 'u:2', 'u:1']);
  assert.deepEqual(combineOrder(children, 'folder', ['f:b', 'f:a']), ['f:b', 'f:a', 'u:1', 'u:2']);
});
