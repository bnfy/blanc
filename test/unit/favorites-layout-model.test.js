'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LAYOUT_MAX_BYTES, GONE_TTL_MS, EMPTY_LAYOUT,
  normalizeLayout, setFolderOrder, ensureFolder, removeFolderEntry, movePrefix,
  mergeLayouts, boundLayout, layoutsEqual,
} = require('../../src/main/favorites-layout-model');

test('constants', () => {
  assert.equal(LAYOUT_MAX_BYTES, 131072);
  assert.equal(GONE_TTL_MS, 90 * 24 * 60 * 60 * 1000);
  assert.deepEqual(EMPTY_LAYOUT, { version: 1, folders: {} });
});

test('setFolderOrder keys by path without case and keeps the spelling', () => {
  const l = setFolderOrder(EMPTY_LAYOUT, 'Work › Clients', ['u:1', 'f:acme', 'u:1'], { at: 5, tie: 'a' });
  assert.deepEqual(l.folders['work › clients'], { path: 'Work › Clients', order: ['u:1', 'f:acme'], at: 5, tie: 'a' });
  assert.deepEqual(EMPTY_LAYOUT.folders, {});
});

test('the top level has the empty key', () => {
  const l = setFolderOrder(EMPTY_LAYOUT, null, ['u:1'], { at: 5, tie: '' });
  assert.deepEqual(l.folders[''], { path: null, order: ['u:1'], at: 5, tie: '' });
});

test('a write always beats the entry it replaces', () => {
  const first = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:1'], { at: 50, tie: '' });
  const second = setFolderOrder(first, 'Work', ['u:2'], { at: 10, tie: '' });
  assert.equal(second.folders.work.at, 51);
});

test('merge is per entry and symmetric', () => {
  const a = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:1'], { at: 10, tie: 'a' });
  const b = setFolderOrder(setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 9, tie: 'b' }), 'Home', ['u:3'], { at: 9, tie: 'b' });
  const ab = mergeLayouts(a, b, { now: 100 });
  assert.deepEqual(ab.folders.work.order, ['u:1']);
  assert.deepEqual(ab.folders.home.order, ['u:3']);
  assert.ok(layoutsEqual(ab, mergeLayouts(b, a, { now: 100 })));
});

test('equal clocks break ties the same way from either side', () => {
  const a = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:1'], { at: 10, tie: 'b' });
  const b = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:2'], { at: 10, tie: 'a' });
  assert.deepEqual(mergeLayouts(a, b, { now: 100 }).folders.work.order, ['u:2']);
  assert.deepEqual(mergeLayouts(b, a, { now: 100 }).folders.work.order, ['u:2']);
});

test('a removed empty folder stays removed, then its marker expires', () => {
  const made = ensureFolder(EMPTY_LAYOUT, 'Empty', { at: 1, tie: '' });
  assert.deepEqual(made.folders.empty, { path: 'Empty', order: [], at: 1, tie: '' });
  const gone = removeFolderEntry(made, 'Empty', { at: 2, tie: '' });
  assert.equal(mergeLayouts(gone, made, { now: 3 }).folders.empty.gone, true);
  assert.equal(mergeLayouts(gone, made, { now: 2 + GONE_TTL_MS + 1 }).folders.empty, undefined);
});

test('ensureFolder leaves a live entry alone and revives a gone one', () => {
  const ordered = setFolderOrder(EMPTY_LAYOUT, 'Work', ['u:1'], { at: 5, tie: '' });
  assert.equal(ensureFolder(ordered, 'work', { at: 9, tie: '' }), ordered);
  const gone = removeFolderEntry(ordered, 'Work', { at: 6, tie: '' });
  const back = ensureFolder(gone, 'Work', { at: 3, tie: '' });
  assert.equal(back.folders.work.gone, undefined);
  assert.equal(back.folders.work.at, 7);
});

