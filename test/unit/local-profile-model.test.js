'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  LOCAL_PROFILE_VERSION,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  emptyLocalProfiles,
  readLocalProfiles,
  addLocalProfile,
  renameLocalProfile,
  removeLocalProfile,
} = require('../../src/main/local-profile-model');

test('an absent registry migrates to the permanent Personal identity', () => {
  const parsed = readLocalProfiles(null);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.migrated, true);
  assert.deepEqual(parsed.registry, emptyLocalProfiles());
  assert.deepEqual(parsed.registry.profiles[0], {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    createdAt: 0,
  });
});

test('current registries normalize names, ids, duplicates, and the default', () => {
  const parsed = readLocalProfiles({
    version: LOCAL_PROFILE_VERSION,
    profiles: [
      { id: 'work', name: '  Client   Work  ', createdAt: 12 },
      { id: 'work', name: 'duplicate', createdAt: 13 },
    ],
  });
  assert.equal(parsed.migrated, false);
  assert.deepEqual(parsed.registry.profiles, [
    { id: 'default', name: 'Personal', createdAt: 0 },
    { id: 'work', name: 'Client Work', createdAt: 12 },
  ]);
});

test('future registries remain unsupported and are never mutated', () => {
  const future = { version: LOCAL_PROFILE_VERSION + 1, profiles: [{ id: 'future', name: 'Future' }] };
  assert.equal(readLocalProfiles(future).supported, false);
  assert.deepEqual(addLocalProfile(future, { id: 'work', name: 'Work' }), emptyLocalProfiles());
});

test('named profile lifecycle preserves opaque identity and protects Personal', () => {
  const created = addLocalProfile(emptyLocalProfiles(), {
    id: 'profile_work', name: 'Work', createdAt: 99,
  });
  const renamed = renameLocalProfile(created, 'profile_work', '  Studio   Work ');
  assert.deepEqual(renamed.profiles[1], {
    id: 'profile_work', name: 'Studio Work', createdAt: 99,
  });
  assert.deepEqual(removeLocalProfile(renamed, 'profile_work'), emptyLocalProfiles());
  assert.throws(() => renameLocalProfile(created, 'default', 'Other'), /named local profile/);
  assert.throws(() => removeLocalProfile(created, 'default'), /cannot be deleted/);
});
