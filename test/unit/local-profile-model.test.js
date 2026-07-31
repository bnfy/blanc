const assert = require('node:assert/strict');
const test = require('node:test');

const {
  LOCAL_PROFILE_VERSION,
  DEFAULT_PROFILE_ID,
  emptyLocalProfiles,
  readLocalProfiles,
  addLocalProfile,
} = require('../../src/main/local-profile-model');

test('a missing local-profile registry creates the permanent default profile', () => {
  const parsed = readLocalProfiles({});

  assert.equal(parsed.supported, true);
  assert.equal(parsed.migrated, true);
  assert.deepEqual(parsed.registry, emptyLocalProfiles());
});

test('profile registry preserves the default and rejects duplicate opaque ids', () => {
  const first = addLocalProfile(emptyLocalProfiles(), {
    id: 'profile_work', name: '  Work   profile ', createdAt: 12,
  });

  assert.equal(first.version, LOCAL_PROFILE_VERSION);
  assert.deepEqual(first.profiles.map(({ id, name }) => ({ id, name })), [
    { id: DEFAULT_PROFILE_ID, name: 'Personal' },
    { id: 'profile_work', name: 'Work profile' },
  ]);
  assert.throws(() => addLocalProfile(first, { id: 'profile_work', name: 'Again' }), /already exists/);
});

test('a newer local-profile registry remains read-only to this build', () => {
  const parsed = readLocalProfiles({ version: LOCAL_PROFILE_VERSION + 1, profiles: [] });
  assert.equal(parsed.supported, false);
  assert.equal(parsed.registry.profiles[0].id, DEFAULT_PROFILE_ID);
});
