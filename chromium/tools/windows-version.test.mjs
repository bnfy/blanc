// W3 Task D1: each Windows beta carries its own Windows version,
// MAJOR.MINOR.BUILD from chrome/VERSION and its beta build number as PATCH
// (158.0.8127.900 for build 900), so Blanc's updater can tell one beta from
// the next. chrome/VERSION itself is shared and unchanged; patch 0103 passes
// `-e PATCH=<build>` to build/util/version.py wherever it reads chrome/VERSION
// in a Windows beta build. The Mac beta and the preview keep Chromium's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {windowsVersion} from '../windows/candidate.mjs';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const patch = () => read('patches/0103-blanc-windows-beta-version.patch');
const added = file => {
  const p = patch(), start = p.indexOf(`+++ b/${file}\n`);
  assert.ok(start >= 0, `0103 patches ${file}`);
  const end = p.indexOf('\n--- ', start);
  return p.slice(start, end < 0 ? undefined : end).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
};

test('a Windows beta\'s version ends in its build number; other channels keep Chromium\'s', () => {
  assert.equal(windowsVersion('158.0.8127.2', 'beta', 900), '158.0.8127.900');
  assert.equal(windowsVersion('158.0.8127.2', 'beta', 901), '158.0.8127.901');
  assert.equal(windowsVersion('158.0.8127.2', 'preview', 900), '158.0.8127.2');
  assert.throws(() => windowsVersion('158.0.8127.2', 'beta', 0));
  assert.throws(() => windowsVersion('158.0.8127.2', 'beta', 65536), /16-bit/);
});
test('only Windows and Linux betas stamp the build number into the Chromium version', () => {
  const config = read('blanc/config.gni');
  assert.match(config, /^blanc_win_version_patch = ""$/m);
  assert.match(config, /^if \(blanc_channel == "beta" && \(target_os == "win" \|\| target_os == "linux"\)\) \{\n  blanc_win_version_patch = "\$blanc_beta_build"\n\}$/m);
});
test('patch 0103 overrides PATCH wherever version.py reads chrome/VERSION', () => {
  const lane = JSON.parse(read('lanes/desktop.json')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf('0103-blanc-windows-beta-version.patch'), lane.indexOf('0102-blanc-windows-update-keys.patch') + 1);
  assert.match(added('chrome/version.gni'), /if \(blanc_win_version_patch != ""\) \{\n\+  _script_arguments \+= \[ "-e", "PATCH=\$blanc_win_version_patch" \]/);
  const pv = added('build/util/process_version.gni');
  assert.match(pv, /filter_include\(invoker\.sources, \[ "\/\/chrome\/VERSION" \]\) != \[\]/);
  assert.match(pv, /args \+= \[ "-e", "PATCH=\$blanc_win_version_patch" \]/);
  for (const file of ['chrome/version.gni', 'build/util/process_version.gni'])
    assert.match(added(file), /import\("\/\/blanc\/config\.gni"\)/, file);
});
test('the installer archive takes the same version (Chromium\'s script reads chrome/VERSION itself)', () => {
  const script = added('chrome/tools/build/win/create_installer_archive.py');
  assert.match(script, /--chrome_version_patch/);
  assert.match(script, /if version_patch:\n\+        patch = version_patch/);
  const gn = added('chrome/installer/mini_installer/BUILD.gn');
  assert.match(gn, /if \(blanc_win_version_patch != ""\) \{\n\+    args \+= \[ "--chrome_version_patch=\$blanc_win_version_patch" \]/);
  assert.match(gn, /import\("\/\/blanc\/config\.gni"\)/);
});
