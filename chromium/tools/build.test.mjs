import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as guard from './build.mjs';
const { changedInputs, plannedActions, checkPlan, planSummary, localJobs, maximumActions, selectedSdk, outputName, buildLane,
  requireAndroidHost, competingBuild, processListArgs, WINDOWS_OUTPUTS, requireDesktopHost, windowsToolchainPins, windowsToolchainMounted,
  LINUX_OUTPUTS, checkoutLockPath, acquireCheckoutLock, sysrootHash } = guard;

test('cold plans larger than the former capture limit retain their final count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-plan-test-'));
  try {
    const file = path.join(dir, 'plan.log');
    fs.writeFileSync(file, '[0/58000] start\n');
    fs.truncateSync(file, 129 * 1024 * 1024);
    fs.appendFileSync(file, '\nBuild Succeeded: 55000 steps\n');
    assert.equal(plannedActions(planSummary(file)), 58000);
    assert.throws(() => checkPlan(planSummary(file)), /Large rebuild stopped/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('streamed plans preserve safety markers crossing chunk boundaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-plan-test-'));
  try {
    const file = path.join(dir, 'plan.log');
    fs.writeFileSync(file, ' '.repeat(65530) + '--regeneration gen .\nBuild Succeeded: 4 steps');
    assert.throws(() => checkPlan(planSummary(file), true), /GN regeneration/);
    fs.writeFileSync(file, ' '.repeat(65530) + 'write_buildflag_header.py\nBuild Succeeded: 4 steps');
    assert.throws(() => checkPlan(planSummary(file)), /Generated build flags/);
    fs.writeFileSync(file, 'unfinished plan');
    assert.throws(() => plannedActions(planSummary(file)), /Cannot determine/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('recognizes real Siso dry-run summary without a progress denominator', () => {
  assert.equal(plannedActions('touch one\ntouch two\nnoexec:0 local:0 remote:0\n 0.11s Build Succeeded: 2 steps - 18.33/s'), 2);
});
test('large and shrinking plans retain the conservative maximum', () => {
  assert.equal(plannedActions('[0/58000] start\n[1/56000] finish\nBuild Succeeded: 55000 steps'), 58000);
});
test('no-work plans return zero; missing or changed formats fail closed', () => {
  assert.equal(plannedActions('ninja: no work to do.'), 0);
  assert.equal(plannedActions('Build Succeeded: 0 steps'), 0);
  assert.throws(() => plannedActions('build finished'), /Cannot determine/);
});
test('detects same-path Xcode replacement and changed build arguments', () => {
  const before = { developerDir: '/Applications/Xcode.app/Contents/Developer', xcode: '27A266a', argsSha256: 'old' };
  assert.deepEqual(changedInputs(before, { ...before, xcode: '27A9275', argsSha256: 'new' }), ['xcode', 'argsSha256']);
  assert.deepEqual(changedInputs(before, { ...before }), []);
});
test('added and missing environment inputs require review', () => {
  assert.deepEqual(changedInputs({ sdk: '1' }, { clang: '2' }), ['sdk', 'clang']);
});

test('large builds require an explicit override, small builds proceed', () => {
  assert.equal(checkPlan('Build Succeeded: 1000 steps'), 1000);
  assert.throws(() => checkPlan('Build Succeeded: 1001 steps'), /Large rebuild stopped/);
  assert.equal(checkPlan('Build Succeeded: 1001 steps', true), 1001);
});
test('explicit approved scope caps the preflight even with a large-build override', () => {
  assert.equal(maximumActions(['--max-actions=47578']), 47578);
  assert.equal(maximumActions([]), null);
  for (const value of ['-1', '1.5', '1000000000', '8 -clobber', '']) assert.throws(() => maximumActions(['--max-actions=' + value]));
  assert.throws(() => maximumActions(['--max-actions=1', '--max-actions=2']));
  assert.equal(checkPlan('Build Succeeded: 47578 steps', true, true, 47578), 47578);
  assert.throws(() => checkPlan('Build Succeeded: 47579 steps', true, true, 47578), /exceeds approved maximum/);
  assert.throws(() => checkPlan('write_buildflag_header.py\nBuild Succeeded: 1 steps', true, true, 47578), /Generated build flags/);
});
test('pending manifest regeneration cannot sneak past the size check', () => {
  assert.throws(() => checkPlan('../../buildtools/mac/gn --root=../.. -q --regeneration gen .\nBuild Succeeded: 1 steps', true), /GN regeneration is pending/);
});

// Regression: the icon-name edit produced a five-step dry run, then changed
// APP_INFO_PLIST_FILE_SIZE and invalidated libbase's generated dependents.
test('small plans with generated buildflags cannot conceal dependent compilation', () => {
  const output = '../../build/write_buildflag_header.py --output base/apple/app_plist_size_buildflags.h\nBuild Succeeded: 5 steps';
  assert.throws(() => checkPlan(output), /Generated build flags are pending/);
  assert.equal(checkPlan(output, true), 5);
});

// Worker limits change scheduling only; they must not admit other Siso flags.
test('local worker limit is bounded and cannot inject or duplicate flags', () => {
  assert.deepEqual(localJobs([]), []);
  assert.deepEqual(localJobs(['--build', '--local-jobs=8']), ['-local_jobs', '8']);
  for (const value of ['0', '-1', '1.5', '1000', '8 -clobber', '']) {
    assert.throws(() => localJobs(['--local-jobs=' + value]));
  }
  assert.throws(() => localJobs(['--local-jobs=8', '--local-jobs=4']));
});


test('output is the preview candidate or the release channel, nothing else', () => {
  assert.equal(outputName(['--build']), 'BlancPrototype');
  assert.equal(outputName(['--out=BlancRelease']), 'BlancRelease');
  assert.equal(outputName(['--out=BlancBeta']), 'BlancBeta');
  for (const value of ['', 'Default', '../BlancRelease', 'BlancRelease2'])
    assert.throws(() => outputName(['--out=' + value]));
  assert.throws(() => outputName(['--out=BlancRelease', '--out=BlancPrototype']));
});

test('explicit recovered SDK must match the real sysroot and never hides Xcode drift', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sdk-selection-'));
  try {
    const out = path.join(dir, 'out'), sdk = path.join(dir, 'sdk'), other = path.join(dir, 'other');
    for (const p of [out, sdk, other]) fs.mkdirSync(p);
    for (const p of [sdk, other]) fs.writeFileSync(path.join(p, 'SDKSettings.json'), '{}');
    fs.symlinkSync(sdk, path.join(out, 'selected.sdk'));
    fs.writeFileSync(path.join(out, 'toolchain.ninja'), 'cflags = -isysroot selected.sdk -O2\n');
    assert.equal(selectedSdk([], out), null);
    assert.equal(selectedSdk([`--sdk-root=${sdk}`], out), fs.realpathSync(sdk));
    assert.throws(() => selectedSdk([`--sdk-root=${other}`], out), /does not match/);
    assert.throws(() => selectedSdk(['--sdk-root=relative'], out), /absolute/);
    assert.throws(() => selectedSdk([`--sdk-root=${sdk}`, `--sdk-root=${sdk}`], out), /exactly one/);
    // A link can be replaced after preflight; re-resolution must reject it.
    fs.unlinkSync(path.join(out, 'selected.sdk'));
    fs.symlinkSync(other, path.join(out, 'selected.sdk'));
    assert.throws(() => selectedSdk([`--sdk-root=${sdk}`], out), /does not match/);
    fs.writeFileSync(path.join(out, 'toolchain.ninja'), 'cflags = -O2\n');
    assert.throws(() => selectedSdk([`--sdk-root=${sdk}`], out), /No sysroot/);
    assert.deepEqual(changedInputs({xcode:'old',sdkPath:sdk}, {xcode:'new',sdkPath:sdk}), ['xcode']);
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});

test('desktop lane keeps its defaults', () => {
  assert.deepEqual(buildLane(['--build']), { lane: 'desktop', out: 'BlancPrototype', target: 'chrome' });
  assert.deepEqual(buildLane(['--lane=desktop', '--out=BlancRelease']), { lane: 'desktop', out: 'BlancRelease', target: 'chrome' });
});
test('android lane resolves its out dir and target', () => {
  assert.deepEqual(buildLane(['--lane=android']), { lane: 'android', out: 'AndroidDebug', target: 'chrome_public_apk' });
  assert.deepEqual(buildLane(['--lane=android', '--out=AndroidDebugX64']), { lane: 'android', out: 'AndroidDebugX64', target: 'chrome_public_apk' });
});
test('lanes and outputs never mix', () => {
  for (const options of [['--lane=ios'], ['--lane='], ['--lane=android', '--lane=desktop'], ['--lane=desktop', '--out=AndroidDebug'],
    ['--lane=android', '--out=BlancPrototype'], ['--lane=android', '--out=../AndroidDebug'], ['--lane=android', '--sdk-root=/tmp']])
    assert.throws(() => buildLane(options), undefined, options.join(' '));
});
test('android lane refuses anything but x86-64 Linux', () => {
  assert.doesNotThrow(() => requireAndroidHost('linux', 'x64'));
  for (const [platform, arch] of [['darwin', 'arm64'], ['linux', 'arm64'], ['win32', 'x64']])
    assert.throws(() => requireAndroidHost(platform, arch), /only on x86-64 Linux/);
});
test('android lane refuses a competing build', () => {
  const linux = 'bash     -bash\nsiso     /home/build/chromium-android/src/third_party/siso/cipd/siso ninja -offline -C out/AndroidDebug chrome_public_apk\n';
  assert.equal(competingBuild(linux), true);
  assert.equal(competingBuild('/Users/x/src/third_party/siso/cipd/siso /Users/x/src/third_party/siso/cipd/siso ninja -C out/BlancPrototype chrome'), true);
  assert.equal(competingBuild('bash     -bash\nnode     node build.mjs --check\nvim      vim siso-notes.txt\n'), false);
  assert.deepEqual(processListArgs('linux'), ['-eo', 'comm=,args=']);
  assert.deepEqual(processListArgs('darwin'), ['-axo', 'comm=,args=']);
});

// Windows is a second build of the desktop lane, cross-compiled on the
// x86-64 Linux server (owner decision D4, 2026-11-17).
test('desktop lane accepts the Windows output: the browser, and Chromium\'s installer with it', () => {
  // W3 adds the Windows beta beside the preview.
  assert.deepEqual(WINDOWS_OUTPUTS, ['BlancWinPrototype', 'BlancWinBeta']);
  assert.equal(outputName(['--out=BlancWinPrototype']), 'BlancWinPrototype');
  assert.deepEqual(buildLane(['--out=BlancWinPrototype']),
    { lane: 'desktop', out: 'BlancWinPrototype', target: 'chrome', extraTargets: ['mini_installer'] });
  // The beta also builds Blanc's updater, its setup program (W3 Task B2) and
  // Chromium's tag tool, which tags the signed setup as the online installer, and
  // the test setup (UpdaterSetup_test.exe, which reads overrides.json) for the
  // release's staging gate (E1).
  assert.deepEqual(buildLane(['--out=BlancWinBeta']), { lane: 'desktop', out: 'BlancWinBeta', target: 'chrome',
    extraTargets: ['mini_installer', 'chrome/updater/win/installer:installer', 'chrome/updater/tools:tag',
      'chrome/updater/win/installer:installer_test'] });
  for (const options of [['--lane=android', '--out=BlancWinPrototype'], ['--out=BlancWinPrototype', '--sdk-root=/tmp'],
    ['--out=BlancWinRelease'], ['--out=blancwinprototype']])
    assert.throws(() => buildLane(options), undefined, options.join(' '));
});
test('each desktop output builds only on its own kind of machine', () => {
  assert.doesNotThrow(() => requireDesktopHost('BlancWinPrototype', 'linux', 'x64'));
  for (const [platform, arch] of [['darwin', 'arm64'], ['linux', 'arm64'], ['win32', 'x64']])
    assert.throws(() => requireDesktopHost('BlancWinPrototype', platform, arch), /only on x86-64 Linux/);
  for (const out of ['BlancPrototype', 'BlancRelease', 'BlancBeta']) {
    assert.doesNotThrow(() => requireDesktopHost(out, 'darwin', 'arm64'));
    assert.doesNotThrow(() => requireDesktopHost(out, 'darwin', 'x64'));
    assert.throws(() => requireDesktopHost(out, 'linux', 'x64'), /only on macOS/);
  }
});
test('the Windows toolchain pins are read from the tree, and a changed format fails closed', () => {
  const source = "# comment TOOLCHAIN_HASH\nTOOLCHAIN_HASH = '3bfcb536c8'\nSDK_VERSION = '10.0.28000.0'\n";
  assert.deepEqual(windowsToolchainPins(source), { toolchainHash: '3bfcb536c8', sdkVersion: '10.0.28000.0' });
  assert.throws(() => windowsToolchainPins("TOOLCHAIN_HASH = '3bfcb536c8'\n"), /SDK_VERSION/);
  assert.throws(() => windowsToolchainPins("SDK_VERSION = '10.0.28000.0'\n"), /TOOLCHAIN_HASH/);
  assert.throws(() => windowsToolchainPins("TOOLCHAIN_HASH = get_hash()\nSDK_VERSION = '10.0.28000.0'\n"), /TOOLCHAIN_HASH/);
});
test('the Windows build needs its case-insensitive toolchain mount', () => {
  const src = '/home/b/chromium-desktop/src', mount = `${src}/third_party/depot_tools/win_toolchain/vs_files`;
  const mounts = `/dev/md2 / ext4 rw 0 0\nciopfs ${mount} fuse.ciopfs rw,nosuid,nodev,relatime,user_id=1000,group_id=1000 0 0\n`;
  assert.equal(windowsToolchainMounted(mounts, src), true);
  assert.equal(windowsToolchainMounted('/dev/md2 / ext4 rw 0 0\n', src), false);
  assert.equal(windowsToolchainMounted(mounts, '/home/b/other/src'), false);
  assert.equal(windowsToolchainMounted(`/dev/md2 ${mount} ext4 rw 0 0\n`, src), false);
});

test('Linux preview builds chrome and chrome_sandbox', () => {
  const options = ['--out=BlancLinuxPrototype'];
  assert.equal(outputName(options), 'BlancLinuxPrototype');
  assert.deepEqual(LINUX_OUTPUTS, ['BlancLinuxPrototype']);
  assert.deepEqual(buildLane(options), { lane: 'desktop', out: 'BlancLinuxPrototype', target: 'chrome', extraTargets: ['chrome_sandbox'] });
  assert.throws(() => buildLane([...options, '--sdk-root=/tmp']), /macOS option/);
});
test('Linux preview requires x86-64 Linux', () => {
  assert.throws(() => requireDesktopHost('BlancLinuxPrototype', 'darwin', 'arm64'), /x86-64 Linux/);
  assert.throws(() => requireDesktopHost('BlancLinuxPrototype', 'linux', 'arm64'), /x86-64 Linux/);
  assert.doesNotThrow(() => requireDesktopHost('BlancLinuxPrototype', 'linux', 'x64'));
  assert.throws(() => requireDesktopHost('BlancPrototype', 'linux', 'x64'), /only on macOS/);
});
test('setup and builds contend for one checkout lock', () => {
  assert.equal(checkoutLockPath('/h/chromium-desktop/src'), '/h/chromium-desktop/.blanc-checkout.lock');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-checkout-'));
  try {
    const src = path.join(dir, 'src'), lock = checkoutLockPath(src);
    const release = acquireCheckoutLock(src);
    assert.throws(() => acquireCheckoutLock(src), /locked/);
    assert.throws(() => fs.mkdirSync(lock), { code: 'EEXIST' });
    release();
    fs.mkdirSync(lock); // Setup takes the same lock with mkdir.
    assert.throws(() => acquireCheckoutLock(src), /locked/);
    fs.rmdirSync(lock);
    const releaseAgain = acquireCheckoutLock(src);
    releaseAgain();
    assert.equal(fs.existsSync(lock), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('sysroot requires exactly one bare hash marker', () => {
  const hash = 'f851add7'.padEnd(64, '0');
  const sidecars = ['_hash', '_content_names', '_is_first_class_gcs'].map(suffix => '.' + hash + suffix);
  assert.equal(sysrootHash([...sidecars, '.' + hash]), hash);
  assert.throws(() => sysrootHash(sidecars));
  assert.throws(() => sysrootHash(['.' + hash, '.' + '1'.repeat(64)]));
});
