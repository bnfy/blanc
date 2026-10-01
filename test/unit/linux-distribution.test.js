const test = require('node:test');
const assert = require('node:assert/strict');
const { detectLinuxDistribution } = require('../../src/main/linux-distribution');
const { resolveUpdaterPolicy } = require('../../src/main/updater-policy');

test('Flatpak identity comes from the application section of its sandbox marker', () => {
  const distribution = detectLinuxDistribution({ platform: 'linux', readFile: () => '[Application]\nname=com.blancbrowser.Blanc\n[Instance]\nname=wrong.App.Id\n' });
  assert.deepEqual(distribution, { flatpak: true, appId: 'com.blancbrowser.Blanc' });
  assert.deepEqual(detectLinuxDistribution({ platform: 'darwin', readFile: () => { throw Error('must not read'); } }), { flatpak: false, appId: null });
});
test('missing marker preserves native updates; malformed or unreadable markers fail closed', () => {
  assert.equal(detectLinuxDistribution({ platform: 'linux', readFile: () => { throw Object.assign(Error(), { code: 'ENOENT' }); } }).flatpak, false);
  for (const info of ['', '[Application]\nname=../../host.desktop\n']) {
    assert.deepEqual(detectLinuxDistribution({ platform: 'linux', readFile: () => info }), { flatpak: true, appId: null });
  }
  assert.equal(detectLinuxDistribution({ platform: 'linux', readFile: () => { throw Object.assign(Error(), { code: 'EACCES' }); } }).flatpak, true);
});
test('Flatpak disables production, staging and auto-install before feed interpretation', () => {
  for (const isPackaged of [true, false]) {
    for (const env of [{}, { BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_URL: 'https://staging.example/', BLANC_UPDATE_STAGING_AUTO_INSTALL: '1', BLANC_UPDATE_STAGING_STATUS_FILE: '/tmp/status' }]) {
      const policy = resolveUpdaterPolicy({ isPackaged, env, distribution: { flatpak: true } });
      assert.equal(policy.enabled, false); assert.equal(policy.feed, null);
      assert.equal(policy.autoInstall, false); assert.equal(policy.statusFile, null);
      assert.equal(policy.reason, 'Flatpak manages Blanc updates');
    }
  }
  assert.equal(resolveUpdaterPolicy({ isPackaged: true, distribution: { flatpak: false }, env: { FLATPAK_ID: 'com.blancbrowser.Blanc' } }).enabled, true);
});