test('movePrefix carries descendants', () => {
  let l = setFolderOrder(EMPTY_LAYOUT, 'Work › Clients', ['u:1'], { at: 1, tie: '' });
  l = movePrefix(l, 'Work', 'Jobs', { at: 2, tie: '' });
  assert.deepEqual(l.folders['jobs › clients'].order, ['u:1']);
  assert.equal(l.folders['jobs › clients'].path, 'Jobs › Clients');
  assert.equal(l.folders['work › clients'].gone, true);
});

test('movePrefix keeps a renamed folder in its place in the parent order', () => {
  let l = setFolderOrder(EMPTY_LAYOUT, null, ['u:1', 'f:work', 'u:2'], { at: 1, tie: '' });
  l = movePrefix(l, 'Work', 'Jobs', { at: 2, tie: '' });
  assert.deepEqual(l.folders[''].order, ['u:1', 'f:jobs', 'u:2']);
});

test('movePrefix to another parent leaves the old parent order', () => {
  let l = setFolderOrder(EMPTY_LAYOUT, null, ['f:work', 'f:home'], { at: 1, tie: '' });
  l = movePrefix(l, 'Work', 'Home › Work', { at: 2, tie: '' });
  assert.deepEqual(l.folders[''].order, ['f:home']);
});

test('boundLayout empties the oldest lists first and keeps entries', () => {
  const big = Array.from({ length: 6000 }, (_, i) => `u:${String(i).padStart(8, '0')}`);
  let l = setFolderOrder(EMPTY_LAYOUT, 'Old', big, { at: 1, tie: '' });
  l = setFolderOrder(l, 'New', big, { at: 2, tie: '' });
  const { layout, dropped } = boundLayout(l);
  assert.equal(dropped, 1);
  assert.deepEqual(layout.folders.old.order, []);
  assert.equal(layout.folders.new.order.length, 6000);
  assert.ok(Buffer.byteLength(JSON.stringify(layout)) <= LAYOUT_MAX_BYTES);
});

test('boundLayout drops the longest of equally old lists first, and nothing when it fits', () => {
  const list = (n) => Array.from({ length: n }, (_, i) => `u:${String(i).padStart(8, '0')}`);
  let l = setFolderOrder(EMPTY_LAYOUT, 'Small', list(3000), { at: 1, tie: '' });
  l = setFolderOrder(l, 'Large', list(8000), { at: 1, tie: '' });
  const { layout, dropped } = boundLayout(l);
  assert.equal(dropped, 1);
  assert.deepEqual(layout.folders.large.order, []);
  assert.equal(layout.folders.small.order.length, 3000);
  const small = setFolderOrder(EMPTY_LAYOUT, 'A', ['u:1'], { at: 1, tie: '' });
  assert.deepEqual(boundLayout(small), { layout: small, dropped: 0 });
});

test('normalizeLayout drops junk', () => {
  assert.deepEqual(normalizeLayout({ folders: { x: { path: 'Y', order: [], at: 1 }, w: null } }).folders, {});
  assert.deepEqual(normalizeLayout(null), EMPTY_LAYOUT);
  assert.deepEqual(normalizeLayout({ folders: { work: { path: 'Work', order: 'no', at: 1 } } }).folders, {});
  assert.deepEqual(normalizeLayout({ folders: { work: { path: 'Work', order: [], at: Date.UTC(3000, 0, 1) } } }).folders, {});
  assert.deepEqual(
    normalizeLayout({ folders: { work: { path: 'Work', order: ['u:1', 7, 'x:2'], at: 3, tie: 'x'.repeat(200), extra: 1 } } }).folders,
    { work: { path: 'Work', order: ['u:1'], at: 3, tie: '' } },
  );
});

test('layoutsEqual ignores key order', () => {
  const a = { version: 1, folders: { a: { path: 'A', order: [], at: 1, tie: '' }, b: { path: 'B', order: [], at: 1, tie: '' } } };
  const b = { version: 1, folders: { b: { path: 'B', order: [], at: 1, tie: '' }, a: { path: 'A', order: [], at: 1, tie: '' } } };
  assert.ok(layoutsEqual(a, b));
  assert.ok(!layoutsEqual(a, EMPTY_LAYOUT));
});
