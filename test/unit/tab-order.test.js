const assert = require('node:assert/strict');
const test = require('node:test');

const { moveTab, reorderGroup, reorderItems } = require('../../src/main/tab-order');

const tabs = (entries) => new Map(entries.map(([id, groupId, pinned = false]) => [
  id,
  { id, groupId, pinned },
]));

const groupsOf = (...ids) => ids.map((id) => ({ id, name: id, collapsed: false }));

test('moveTab reorders inside the current bucket', () => {
  const model = tabs([['a', 'work'], ['b', 'work'], ['c', 'work']]);
  assert.deepEqual(
    moveTab(['a', 'b', 'c'], model, groupsOf('work'), 'c', { groupId: 'work', beforeId: 'a' }),
    { order: ['c', 'a', 'b'], groupId: 'work' }
  );
});

test('moveTab moves loose → group, group → loose and group → group', () => {
  const model = tabs([['a', 'work'], ['b', 'play'], ['l', null]]);
  const groups = groupsOf('work', 'play');
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'l', { groupId: 'work', beforeId: 'a' }),
    { order: ['l', 'a', 'b'], groupId: 'work' }
  );
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'a', { groupId: null, beforeId: null }),
    { order: ['b', 'l', 'a'], groupId: null }
  );
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'a', { groupId: 'play', beforeId: null }),
    { order: ['b', 'a', 'l'], groupId: 'play' }
  );
});

test('moveTab moves a standalone pin into a group\'s pinned rows and back', () => {
  const model = tabs([['p', null, true], ['gp', 'work', true], ['g', 'work']]);
  const groups = groupsOf('work');
  assert.deepEqual(
    moveTab(['p', 'gp', 'g'], model, groups, 'p', { groupId: 'work', beforeId: 'gp' }),
    { order: ['p', 'gp', 'g'], groupId: 'work' }
  );
  assert.deepEqual(
    moveTab(['p', 'gp', 'g'], model, groups, 'gp', { groupId: null, beforeId: 'p' }),
    { order: ['gp', 'p', 'g'], groupId: null }
  );
});

test('moveTab appends into an empty target bucket, including a pins-only group', () => {
  const model = tabs([['gp', 'work', true], ['l', null], ['x', null]]);
  assert.deepEqual(
    moveTab(['l', 'gp', 'x'], model, groupsOf('work'), 'l', { groupId: 'work', beforeId: null }),
    { order: ['gp', 'x', 'l'], groupId: 'work' }
  );
});

test('moveTab rejects pin-crossing, missing groups, wrong buckets and bad input', () => {
  const model = tabs([['p', null, true], ['a', 'work'], ['b', 'play'], ['l', null]]);
  const groups = groupsOf('work', 'play');
  const order = ['p', 'a', 'b', 'l'];
  assert.equal(moveTab(order, model, groups, 'l', { groupId: null, beforeId: 'p' }), null, 'unpinned → pinned');
  assert.equal(moveTab(order, model, groups, 'p', { groupId: null, beforeId: 'l' }), null, 'pinned → unpinned');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'gone', beforeId: null }), null, 'missing group');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'play', beforeId: 'l' }), null, 'beforeId outside target');
  assert.equal(moveTab(order, model, groups, 'missing', { groupId: null, beforeId: null }), null);
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'work', beforeId: undefined }), null);
  assert.equal(moveTab(order, model, groups, 'a', null), null);
  assert.deepEqual(order, ['p', 'a', 'b', 'l'], 'rejected requests never mutate the input');
});

test('moveTab self-target is a no-op only inside the current group', () => {
  const model = tabs([['a', 'work'], ['b', 'play']]);
  const groups = groupsOf('work', 'play');
  assert.deepEqual(
    moveTab(['a', 'b'], model, groups, 'a', { groupId: 'work', beforeId: 'a' }),
    { order: ['a', 'b'], groupId: 'work' }
  );
  assert.equal(
    moveTab(['a', 'b'], model, groups, 'a', { groupId: 'play', beforeId: 'a' }),
    null,
    'a self-target never bypasses target-bucket validation during a group change'
  );
});

test('moveTab null beforeId on a sole-member bucket keeps its slot', () => {
  const model = tabs([['a', 'work'], ['b', 'play']]);
  assert.deepEqual(
    moveTab(['a', 'b'], model, groupsOf('work', 'play'), 'a', { groupId: 'work', beforeId: null }),
    { order: ['a', 'b'], groupId: 'work' }
  );
});

