'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  holdEligibility, sanitizeSnapshot, buildTabEntry, buildGroupEntry,
  expireHolds, projectEntries, CLOSED_GRACE_MS, MAX_CLOSED_ENTRIES,
} = require('../../src/main/closed-tabs');

const SNAP = { entries: [{ url: 'https://a.test/', title: 'A' }], index: 0, droppedPageState: false };
const baseTab = (over = {}) => ({
  url: 'https://a.test/', private: false, capturing: false, captureRecord: null,
  isLoading: false, asleep: false, sleeping: false, waking: false,
  adopted: false, title: 'A', favicon: null, pinned: false, muted: false,
  groupId: null, usedMedia: false, historyEligible: true,
  restorableCommit: true, httpEntryCount: 1, deepScrolled: false, ...over,
});

test('eligibility: refuse for private, newtab, and url-less tabs', () => {
  const opts = { hasSnapshot: true };
  assert.equal(holdEligibility(baseTab({ private: true }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: 'blanc://newtab/' }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: '' }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: 42 }), opts), 'refuse');
});

test('eligibility: hold only for a clean, snapshot-bearing, family-free tab', () => {
  assert.equal(holdEligibility(baseTab(), { hasSnapshot: true }), 'hold');
  assert.equal(holdEligibility(baseTab(), { hasSnapshot: false }), 'url');
});

test('eligibility: every Tier 1 demotion condition', () => {
  const opts = { hasSnapshot: true };
  assert.equal(holdEligibility(baseTab({ capturing: true }), opts), 'snapshot');
  // grant anchors are truth even when the capturing projection reads false (§5.1a)
  assert.equal(holdEligibility(baseTab({ captureRecord: { anchors: [{}] } }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, promptPending: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab({ isLoading: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ asleep: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ sleeping: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ adopted: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, openerAlive: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, hasManagedChild: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, popupChildCount: 1 }), 'snapshot');
});

test('sanitizeSnapshot strips active pageState for a non-restorable commit', () => {
  const snap = { entries: [{ url: 'u', title: 't', pageState: 'POSTBODY' }], index: 0, droppedPageState: false };
  const clean = sanitizeSnapshot(snap, { restorableCommit: false });
  assert.equal(clean.entries[0].pageState, undefined);
  const kept = sanitizeSnapshot(snap, { restorableCommit: true });
  assert.equal(kept.entries[0].pageState, 'POSTBODY');
  assert.equal(sanitizeSnapshot(null, { restorableCommit: true }), null);
});

test('sanitizeSnapshot strips every entry when restorableCommit is false (defense-in-depth)', () => {
  const snap = {
    entries: [
      { url: 'u1', title: 't1', pageState: 'STATE1' },
      { url: 'u2', title: 't2', pageState: 'STATE2' },
    ],
    index: 1,
    droppedPageState: false,
  };
  const clean = sanitizeSnapshot(snap, { restorableCommit: false });
  // No entry retains pageState when commit is non-restorable
  assert.equal(clean.entries[0].pageState, undefined);
  assert.equal(clean.entries[1].pageState, undefined);
  // URLs and titles are preserved
  assert.equal(clean.entries[0].url, 'u1');
  assert.equal(clean.entries[1].url, 'u2');

  // With restorable commit, both pageStates are intact
  const kept = sanitizeSnapshot(snap, { restorableCommit: true });
  assert.equal(kept.entries[0].pageState, 'STATE1');
  assert.equal(kept.entries[1].pageState, 'STATE2');
});

test('buildTabEntry captures identity, slot, and the adoption seed', () => {
  const entry = buildTabEntry(
    baseTab({ pinned: true, muted: true, usedMedia: true, groupId: 'g1', navEpoch: 7 }),
    SNAP, { index: 3, groupName: 'work' }, 1000);
  assert.equal(entry.seed.navEpoch, 7);
  assert.equal(entry.kind, 'tab');
  assert.equal(entry.closedAt, 1000);
  assert.equal(entry.index, 3);
  assert.deepEqual(
    [entry.pinned, entry.muted, entry.groupId, entry.groupName],
    [true, true, 'g1', 'work']);
  assert.equal(entry.seed.usedMedia, true);
  assert.equal(entry.view, null);
  assert.ok(entry.id && entry.id !== buildTabEntry(baseTab(), SNAP, { index: 0 }, 1000).id);
});

test('buildGroupEntry is one entry with per-member snapshots and no private members', () => {
  const members = [
    { url: 'https://a.test/', title: 'A', favicon: null, pinned: true, muted: false, private: false, snapshot: SNAP },
    { url: 'https://p.test/', title: 'P', favicon: null, pinned: false, muted: false, private: true, snapshot: SNAP },
  ];
  const entry = buildGroupEntry({ id: 'g1', name: 'work', collapsed: false, index: 2, activeMemberIndex: 0 }, members, 1000);
  assert.equal(entry.kind, 'group');
  assert.equal(entry.group.name, 'work');
  assert.equal(entry.group.index, 2);
  assert.equal(entry.tabs.length, 1); // the private member is not recorded
  assert.equal(entry.view, null);
});

test('expireHolds names only entries whose hold has aged out', () => {
  const young = { id: 'a', view: {}, heldAt: 100 };
  const old = { id: 'b', view: {}, heldAt: 0 };
  const snapshotOnly = { id: 'c', view: null, heldAt: null };
  assert.deepEqual(
    expireHolds([young, old, snapshotOnly], { now: CLOSED_GRACE_MS, graceMs: CLOSED_GRACE_MS }),
    ['b']);
});

test('projectEntries emits exactly five fields and only PNG data favicons', () => {
  const entries = [
    { kind: 'tab', id: 'e1', title: 'A', favicon: 'data:image/png;base64,AAAA', view: {}, snapshot: SNAP, tabs: null },
    { kind: 'tab', id: 'e2', title: 'B', favicon: 'https://evil.test/f.ico', view: null, snapshot: SNAP },
    { kind: 'tab', id: 'e3', title: 'C', favicon: null, view: null, snapshot: null },
    { kind: 'group', id: 'e4', group: { name: 'work' }, view: null, tabs: [{}, {}] },
  ];
  const projected = projectEntries(entries);
  assert.deepEqual(projected.map((p) => Object.keys(p).sort()),
    projected.map(() => ['favicon', 'id', 'tabCount', 'tier', 'title']));
  assert.deepEqual(projected.map((p) => p.tier), [0, 1, 2, 1]);
  assert.equal(projected[1].favicon, null); // non-PNG-data favicon never crosses
  assert.deepEqual(projected.map((p) => p.tabCount), [1, 1, 1, 2]);
  assert.equal(projected[3].title, 'work');
});
