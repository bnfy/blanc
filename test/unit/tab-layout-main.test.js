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
  'ungroupGroup', 'reopenGroupEntry', 'reorderGroupBefore', 'moveClosedSection',
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
