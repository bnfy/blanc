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
  assert.equal(good.stdout.split('\n')[2], path.join(app, 'blanc-cdm-preload.so'), 'preload is retained only for native startup');
  assert.ok(!good.stdout.includes('--zygote-cmd-prefix='), 'vendor-incompatible prefix is never added');
  assert.ok(good.stdout.includes(`--user-data-dir=${profile}`));
  assert.equal(run(['--user-data-dir=/somewhere-else']).status, 126);
  assert.equal(run(['--user-data-dir', profile]).status, 0);
  for (const flag of ['--no-sandbox', '--no-zygote-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox']) assert.equal(run([flag]).status, 126);
  assert.equal(run(['--zygote-cmd-prefix=/untrusted']).status, 126);
  assert.equal(run(['--ecs-zygote', '/bin/echo', '--type=zygote']).status, 126);
  const install = version => {
    const dir = path.join(profile, 'WidevineCdm', version);
    fs.mkdirSync(path.join(dir, '_platform_specific/linux_x64'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version }));
    const lib = path.join(dir, '_platform_specific/linux_x64/libwidevinecdm.so');
    fs.writeFileSync(lib, 'fixture'); return lib;
  };
  const old = install('4.10.9.0'), current = install('4.10.11.0');
  assert.equal(run(['--ecs-query-cdm']).stdout, current + '\n');
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
  const configAlias = path.join(root, 'config-alias'); fs.symlinkSync(config, configAlias);
  const linkedConfig = run([], { BLANC_ECS_FULL_PROFILE: '', XDG_CONFIG_HOME: configAlias });
  assert.equal(linkedConfig.status, 0);
  assert.equal(linkedConfig.stdout.split('\n')[0], path.join(config, 'Blanc-ECS-Candidate'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const homeAlias = path.join(root, 'home-alias'); fs.symlinkSync(home, homeAlias);
  const linkedHome = run([], { BLANC_ECS_FULL_PROFILE: '', XDG_CONFIG_HOME: '', HOME: homeAlias });
  assert.equal(linkedHome.status, 0);
  assert.equal(linkedHome.stdout.split('\n')[0], path.join(home, '.config/Blanc-ECS-Candidate'));

  // Real loader regression: only the pinned core zygote loads the CDM. Keep
  // Chromium's initial argv/environ layout intact for service-role titles;
  // a subsequent foreign exec strips the startup environment and never loads CDM.
  fs.unlinkSync(current);
  execFileSync('cc', ['-shared', '-fPIC', '-x', 'c', '-', '-o', old], { input:
    '#include <stdio.h>\n#include <stdlib.h>\n__attribute__((constructor)) static void loaded(void) { fputs("CDM_LOADED\\n", stderr); if(!getenv("LD_PRELOAD") || !getenv("BLANC_ECS_CDM_PRELOAD_PATH")) abort(); }\n' });
  execFileSync('cc', ['-shared', '-fPIC', '-Wall', '-Wextra', '-Werror', path.resolve('scripts/ecs-linux-cdm-preload.c'), '-o', path.join(app, 'blanc-cdm-preload.so'), '-ldl']);
  const core = path.join(app, 'blanc-ecs-full-candidate');
  fs.unlinkSync(core);
  execFileSync('cc', ['-x', 'c', '-', '-o', core], { input:
    '#include <unistd.h>\n#include <stdio.h>\n#include <string.h>\nextern char **environ;\nint main(int argc, char **argv) { char *p=argv[0]; for(int i=0;i<argc;i++) { if(p!=argv[i]) return 91; p+=strlen(p)+1; } for(int i=0;environ[i];i++) { if(p!=environ[i]) return 92; p+=strlen(p)+1; } fputs("ENV_LAYOUT_OK\\n", stderr); execl("/usr/bin/env", "env", (char*)0); return 1; }\n' });
  const zygote = run(['--type=zygote']);
  assert.equal(zygote.status, 0); assert.match(zygote.stderr, /CDM_LOADED/);
  assert.match(zygote.stderr, /ENV_LAYOUT_OK/, 'Chromium can safely initialize its process-title storage');
  assert.doesNotMatch(zygote.stdout, /LD_PRELOAD=|BLANC_ECS_CDM_PRELOAD_PATH=|BLANC_ECS_CDM_EXECUTABLE=/);
  const unsandboxed = spawnSync(core, ['--type=zygote', '--no-zygote-sandbox'], { encoding: 'utf8', env: {
    ...process.env, LD_PRELOAD: path.join(app, 'blanc-cdm-preload.so'),
    BLANC_ECS_CDM_PRELOAD_PATH: old, BLANC_ECS_CDM_EXECUTABLE: core,
  } });
  assert.equal(unsandboxed.status, 0); assert.doesNotMatch(unsandboxed.stderr, /CDM_LOADED/);
  const foreign = spawnSync('/bin/true', ['--type=zygote', 'X'.repeat(70000)], { encoding: 'utf8', env: {
    ...process.env, LD_PRELOAD: path.join(app, 'blanc-cdm-preload.so'),
    BLANC_ECS_CDM_PRELOAD_PATH: '/inaccessible/cdm.so', BLANC_ECS_CDM_EXECUTABLE: core,
  } });
  assert.equal(foreign.status, 0, 'foreign long command lines never enter the CDM parser');
  assert.doesNotMatch(foreign.stderr, /CDM_LOADED|pre-sandbox preload failed/);
});

