const assert = require('node:assert/strict');
const test = require('node:test');

const { reorderWithinBucket, moveTab, reorderGroup } = require('../../src/main/tab-order');

const tabs = (entries) => new Map(entries.map(([id, groupId, pinned = false]) => [
  id,
  { id, groupId, pinned },
]));

test('moves a tab before another tab in the same group and pin bucket', () => {
  const model = tabs([
    ['a', 'work'],
    ['b', 'other'],
    ['c', 'work'],
    ['d', null],
  ]);

  assert.deepEqual(
    reorderWithinBucket(['a', 'b', 'c', 'd'], model, 'c', 'a'),
    ['c', 'a', 'b', 'd']
  );
});

test('rejects a beforeId in another group or pin bucket', () => {
  const model = tabs([
    ['a', 'work'],
    ['b', 'other'],
    ['c', 'work', true],
  ]);
  const order = ['a', 'b', 'c'];

  assert.equal(reorderWithinBucket(order, model, 'a', 'b'), null);
  assert.equal(reorderWithinBucket(order, model, 'a', 'c'), null);
  assert.equal(reorderWithinBucket(order, model, 'missing', 'a'), null);
  assert.equal(reorderWithinBucket(order, model, 'a', undefined), null);
  assert.deepEqual(order, ['a', 'b', 'c'], 'rejected requests never mutate the input');
});

test('beforeId:null moves to the end of the validated source bucket', () => {
  const model = tabs([
    ['a', 'work'],
    ['loose', null],
    ['b', 'work'],
    ['other', 'other'],
    ['c', 'work'],
  ]);

  assert.deepEqual(
    reorderWithinBucket(['a', 'loose', 'b', 'other', 'c'], model, 'a', null),
    ['loose', 'b', 'other', 'c', 'a']
  );
});

test('reordering preserves every non-source tab relative to every other one', () => {
  const model = tabs([
    ['a', 'work'],
    ['x', null],
    ['b', 'work'],
    ['y', 'other'],
  ]);

  const result = reorderWithinBucket(['a', 'x', 'b', 'y'], model, 'b', 'a');
  assert.deepEqual(result, ['b', 'a', 'x', 'y']);
  assert.deepEqual(result.filter((id) => id !== 'b'), ['a', 'x', 'y']);
});

test('a same-id target and a single-member bucket are accepted no-ops', () => {
  const model = tabs([
    ['a', 'work'],
    ['b', 'other'],
  ]);
  const order = ['a', 'b'];

  assert.deepEqual(reorderWithinBucket(order, model, 'a', 'a'), order);
  assert.deepEqual(reorderWithinBucket(order, model, 'a', null), order);
});

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
