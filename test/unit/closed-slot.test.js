const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CLOSED_SECTION_ID,
  clampClosedSlot,
  reconcileClosedSlot,
  reorderGroupsWithClosed,
} = require('../../src/main/closed-slot');

test('CLOSED_SECTION_ID is the band token', () => {
  assert.equal(CLOSED_SECTION_ID, 'recently-closed');
});

test('clampClosedSlot', () => {
  assert.equal(clampClosedSlot(undefined, 3), 0);
  assert.equal(clampClosedSlot(-1, 3), 0);
  assert.equal(clampClosedSlot(1.5, 3), 0);
  assert.equal(clampClosedSlot('2', 3), 0);
  assert.equal(clampClosedSlot(5, 3), 3);
  assert.equal(clampClosedSlot(2, 3), 2);
  assert.equal(clampClosedSlot(0, 0), 0);
});

test('band keeps its place when a group above it is removed', () => {
  assert.equal(reconcileClosedSlot(['a', 'b', 'c'], 2, ['a', 'c']), 1);
});

test('band keeps its place when a group below it is removed', () => {
  assert.equal(reconcileClosedSlot(['a', 'b', 'c'], 1, ['a', 'c']), 1);
});

test('a group appended at the end lands below the band', () => {
  assert.equal(reconcileClosedSlot(['a', 'b'], 1, ['a', 'b', 'n']), 1);
});

test('a group reinserted above the band shifts the band down', () => {
  assert.equal(reconcileClosedSlot(['a', 'b'], 1, ['r', 'a', 'b']), 2);
});

test('a band at the end stays at the end', () => {
  assert.equal(reconcileClosedSlot(['a', 'b'], 2, ['a', 'b', 'n']), 3);
  assert.equal(reconcileClosedSlot(['a', 'b'], 2, ['a']), 1);
});

test('the band stays put when another group is reordered past it', () => {
  assert.equal(reconcileClosedSlot(['a', 'g', 'b'], 2, ['a', 'b', 'g'], 'g'), 1);
  assert.equal(reconcileClosedSlot(['a', 'b', 'g'], 1, ['g', 'a', 'b'], 'g'), 2);
});

test('moving the band', () => {
  assert.deepEqual(
    reorderGroupsWithClosed(['a', 'b', 'c'], 0, CLOSED_SECTION_ID, 'c'),
    { order: ['a', 'b', 'c'], slot: 2 },
  );
  assert.deepEqual(
    reorderGroupsWithClosed(['a', 'b', 'c'], 0, CLOSED_SECTION_ID, null),
    { order: ['a', 'b', 'c'], slot: 3 },
  );
  assert.equal(reorderGroupsWithClosed(['a', 'b', 'c'], 0, CLOSED_SECTION_ID, 'zz'), null);
});

test('a group dropped directly above the band', () => {
  assert.deepEqual(
    reorderGroupsWithClosed(['a', 'b', 'c'], 1, 'c', CLOSED_SECTION_ID),
    { order: ['a', 'c', 'b'], slot: 2 },
  );
  assert.deepEqual(
    reorderGroupsWithClosed(['a', 'b', 'c'], 1, 'a', 'c'),
    { order: ['b', 'a', 'c'], slot: 0 },
  );
});

test('a group moved to the end keeps the band in place', () => {
  assert.deepEqual(
    reorderGroupsWithClosed(['a', 'b', 'c'], 1, 'b', null),
    { order: ['a', 'c', 'b'], slot: 1 },
  );
});

test('unknown ids are refused', () => {
  assert.equal(reorderGroupsWithClosed(['a', 'b'], 1, 'zz', null), null);
  assert.equal(reorderGroupsWithClosed(['a', 'b'], 1, 'a', 'zz'), null);
  assert.equal(reorderGroupsWithClosed(['a', 'b'], 1, 'a', 42), null);
});

test('a new window keeps the band under Pinned as groups appear', () => {
  assert.equal(reconcileClosedSlot([], 0, ['g']), 0);
  assert.equal(reconcileClosedSlot(['g'], 0, ['g', 'h']), 0);
});

test('with nothing left to anchor to, the band returns to the top', () => {
  assert.equal(reconcileClosedSlot(['a'], 1, ['n']), 0);
});

test('with only groups above it left, the band stays last', () => {
  assert.equal(reconcileClosedSlot(['a', 'b'], 1, ['a', 'n']), 2);
});
