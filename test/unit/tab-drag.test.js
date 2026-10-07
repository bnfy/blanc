'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Same realm as the assertions (a vm context's own Object prototype would
// make deepStrictEqual reject identical intents); globalThis is still a
// private sandbox object, so the browser global never leaks into Node.
function load() {
  const sandbox = {};
  const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/tab-drag.js'), 'utf8');
  vm.runInThisContext(`(function (globalThis) {\n${source}\n})`)(sandbox);
  return sandbox.blancTabDrag;
}
const drag = load();

test('lift found the tab-drag API', () => {
  for (const name of ['resolveTabDrop', 'resolveGroupDrop', 'keyboardTabMove', 'keyboardGroupMove', 'describeMove']) {
    assert.equal(typeof drag[name], 'function', `${name} missing`);
  }
  assert.equal(drag.constants.DRAG_THRESHOLD_PX, 4);
});

// Rows are 20px tall. Layout, top to bottom:
//   pinned: P (0-20)
//   group work (header 20-40): W1 pinned (40-60), W2 (60-80), W3 (80-100)
//   group play collapsed (header 100-120)
//   loose: L1 (120-140), L2 (140-160)
const row = (id, top, pinned = false) => ({ id, pinned, top, bottom: top + 20 });
const model = {
  top: 0, bottom: 160,
  sections: [
    { kind: 'pinned', groupId: null, collapsed: false, top: 0, bottom: 20, header: null, rows: [row('P', 0, true)] },
    { kind: 'group', groupId: 'work', collapsed: false, top: 20, bottom: 100, header: { top: 20, bottom: 40 },
      rows: [row('W1', 40, true), row('W2', 60), row('W3', 80)] },
    { kind: 'group', groupId: 'play', collapsed: true, top: 100, bottom: 120, header: { top: 100, bottom: 120 }, rows: [] },
    { kind: 'loose', groupId: null, collapsed: false, top: 120, bottom: 160, header: null, rows: [row('L1', 120), row('L2', 140)] },
  ],
};
const tabSource = (id, pinned, groupId) => ({ kind: 'tab', id, pinned, groupId, title: id });

test('a gap inside the source bucket resolves to beforeId', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W3', false, 'work'), 61);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W3', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(hit.indicator, { type: 'line', y: 60 });
});

test('the gap after a bucket\'s last row resolves to null', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 99);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: null });
});

test('a loose tab dropped among group rows joins that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L2', false, null), 79);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L2', groupId: 'work', beforeId: 'W3' });
});

test('a grouped tab dropped in the loose section leaves its group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 141);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: null, beforeId: 'L2' });
});

test('the pin boundary inside a group is valid for both states; deeper gaps only for their own', () => {
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('L1', false, null), 59).intent,
    { kind: 'tab', id: 'L1', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('P', true, null), 59).intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null });
  assert.equal(drag.resolveTabDrop(model, tabSource('P', true, null), 81), null, 'pinned tab among unpinned rows');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 41), null, 'unpinned tab above a group pin');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 1), null, 'unpinned tab into the pinned section');
});

test('the middle of a header (collapsed or not) appends to that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L1', false, null), 110);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L1', groupId: 'play', beforeId: null });
  assert.deepEqual(hit.indicator, { type: 'header', groupId: 'play' });
  assert.equal(drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 30).intent.groupId, 'work');
});

test('outside the list resolves to nothing', () => {
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), -5), null);
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 400), null);
});

test('an empty loose zone is a valid target for unpinned tabs only', () => {
  const withZone = { ...model, bottom: 190, sections: [...model.sections.slice(0, 3),
    { kind: 'loose', groupId: null, collapsed: false, top: 160, bottom: 190, header: null, rows: [] }] };
  assert.deepEqual(drag.resolveTabDrop(withZone, tabSource('W2', false, 'work'), 175).intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: null });
  assert.equal(drag.resolveTabDrop(withZone, tabSource('W1', true, 'work'), 175), null);
});

test('group drops resolve between group bands', () => {
  assert.deepEqual(drag.resolveGroupDrop(model, 'play', 22).intent,
    { kind: 'group', id: 'play', beforeGroupId: 'work' });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 119).intent,
    { kind: 'group', id: 'work', beforeGroupId: null });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 22).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'play' }, 'own position is an accepted no-op target');
  assert.equal(drag.resolveGroupDrop(model, 'work', 500), null);
});

// Keyboard: payload order. Groups: work (open), play (collapsed), solo (open, pins only).
const snapshot = {
  groups: [
    { id: 'work', name: 'work', collapsed: false },
    { id: 'play', name: 'play', collapsed: true },
    { id: 'solo', name: 'solo', collapsed: false },
  ],
  tabs: [
    { id: 'P', groupId: null, pinned: true, title: 'P' },
    { id: 'W1', groupId: 'work', pinned: false, title: 'W1' },
    { id: 'W2', groupId: 'work', pinned: false, title: 'W2' },
    { id: 'Y1', groupId: 'play', pinned: false, title: 'Y1' },
    { id: 'S1', groupId: 'solo', pinned: true, title: 'S1' },
    { id: 'L1', groupId: null, pinned: false, title: 'L1' },
  ],
};

test('keyboard swaps inside a bucket', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'down').intent,
    { kind: 'tab', id: 'W1', groupId: 'work', beforeId: null });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'up').intent,
    { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' });
});

test('keyboard crosses into the next eligible bucket, skipping collapsed groups', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'down').intent,
    { kind: 'tab', id: 'W2', groupId: 'solo', beforeId: null },
    'play is collapsed; solo\'s empty unpinned bucket is a valid visible slot');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'up').intent,
    { kind: 'tab', id: 'L1', groupId: 'solo', beforeId: null });
});

test('keyboard never enters an opposite-state bucket and stops at the ends', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'down').intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null }, 'pinned tab into work\'s empty pinned bucket');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'down'), { stop: 'bottom' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'up'), { stop: 'top' }, 'no unpinned bucket above work');
  assert.equal(drag.keyboardTabMove(snapshot, 'nope', 'up'), null);
});

test('keyboard group moves and end stops', () => {
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'up').intent,
    { kind: 'group', id: 'solo', beforeGroupId: 'play' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'down'), { stop: 'bottom' });
});

test('describeMove names reorders, joins, leaves and dissolving groups', () => {
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' }), 'Moved W2');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'L1', groupId: 'work', beforeId: null }), 'Moved to work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W1', groupId: null, beforeId: null }), 'Moved out of work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: 'work', beforeId: null }),
    'Moved to work. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: null, beforeId: null }),
    'Moved out of play. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'group', id: 'play', beforeGroupId: 'work' }), 'Moved group play');
});
