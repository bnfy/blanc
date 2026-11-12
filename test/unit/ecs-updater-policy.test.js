'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCandidateUpdaterPolicy } = require('../../scripts/ecs-updater-policy.cjs');
const { resolveUpdaterPolicy } = require('../../src/main/updater-policy');
const metadata = { blancEcsFullCandidate: true, blancEcsStagingUpdater: true };
test('ECS candidate never resolves to production, including malformed staging inputs', () => {
  for (const env of [{}, { BLANC_UPDATE_CHANNEL: 'production' },
    { BLANC_UPDATE_CHANNEL: 'staging' },
    { BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'http://example.com/' },
    { BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'https://user:pass@example.com/' }]) {
    assert.equal(applyCandidateUpdaterPolicy({ metadata, env, resolveUpdaterPolicy }), 'disabled');
    assert.equal(resolveUpdaterPolicy({ isPackaged: true, env }).enabled, false);
  }
});
test('ECS staging update requires both build-time opt-in and validated runtime configuration', () => {
  const env = { BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:8080/', BLANC_UPDATE_STAGING_ALLOW_HTTP: '1' };
  assert.equal(applyCandidateUpdaterPolicy({ metadata, env: { ...env }, resolveUpdaterPolicy }), 'staging');
  assert.equal(applyCandidateUpdaterPolicy({ metadata: { ...metadata, blancEcsStagingUpdater: false }, env: { ...env }, resolveUpdaterPolicy }), 'disabled');
  assert.throws(() => applyCandidateUpdaterPolicy({ metadata: {}, env, resolveUpdaterPolicy }), /identity/);
});
