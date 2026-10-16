import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedInputs, plannedActions, checkPlan } from './build.mjs';

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
test('pending manifest regeneration cannot sneak past the size check', () => {
  assert.throws(() => checkPlan('../../buildtools/mac/gn --root=../.. -q --regeneration gen .\nBuild Succeeded: 1 steps', true), /GN regeneration is pending/);
});