test('reorderGroup moves a group before another or to the end', () => {
  const groups = groupsOf('a', 'b', 'c');
  assert.deepEqual(reorderGroup(groups, 'c', 'a').map((g) => g.id), ['c', 'a', 'b']);
  assert.deepEqual(reorderGroup(groups, 'a', null).map((g) => g.id), ['b', 'c', 'a']);
  assert.deepEqual(reorderGroup(groups, 'b', 'b').map((g) => g.id), ['a', 'b', 'c']);
  assert.equal(reorderGroup(groups, 'zz', null), null);
  assert.equal(reorderGroup(groups, 'a', 'zz'), null);
  assert.equal(reorderGroup(groups, 'a', undefined), null);
  assert.deepEqual(groups.map((g) => g.id), ['a', 'b', 'c'], 'input never mutated');
  assert.equal(reorderGroup(groups, 'c', 'a')[0], groups[2], 'group records are moved, not copied');
});

test('moveTab requires an explicit groupId: a missing one never ungroups a tab', () => {
  const model = tabs([['a', 'work'], ['b', 'work'], ['l', null]]);
  const order = ['a', 'b', 'l'];
  const groups = groupsOf('work');
  assert.equal(moveTab(order, model, groups, 'a', { beforeId: null }), null, 'groupId omitted');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: undefined, beforeId: null }), null);
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 7, beforeId: null }), null, 'non-string id');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: '', beforeId: null }), null, 'empty id is not loose');
  assert.deepEqual(moveTab(order, model, groups, 'a', { groupId: null, beforeId: null }),
    { order: ['b', 'l', 'a'], groupId: null }, 'explicit null is the loose section');
});

// Ungrouped tabs anywhere (spec 2026-10-17): a loose target's beforeId may be
// a loose tab, the first tab of a group, the tab itself, or null (the end).
test('loose tab dropped above a group', () => {
  const model = tabs([['a', 'work'], ['b', 'work'], ['l', null]]);
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groupsOf('work'), 'l', { groupId: null, beforeId: 'a' }),
    { order: ['l', 'a', 'b'], groupId: null }
  );
});

test('loose tab dropped between two groups', () => {
  const model = tabs([['a', 'work'], ['b', 'play'], ['l', null]]);
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groupsOf('work', 'play'), 'l', { groupId: null, beforeId: 'b' }),
    { order: ['a', 'l', 'b'], groupId: null }
  );
});

test('a grouped tab leaving for a gap lands before the first tab of the next group', () => {
  const model = tabs([['a', 'work'], ['a2', 'work'], ['b', 'play']]);
  assert.deepEqual(
    moveTab(['a', 'a2', 'b'], model, groupsOf('work', 'play'), 'a2', { groupId: null, beforeId: 'b' }),
    { order: ['a', 'a2', 'b'], groupId: null }
  );
});

test('null beforeId appends a loose tab to the end', () => {
  const model = tabs([['l', null], ['a', 'work'], ['m', null]]);
  assert.deepEqual(
    moveTab(['l', 'a', 'm'], model, groupsOf('work'), 'l', { groupId: null, beforeId: null }),
    { order: ['a', 'm', 'l'], groupId: null }
  );
});

test('self-target into the gap above its own group', () => {
  const model = tabs([['x', null], ['a', 'work'], ['b', 'work']]);
  assert.deepEqual(
    moveTab(['x', 'a', 'b'], model, groupsOf('work'), 'a', { groupId: null, beforeId: 'a' }),
    { order: ['x', 'a', 'b'], groupId: null }
  );
});

test('beforeId in the middle of a group is rejected for a loose target', () => {
  const model = tabs([['a', 'work'], ['b', 'work'], ['l', null]]);
  assert.equal(moveTab(['a', 'b', 'l'], model, groupsOf('work'), 'l', { groupId: null, beforeId: 'b' }), null);
});

test('a group\'s first drawn tab is its leading pin', () => {
  const model = tabs([['a', 'work'], ['p', 'work', true], ['l', null]]);
  assert.equal(moveTab(['a', 'p', 'l'], model, groupsOf('work'), 'l', { groupId: null, beforeId: 'a' }), null);
  assert.deepEqual(
    moveTab(['a', 'p', 'l'], model, groupsOf('work'), 'l', { groupId: null, beforeId: 'p' }),
    { order: ['l', 'a', 'p'], groupId: null }
  );
});

test('reorderItems moves a group between two loose tabs', () => {
  assert.deepEqual(
    reorderItems(['l1', 'l2', 'work'], 0, 'work', 'l2'),
    { order: ['l1', 'work', 'l2'], slot: 0 }
  );
  assert.deepEqual(
    reorderItems(['l1', 'work'], 2, 'recently-closed', 'l1'),
    { order: ['l1', 'work'], slot: 0 }
  );
  assert.equal(reorderItems(['l1', 'work'], 0, 'work', 'nope'), null);
});
