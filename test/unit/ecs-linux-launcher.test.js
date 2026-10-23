'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

test('self-contained Linux launcher selects owned components and fails closed without breaking browsing', { skip: process.platform !== 'linux' }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-launcher-unit-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'), profile = path.join(root, 'profilé with spaces');
  fs.mkdirSync(app); fs.mkdirSync(profile);
  const launcher = path.join(app, 'blanc-ecs-launcher');
  execFileSync('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', path.resolve('scripts/ecs-linux-launcher.cc'), '-o', launcher]);
  fs.writeFileSync(path.join(app, 'blanc-cdm-preload.so'), 'not loaded by the fixture');
  fs.writeFileSync(path.join(app, 'blanc-ecs-full-candidate'), '#!/bin/sh\nprintf "%s\\n" "$BLANC_ECS_FULL_PROFILE" "$BLANC_ECS_CDM_PRELOAD_PATH" "$LD_PRELOAD" "$@"\n', { mode: 0o755 });
  const marker = path.join(profile, 'ecs-candidate-profile.json');
  const run = (args = [], extra = {}) => spawnSync(launcher, args, { encoding: 'utf8', env: { ...process.env, BLANC_ECS_FULL_PROFILE: profile, ...extra } });
  assert.equal(run().status, 126);
  fs.writeFileSync(marker, '{"candidate":true}');
  const good = run(); assert.equal(good.status, 0); assert.equal(good.stdout.split('\n')[1], '');
  assert.ok(good.stdout.includes(`--user-data-dir=${profile}`));
  assert.equal(run(['--user-data-dir=/somewhere-else']).status, 126);
  assert.equal(run(['--user-data-dir', profile]).status, 0);
  for (const flag of ['--no-sandbox', '--no-zygote-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox']) assert.equal(run([flag]).status, 126);
  const install = version => {
    const dir = path.join(profile, 'WidevineCdm', version);
    fs.mkdirSync(path.join(dir, '_platform_specific/linux_x64'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version }));
    const lib = path.join(dir, '_platform_specific/linux_x64/libwidevinecdm.so');
    fs.writeFileSync(lib, 'fixture'); return lib;
  };
  const old = install('4.10.9.0'), current = install('4.10.11.0');
  assert.equal(run().stdout.split('\n')[1], current);
  fs.mkdirSync(path.join(profile, 'chromium'));
  const stateFile = path.join(profile, 'chromium/Local State');
  fs.writeFileSync(stateFile, JSON.stringify({ updateclientdata: { apps: { oimompecagnajdejgnnjijobebaeigek: { pv: '4.10.9.0' } } } }));
  assert.equal(run().stdout.split('\n')[1], old);
  const hint = path.join(profile, 'WidevineCdm/latest-component-updated-widevine-cdm');
  fs.writeFileSync(hint, JSON.stringify({ Path: path.dirname(path.dirname(path.dirname(current))) }));
  assert.equal(run().stdout.split('\n')[1], current);
  for (const invalid of ['{"Path":"/outside"}', '{"Path":"x","Path":"y"}', '{bad', '{"Path":"\\u0000"}']) {
    fs.writeFileSync(hint, invalid); const result = run();
    assert.equal(result.status, 0); assert.equal(result.stdout.split('\n')[1], '');
    assert.match(result.stderr, /protected playback disabled/);
  }
  fs.unlinkSync(hint); fs.unlinkSync(stateFile);
  fs.unlinkSync(current); fs.symlinkSync(old, current);
  assert.equal(run().stdout.split('\n')[1], '');
  const alias = path.join(root, 'alias'); fs.symlinkSync(profile, alias);
  assert.equal(run([], { BLANC_ECS_FULL_PROFILE: alias }).status, 126);
  const config = path.join(root, 'config'); fs.mkdirSync(config);
  const automatic = run([], { BLANC_ECS_FULL_PROFILE: '', XDG_CONFIG_HOME: config });
  assert.equal(automatic.status, 0); assert.equal(automatic.stdout.split('\n')[0], path.join(config, 'Blanc-ECS-Candidate'));
  assert.equal(fs.statSync(path.join(config, 'Blanc-ECS-Candidate')).mode & 0o777, 0o700);
});

test('AppImage entrypoint uses its own launcher, never an inherited mount or sandbox bypass', () => {
  const script = fs.readFileSync(path.resolve('scripts/ecs-linux-apprun.sh'), 'utf8');
  assert.match(script, /unset LD_PRELOAD BLANC_ECS_CDM_PRELOAD_PATH APPIMAGE_EXIT_AFTER_INSTALL/);
  assert.match(script, /readlink -f -- "\$0"/);
  assert.match(script, /exec "\$ECS_APPDIR\/blanc-ecs-launcher" "\$@"/);
  assert.doesNotMatch(script, /--no-sandbox|unshare|\beval\b/);
  const builder = fs.readFileSync(path.resolve('scripts/build-full-ecs-candidate.cjs'), 'utf8');
  assert.match(builder, /if \(nativeSecurityPatch\) \{/);
  assert.match(builder, /ecs-linux-launcher\.cc/);
});
