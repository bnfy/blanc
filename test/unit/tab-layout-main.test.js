'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const closedSlot = require('../../src/main/closed-slot');
const tabOrder = require('../../src/main/tab-order');
const tabSections = require('../../src/renderer/tab-sections');
const groupNameCase = require('../../src/main/group-name-case');

// Ungrouped tabs anywhere (spec 2026-10-17): main keeps one tab order.
// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
const names = [
  'tabLayoutList', 'syncTabLayout', 'clusterList', 'clusterKeyForTab', 'setTabGroup', 'groupTabByName',
  'ungroupGroup', 'reopenGroupEntry', 'reorderGroupBefore', 'moveClosedSection', 'applySavedLayout',
  'moveTabTo', 'finishReopen', 'toggleTabPinned', 'setGroupColor',
];
const sources = names.map(lift);

test('the tab layout functions could be lifted from main.js', () => {
  names.forEach((name, index) => assert.ok(sources[index], `${name} not found in main.js — update this test with it`));
});

const plain = (value) => JSON.parse(JSON.stringify(value));

/** `spec` lists tabs in order: 'L1' loose, 'a:g1' in group g1, 'P!' an ungrouped pin. */
function harness(spec, { groups = null, closedSlot: slot = 0 } = {}) {
  const tabs = new Map();
  for (const entry of spec) {
    const pinned = entry.endsWith('!');
    const [id, groupId = null] = entry.replace('!', '').split(':');
    tabs.set(id, { id, groupId, pinned });
  }
  const groupIds = [...new Set([...tabs.values()].map((tab) => tab.groupId).filter(Boolean))];
  const runtime = {
    tabOrder: [...tabs.keys()],
    groups: (groups ?? groupIds).map((id) => ({ id, name: id, collapsed: false })),
    closedSlot: slot,
    closedSlotIds: null,
  };
  const calls = [];
  const sandbox = {
    tabs, crypto, rt: () => runtime,
    CLOSED_SECTION_ID: closedSlot.CLOSED_SECTION_ID,
    clampClosedSlot: closedSlot.clampClosedSlot,
    reconcileClosedSlot: closedSlot.reconcileClosedSlot,
    reorderItems: tabOrder.reorderItems,
    resolveTabMove: tabOrder.moveTab,
    windowRuntimes: { runtimeForTab: () => runtime },
    pinnedHomeFor: () => null,
    ...require('../../src/main/group-color'),
    ...tabSections,
    ...groupNameCase,
    pruneEmptyGroups: () => {
      runtime.groups = runtime.groups.filter((g) => [...tabs.values()].some((tab) => tab.groupId === g.id));
    },
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
    setActiveTab: () => {},
    createTab: (url, { groupId }) => {
      const id = url;
      tabs.set(id, { id, groupId, pinned: false });
      runtime.tabOrder.push(id);
      return id;
    },
    sleepSnapshots: new Map(),
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.fns = { ${names.join(', ')} };`, sandbox);
  const fns = sandbox.fns;
  runtime.closedSlotIds = tabSections.itemsOf(fns.tabLayoutList(runtime)).map((item) => item.id);
  const sync = () => fns.syncTabLayout(runtime);
  return { ...fns, runtime, tabs, calls, sync, order: () => plain(runtime.tabOrder) };
}

test('sync draws groups at their first member and keeps runs between them', () => {
  const h = harness(['L1', 'a:g1', 'L2', 'b:g2', 'c:g1']);
  h.sync();
  assert.deepEqual(h.order(), ['L1', 'a', 'c', 'L2', 'b']);
  assert.deepEqual(plain(h.runtime.groups.map((g) => g.id)), ['g1', 'g2']);
});

test('groups follow the tab order', () => {
  const h = harness(['b:g2', 'a:g1'], { groups: ['g1', 'g2'] });
  h.sync();
  assert.deepEqual(plain(h.runtime.groups.map((g) => g.id)), ['g2', 'g1']);
});

test('run slot key follows its first tab', () => {
  const h = harness(['L1', 'L2', 'a:g1', 'L3']);
  assert.deepEqual(plain(h.clusterList().map((c) => c.key)), ['run:L1', 'g1', 'run:L3']);
  assert.equal(h.clusterKeyForTab(h.tabs.get('L2')), 'run:L1');
  assert.equal(h.clusterKeyForTab(h.tabs.get('a')), 'g1');
});

test('new group appears where its tab was', () => {
  const h = harness(['a:g1', 'L1', 'L2']);
  h.groupTabByName('L1', 'Research');
  h.sync();
  const research = h.runtime.groups.find((g) => g.name === 'Research');
  assert.equal(h.tabs.get('L1').groupId, research.id);
  assert.deepEqual(h.order(), ['a', 'L1', 'L2']);
  assert.deepEqual(plain(h.runtime.groups.map((g) => g.name)), ['g1', 'Research']);
});

test('new group from a grouped tab appears below the old group', () => {
  const h = harness(['L0', 'a:g1', 'b:g1', 'c:g1', 'L1']);
  h.groupTabByName('a', 'Research');
  h.sync();
  assert.deepEqual(h.order(), ['L0', 'b', 'c', 'a', 'L1']);
  assert.deepEqual(plain(h.runtime.groups.map((g) => g.name)), ['g1', 'Research']);
});

test('joining an existing group lands at its end', () => {
  const h = harness(['L1', 'a:g1', 'b:g1', 'L2']);
  h.groupTabByName('L1', 'g1');
  h.sync();
  assert.deepEqual(h.order(), ['a', 'b', 'L1', 'L2']);
});

test('remove from group lands below the group', () => {
  const h = harness(['L0', 'a:g1', 'b:g1', 'c:g1', 'L1']);
  h.setTabGroup('a', null);
  h.sync();
  assert.deepEqual(h.order(), ['L0', 'b', 'c', 'a', 'L1']);
  assert.equal(h.tabs.get('a').groupId, null);
});

test('ungroup keeps members in place', () => {
  const h = harness(['L0', 'a:g1', 'b:g1', 'L1']);
  h.ungroupGroup('g1');
  h.sync();
  assert.deepEqual(h.order(), ['L0', 'a', 'b', 'L1']);
  assert.deepEqual(plain(h.runtime.groups), []);
});

test('group reopens at its item index', () => {
  const h = harness(['L0', 'a:g1', 'L1']);
  h.reopenGroupEntry({
    group: { id: 'g2', name: 'g2', collapsed: false, index: 1 },
    activeMemberIndex: 0,
    tabs: [{ url: 'x' }, { url: 'y' }],
  });
  h.sync();
  assert.deepEqual(h.order(), ['L0', 'x', 'y', 'a', 'L1']);
});

test('a group moves between two loose tabs', () => {
  const h = harness(['L1', 'L2', 'a:g1']);
  h.sync();
  assert.equal(h.reorderGroupBefore('g1', 'L2'), true);
  assert.deepEqual(h.order(), ['L1', 'a', 'L2']);
});

test('band at the end stays last', () => {
  const h = harness(['a:g1', 'L1'], { closedSlot: 2 });
  h.sync();
  assert.equal(h.runtime.closedSlot, 2);
  h.tabs.set('NEW', { id: 'NEW', groupId: null, pinned: false });
  h.runtime.tabOrder.push('NEW');
  h.sync();
  assert.equal(h.runtime.closedSlot, 3);
});

test('band item index survives a loose tab closing above it', () => {
  const h = harness(['L1', 'L2', 'a:g1'], { closedSlot: 2 });
  h.sync();
  h.tabs.delete('L1');
  h.runtime.tabOrder = h.runtime.tabOrder.filter((id) => id !== 'L1');
  h.sync();
  assert.equal(h.runtime.closedSlot, 1, 'still directly above g1');
});

test('the band moves between two loose tabs', () => {
  const h = harness(['L1', 'L2', 'a:g1']);
  h.sync();
  assert.equal(h.moveClosedSection('L2'), true);
  assert.equal(h.runtime.closedSlot, 1);
  assert.deepEqual(h.order(), ['L1', 'L2', 'a']);
});

test('legacy order normalizes to groups then loose', () => {
  // Saved before sections: loose tabs among group members, groups[] in its own order.
  const h = harness(['L1', 'b:g2', 'L2', 'a:g1', 'L3'], { groups: ['g1', 'g2'], closedSlot: 1 });
  h.runtime.closedSlotIds = ['g1', 'g2'];
  h.applySavedLayout(h.runtime, { groups: [{ id: 'g1' }, { id: 'g2' }], closedSlot: 1 }, ['L1', 'b', 'L2', 'a', 'L3']);
  assert.deepEqual(h.order(), ['a', 'b', 'L1', 'L2', 'L3']);
  assert.equal(h.runtime.closedSlot, 1, 'the band stays between the two groups');
});

test('sectionOrder keeps loose tabs between groups', () => {
  const h = harness(['L1', 'a:g1', 'L2', 'b:g2']);
  h.applySavedLayout(h.runtime, { sectionOrder: true, closedIndex: 2, groups: [] }, ['L1', 'a', 'L2', 'b']);
  assert.deepEqual(h.order(), ['L1', 'a', 'L2', 'b']);
  assert.equal(h.runtime.closedSlot, 2);
});

test('closedIndex counts only the restored items when a startup tab leads', () => {
  const h = harness(['START', 'L1', 'a:g1']);
  h.applySavedLayout(h.runtime, { sectionOrder: true, closedIndex: 1, groups: [] }, ['L1', 'a']);
  assert.equal(h.runtime.closedSlot, 2, 'directly above g1, below the startup tab and L1');
});

// Recently closed band and tab moves (final review, Important 1). Items:
// L1, L2, [band], L3, L4.
function bandHarness() {
  const h = harness(['L1', 'L2', 'L3', 'L4'], { closedSlot: 2 });
  h.sync();
  return h;
}

test('a tab moved to the top leaves the band where it was', () => {
  const h = bandHarness();
  assert.equal(h.moveTabTo('L3', { groupId: null, beforeId: 'L1' }), true);
  h.sync();
  assert.deepEqual(h.order(), ['L3', 'L1', 'L2', 'L4']);
  assert.equal(h.runtime.closedSlot, 3, 'still directly above L4');
});

test('a tab dropped directly above the band lands above it', () => {
  const h = bandHarness();
  assert.equal(h.moveTabTo('L4', { groupId: null, beforeId: 'recently-closed' }), true);
  h.sync();
  assert.deepEqual(h.order(), ['L1', 'L2', 'L4', 'L3']);
  assert.equal(h.runtime.closedSlot, 3, 'directly below L4');
});

test('a tab dropped directly below the band lands below it', () => {
  const h = bandHarness();
  assert.equal(h.moveTabTo('L1', { groupId: null, beforeId: 'L3' }), true);
  h.sync();
  assert.deepEqual(h.order(), ['L2', 'L1', 'L3', 'L4']);
  assert.equal(h.runtime.closedSlot, 1, 'directly above L1');
});

test('the end of the list is below a band that sits last', () => {
  const h = harness(['L1', 'L2'], { closedSlot: 2 });
  h.sync();
  assert.equal(h.moveTabTo('L1', { groupId: null, beforeId: null }), true);
  h.sync();
  assert.deepEqual(h.order(), ['L2', 'L1']);
  assert.equal(h.runtime.closedSlot, 1, 'the band stays above the dropped tab');
});

test('imported tabs land at the bottom, never inside or above the user\'s sections', () => {
  // Bring Your Tabs used to splice after the active tab. With the tab order
  // drawn as is, that pulled a same-named group up or split a run (final
  // review, Important 2). Handoff already appends.
  const apply = mainSource.slice(mainSource.indexOf('const plan = planTabImportApply({'));
  const call = apply.match(/const insertAt = ([^;]+);\n\s*const batch = createQuietTabsBatch\(rt\(\), plan\.tabs, \{ insertAt \}\);/);
  assert.ok(call, 'the Bring Your Tabs batch call was not found — update this test with it');
  assert.equal(call[1], 'rt().tabOrder.length');
});

test('a reopened tab returns to its slot inside its group', () => {
  // Group [a, b, c]: closing a then reopening it puts it first again
  // (final review, Important 3).
  for (const [closed, index, expected] of [['a', 0, ['a', 'b', 'c']], ['b', 1, ['a', 'b', 'c']]]) {
    const h = harness(['a:g1', 'b:g1', 'c:g1', 'L1']);
    h.runtime.tabOrder = h.runtime.tabOrder.filter((id) => id !== closed);
    h.runtime.tabOrder.push(closed); // createTab appends
    h.finishReopen(closed, { index });
    h.sync();
    assert.deepEqual(h.order().slice(0, 3), expected, `reopening ${closed}`);
  }
});

test('a reopened tab outside its group block rejoins at the group\'s end', () => {
  const h = harness(['L0', 'a:g1', 'b:g1', 'L1']);
  h.runtime.tabOrder = ['b', 'L1', 'L0', 'a'];
  h.finishReopen('a', { index: 2 }); // between L1 and L0: no group neighbour
  h.sync();
  assert.deepEqual(h.order(), ['b', 'a', 'L1', 'L0']);
});

test('a legacy band after the last group stays above the ungrouped tabs', () => {
  // v1.36.0 drew groups, the band (slot = groups.length), then ungrouped tabs
  // (final review, Important 4).
  const h = harness(['L1', 'a:g1', 'b:g2', 'L2'], { groups: ['g1', 'g2'] });
  h.runtime.closedSlot = 2;
  h.runtime.closedSlotIds = ['g1', 'g2'];
  h.applySavedLayout(h.runtime, { groups: [{ id: 'g1' }, { id: 'g2' }], closedSlot: 2 }, ['L1', 'a', 'b', 'L2']);
  assert.deepEqual(h.order(), ['a', 'b', 'L1', 'L2']);
  assert.equal(h.runtime.closedSlot, 2, 'between g2 and L1');
});

test('unpinning an ungrouped pin returns it to the bottom, like a new tab', () => {
  // Pins sit first in the tab order; unpinned there, a tab used to jump above
  // every group (final review, Important 5).
  const h = harness(['P!', 'a:g1', 'L1']);
  h.sync();
  h.toggleTabPinned('P');
  h.sync();
  assert.deepEqual(h.order(), ['a', 'L1', 'P']);
});

test('unpinning a grouped pin keeps it in its group', () => {
  const h = harness(['L0', 'p:g1!', 'a:g1']);
  h.tabs.get('p').pinned = true;
  h.tabs.get('p').groupId = 'g1';
  h.sync();
  h.toggleTabPinned('p');
  h.sync();
  assert.equal(h.tabs.get('p').groupId, 'g1');
  assert.deepEqual(h.order(), ['L0', 'p', 'a']);
});

test('setGroupColor sets a preset, clears it, and refuses anything else', () => {
  const h = harness(['a:g1']);
  assert.deepEqual(plain(h.setGroupColor('g1', '#376694')), { ok: true });
  assert.equal(h.runtime.groups[0].color, '#376694');
  assert.deepEqual(plain(h.setGroupColor('g1', '#123456')), { ok: false });
  assert.equal(h.runtime.groups[0].color, '#376694', 'a refused color changes nothing');
  assert.deepEqual(plain(h.setGroupColor('g1', null)), { ok: true });
  assert.equal(h.runtime.groups[0].color, null);
  assert.deepEqual(plain(h.setGroupColor('nope', '#376694')), { ok: false });
});

test('a reopened group keeps its color', () => {
  const h = harness(['L0']);
  h.reopenGroupEntry({
    group: { id: 'g2', name: 'Work', collapsed: false, color: '#376694', index: 0 },
    activeMemberIndex: 0,
    tabs: [{ url: 'x' }],
  });
  assert.equal(h.runtime.groups.find((g) => g.id === 'g2').color, '#376694');
});
