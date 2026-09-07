const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveUpdaterPolicy } = require('../../src/main/updater-policy');

const resolve = (env = {}, isPackaged = true) => resolveUpdaterPolicy({ isPackaged, env });

test('production stays on the embedded feed and development never updates', () => {
  assert.deepEqual(resolve(), {
    enabled: true, mode: 'production', reason: null, feed: null,
    allowPrerelease: false, autoInstall: false, statusFile: null,
  });
  assert.equal(resolve({ BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'https://updates.example/' }, false).enabled, false);
});

test('staging requires exact valid configuration and never falls back', () => {
  assert.equal(resolve({ BLANC_UPDATE_CHANNEL: 'staging' }).enabled, false);
  assert.equal(resolve({ BLANC_UPDATE_CHANNEL: 'beta', BLANC_UPDATE_STAGING_URL: 'https://updates.example/' }).enabled, false);
  const policy = resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'https://updates.example/blanc',
  });
  assert.deepEqual(policy.feed, {
    provider: 'generic', url: 'https://updates.example/blanc/',
    channel: 'staging', useMultipleRangeRequest: false,
  });
  assert.equal(policy.allowPrerelease, true);
});

test('HTTP is restricted to explicitly enabled loopback', () => {
  const base = { BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_ALLOW_HTTP: '1' };
  assert.equal(resolve({ ...base, BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:4321/feed' }).enabled, true);
  assert.equal(resolve({ ...base, BLANC_UPDATE_STAGING_URL: 'http://updates.example/feed' }).enabled, false);
  assert.equal(resolve({ BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'http://localhost:4321/feed' }).enabled, false);
});

test('staging rejects credentials, query, fragment, and unsafe status configuration', () => {
  for (const url of [
    'https://user:secret@updates.example/feed',
    'https://updates.example/feed?token=secret',
    'https://updates.example/feed#candidate',
  ]) {
    assert.equal(resolve({ BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: url }).enabled, false);
  }
  const auto = {
    BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'https://updates.example/feed',
    BLANC_UPDATE_STAGING_AUTO_INSTALL: '1', BLANC_UPDATE_STAGING_STATUS_FILE: '/tmp/status.json',
  };
  assert.equal(resolve(auto).statusFile, '/tmp/status.json');
  assert.equal(resolve({ ...auto, BLANC_UPDATE_STAGING_STATUS_FILE: 'relative.json' }).enabled, false);
  assert.equal(resolve({ ...auto, BLANC_UPDATE_STAGING_AUTO_INSTALL: '0' }).enabled, false);
});
