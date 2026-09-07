const assert = require('node:assert/strict');
const test = require('node:test');
const {
  computeBatchInsertAt,
  reorderTabOrderForBatch,
  resolveBatchGroupId,
} = require('../../src/main/tab-import-batch');

test('computeBatchInsertAt splices after the active tab or at end', () => {
  assert.equal(computeBatchInsertAt(['a', 'b', 'c'], 'b'), 2);
  assert.equal(computeBatchInsertAt(['a', 'b', 'c'], 'missing'), 3);
  assert.equal(computeBatchInsertAt(['a', 'b'], null), 2);
});

test('reorderTabOrderForBatch preserves created order at insertAt', () => {
  const order = ['keep', 'active', 'tail'];
  assert.deepEqual(
    reorderTabOrderForBatch(order, ['n1', 'n2'], 2),
    ['keep', 'active', 'n1', 'n2', 'tail'],
  );
});

test('resolveBatchGroupId merges existing names without creating duplicates', () => {
  const groups = [{ id: 'g-work', name: 'work', collapsed: false }];
  const created = [];
  const randomId = () => 'should-not-run';
  assert.equal(resolveBatchGroupId(groups, 'WORK', created, randomId), 'g-work');
  assert.deepEqual(created, []);
  assert.equal(resolveBatchGroupId(groups, 'reading', created, () => 'g-read'), 'g-read');
  assert.deepEqual(created, ['g-read']);
  assert.equal(resolveBatchGroupId(groups, 'reading', created, () => 'g-read-2'), 'g-read');
  assert.deepEqual(created, ['g-read']);
});
