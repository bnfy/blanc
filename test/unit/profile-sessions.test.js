'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalPartitionFor,
  privatePartitionFor,
  createProfileSessionRegistry,
} = require('../../src/main/profile-sessions');

test('Personal retains shipped partitions and named profiles get isolated pairs', () => {
  assert.equal(normalPartitionFor('default'), null);
  assert.equal(privatePartitionFor('default'), 'private-browsing');
  assert.equal(normalPartitionFor('profile_work'), 'persist:blanc-profile-profile_work');
  assert.equal(privatePartitionFor('profile_work'), 'private-browsing-profile_work');
});

test('session registry is lazy, stable, unique, and removable', () => {
  const defaultSession = { partition: 'default' };
  const created = [];
  const registry = createProfileSessionRegistry({
    defaultSession,
    fromPartition: (partition) => {
      const value = { partition };
      created.push(value);
      return value;
    },
  });
  const personal = registry.forProfile('default');
  assert.equal(personal.normal, defaultSession);
  assert.equal(personal.private.partition, 'private-browsing');

  const work = registry.forProfile('profile_work');
  assert.equal(work.normal.partition, 'persist:blanc-profile-profile_work');
  assert.equal(work.private.partition, 'private-browsing-profile_work');
  assert.equal(registry.normal('profile_work'), work.normal);
  assert.equal(registry.private('profile_work'), work.private);
  assert.equal(registry.all().length, 4);
  assert.equal(registry.remove('profile_work'), true);
  assert.equal(registry.all().length, 2);
  assert.equal(registry.remove('default'), false);
  assert.equal(created.length, 3);
});

test('invalid ids fail closed to Personal rather than forming a partition path', () => {
  assert.equal(normalPartitionFor('../escape'), null);
  assert.equal(privatePartitionFor('../escape'), 'private-browsing');
});
