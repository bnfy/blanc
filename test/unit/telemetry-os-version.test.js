const assert = require('node:assert/strict');
const test = require('node:test');
const { coarseOsVersion } = require('../../src/main/telemetry');

// The ping carries a coarsened OS major, never the raw version string. These
// pin the mapping, because a wrong bucket is invisible in production — the
// numbers just quietly describe the wrong thing.
test('macOS reports its marketing major', () => {
  assert.equal(coarseOsVersion('darwin', '27.0.0'), '27');
  assert.equal(coarseOsVersion('darwin', '26.1'), '26');
  assert.equal(coarseOsVersion('darwin', '15.6.1'), '15');
});

test('Windows 10 and 11 are told apart by build, not by major', () => {
  // Both report 10.0.<build>; 11 starts at build 22000. Trusting the major
  // alone would file every Windows 11 install under "10".
  assert.equal(coarseOsVersion('win32', '10.0.26100'), '11');
  assert.equal(coarseOsVersion('win32', '10.0.22000'), '11');
  assert.equal(coarseOsVersion('win32', '10.0.19045'), '10');
  assert.equal(coarseOsVersion('win32', '10.0'), '10'); // no build component
});

test('linux falls back to the kernel major', () => {
  assert.equal(coarseOsVersion('linux', '6.8.0-51-generic'), '6');
});

test('unparseable input degrades to unknown instead of leaking a raw string', () => {
  for (const bad of ['', null, undefined, 'sonoma', {}]) {
    assert.equal(coarseOsVersion('darwin', bad), 'unknown');
  }
});

test('the coarsened value never carries a point release', () => {
  for (const [platform, raw] of [
    ['darwin', '26.3.1'], ['win32', '10.0.26100'], ['linux', '6.8.0-51-generic'],
  ]) {
    assert.match(coarseOsVersion(platform, raw), /^\d{1,4}$/);
  }
});
