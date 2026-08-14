'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePending,
  createProfileDeletionManager,
} = require('../../src/main/profile-deletions');

function fakeStore(data = {}) {
  return {
    data,
    fail: false,
    updateAndFlush(fn) {
      if (this.fail) return false;
      fn(this.data);
      return true;
    },
  };
}

test('deletion markers normalize to unique valid named profile ids', () => {
  assert.deepEqual(normalizePending({
    profileIds: ['default', 'profile_work', '../escape', 'profile_work', 'profile_home'],
  }), ['profile_work', 'profile_home']);
});

test('mark and clear are durable, idempotent transitions', () => {
  const store = fakeStore();
  const manager = createProfileDeletionManager({ store });
  assert.equal(manager.mark('profile_work'), true);
  assert.equal(manager.mark('profile_work'), true);
  assert.deepEqual(manager.pending(), ['profile_work']);
  assert.equal(manager.clear('profile_work'), true);
  assert.deepEqual(manager.pending(), []);
  assert.throws(() => manager.mark('default'), /named local profile/);
});

test('a failed durable write never reports deletion as committed', () => {
  const store = fakeStore();
  const manager = createProfileDeletionManager({ store });
  store.fail = true;
  assert.throws(() => manager.mark('profile_work'), /safely start/);
  assert.deepEqual(manager.pending(), []);
});
