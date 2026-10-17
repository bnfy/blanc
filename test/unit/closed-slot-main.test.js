'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const closedSlot = require('../../src/main/closed-slot');

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
const sources = ['syncClosedSlot', 'reorderGroupBefore', 'moveClosedSection'].map(lift);

test('the Recently closed functions could be lifted from main.js', () => {
  assert.ok(sources.every(Boolean), 'a function was not found in main.js — update this test with it');
});

const groupsOf = (...ids) => ids.map((id) => ({ id, name: id, collapsed: false }));

function harness(runtime) {
  const calls = [];
  const sandbox = {
    rt: () => runtime,
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
    ...closedSlot,
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.fns = { syncClosedSlot, reorderGroupBefore, moveClosedSection };`, sandbox);
  return { ...sandbox.fns, calls };
}

test('removing the group above the band keeps the band in place', () => {
  const runtime = { groups: groupsOf('a', 'b', 'c'), closedSlot: 2, closedSlotIds: ['a', 'b', 'c'] };
  const h = harness(runtime);
  runtime.groups = groupsOf('a', 'c');
  h.syncClosedSlot(runtime);
  assert.equal(runtime.closedSlot, 1);
  assert.deepEqual(runtime.closedSlotIds, ['a', 'c']);
});

test('a group can be dropped directly above the band', () => {
  const runtime = { groups: groupsOf('a', 'b', 'c'), closedSlot: 1, closedSlotIds: ['a', 'b', 'c'] };
  const h = harness(runtime);
  assert.equal(h.reorderGroupBefore('c', 'recently-closed'), true);
  assert.deepEqual(runtime.groups.map((g) => g.id), ['a', 'c', 'b']);
  assert.equal(runtime.closedSlot, 2);
  assert.deepEqual(h.calls, ['broadcast', 'menu']);
});

test('reordering keeps the same group records', () => {
  const runtime = { groups: groupsOf('a', 'b'), closedSlot: 0, closedSlotIds: ['a', 'b'] };
  const [a, b] = runtime.groups;
  harness(runtime).reorderGroupBefore('b', 'a');
  assert.equal(runtime.groups[0], b);
  assert.equal(runtime.groups[1], a);
});

test('the band moves before a group or to the end', () => {
  const runtime = { groups: groupsOf('a', 'b', 'c'), closedSlot: 0, closedSlotIds: ['a', 'b', 'c'] };
  const h = harness(runtime);
  assert.equal(h.moveClosedSection('c'), true);
  assert.equal(runtime.closedSlot, 2);
  assert.equal(h.moveClosedSection(null), true);
  assert.equal(runtime.closedSlot, 3);
  assert.deepEqual(runtime.groups.map((g) => g.id), ['a', 'b', 'c']);
});

test('unknown ids are refused without a broadcast', () => {
  const runtime = { groups: groupsOf('a'), closedSlot: 0, closedSlotIds: ['a'] };
  const h = harness(runtime);
  assert.equal(h.moveClosedSection('zz'), false);
  assert.equal(h.reorderGroupBefore('zz', null), false);
  assert.equal(h.reorderGroupBefore('recently-closed', null), false);
  assert.deepEqual(h.calls, []);
});
