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
