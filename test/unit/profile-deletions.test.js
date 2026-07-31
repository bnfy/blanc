const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createProfileDeletionManager,
  normalizePending,
} = require('../../src/main/profile-deletions');

function fakeStore(data = { version: 1, profileIds: [] }) {
  return {
    data: structuredClone(data),
    writes: 0,
    update() {},
    updateAndFlush(fn) {
      fn(this.data);
      this.writes += 1;
      return true;
    },
  };
}

test('profile-deletion markers retain only named opaque ids', () => {
  assert.deepEqual(normalizePending({ profileIds: ['default', 'profile_work', '../bad', 'profile_work'] }), [
    'profile_work',
  ]);
});

test('a deletion marker is durable before it can hide a named profile', () => {
  const store = fakeStore();
  const manager = createProfileDeletionManager({ store });

  assert.equal(manager.mark('profile_work'), true);
  assert.equal(manager.has('profile_work'), true);
  assert.deepEqual(manager.pending(), ['profile_work']);
  assert.equal(store.writes, 1);
  assert.equal(manager.clear('profile_work'), true);
  assert.deepEqual(manager.pending(), []);
  assert.equal(store.writes, 2);
});

test('a failed marker flush aborts deletion before any profile transition', () => {
  const store = fakeStore();
  store.updateAndFlush = () => false;
  const manager = createProfileDeletionManager({ store });

  assert.throws(() => manager.mark('profile_work'), /safely start/);
  assert.deepEqual(manager.pending(), []);
});
