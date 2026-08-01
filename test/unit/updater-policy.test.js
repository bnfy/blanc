const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveUpdaterPolicy } = require('../../src/main/updater-policy');

const resolve = (env = {}, isPackaged = true) =>
  resolveUpdaterPolicy({ isPackaged, env });

test('ordinary packaged builds remain on their embedded production feed', () => {
  assert.deepEqual(resolve(), {
    enabled: true,
    mode: 'production',
    reason: null,
    feed: null,
    allowPrerelease: false,
    autoInstall: false,
    statusFile: null,
  });
});

test('development builds never activate an updater feed', () => {
  assert.equal(resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'https://updates.example/staging',
  }, false).enabled, false);
});

test('staging requires an exact opt-in and never falls back to Stable on error', () => {
  const missing = resolve({ BLANC_UPDATE_CHANNEL: 'staging' });
  assert.equal(missing.enabled, false);
  assert.match(missing.reason, /URL is required/);

  const unknown = resolve({
    BLANC_UPDATE_CHANNEL: 'beta',
    BLANC_UPDATE_STAGING_URL: 'https://updates.example/staging',
  });
  assert.equal(unknown.enabled, false);
  assert.match(unknown.reason, /unsupported/);
});

test('HTTPS staging feeds use isolated staging metadata and allow prereleases', () => {
  const policy = resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'https://updates.example/blanc',
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.mode, 'staging');
  assert.deepEqual(policy.feed, {
    provider: 'generic',
    url: 'https://updates.example/blanc/',
    channel: 'staging',
    useMultipleRangeRequest: false,
  });
  assert.equal(policy.allowPrerelease, true);
});

test('plain HTTP is restricted to an explicitly enabled loopback smoke', () => {
  const denied = resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:4321/feed',
  });
  assert.equal(denied.enabled, false);

  const allowed = resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:4321/feed',
    BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
  });
  assert.equal(allowed.enabled, true);
  assert.equal(allowed.feed.url, 'http://127.0.0.1:4321/feed/');

  const remote = resolve({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'http://updates.example/feed',
    BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
  });
  assert.equal(remote.enabled, false);
});

test('staging feed URLs reject credentials, queries, and fragments', () => {
  for (const url of [
    'https://user:secret@updates.example/feed',
    'https://updates.example/feed?token=secret',
    'https://updates.example/feed#candidate',
  ]) {
    assert.equal(resolve({
      BLANC_UPDATE_CHANNEL: 'staging',
      BLANC_UPDATE_STAGING_URL: url,
    }).enabled, false, url);
  }
});

test('auto-install instrumentation is explicit and requires an absolute status path', () => {
  const env = {
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'https://updates.example/feed',
    BLANC_UPDATE_STAGING_AUTO_INSTALL: '1',
    BLANC_UPDATE_STAGING_STATUS_FILE: '/tmp/blanc-updater-status.json',
  };
  const policy = resolve(env);
  assert.equal(policy.enabled, true);
  assert.equal(policy.autoInstall, true);
  assert.equal(policy.statusFile, '/tmp/blanc-updater-status.json');

  assert.equal(resolve({
    ...env,
    BLANC_UPDATE_STAGING_STATUS_FILE: 'relative.json',
  }).enabled, false);
  assert.equal(resolve({
    ...env,
    BLANC_UPDATE_STAGING_AUTO_INSTALL: '0',
  }).enabled, false);
});
