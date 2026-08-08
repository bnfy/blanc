'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadWorkspace, buildSaveShape } = require('../../src/main/session-workspace');

const ENTRY = {
  urls: ['https://a.example/', 'https://b.example/'],
  activeIndex: 1,
  groups: [{ id: 'g1', name: 'work', collapsed: false }],
  groupIds: ['g1', null],
  pinned: [false, true],
};
const EMPTY = { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [] };

test('v0 (version-less flat file) loads as one window', () => {
  const { windows, readOnly } = loadWorkspace({ ...ENTRY });
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY]);
});

test('empty or missing data loads as one empty window', () => {
  for (const data of [undefined, null, {}, { urls: [] }]) {
    const { windows } = loadWorkspace(data);
    assert.deepEqual(windows, [EMPTY], JSON.stringify(data));
  }
});

test('v1 with an agreeing mirror loads windows[0]', () => {
  const file = { version: 1, windows: [ENTRY], ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY]);
});

test('rollback → re-upgrade: a diverged mirror wins over the stale nested workspace', () => {
  // 1.0.9's JsonStore.update() rewrote the flat fields in place and PRESERVED
  // the unknown version/windows keys — so divergence means the legacy writer
  // wrote last, and v1 is rebuilt from the mirror.
  const staleNested = { ...ENTRY, urls: ['https://old.example/'], groupIds: [null], pinned: [false], activeIndex: 0 };
  const file = { version: 1, windows: [staleNested], ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY], 'mirror (legacy writer) must win');
});

test('unknown future version loads from the mirror, read-only', () => {
  const file = { version: 2, windows: [ENTRY], somethingNew: true, ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, true, 'a 1.1 build must never rewrite a newer format');
  assert.deepEqual(windows, [ENTRY]);
});

test('unknown future version with an unparseable mirror loads empty, read-only', () => {
  const { windows, readOnly } = loadWorkspace({ version: 2, windows: 'opaque' });
  assert.equal(readOnly, true);
  assert.deepEqual(windows, [EMPTY]);
});

test('buildSaveShape writes v1 plus a mirror shape-identical to the 1.0.9 writer', () => {
  const shape = buildSaveShape(ENTRY, {});
  assert.equal(shape.version, 1);
  assert.deepEqual(shape.windows, [ENTRY]);
  // The mirror IS the 1.0.9 persistSession shape: exactly these five keys.
  assert.deepEqual(shape.urls, ENTRY.urls);
  assert.equal(shape.activeIndex, ENTRY.activeIndex);
  assert.deepEqual(shape.groups, ENTRY.groups);
  assert.deepEqual(shape.groupIds, ENTRY.groupIds);
  assert.deepEqual(shape.pinned, ENTRY.pinned);
});

test('buildSaveShape preserves foreign keys it does not own', () => {
  const shape = buildSaveShape(ENTRY, { futureKey: { keep: true } });
  assert.deepEqual(shape.futureKey, { keep: true });
});

test('v1 with populated windows[0] but NO mirror keys → nested wins', () => {
  // Data-loss regression: absent mirror should not default to EMPTY and "diverge"
  const file = { version: 1, windows: [ENTRY] }; // no top-level urls/activeIndex/groups/groupIds/pinned
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY], 'nested must win when mirror is absent');
});

test('v1 with populated windows[0] and PARTIAL mirror → nested wins', () => {
  // Only urls + activeIndex present; missing groups/groupIds/pinned
  const file = { version: 1, windows: [ENTRY], urls: ENTRY.urls, activeIndex: ENTRY.activeIndex };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY], 'nested must win when mirror is incomplete');
});

test('v1 with populated windows[0] and INVALID mirror → nested wins', () => {
  // urls is a string instead of array; activeIndex is a string instead of integer
  const file = { version: 1, windows: [ENTRY], urls: 'invalid', activeIndex: '1', groups: [], groupIds: [], pinned: [] };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY], 'nested must win when mirror is invalid');
});

test('v1 where mirror groups have different key order but identical content → treated as agreeing', () => {
  // Regression: JSON.stringify is key-order-sensitive for objects within arrays.
  // This fixture MUST discriminate between deepEqual (which ignores key order) and
  // JSON.stringify (which does not). Assert Object.keys order of the result to prove
  // the NESTED entry branch fired (not just that values are equal).
  const nestedGroups = [{ id: 'g1', name: 'work', collapsed: false }]; // key order: id, name, collapsed
  const nestedEntry = {
    urls: ['https://a.example/'],
    activeIndex: 0,
    groups: nestedGroups,
    groupIds: ['g1'],
    pinned: [false],
  };
  const reorderedMirrorGroups = [{ collapsed: false, id: 'g1', name: 'work' }]; // key order: collapsed, id, name
  const file = {
    version: 1,
    windows: [nestedEntry],
    urls: ['https://a.example/'],
    activeIndex: 0,
    groups: reorderedMirrorGroups,
    groupIds: ['g1'],
    pinned: [false],
  };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  // This assertion MUST verify that nested entry was returned, not the mirror.
  // If deepEqual is reverted to JSON.stringify, this test FAILS because the mirror
  // branch would fire, and Object.keys(mirror groups[0]) would be ['collapsed','id','name'].
  assert.deepEqual(Object.keys(windows[0].groups[0]), ['id', 'name', 'collapsed'],
    'nested branch must win — reordered keys are not divergence, so nested key order is preserved');
});
