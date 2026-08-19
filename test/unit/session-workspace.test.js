'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_WORKSPACE_VERSION,
  PRIMARY_WINDOW_ID,
  loadWorkspace,
  buildSaveShape,
  removeProfileWorkspaces,
  entryFrom,
} = require('../../src/main/session-workspace');

const ENTRY = {
  id: PRIMARY_WINDOW_ID,
  profileId: 'default',
  // Named Workspaces single-window binding (Task 6). null = scratch window,
  // same as every entry that predates this field.
  workspaceId: null,
  urls: ['https://a.example/', 'https://b.example/'],
  activeIndex: 1,
  groups: [{ id: 'g1', name: 'work', collapsed: false }],
  groupIds: ['g1', null],
  pinned: [false, true],
  // Quiet Tabs (spec §10.1). An entry always HAS the key; a file that predates
  // it — or whose array no longer lines up with urls — reads back as [].
  meta: [],
};
const EMPTY = { id: PRIMARY_WINDOW_ID, profileId: 'default', workspaceId: null, urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] };

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

test('v1 with an agreeing mirror migrates windows into Personal', () => {
  const file = { version: 1, windows: [ENTRY], ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY]);
});

test('v2 preserves the explicit profile identity of every window', () => {
  const named = {
    ...ENTRY,
    id: 'window_work',
    profileId: 'profile_work',
    urls: ['https://work.example/'],
    groupIds: [null],
    pinned: [false],
    activeIndex: 0,
  };
  const file = {
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: named.id,
    windows: [ENTRY, named],
    ...named,
  };
  const loaded = loadWorkspace(file);
  assert.equal(loaded.readOnly, false);
  assert.equal(loaded.activeWindowId, named.id);
  assert.deepEqual(loaded.windows, [ENTRY, named]);
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
  const file = { version: SESSION_WORKSPACE_VERSION + 1, windows: [ENTRY], somethingNew: true, ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, true, 'a 1.1 build must never rewrite a newer format');
  assert.deepEqual(windows, [ENTRY]);
});

test('unknown future version with an unparseable mirror loads empty, read-only', () => {
  const { windows, readOnly } = loadWorkspace({ version: SESSION_WORKSPACE_VERSION + 1, windows: 'opaque' });
  assert.equal(readOnly, true);
  assert.deepEqual(windows, [EMPTY]);
});

