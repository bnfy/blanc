'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const closedSlot = require('../../src/main/closed-slot');
const tabOrder = require('../../src/main/tab-order');
const tabSections = require('../../src/renderer/tab-sections');

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
const sources = ['tabLayoutList', 'syncTabLayout', 'reorderGroupBefore', 'moveClosedSection'].map(lift);

test('the Recently closed functions could be lifted from main.js', () => {
  assert.ok(sources.every(Boolean), 'a function was not found in main.js — update this test with it');
});

// One tab per group, so a group's item index equals its group index.
function harness(groupIds, slot) {
  const tabs = new Map(groupIds.map((id) => [`t-${id}`, { id: `t-${id}`, groupId: id, pinned: false }]));
  const runtime = {
    tabOrder: [...tabs.keys()],
    groups: groupIds.map((id) => ({ id, name: id, collapsed: false })),
    closedSlot: slot,
    closedSlotIds: [...groupIds],
  };
  const calls = [];
  const sandbox = {
    tabs,
    rt: () => runtime,
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
    ...closedSlot,
    reorderItems: tabOrder.reorderItems,
    ...tabSections,
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.fns = { syncTabLayout, reorderGroupBefore, moveClosedSection };`, sandbox);
  return { ...sandbox.fns, calls, runtime, tabs };
}

const ids = (runtime) => runtime.groups.map((g) => g.id);

test('removing the group above the band keeps the band in place', () => {
  const h = harness(['a', 'b', 'c'], 2);
  h.tabs.delete('t-b');
  h.runtime.tabOrder = h.runtime.tabOrder.filter((id) => id !== 't-b');
  h.runtime.groups = h.runtime.groups.filter((g) => g.id !== 'b');
  h.syncTabLayout(h.runtime);
  assert.equal(h.runtime.closedSlot, 1);
  assert.deepEqual([...h.runtime.closedSlotIds], ['a', 'c']);
});

test('a group can be dropped directly above the band', () => {
  const h = harness(['a', 'b', 'c'], 1);
  assert.equal(h.reorderGroupBefore('c', 'recently-closed'), true);
  assert.deepEqual(ids(h.runtime), ['a', 'c', 'b']);
  assert.equal(h.runtime.closedSlot, 2);
  assert.deepEqual(h.calls, ['broadcast', 'menu']);
});

test('reordering keeps the same group records', () => {
  const h = harness(['a', 'b'], 0);
  const [a, b] = h.runtime.groups;
  h.reorderGroupBefore('b', 'a');
  assert.equal(h.runtime.groups[0], b);
  assert.equal(h.runtime.groups[1], a);
});

test('the band moves before a group or to the end', () => {
  const h = harness(['a', 'b', 'c'], 0);
  assert.equal(h.moveClosedSection('c'), true);
  assert.equal(h.runtime.closedSlot, 2);
  assert.equal(h.moveClosedSection(null), true);
  assert.equal(h.runtime.closedSlot, 3);
  assert.deepEqual(ids(h.runtime), ['a', 'b', 'c']);
});

test('unknown ids are refused without a broadcast', () => {
  const h = harness(['a'], 0);
  assert.equal(h.moveClosedSection('zz'), false);
  assert.equal(h.reorderGroupBefore('zz', null), false);
  assert.equal(h.reorderGroupBefore('recently-closed', null), false);
  assert.deepEqual(h.calls, []);
});
