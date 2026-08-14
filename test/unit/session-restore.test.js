const assert = require('node:assert/strict');
const test = require('node:test');

const { filterRestoredSession, restoreTargetId } = require('../../src/main/session-restore');

const drop = (url) => url.startsWith('blanc://settings');

test('keeps zipped alignment when middle entries drop', () => {
  const out = filterRestoredSession({
    urls: ['https://a/', 'blanc://settings/', 'https://b/'],
    groupIds: ['g1', null, 'g2'],
    pinned: [true, false, false],
    meta: [
      { title: 'A', favicon: 'https://a/icon.png' },
      { title: 'Settings', favicon: null },
      { title: 'B', favicon: null },
    ],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out, {
    urls: ['https://a/', 'https://b/'],
    groupIds: ['g1', 'g2'],
    pinned: [true, false],
    meta: [
      { title: 'A', favicon: 'https://a/icon.png' },
      { title: 'B', favicon: null },
    ],
    activeIndex: 0,
  });
});

test('active entry removed: next surviving neighbor wins', () => {
  const out = filterRestoredSession({
    urls: ['https://a/', 'blanc://settings/', 'https://b/'],
    groupIds: [null, null, null],
    pinned: [false, false, false],
    activeIndex: 1,
  }, drop);
  assert.equal(out.activeIndex, 1); // https://b/ at new index 1
});

test('active entry removed with no survivor after: last survivor before wins', () => {
  const out = filterRestoredSession({
    urls: ['https://a/', 'https://b/', 'blanc://settings/'],
    groupIds: [null, null, null],
    pinned: [false, false, false],
    activeIndex: 2,
  }, drop);
  assert.equal(out.activeIndex, 1); // https://b/
});

test('active survives a shift left', () => {
  const out = filterRestoredSession({
    urls: ['blanc://settings/', 'https://a/'],
    groupIds: [null, 'g1'],
    pinned: [false, true],
    activeIndex: 1,
  }, drop);
  assert.deepEqual(out, {
    urls: ['https://a/'], groupIds: ['g1'], pinned: [true],
    meta: [{ title: 'a', favicon: null }], activeIndex: 0,
  });
});

test('everything removed: empty arrays, activeIndex 0', () => {
  const out = filterRestoredSession({
    urls: ['blanc://settings/'], groupIds: [null], pinned: [false], activeIndex: 0,
  }, drop);
  assert.deepEqual(out, { urls: [], groupIds: [], pinned: [], meta: [], activeIndex: 0 });
});

test('missing metadata arrays and out-of-range activeIndex are tolerated', () => {
  const out = filterRestoredSession({ urls: ['https://a/'], activeIndex: 99 }, drop);
  assert.deepEqual(out, {
    urls: ['https://a/'], groupIds: [null], pinned: [false],
    meta: [{ title: 'a', favicon: null }], activeIndex: 0,
  });
});

// A v1.1.1 session.json has urls but no meta column. Restored tabs are born
// quiet, so without a derived label every row reads "New Tab" until first
// wake — reported after the 1.2.1 update as "my tabs are gone".
test('missing meta on a real site derives the row title from the host', () => {
  const out = filterRestoredSession({
    urls: ['https://www.blancbrowser.com/changelog/'],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out.meta, [{ title: 'blancbrowser.com', favicon: null }]);
});

test('empty meta title on a real site also derives from the host', () => {
  const out = filterRestoredSession({
    urls: ['https://news.ycombinator.com/item?id=1'],
    meta: [{ title: '', favicon: null }],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out.meta, [{ title: 'news.ycombinator.com', favicon: null }]);
});

test('a saved real title is never overwritten by the host', () => {
  const out = filterRestoredSession({
    urls: ['https://example.com/'],
    meta: [{ title: 'Example Domain', favicon: 'https://example.com/i.png' }],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out.meta, [{ title: 'Example Domain', favicon: 'https://example.com/i.png' }]);
});

test('a genuinely blank tab keeps its empty title (renders as New Tab)', () => {
  const out = filterRestoredSession({
    urls: ['blanc://newtab/'],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out.meta, [{ title: '', favicon: null }]);
});

test('an unparsable url without meta stays untitled rather than throwing', () => {
  const out = filterRestoredSession({
    urls: ['not a url'],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out.meta, [{ title: '', favicon: null }]);
});

test('restoreTargetId skips holes at and after the saved index', () => {
  assert.equal(restoreTargetId(['a', null, 'c'], 1), 'c');
});

test('restoreTargetId falls back to the last real id before the saved index', () => {
  assert.equal(restoreTargetId(['a', null, null], 2), 'a');
});

test('restoreTargetId returns null when nothing was created', () => {
  assert.equal(restoreTargetId([null, null], 0), null);
  assert.equal(restoreTargetId([], 0), null);
  assert.equal(restoreTargetId(undefined, 0), null);
});

test('restoreTargetId clamps an out-of-range or non-integer index', () => {
  assert.equal(restoreTargetId(['a', 'b'], 99), 'b');
  assert.equal(restoreTargetId(['a', 'b'], -3), 'a');
  assert.equal(restoreTargetId(['a', 'b'], undefined), 'a');
});
