import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NAME, nextRelease, tagFor, validateLedger } from '../android/release/versions.mjs';

const ledger = (...builds) => ({ schema: 1, builds });
const entry = (versionCode, overrides = {}) => ({
  versionCode,
  versionName: `1.0.0-beta.${versionCode}`,
  tag: `android-v1.0.0-beta.${versionCode}-${versionCode}`,
  commit: 'a'.repeat(40),
  state: 'built',
  date: '2026-11-15',
  note: '',
  ...overrides,
});

test('the checked-in Android release ledger is valid, and its codes run from 1 without a gap', () => {
  const checkedIn = JSON.parse(fs.readFileSync(new URL('../android/release/ledger.json', import.meta.url), 'utf8'));
  assert.equal(validateLedger(checkedIn), undefined);
  assert.deepEqual(checkedIn.builds.map(build => build.versionCode), checkedIn.builds.map((_, index) => index + 1));
  // The first row is the first upload: 1.0.0-beta.1, version code 1.
  assert.deepEqual([checkedIn.builds[0].versionName, checkedIn.builds[0].tag, checkedIn.builds[0].state], ['1.0.0-beta.1', 'android-v1.0.0-beta.1-1', 'uploaded']);
});

test('the first Android release gets code 1 and its versioned tag', () => {
  const initial = ledger();
  assert.deepEqual(nextRelease(initial, '1.0.0-beta.1'), {
    versionCode: 1, versionName: '1.0.0-beta.1', tag: 'android-v1.0.0-beta.1-1',
  });
  assert.deepEqual(initial, ledger());
});

test('ledger codes start at 1 and increase by exactly 1', () => {
  assert.equal(validateLedger(ledger(entry(1), entry(2), entry(3))), undefined);
  for (const codes of [[0], [2], [1, 3], [1, 1], [2, 1], [1, 2.5]]) {
    assert.throws(() => validateLedger(ledger(...codes.map(code => entry(code)))), /versionCode/, String(codes));
  }
});

test('an abandoned code is consumed and the next release gets code 3', () => {
  const history = ledger(entry(1, { state: 'uploaded' }), entry(2, { state: 'abandoned' }));
  const before = structuredClone(history);
  assert.deepEqual(nextRelease(history, '1.0.0-beta.3'), {
    versionCode: 3, versionName: '1.0.0-beta.3', tag: 'android-v1.0.0-beta.3-3',
  });
  assert.deepEqual(history, before);
});

test('an abandoned version name can be retried with a new code', () => {
  const history = ledger(entry(1, { state: 'abandoned' }));
  const retry = nextRelease(history, '1.0.0-beta.1');
  assert.deepEqual(retry, {
    versionCode: 2, versionName: '1.0.0-beta.1', tag: 'android-v1.0.0-beta.1-2',
  });
  assert.equal(validateLedger(ledger(...history.builds, entry(2, retry))), undefined);
});

test('built and uploaded version names cannot be reused', () => {
  for (const state of ['built', 'uploaded']) {
    const history = ledger(entry(1, { state }));
    assert.throws(() => nextRelease(history, '1.0.0-beta.1'), /versionName.*abandoned/);
    assert.throws(() => validateLedger(ledger(...history.builds, entry(2, {
      versionName: '1.0.0-beta.1', tag: 'android-v1.0.0-beta.1-2',
    }))), /versionName.*abandoned/);
  }
});

test('every previous use of a retried version name must be abandoned', () => {
  const first = entry(1, { state: 'abandoned' });
  const second = entry(2, { versionName: first.versionName, tag: 'android-v1.0.0-beta.1-2', state: 'abandoned' });
  const third = entry(3, { versionName: first.versionName, tag: 'android-v1.0.0-beta.1-3' });
  assert.equal(validateLedger(ledger(first, second, third)), undefined);
  assert.throws(() => nextRelease(ledger(first, second, third), first.versionName), /versionName.*abandoned/);
});

test('version helpers and the ledger reject names outside the Android beta format', () => {
  assert.equal(NAME.source, /^1\.0\.0-beta\.[1-9]\d*$/.source);
  assert.equal(tagFor('1.0.0-beta.12', 23), 'android-v1.0.0-beta.12-23');
  for (const versionName of ['', '1.0.0', '2.0.0-beta.1', '1.0.0-beta.0', '1.0.0-beta.01', '1.0.0-beta.-1', '1.0.0-beta.1\n', null, 1]) {
    assert.throws(() => tagFor(versionName, 1), /versionName/);
    assert.throws(() => nextRelease(ledger(), versionName), /versionName/);
    assert.throws(() => validateLedger(ledger(entry(1, { versionName }))), /versionName/);
  }
});

test('tagFor rejects codes that are not positive safe integers', () => {
  for (const versionCode of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
    assert.throws(() => tagFor('1.0.0-beta.1', versionCode), /versionCode/);
  }
});

test('duplicate tags are rejected', () => {
  assert.throws(() => validateLedger(ledger(entry(1), entry(2, { tag: entry(1).tag }))), /duplicate tag/);
});

test('a ledger tag must match its version name and code', () => {
  for (const tag of ['', null, 'android-v1.0.0-beta.2-1', 'android-v1.0.0-beta.1-2']) {
    assert.throws(() => validateLedger(ledger(entry(1, { tag }))), /tag/);
  }
});

test('invalid ledger schemas are rejected before selecting the next release', () => {
  for (const invalid of [null, [], {}, { schema: 2, builds: [] }, { schema: 1 }, { schema: 1, builds: {} }]) {
    assert.throws(() => validateLedger(invalid), /ledger/);
    assert.throws(() => nextRelease(invalid, '1.0.0-beta.1'), /ledger/);
  }
  assert.throws(() => nextRelease(ledger(entry(1), entry(3)), '1.0.0-beta.4'), /versionCode/);
});

test('ledger entries require all release metadata with valid field types', () => {
  for (const field of Object.keys(entry(1))) {
    const incomplete = entry(1);
    delete incomplete[field];
    assert.throws(() => validateLedger(ledger(incomplete)), new RegExp(field), field);
  }
  for (const invalid of [null, [], 'build', ...[
    { commit: 'abc123' }, { commit: 'z'.repeat(40) }, { commit: null },
    { state: 'pending' }, { state: null }, { note: null }, { note: 1 },
  ].map(overrides => entry(1, overrides))]) {
    assert.throws(() => validateLedger(ledger(invalid)), /entry|commit|state|note/);
  }
});

test('ledger dates are real ISO calendar dates', () => {
  assert.equal(validateLedger(ledger(entry(1, { date: '2024-02-29' }))), undefined);
  for (const date of [null, '', '2026-2-01', '2026-02-29', '2026-02-30', '2026-13-01']) {
    assert.throws(() => validateLedger(ledger(entry(1, { date }))), /date/, String(date));
  }
});

test('ledger dates also accept canonical ISO timestamps', () => {
  assert.equal(validateLedger(ledger(entry(1, { date: '2026-11-15T12:34:56.789Z' }))), undefined);
  for (const date of ['2026-02-30T12:34:56.789Z', '2026-11-15T12:34:56.789Z\n', '2026-11-15T12:34:56.789+00:00']) {
    assert.throws(() => validateLedger(ledger(entry(1, { date }))), /date/, date);
  }
});
