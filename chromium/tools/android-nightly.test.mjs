import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReason, nightVerdict, nightlyArgs, NIGHTLY_NAME } from '../android/release/nightly-rules.mjs';
import { NAME } from '../android/release/versions.mjs';

// 01:00 US Eastern in late November is 06:00 UTC (EST, UTC−5); in July it is 05:00 UTC (EDT).
const night = '2026-11-24T06:00:00Z';
test('the nightly yields to the desktop lane, a release and the clock', () => {
  assert.match(skipReason({ desktopLock: true, startedAt: night }), /desktop checkout/);
  assert.match(skipReason({ sisoRunning: true, startedAt: night }), /build is running/);
  assert.match(skipReason({ androidLock: true, startedAt: night }), /Android checkout/);
  assert.match(skipReason({ startedAt: '2026-11-24T08:15:00Z' }), /03:15/);
  assert.match(skipReason({ startedAt: '2026-07-14T07:15:00Z' }), /03:15/);
  assert.match(skipReason({ startedAt: '2026-11-24T19:00:00Z' }), /03:15/);
  assert.equal(skipReason({ startedAt: '2026-11-24T08:14:00Z' }), null);
  assert.equal(skipReason({ startedAt: '2026-11-24T05:00:00Z' }), null); // midnight
  assert.match(skipReason({ unchangedSinceLastPass: true, startedAt: night }), /unchanged/);
  assert.match(skipReason({ appliedUnknown: true, startedAt: night }), /last applied/);
  assert.equal(skipReason({ startedAt: night }), null);
});

test('a night passes only with a built APK and a passing gate for that APK', () => {
  const gate = { schema: 1, verdict: 'pass', apkSHA256: 'a'.repeat(64) };
  assert.equal(nightVerdict({ buildOk: true, apkSHA256: 'a'.repeat(64), gate }), 'pass');
  assert.equal(nightVerdict({ buildOk: false, apkSHA256: 'a'.repeat(64), gate }), 'fail');
  assert.equal(nightVerdict({ buildOk: true, apkSHA256: 'b'.repeat(64), gate }), 'fail');
  assert.equal(nightVerdict({ buildOk: true, apkSHA256: 'a'.repeat(64), gate: { ...gate, verdict: 'fail' } }), 'fail');
  assert.equal(nightVerdict({ buildOk: true, apkSHA256: 'a'.repeat(64), gate: null }), 'fail');
});

test('nightly builds carry a name no release can have', () => {
  assert.equal(NAME.test(NIGHTLY_NAME), false);
  assert.match(nightlyArgs('is_official_build = true\n'), /android_override_version_name = "0\.0\.0-nightly"\n/);
});
