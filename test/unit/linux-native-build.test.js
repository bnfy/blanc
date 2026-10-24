'use strict';
// Blanc's Linux natives must start on glibc 2.28 (scripts/linux-native-build.cjs).
// Fixtures are real `readelf -V -d -l --wide` output: the launcher and preload as
// Blanc 1.43.0 built them on Ubuntu 24.04, and as the fixed build makes them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const native = require('../../scripts/linux-native-build.cjs');

const root = path.resolve(__dirname, '../..');
const fixture = (name) => fs.readFileSync(path.join(__dirname, '../fixtures/linux-elf', `${name}.txt`), 'utf8');

test('the launcher Blanc 1.43.0 shipped fails the baseline; the static build passes', () => {
  const shipped = native.parseElfNeeds(fixture('launcher-dynamic'));
  assert.ok(shipped.interpreter, 'asks for a loader');
  assert.ok(shipped.needed.includes('libstdc++.so.6'));
  assert.ok(shipped.versions.includes('GLIBC_2.38'));
  assert.ok(shipped.versions.includes('GLIBCXX_3.4.32'));
  const problems = native.baselineProblems(shipped, { kind: 'static' });
  assert.ok(problems.some((p) => /GLIBC_2\.38/.test(p)), problems.join('; '));
  assert.ok(problems.some((p) => /GLIBCXX_3\.4\.32/.test(p)));
  assert.ok(problems.some((p) => /dynamic loader/.test(p)));

  const fixed = native.parseElfNeeds(fixture('launcher-static'));
  assert.deepEqual(fixed, { interpreter: null, needed: [], versions: [] });
  assert.deepEqual(native.baselineProblems(fixed, { kind: 'static' }), []);
});

test('the preload Blanc 1.43.0 shipped needs glibc 2.34; the manylinux build needs only 2.2.5', () => {
  const shipped = native.parseElfNeeds(fixture('preload-2404'));
  assert.ok(shipped.versions.includes('GLIBC_2.34'));
  assert.ok(native.baselineProblems(shipped, { kind: 'shared' }).some((p) => /GLIBC_2\.34/.test(p)));

  const fixed = native.parseElfNeeds(fixture('preload-228'));
  assert.equal(fixed.interpreter, null);
  assert.deepEqual(native.baselineProblems(fixed, { kind: 'shared' }), []);
  assert.ok(fixed.versions.every((v) => /^GLIBC_2\.2\.5$/.test(v)), fixed.versions.join(','));
});

test('the baseline compares versions numerically and refuses any C++ runtime requirement', () => {
  const needs = (versions, extra = {}) => ({ interpreter: null, needed: ['libc.so.6'], versions, ...extra });
  assert.deepEqual(native.baselineProblems(needs(['GLIBC_2.28', 'GLIBC_2.3.4', 'GLIBC_2.17']), { kind: 'shared' }), []);
  assert.equal(native.baselineProblems(needs(['GLIBC_2.29']), { kind: 'shared' }).length, 1);
  assert.equal(native.baselineProblems(needs(['GLIBC_2.100']), { kind: 'shared' }).length, 1, '2.100 is newer than 2.28');
  for (const v of ['GLIBCXX_3.4.19', 'CXXABI_1.3.8', 'GCC_3.0']) {
    assert.equal(native.baselineProblems(needs([v]), { kind: 'shared' }).length, 1, v);
  }
  assert.equal(native.baselineProblems(needs([], { needed: ['libc.so.6', 'libstdc++.so.6'] }), { kind: 'shared' }).length, 1);
  assert.equal(native.baselineProblems(needs([], { needed: ['libc.so.6'] }), { kind: 'static' }).length, 1, 'static means no libraries');
});

test('assertLinuxBaseline reads the binary with readelf and fails closed', () => {
  const file = path.join(__dirname, '../fixtures/linux-elf/launcher-static.txt'); // any existing path
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); return fixture('launcher-static'); };
  assert.equal(native.assertLinuxBaseline(file, { kind: 'static', exec }), true);
  assert.deepEqual(calls[0].slice(0, 5), ['readelf', '-V', '-d', '-l', '--wide']);
  assert.throws(() => native.assertLinuxBaseline(file, { kind: 'static', exec: () => fixture('launcher-dynamic') }),
    /would not start on glibc 2\.28: .*GLIBC_2\.38/);
  assert.throws(() => native.assertLinuxBaseline(file, { kind: 'shared', exec: () => fixture('preload-2404') }), /GLIBC_2\.34/);
  assert.throws(() => native.assertLinuxBaseline('/nonexistent/blanc-ecs-launcher', { kind: 'static', exec }), /missing/);
  assert.throws(() => native.assertLinuxBaseline(file, { kind: 'whatever', exec }), /Unknown Linux native kind/);
});

test('the builders link the launcher statically and build the preload in the pinned image', () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); };
  native.buildLauncher('/src/scripts/ecs-linux-launcher.cc', '/out/blanc-ecs-launcher', { exec });
  const [launcherCmd, ...launcherArgs] = calls[0];
  assert.equal(launcherCmd, 'c++');
  assert.ok(launcherArgs.includes('-static'));
  assert.ok(launcherArgs.includes('-DBLANC_ECS_PRODUCTION'));
  assert.deepEqual(launcherArgs.slice(-3), ['/src/scripts/ecs-linux-launcher.cc', '-o', '/out/blanc-ecs-launcher']);

  native.buildCdmPreload('/src/scripts/ecs-linux-cdm-preload.c', '/runtime/blanc-cdm-preload.so', { exec });
  const [dockerCmd, ...dockerArgs] = calls[1];
  assert.equal(dockerCmd, 'docker');
  assert.deepEqual(dockerArgs.slice(0, 2), ['run', '--rm']);
  assert.ok(dockerArgs.join(' ').includes('--network none'), 'no network inside the build');
  assert.ok(dockerArgs.includes('/src/scripts:/blanc-src:ro'), 'sources mounted read-only');
  assert.ok(dockerArgs.includes(native.LINUX_NATIVE_IMAGE));
  assert.deepEqual(dockerArgs.slice(-4), ['/blanc-src/ecs-linux-cdm-preload.c', '-o', '/blanc-out/blanc-cdm-preload.so', '-ldl']);
  assert.match(native.LINUX_NATIVE_IMAGE, /^quay\.io\/pypa\/manylinux_2_28_x86_64@sha256:[0-9a-f]{64}$/, 'pinned by digest');
  assert.equal(native.LINUX_GLIBC_BASELINE, '2.28');
});

test('the ECS packaging hooks use the builders and check both natives', () => {
  const prepare = fs.readFileSync(path.join(root, 'scripts/prepare-ecs-runtime.cjs'), 'utf8');
  const packaging = fs.readFileSync(path.join(root, 'scripts/ecs-production-packaging.cjs'), 'utf8');
  assert.match(prepare, /buildCdmPreload\(/);
  assert.match(prepare, /assertLinuxBaseline\(preload, \{ kind: 'shared' \}\)/);
  assert.doesNotMatch(prepare, /execFileSync\('cc'/, 'no runner-glibc preload build');
  assert.match(packaging, /buildLauncher\(/);
  assert.match(packaging, /assertLinuxBaseline\(launcher, \{ kind: 'static' \}\)/);
  assert.match(packaging, /assertLinuxBaseline\(path\.join\(context\.appOutDir, 'blanc-cdm-preload\.so'\), \{ kind: 'shared' \}\)/);
  assert.doesNotMatch(packaging, /execFileSync\('c\+\+'/, 'no runner-glibc launcher build');
});
