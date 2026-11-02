import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedInputs, plannedActions, checkPlan, planSummary, localJobs, maximumActions, selectedSdk, outputName } from './build.mjs';

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
