'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_SPLIT_PANES,
  PR1_MAX_PANES,
  splitEligible,
  createSplit,
  removeFromSplit,
  placeAfterSplit,
  normalizeSplitOrder,
  splitForTab,
  captureSplits,
  restoreSplits,
} = require('../../src/main/split-model');
const TabSections = require('../../src/renderer/tab-sections');

const tab = (id, extra = {}) => ({ id, groupId: null, pinned: false, ...extra });

test('pane limits', () => {
  assert.equal(MAX_SPLIT_PANES, 4);
  assert.equal(PR1_MAX_PANES, 2);
});

test('createSplit takes the initiator\'s group for every member', () => {
  const cases = [
    [tab('a', { groupId: 'g1' }), tab('b'), 'g1'],
    [tab('a'), tab('b', { groupId: 'g2' }), null],
    [tab('a', { groupId: 'g1' }), tab('b', { groupId: 'g2' }), 'g1'],
    [tab('a', { groupId: 'g1' }), tab('b', { groupId: 'g1' }), 'g1'],
  ];
  for (const [initiator, other, groupId] of cases) {
    const made = createSplit({ initiator, others: [other] });
    assert.equal(made.groupId, groupId);
    assert.deepEqual(made.split.tabIds, ['a', 'b']);
    assert.equal(made.split.focusedIndex, 0);
    assert.deepEqual(made.split.layout, { kind: 'columns', widths: [0.5, 0.5] });
  }
});

test('createSplit keeps a valid layout it is given and gives each split its own id', () => {
  const a = createSplit({ initiator: tab('a'), others: [tab('b')], layout: { kind: 'columns', widths: [0.62, 0.38] } });
  const b = createSplit({ initiator: tab('c'), others: [tab('d')] });
  assert.deepEqual(a.split.layout, { kind: 'columns', widths: [0.62, 0.38] });
  assert.notEqual(a.split.id, b.split.id);
  assert.match(a.split.id, /^split-/);
});

test('splitEligible refuses pinned and already-split tabs', () => {
  assert.equal(splitEligible(tab('a')), true);
  assert.equal(splitEligible(tab('a', { pinned: true })), false);
  assert.equal(splitEligible(tab('a', { splitId: 'split-1' })), false);
  assert.equal(splitEligible(null), false);
});

test('removeFromSplit of a two-pane split dissolves and names the survivor', () => {
  const split = { id: 's', tabIds: ['a', 'b'], layout: { kind: 'columns', widths: [0.5, 0.5] }, focusedIndex: 1 };
  assert.deepEqual(removeFromSplit(split, 'a'), { split: null, dissolved: ['b'] });
});

test('removeFromSplit of a larger split keeps the rest with a fresh layout and clamped focus', () => {
  const split = { id: 's', tabIds: ['a', 'b', 'c'], layout: { kind: 'columns', widths: [0.4, 0.3, 0.3] }, focusedIndex: 2 };
  const result = removeFromSplit(split, 'c');
  assert.deepEqual(result.dissolved, []);
  assert.deepEqual(result.split.tabIds, ['a', 'b']);
  assert.deepEqual(result.split.layout, { kind: 'columns', widths: [0.5, 0.5] });
  assert.equal(result.split.focusedIndex, 1);
  assert.deepEqual(removeFromSplit(split, 'zzz'), { split, dissolved: [] });
});

test('placeAfterSplit lands the tab directly below the split', () => {
  assert.deepEqual(placeAfterSplit(['x', 's1', 's2', 'y'], ['s1', 's2'], 's1'), ['x', 's2', 's1', 'y']);
  assert.deepEqual(placeAfterSplit(['s1', 's2', 's3', 'y'], ['s2', 's3'], 's1'), ['s2', 's3', 's1', 'y']);
});

test('normalizeSplitOrder makes members contiguous at the first member and is idempotent', () => {
  const splits = [{ id: 's', tabIds: ['b', 'd'] }];
  const once = normalizeSplitOrder(['a', 'b', 'c', 'd', 'e'], splits);
  assert.deepEqual(once, ['a', 'b', 'd', 'c', 'e']);
  assert.deepEqual(normalizeSplitOrder(once, splits), once);
  assert.deepEqual(normalizeSplitOrder(['d', 'a', 'b'], splits), ['b', 'd', 'a'], 'members follow tabIds order, at the first one\'s place');
});