test('buildSaveShape writes v2 plus a mirror shape-identical to the 1.0.9 writer', () => {
  const shape = buildSaveShape(ENTRY, {});
  assert.equal(shape.version, SESSION_WORKSPACE_VERSION);
  assert.equal(shape.activeWindowId, PRIMARY_WINDOW_ID);
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

// ─── Quiet Tabs: the session.json meta column (spec §10.1) ────────────────

const META = [
  { title: 'A', favicon: 'https://a.example/favicon.ico' },
  { title: '', favicon: null },
];

test('meta is written into windows[0] only, never into the v0 mirror', () => {
  const shape = buildSaveShape({ ...ENTRY, meta: META }, {});
  assert.deepEqual(shape.windows[0].meta, META);
  assert.equal('meta' in shape, false,
    'a 1.0.x rollback rewrites the five mirror keys and would strand a stale meta array');
});

test('a v1 file with meta and an agreeing mirror still loads the NESTED workspace', () => {
  const file = { version: 1, windows: [{ ...ENTRY, meta: META }], ...ENTRY };
  const { windows } = loadWorkspace(file);
  assert.deepEqual(windows[0].urls, ENTRY.urls, 'nested must win — the mirror carries no meta by design');
  assert.deepEqual(windows[0].meta, META);
});

test('a meta array whose length no longer matches urls self-drops', () => {
  const { windows } = loadWorkspace({ version: 1, windows: [{ ...ENTRY, meta: [META[0]] }] });
  assert.deepEqual(windows[0].meta, [], 'a stale array must never zip onto different urls');
});

test('rollback → re-upgrade drops meta along with the stale nested workspace', () => {
  const staleNested = {
    ...ENTRY, urls: ['https://old.example/'], groupIds: [null], pinned: [false], activeIndex: 0,
    meta: [{ title: 'Old', favicon: null }],
  };
  const { windows } = loadWorkspace({ version: 1, windows: [staleNested], ...ENTRY });
  assert.deepEqual(windows[0].urls, ENTRY.urls, 'the legacy writer wrote last');
  assert.deepEqual(windows[0].meta, []);
});

test('v1 restores multiple independently identified windows and the focused owner', () => {
  const secondary = {
    ...ENTRY,
    id: 'window_2',
    urls: ['https://secondary.example/'],
    groupIds: [null],
    pinned: [false],
    meta: [{ title: 'Secondary', favicon: null }],
    activeIndex: 0,
  };
  const file = {
    ...ENTRY,
    version: 1,
    activeWindowId: secondary.id,
    windows: [ENTRY, secondary],
    // The rollback mirror follows the focused window.
    ...secondary,
  };
  const loaded = loadWorkspace(file);
  assert.equal(loaded.readOnly, false);
  assert.equal(loaded.activeWindowId, secondary.id);
  assert.deepEqual(loaded.windows, [ENTRY, secondary]);
});

test('buildSaveShape retains every window and mirrors only the focused one', () => {
  const secondary = {
    ...ENTRY,
    id: 'window_2',
    urls: ['https://secondary.example/'],
    groupIds: [null],
    pinned: [true],
    meta: [{ title: 'Secondary', favicon: null }],
    activeIndex: 0,
  };
  const shape = buildSaveShape([ENTRY, secondary], {}, { activeWindowId: secondary.id });
  assert.deepEqual(shape.windows, [ENTRY, secondary]);
  assert.equal(shape.activeWindowId, secondary.id);
  assert.deepEqual(shape.urls, secondary.urls);
  assert.deepEqual(shape.groups, secondary.groups);
  assert.deepEqual(shape.groupIds, secondary.groupIds);
  assert.deepEqual(shape.pinned, secondary.pinned);
  assert.equal('meta' in shape, false);
});

test('legacy mirror divergence collapses stale multi-window state to one primary workspace', () => {
  const staleSecondary = {
    ...ENTRY,
    id: 'window_2',
    urls: ['https://stale-secondary.example/'],
    groupIds: [null],
    pinned: [false],
  };
  const currentMirror = {
    ...ENTRY,
    urls: ['https://changed-under-rollback.example/'],
    groupIds: [null],
    pinned: [false],
    activeIndex: 0,
  };
  const loaded = loadWorkspace({
    version: 1,
    activeWindowId: staleSecondary.id,
    windows: [ENTRY, staleSecondary],
    ...currentMirror,
  });
  assert.equal(loaded.activeWindowId, PRIMARY_WINDOW_ID);
  assert.deepEqual(loaded.windows, [{ ...currentMirror, id: PRIMARY_WINDOW_ID, meta: [] }]);
});

test('profile removal drops every owned workspace and repairs the focused id', () => {
  const personal = { ...ENTRY };
  const workA = { ...ENTRY, id: 'window_work_a', profileId: 'profile_work' };
  const workB = { ...ENTRY, id: 'window_work_b', profileId: 'profile_work' };
  const saved = buildSaveShape([personal, workA, workB], {}, {
    activeWindowId: workB.id,
  });
  const removed = removeProfileWorkspaces(saved, 'profile_work');
  assert.equal(removed.readOnly, false);
  assert.deepEqual(removed.windows, [personal]);
  assert.equal(removed.activeWindowId, personal.id);
});

test('profile removal refuses Personal and future workspace formats', () => {
  const saved = buildSaveShape([ENTRY], {});
  assert.deepEqual(removeProfileWorkspaces(saved, 'default').windows, [ENTRY]);
  assert.equal(removeProfileWorkspaces({ version: 99 }, 'profile_work').readOnly, true);
});

// ─── Named Workspaces: the session.json binding pointer (Task 6) ──────────
//
// The pointer is validated, never trusted verbatim: entryFrom is the ONLY
// place session.json's workspaceId is read, so its rules (shape, __proto__
// deny-list) are exercised directly here rather than only indirectly through
// loadWorkspace/buildSaveShape round trips elsewhere in this file.

test('entryFrom: a valid workspaceId round-trips', () => {
  const entry = entryFrom({ ...ENTRY, workspaceId: 'workspace_1' });
  assert.equal(entry.workspaceId, 'workspace_1');
});

test('entryFrom: a 64-character workspaceId (the upper bound) round-trips', () => {
  const id = 'w'.repeat(64);
  assert.equal(entryFrom({ ...ENTRY, workspaceId: id }).workspaceId, id);
});

test('entryFrom: an invalid workspaceId normalizes to null', () => {
  const invalidValues = [
    'hello world',   // whitespace fails the id-shape regex
    '__proto__',      // shape-valid but denied — would silently corrupt a plain object key
    'w'.repeat(65),    // one past the 64-char bound
    123,               // non-string
    true,              // non-string
    {},                // non-string
    [],                // non-string
    null,              // explicit null is already the correct default, but must not throw
  ];
  for (const workspaceId of invalidValues) {
    const entry = entryFrom({ ...ENTRY, workspaceId });
    assert.equal(entry.workspaceId, null, `expected null for ${JSON.stringify(workspaceId)}`);
  }
});

test('entryFrom: an absent workspaceId key normalizes to null', () => {
  const { workspaceId: _drop, ...sourceWithoutKey } = ENTRY;
  assert.equal(entryFrom(sourceWithoutKey).workspaceId, null);
});

test('mirrorProjection still emits exactly the five legacy keys — no workspaceId', () => {
  // buildSaveShape spreads mirrorProjection(focused) directly onto the saved
  // shape, so its exact key set is observable here without exporting the
  // helper itself. A binding pointer is metadata (like id/profileId), which
  // the pre-v1 flat rollback mirror must never carry — an older build reads
  // this file and understands only these five keys.
  const shape = buildSaveShape({ ...ENTRY, workspaceId: 'workspace_1' }, {});
  const controlKeys = new Set(['version', 'activeWindowId', 'windows']);
  const mirrorKeys = Object.keys(shape).filter((key) => !controlKeys.has(key)).sort();
  assert.deepEqual(mirrorKeys, ['activeIndex', 'groupIds', 'groups', 'pinned', 'urls']);
  assert.equal('workspaceId' in shape, false, 'a binding pointer must never enter the flat mirror');
});

test('hasMirror is unaffected: a healthy file with no top-level workspaceId round-trips ' +
  'the nested binding and is still recognized as having a mirror', () => {
  // A healthy v2 save never writes workspaceId to the top level (previous
  // test), so this is the shape loadWorkspace actually sees on every normal
  // relaunch. If hasMirror ever came to require workspaceId at the top
  // level, every real file would silently stop being recognized as having a
  // mirror at all.
  const saved = buildSaveShape({ ...ENTRY, workspaceId: 'workspace_1' }, {});
  assert.equal('workspaceId' in saved, false, 'sanity: matches the previous test');
  const { windows, readOnly } = loadWorkspace(saved);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [{ ...ENTRY, workspaceId: 'workspace_1' }],
    'the nested workspaceId must survive the round trip, and the mirror must still be detected ' +
    '(a false "no mirror" would take the wrong branch in loadWorkspace)');
});

test('each restored window carries its own independent workspaceId (or none)', () => {
  const bound = { ...ENTRY, id: 'window_work', workspaceId: 'workspace_work', groupIds: [null, null] };
  const scratch = { ...ENTRY, id: 'window_scratch', workspaceId: null, groupIds: [null, null] };
  const shape = buildSaveShape([bound, scratch], {}, { activeWindowId: bound.id });
  const { windows } = loadWorkspace(shape);
  const byId = new Map(windows.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('window_work').workspaceId, 'workspace_work');
  assert.equal(byId.get('window_scratch').workspaceId, null);
});
