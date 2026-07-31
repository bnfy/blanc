const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalPartitionFor,
  privatePartitionFor,
  createProfileSessionRegistry,
} = require('../../src/main/profile-sessions');

test('default profile keeps Blanc’s shipped Chromium and private partitions', () => {
  assert.equal(normalPartitionFor('default'), null);
  assert.equal(privatePartitionFor('default'), 'private-browsing');
});

test('named profiles receive stable persistent and isolated private partitions', () => {
  assert.equal(normalPartitionFor('work_2026'), 'persist:blanc-profile-work_2026');
  assert.equal(privatePartitionFor('work_2026'), 'private-browsing-work_2026');
});

test('profile sessions cache independently without creating a default persistent partition', () => {
  const defaultSession = { name: 'default' };
  const created = [];
  const registry = createProfileSessionRegistry({
    defaultSession,
    fromPartition(partition) {
      const session = { partition };
      created.push(session);
      return session;
    },
  });

  assert.equal(registry.normal('default'), defaultSession);
  assert.equal(registry.normal('work'), registry.normal('work'));
  assert.equal(registry.private('work'), registry.private('work'));
  assert.notEqual(registry.normal('work'), registry.private('work'));
  assert.deepEqual(created.map((entry) => entry.partition), [
    'persist:blanc-profile-work',
    'private-browsing-work',
  ]);
  assert.equal(registry.all().length, 3);
});

test('deleting a named profile removes both of its cached sessions', () => {
  const defaultSession = { name: 'default' };
  const registry = createProfileSessionRegistry({
    defaultSession,
    fromPartition: (partition) => ({ partition }),
  });
  registry.forProfile('work');

  assert.equal(registry.remove('work'), true);
  assert.deepEqual(registry.all(), [defaultSession]);
  assert.equal(registry.remove('work'), false);
  assert.equal(registry.remove('default'), false);
});
