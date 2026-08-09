'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
} = require('../../src/main/tab-sleep');

// The delay table is the ONLY setting-id -> milliseconds mapping in the app.
// settings.js holds the enum of ids; this holds what they mean.
test('the delay table maps every setting id, and "off" means never', () => {
  assert.deepEqual(Object.keys(TAB_SLEEP_DELAY_MS), ['off', '30m', '1h', '6h']);
  assert.equal(TAB_SLEEP_DELAY_MS.off, null);
  assert.equal(TAB_SLEEP_DELAY_MS['30m'], 1800000);
  assert.equal(TAB_SLEEP_DELAY_MS['1h'], 3600000);
  assert.equal(TAB_SLEEP_DELAY_MS['6h'], 21600000);
  assert.equal(MAX_SLEEP_SNAPSHOTS, 50);
  assert.equal(MAX_PAGE_STATE_BYTES, 512 * 1024);
});

// An empty history means the tab has nothing worth restoring. Returning a
// snapshot here would let sleepTab overwrite a good one with an empty one and
// strand the tab on a blank page after wake.
test('an empty or missing entry list produces no snapshot at all', () => {
  assert.equal(trimSnapshot([], 0), null);
  assert.equal(trimSnapshot(null, 0), null);
  assert.equal(trimSnapshot(undefined, 0), null);
});

// pageState on a BACK entry carries the verbatim POST body of a past form
// submission plus stale form values. Only the active entry may keep it.
test('non-active entries are rebuilt as exactly {url, title}', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
    { url: 'https://c/', title: 'C', pageState: 'ccc' },
  ], 1);
  assert.deepEqual(Object.keys(snap.entries[0]), ['url', 'title']);
  assert.deepEqual(Object.keys(snap.entries[2]), ['url', 'title']);
  assert.equal('pageState' in snap.entries[0], false, 'the key must be ABSENT, not undefined');
  assert.deepEqual(snap.entries[1], { url: 'https://b/', title: 'B', pageState: 'bbb' });
  assert.equal(snap.index, 1);
  assert.equal(snap.droppedPageState, false);
});

test('an active entry with no pageState is not reported as dropped', () => {
  const snap = trimSnapshot([{ url: 'https://a/', title: 'A' }], 0);
  assert.deepEqual(snap.entries, [{ url: 'https://a/', title: 'A' }]);
  assert.equal(snap.droppedPageState, false);
});

// The ceiling exists to bound real heap, so it is measured in UTF-8 BYTES.
// '€' is 1 JS char but 3 bytes: a String.length check would keep this.
test('the pageState ceiling is measured in UTF-8 bytes, not string length', () => {
  const snap = trimSnapshot(
    [{ url: 'https://a/', title: 'A', pageState: '€€€€' }],
    0,
    { maxPageStateBytes: 10 }
  );
  assert.equal('pageState' in snap.entries[0], false);
  assert.equal(snap.droppedPageState, true);
});

// Oversized still returns a snapshot: the tab is quieted anyway and wake goes
// through navigationHistory.restore() with pageState-free entries, preserving
// the back stack. Returning null here would degrade wake to loadURL().
test('an oversized pageState is dropped but the snapshot survives', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A' },
    { url: 'https://b/', title: 'B', pageState: 'x'.repeat(600 * 1024) },
  ], 1);
  assert.notEqual(snap, null);
  assert.equal(snap.entries.length, 2);
  assert.equal(snap.index, 1);
  assert.equal('pageState' in snap.entries[1], false);
  assert.equal(snap.droppedPageState, true);
});

test('a private tab keeps no pageState on any entry', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
  ], 1, { private: true });
  assert.equal('pageState' in snap.entries[0], false);
  assert.equal('pageState' in snap.entries[1], false);
  assert.equal(snap.droppedPageState, true);
  assert.equal(snap.index, 1);
});

test('the index is clamped into range, and a non-integer index clamps to 0', () => {
  const entries = [
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
  ];
  assert.equal(trimSnapshot(entries, 9).index, 1);
  assert.equal(trimSnapshot(entries, -4).index, 0);
  assert.equal(trimSnapshot(entries, 1.5).index, 0);
  assert.equal(trimSnapshot(entries, undefined).index, 0);
  // and the clamped index is the entry that keeps its pageState
  assert.equal(trimSnapshot(entries, 9).entries[1].pageState, 'bbb');
});
