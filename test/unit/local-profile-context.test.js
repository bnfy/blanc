'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  withLocalProfile,
  activeLocalProfileId,
  setFocusedLocalProfile,
  isDefaultLocalProfile,
} = require('../../src/main/local-profile-context');

test('profile context keeps overlapping async window work isolated', async () => {
  setFocusedLocalProfile('default');
  const seen = await Promise.all([
    withLocalProfile('profile_work', async () => {
      await Promise.resolve();
      return activeLocalProfileId();
    }),
    withLocalProfile('profile_home', async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return activeLocalProfileId();
    }),
  ]);
  assert.deepEqual(seen, ['profile_work', 'profile_home']);
  assert.equal(activeLocalProfileId(), 'default');
  assert.equal(isDefaultLocalProfile(), true);
});

test('invalid focused or bound identities fail closed to Personal', () => {
  setFocusedLocalProfile('../escape');
  assert.equal(activeLocalProfileId(), 'default');
  assert.equal(withLocalProfile('not/valid', activeLocalProfileId), 'default');
});
