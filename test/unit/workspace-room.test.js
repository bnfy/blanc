'use strict';
// Switching between spaces never stops for a limit (spec D22). After a
// switch, Blanc quiets tabs in the spaces it has set aside: at most two
// set-aside spaces keep loaded tabs and at most 16 stay loaded across them.
// roomPlan only decides which tabs to quiet, in order; Quiet Tabs may still
// refuse one (unsaved work), which then stays loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { roomPlan, releasePlan } = require('../../src/main/workspace-residency');

// A set-aside space: `since` is when it was set aside.
const space = (since, ...tabs) => ({ residentSince: since, tabOrder: tabs.map(([id]) => id), tabs });
// A tab is [id, lastActiveAt, live = true, quietable = true].
function plan(residents, options) {
  const all = new Map(residents.flatMap((r) => r.tabs.map(([id, at, live = true, quietable = true]) => [id, { at, live, quietable }])));
  return roomPlan(residents, {
    isLive: (id) => all.get(id).live, canQuiet: (id) => all.get(id).quietable, lastActiveAt: (id) => all.get(id).at, ...options,
  });
}
const tabsOf = (prefix, n, base = 0) => Array.from({ length: n }, (_, i) => [`${prefix}${i}`, base + i]);

test('within the budget, nothing is quieted', () => {
  assert.deepEqual(plan([space(1, ...tabsOf('a', 3)), space(2, ...tabsOf('b', 3))]), []);
  assert.deepEqual(plan([]), []);
});

test('a third set-aside space: the one set aside longest ago gives way, its least recently used tabs first', () => {
  const residents = [space(30, ...tabsOf('c', 2)), space(10, ['a0', 500], ['a1', 100], ['a2', 300]), space(20, ...tabsOf('b', 2))];
  assert.deepEqual(plan(residents), ['a1', 'a2', 'a0'], 'sorted by when they were set aside, not by list order');
});

test('too many loaded tabs: the older of the kept spaces gives way first, the space just left last', () => {
  const older = space(1, ...tabsOf('b', 10, 0)); const newest = space(2, ...tabsOf('c', 9, 100));
  assert.deepEqual(plan([older, newest]), ['b0', 'b1', 'b2'], '19 loaded, 3 over: all from the older space');
  const thin = space(1, ...tabsOf('b', 2, 0)); const heavy = space(2, ...tabsOf('c', 18, 100));
  assert.deepEqual(plan([thin, heavy]), ['b0', 'b1', 'c0', 'c1'], '20 loaded, 4 over: the older space first, then the oldest of the newest');
});

test('tabs that are already quiet neither count nor appear in the plan', () => {
  const quietOld = space(1, ['a0', 1, false], ['a1', 2, false]);
  const residents = [quietOld, space(2, ...tabsOf('b', 2)), space(3, ...tabsOf('c', 2))];
  assert.deepEqual(plan(residents), [], 'the oldest space is already fully quiet, so two spaces hold loaded tabs');
  assert.deepEqual(plan([space(1, ['a0', 1, false], ['a1', 2]), space(2, ...tabsOf('b', 1)), space(3, ...tabsOf('c', 1))]), ['a1']);
});

test('the budget can be set, and a space with no loaded tabs is not a space to quiet', () => {
  assert.deepEqual(plan([space(1, ...tabsOf('a', 2)), space(2, ...tabsOf('b', 2))], { maxSets: 1 }), ['a0', 'a1']);
  assert.deepEqual(plan([space(1, ...tabsOf('a', 4))], { maxLiveTabs: 2 }), ['a0', 'a1']);
});

test("a tab Quiet Tabs would never quiet still counts, but is never in the plan", () => {
  // The oldest space plays music in a0 (not quietable): only a1 goes.
  const residents = [space(1, ['a0', 1, true, false], ['a1', 2]), space(2, ...tabsOf('b', 1)), space(3, ...tabsOf('c', 1))];
  assert.deepEqual(plan(residents), ['a1']);
  // 17 loaded, one over, and the oldest loaded tab is pinned: the next one goes instead.
  const kept = [space(1, ['b0', 0, true, false], ...tabsOf('b', 8, 10).map(([id, at]) => [`x${id}`, at])), space(2, ...tabsOf('c', 8, 100))];
  assert.deepEqual(plan(kept), ['xb0']);
});

// The hard cap on set-aside spaces holds whatever Quiet Tabs is doing (off,
// or out of snapshots): beyond it the oldest unprotected spaces are released.
test('beyond the cap, the oldest set-aside spaces are released, skipping any with protected work', () => {
  const r = (id, since, isProtected = false) => ({ id, residentSince: since, isProtected });
  const release = (residents, max) => releasePlan(residents, { maxSetAside: max, isProtected: (x) => x.isProtected }).map((x) => x.id);
  assert.deepEqual(release([r('a', 1), r('b', 2)], 6), [], 'within the cap');
  assert.deepEqual(release([r('c', 3), r('a', 1), r('b', 2), r('d', 4)], 2), ['a', 'b'], 'oldest first, not list order');
  assert.deepEqual(release([r('a', 1, true), r('b', 2), r('c', 3), r('d', 4)], 2), ['b', 'c'], 'a protected space stays and still counts');
  assert.deepEqual(release([r('a', 1, true), r('b', 2, true), r('c', 3)], 1), ['c'], 'only what can go goes');
  assert.deepEqual(release([r('a', 1, true), r('b', 2, true)], 1), [], 'nothing unprotected to release');
});
