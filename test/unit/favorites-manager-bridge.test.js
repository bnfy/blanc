'use strict';
// The Favorites manager's page calls (F63): one preload entry, one handler
// limited to the Favorites sheet, and one bridges.json entry per call.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const pages = read('src/main/pages.js');
const preload = read('src/main/tab-preload.js');
const bridges = JSON.parse(read('browser-api/bridges.json'));

const CALLS = {
  tree: 'pages:bookmarks:tree',
  createFolder: 'pages:bookmarks:create-folder',
  moveFolder: 'pages:bookmarks:move-folder',
  move: 'pages:bookmarks:move',
  reorder: 'pages:bookmarks:reorder',
  removeMany: 'pages:bookmarks:remove-many',
};

test('the Favorites sheet says it can draw the tree', () => {
  assert.match(pages, /handle\('pages:bookmarks:capabilities', 'bookmarks', \(\) => \(\{ editable: true, tree: true \}\)\);/);
});

test('each manager call is bridged, handled for the Favorites sheet only, and listed', () => {
  const entries = JSON.stringify(bridges);
  for (const [name, channel] of Object.entries(CALLS)) {
    assert.match(preload, new RegExp(`\\b${name}: \\([^)]*\\) => invoke\\('${channel}'`), name);
    assert.match(pages, new RegExp(`handle\\('${channel}', 'bookmarks',`), channel);
    assert.ok(entries.includes(`"bookmarks.${name}"`), `bridges.json lists bookmarks.${name}`);
  }
});

test('handlers coerce what a page sends', () => {
  const { pageIds, pageKeys, pagePath } = require('../../src/main/favorites-page-args');
  assert.deepEqual(pageIds(['a', 7, 'b']), ['a', 'b']);
  assert.deepEqual(pageIds('a'), []);
  assert.equal(pageIds(Array.from({ length: 6000 }, (_, i) => `id${i}`)).length, 5000);
  assert.deepEqual(pageIds(['x'.repeat(201)]), []);
  assert.equal(pageKeys(Array.from({ length: 30000 }, (_, i) => `u:${i}`)).length, 20000);
  assert.equal(pagePath(null), null);
  assert.equal(pagePath(undefined), null);
  assert.equal(pagePath(5), '5');
  assert.equal(pagePath('x'.repeat(300)).length, 200);
});
