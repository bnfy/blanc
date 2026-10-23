'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { linuxPreloadEnv } = require('../../scripts/ecs-linux-preload-env.cjs');
test('preload is opt-in to a packaged shim and marked isolated profile', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-preload-')));
  const app = path.join(root, 'app'), profile = path.join(root, 'profile');
  fs.mkdirSync(app); fs.mkdirSync(profile);
  try {
    assert.deepEqual(linuxPreloadEnv(app, profile), {});
    const shim = path.join(app, 'blanc-cdm-preload.so'); fs.writeFileSync(shim, 'fixture');
    assert.throws(() => linuxPreloadEnv(app, profile));
    fs.writeFileSync(path.join(profile, 'ecs-candidate-profile.json'), '{"candidate":true}');
    assert.deepEqual(linuxPreloadEnv(app, profile), { LD_PRELOAD: shim, BLANC_ECS_CDM_PRELOAD_PATH: '' });
    const install = version => {
      const dir = path.join(profile, 'WidevineCdm', version);
      fs.mkdirSync(path.join(dir, '_platform_specific/linux_x64'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version }));
      const lib = path.join(dir, '_platform_specific/linux_x64/libwidevinecdm.so');
      fs.writeFileSync(lib, 'fixture'); return lib;
    };
    install('4.10.9.0'); const latest = install('4.10.11.0');
    assert.equal(linuxPreloadEnv(app, profile).BLANC_ECS_CDM_PRELOAD_PATH, latest);
    fs.writeFileSync(path.join(profile, 'WidevineCdm/4.10.11.0/manifest.json'), '{"version":"wrong"}');
    assert.throws(() => linuxPreloadEnv(app, profile), /manifest/);
    fs.writeFileSync(path.join(profile, 'WidevineCdm/4.10.11.0/manifest.json'), '{"version":"4.10.11.0"}');
    fs.unlinkSync(latest); fs.symlinkSync(path.join(root, 'outside.so'), latest);
    fs.writeFileSync(path.join(root, 'outside.so'), 'outside');
    assert.throws(() => linuxPreloadEnv(app, profile), /redirected/);
    const alias = path.join(root, 'alias'); fs.symlinkSync(profile, alias, 'dir');
    assert.throws(() => linuxPreloadEnv(app, alias), /isolated profile/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