test('AppImage entrypoint uses its own launcher, never an inherited mount or sandbox bypass', () => {
  const script = fs.readFileSync(path.resolve('scripts/ecs-linux-apprun.sh'), 'utf8');
  assert.match(script, /unset LD_PRELOAD BLANC_ECS_CDM_PRELOAD_PATH APPIMAGE_EXIT_AFTER_INSTALL/);
  assert.match(script, /readlink -f -- "\$0"/);
  assert.match(script, /exec "\$ECS_APPDIR\/blanc-ecs-launcher" "\$@"/);
  assert.doesNotMatch(script, /--no-sandbox|unshare|\beval\b/);
  if (process.platform !== 'win32') assert.equal(spawnSync('sh', [path.resolve('scripts/ecs-linux-apprun.sh')], {
    env: { ...process.env, APPIMAGE_EXIT_AFTER_INSTALL: 'true' },
  }).status, 0, 'explicit install-only mode never enters the browser');
  const builder = fs.readFileSync(path.resolve('scripts/build-full-ecs-candidate.cjs'), 'utf8');
  assert.match(builder, /if \(nativeSecurityPatch\) \{/);
  assert.match(builder, /ecs-linux-launcher\.cc/);
});

test('production launcher uses normal profile paths without creating them before migration', { skip: process.platform !== 'linux' }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-production-launcher-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'); fs.mkdirSync(app);
  const launcher = path.join(app, 'blanc-ecs-launcher');
  execFileSync('c++', ['-std=c++17', '-DBLANC_ECS_PRODUCTION', '-Wall', '-Wextra', '-Werror', path.resolve('scripts/ecs-linux-launcher.cc'), '-o', launcher]);
  fs.writeFileSync(path.join(app, 'blanc-cdm-preload.so'), 'fixture');
  fs.writeFileSync(path.join(app, 'blanc'), '#!/bin/sh\nprintf "%s\\n" "$BLANC_ECS_FULL_PROFILE" "$@"\n', { mode: 0o755 });
  const config = path.join(root, 'config'); fs.mkdirSync(config);
  const run = (args = [], env = {}) => spawnSync(launcher, args, { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: config, BLANC_ECS_FULL_PROFILE: '/ignored-candidate-profile', ...env } });
  const result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout.split('\n')[0], path.join(config, 'Blanc'));
  assert.equal(fs.existsSync(path.join(config, 'Blanc')), false, 'legacy migration owns profile creation');
  const explicit = path.join(root, 'custom profile'); fs.mkdirSync(explicit, { mode: 0o700 });
  assert.equal(run([`--user-data-dir=${explicit}`]).stdout.split('\n')[0], explicit);
  assert.equal(run(['--user-data-dir', explicit]).status, 0);
  assert.equal(run(['--user-data-dir=relative']).status, 126);
  assert.equal(run([`--user-data-dir=${explicit}`, '--user-data-dir=/another']).status, 126);
  const alias = path.join(root, 'config-link'); fs.symlinkSync(config, alias);
  assert.equal(run([], { XDG_CONFIG_HOME: alias }).stdout.split('\n')[0], path.join(config, 'Blanc'));
  fs.chmodSync(explicit, 0o777);
  assert.equal(run([`--user-data-dir=${explicit}`]).status, 126, 'shared writable profile rejected');
  for (const flag of ['--no-sandbox', '--no-zygote-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox']) assert.equal(run([flag]).status, 126);
});
