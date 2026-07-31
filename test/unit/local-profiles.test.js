const assert = require('node:assert/strict');
const test = require('node:test');

const { createLocalProfileManager, MAX_LOCAL_PROFILES } = require('../../src/main/local-profiles');

function fakeStore(data = { version: 0, profiles: [] }) {
  return {
    data: structuredClone(data),
    updates: 0,
    update(fn) { fn(this.data); this.updates += 1; },
  };
}

test('a local profile registry lazily migrates its default identity', () => {
  const manager = createLocalProfileManager({ store: fakeStore() });
  assert.deepEqual(manager.list(), [{ id: 'default', name: 'Personal', createdAt: 0 }]);
  assert.equal(manager.get('default').name, 'Personal');
});

test('new local profiles receive an opaque persistent identity and bounded name', () => {
  const store = fakeStore();
  const manager = createLocalProfileManager({
    store,
    makeId: () => '00000000-0000-4000-8000-000000000001',
    now: () => 1234,
  });
  const profile = manager.create('  Work   projects  ');

  assert.deepEqual(profile, {
    id: 'profile-00000000-0000-4000-8000-000000000001',
    name: 'Work projects',
    createdAt: 1234,
  });
  assert.deepEqual(manager.list().map(({ id, name }) => ({ id, name })), [
    { id: 'default', name: 'Personal' },
    { id: profile.id, name: 'Work projects' },
  ]);
  assert.equal(store.updates, 1);
});

test('a newer profile registry is read-only and profile creation has a hard cap', () => {
  const future = createLocalProfileManager({ store: fakeStore({ version: 99, profiles: [] }) });
  assert.deepEqual(future.list(), []);
  assert.throws(() => future.create('Work'), /newer local-profile registry/);

  const profiles = Array.from({ length: MAX_LOCAL_PROFILES }, (_, index) => ({
    id: index ? `profile-${index}` : 'default',
    name: `Profile ${index}`,
    createdAt: 0,
  }));
  const capped = createLocalProfileManager({ store: fakeStore({ version: 1, profiles }) });
  assert.throws(() => capped.create('One more'), /up to/);
});