test('normalizeSplitOrder is stable when a group emptied by the split disappears', () => {
  // b came from group g2, now empty; the split took a's group g1.
  const list = [tab('x'), tab('a', { groupId: 'g1', splitId: 's' }), tab('y', { groupId: 'g1' }), tab('z'), tab('b', { groupId: 'g1', splitId: 's' })];
  const splits = [{ id: 's', tabIds: ['a', 'b'] }];
  const byId = new Map(list.map((t) => [t.id, t]));
  const pass = (order) => normalizeSplitOrder(TabSections.normalizeOrder(order.map((id) => byId.get(id))), splits);
  const first = pass(list.map((t) => t.id));
  assert.deepEqual(first, ['x', 'a', 'b', 'y', 'z']);
  assert.deepEqual(pass(first), first);
  assert.deepEqual(pass(pass(first)), first);
});

test('splitForTab', () => {
  const s = { id: 's', tabIds: ['a', 'b'] };
  assert.equal(splitForTab([s], 'b'), s);
  assert.equal(splitForTab([s], 'c'), null);
});

test('captureSplits drops a split with a private member, writing null splitIds', () => {
  const splits = [
    { id: 's1', tabIds: ['a', 'p'], layout: { kind: 'columns', widths: [0.6, 0.4] }, focusedIndex: 1 },
    { id: 's2', tabIds: ['c', 'd'], layout: { kind: 'columns', widths: [0.7, 0.3] }, focusedIndex: 1 },
  ];
  const saved = captureSplits(splits, ['a', 'c', 'd', 'e']);
  assert.deepEqual(saved.splitIds, [null, 's2', 's2', null]);
  assert.deepEqual(saved.splits, [{ id: 's2', layout: { kind: 'columns', widths: [0.7, 0.3] }, focusedIndex: 1 }]);
});

test('captureSplits re-lays a split that lost a private member but keeps two', () => {
  const splits = [{ id: 's', tabIds: ['a', 'p', 'b'], layout: { kind: 'columns', widths: [0.4, 0.3, 0.3] }, focusedIndex: 1 }];
  const saved = captureSplits(splits, ['a', 'b']);
  assert.deepEqual(saved.splitIds, ['s', 's']);
  assert.deepEqual(saved.splits, [{ id: 's', layout: { kind: 'columns', widths: [0.5, 0.5] }, focusedIndex: 0 }]);
});

test('restoreSplits rebuilds from splitIds and drops a split whose member was filtered out', () => {
  const savedSplits = [
    { id: 's1', layout: { kind: 'columns', widths: [0.6, 0.4] }, focusedIndex: 1 },
    { id: 's2', layout: { kind: 'columns', widths: [0.5, 0.5] }, focusedIndex: 0 },
  ];
  const restored = restoreSplits(savedSplits, ['s1', 's1', 's2', 's2', null], ['t1', 't2', 't3', null, 't5']);
  assert.deepEqual(restored, [{ id: 's1', tabIds: ['t1', 't2'], layout: { kind: 'columns', widths: [0.6, 0.4] }, focusedIndex: 1 }]);
});

test('restoreSplits clamps focusedIndex and normalizes a malformed layout', () => {
  const restored = restoreSplits([{ id: 's', layout: { kind: 'nope' }, focusedIndex: 9 }], ['s', 's'], ['a', 'b']);
  assert.deepEqual(restored, [{ id: 's', tabIds: ['a', 'b'], layout: { kind: 'columns', widths: [0.5, 0.5] }, focusedIndex: 1 }]);
  assert.deepEqual(restoreSplits(undefined, undefined, ['a']), []);
  assert.deepEqual(restoreSplits([{ id: 's' }], ['s', 'other'], ['a', 'b']), [], 'an unknown or lone id makes no split');
});
