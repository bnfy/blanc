// test/unit/patron-model.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readBenefitId, resolveKind, parseExpiresAt } = require('../../src/main/patron-model');

const ALLOW = { ben_supporter: 'founding', ben_annual: 'subscription', ben_monthly: 'subscription', ben_lifetime: 'lifetime' };

test('readBenefitId reads root, nested license_key, and nested activation', () => {
  assert.equal(readBenefitId({ benefit_id: 'a' }), 'a');
  assert.equal(readBenefitId({ license_key: { benefit_id: 'b' } }), 'b');
  assert.equal(readBenefitId({ activation: { license_key: { benefit_id: 'c' } } }), 'c');
  assert.equal(readBenefitId({}), null);
  assert.equal(readBenefitId(null), null);
});

test('resolveKind maps known benefits', () => {
  assert.equal(resolveKind('ben_supporter', ALLOW), 'founding');
  assert.equal(resolveKind('ben_annual', ALLOW), 'subscription');
  assert.equal(resolveKind('ben_lifetime', ALLOW), 'lifetime');
});

test('resolveKind fails closed on unknown, empty, non-string, and inherited props', () => {
  assert.equal(resolveKind('ben_unknown', ALLOW), null);
  assert.equal(resolveKind('', ALLOW), null);
  assert.equal(resolveKind(null, ALLOW), null);
  assert.equal(resolveKind(42, ALLOW), null);
  // prototype-property inputs must NOT resolve to a truthy inherited value
  assert.equal(resolveKind('toString', ALLOW), null);
  assert.equal(resolveKind('constructor', ALLOW), null);
  assert.equal(resolveKind('__proto__', ALLOW), null);
  // a benefit mapped to a NON-kind value must not leak through
  assert.equal(resolveKind('x', { x: 'not_a_kind' }), null);
});

test('parseExpiresAt: three states — null (absent), number (valid), false (malformed)', () => {
  // absent / falsy → null (no expiry set)
  assert.strictEqual(parseExpiresAt(null), null);
  assert.strictEqual(parseExpiresAt(undefined), null);
  assert.strictEqual(parseExpiresAt(''), null);
  // valid ISO string → epoch-ms
  assert.strictEqual(parseExpiresAt('2026-12-31T00:00:00Z'), Date.parse('2026-12-31T00:00:00Z'));
  // present but malformed → false
  assert.strictEqual(parseExpiresAt('not-a-date'), false);  // Date.parse returns NaN
  assert.strictEqual(parseExpiresAt(12345), false);          // wrong type
  assert.strictEqual(parseExpiresAt(true), false);           // wrong type
});

const { evaluateValidation, isRecordActive, GRACE_MS } = require('../../src/main/patron-model');

const sub = (over = {}) => ({
  kind: 'subscription', key: 'k', activationId: 'a', benefitId: 'ben_annual',
  activatedAt: 0, lastValidatedAt: 1000, lastAttemptedAt: 1000, lastStatus: 'granted', ...over,
});

test('isRecordActive: founding/lifetime always active; subscription needs granted + within grace', () => {
  assert.equal(isRecordActive({ kind: 'founding' }, 9e15), true);
  assert.equal(isRecordActive({ kind: 'lifetime' }, 9e15), true);
  assert.equal(isRecordActive(null, 0), false);
  // restart with a granted record still within grace → active WITHOUT any network call
  assert.equal(isRecordActive(sub({ lastValidatedAt: 1000 }), 1000 + GRACE_MS), true);
  // past grace → inactive
  assert.equal(isRecordActive(sub({ lastValidatedAt: 1000 }), 1000 + GRACE_MS + 1), false);
  // last confirmed status not granted → inactive regardless of grace
  assert.equal(isRecordActive(sub({ lastStatus: 'revoked', lastValidatedAt: 9e15 }), 9e15), false);
});

test('granted + unexpired + benefitOk → active, advances lastValidatedAt', () => {
  const now = 5000;
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now + 1, benefitOk: true }, record: sub(), now });
  assert.equal(r.active, true);
  assert.equal(r.record.lastValidatedAt, now);
  assert.equal(r.record.lastStatus, 'granted');
});

test('revoked, expired, and benefit mismatch each degrade', () => {
  const now = 5000;
  assert.equal(evaluateValidation({ outcome: { kind: 'ok', status: 'revoked', expiresAt: null, benefitOk: true }, record: sub(), now }).active, false);
  assert.equal(evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now - 1, benefitOk: true }, record: sub(), now }).active, false);
  const mismatch = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now + 1, benefitOk: false }, record: sub(), now });
  assert.equal(mismatch.active, false);
  assert.equal(mismatch.record.lastStatus, 'benefit_mismatch');
});

test('malformed expiry (false) is ambiguous, not a terminal expired state', () => {
  const now = 5000;
  const malformed = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: false, benefitOk: true }, record: sub(), now });
  assert.equal(malformed.active, true);
  assert.equal(malformed.record.lastValidatedAt, 1000); // unchanged — treated as ambiguous
  assert.equal(malformed.record.lastStatus, 'granted'); // unchanged — rides grace
});

test('unknown status and unreachable ride the grace, do not advance lastValidatedAt', () => {
  const withinNow = 1000 + GRACE_MS;
  const unknown = evaluateValidation({ outcome: { kind: 'ok', status: 'weird_new', expiresAt: null, benefitOk: true }, record: sub(), now: withinNow });
  assert.equal(unknown.active, true);
  assert.equal(unknown.record.lastValidatedAt, 1000); // unchanged
  assert.equal(unknown.record.lastStatus, 'granted'); // unchanged
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: withinNow }).active, true);
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: 1000 + GRACE_MS + 1 }).active, false);
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: withinNow }).record.lastAttemptedAt, withinNow);
});
