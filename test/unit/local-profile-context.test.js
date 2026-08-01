const assert = require('node:assert/strict');
const test = require('node:test');

const {
  withLocalProfile,
  activeLocalProfileId,
  setFocusedLocalProfile,
} = require('../../src/main/local-profile-context');

test('local-profile context preserves overlapping async window work', async () => {
  setFocusedLocalProfile('default');
  const seen = await Promise.all([
    withLocalProfile('work', async () => {
      await Promise.resolve();
      return activeLocalProfileId();
    }),
    withLocalProfile('personal', async () => {
      await Promise.resolve();
      return activeLocalProfileId();
    }),
  ]);

  assert.deepEqual(seen, ['work', 'personal']);
  assert.equal(activeLocalProfileId(), 'default');
});
