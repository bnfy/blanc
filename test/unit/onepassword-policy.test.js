'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AUTOFILL,
  PICKER_MAX,
  websiteMatch,
  rankMatches,
  selectFields,
  buildInspectScript,
  buildFillScript,
} = require('../../src/main/onepassword-policy');

const website = (url, autofillBehavior = AUTOFILL.ANYWHERE) => ({ url, autofillBehavior });

test('AnywhereOnWebsite matches only the saved host and its descendants', () => {
  assert.equal(websiteMatch(website('example.com'), 'https://example.com/login')?.tier, 1);
  assert.equal(websiteMatch(website('example.com'), 'https://login.example.com/')?.tier, 2);
  assert.equal(websiteMatch(website('login.example.com'), 'https://example.com/'), null);
  assert.equal(websiteMatch(website('one.example.com'), 'https://two.example.com/'), null);
  assert.equal(websiteMatch(website('example.com'), 'https://example.com.evil.test/'), null);
});

test('ExactDomain includes effective port and Never always fails closed', () => {
  assert.ok(websiteMatch(website('https://example.com', AUTOFILL.EXACT), 'https://example.com/path'));
  assert.equal(websiteMatch(website('https://example.com', AUTOFILL.EXACT), 'http://example.com/'), null);
  assert.ok(websiteMatch(website('https://example.com:8443', AUTOFILL.EXACT), 'https://example.com:8443/'));
  assert.equal(websiteMatch(website('https://example.com:8443', AUTOFILL.EXACT), 'https://example.com/'), null);
  assert.equal(websiteMatch(website('example.com', AUTOFILL.NEVER), 'https://example.com/'), null);
  assert.equal(websiteMatch(website('example.com', 'FutureBehavior'), 'https://example.com/'), null);
});

test('ranking is deterministic, exact-first, and bounded', () => {
  const candidates = Array.from({ length: PICKER_MAX + 3 }, (_, index) => ({
    vaultId: 'v', itemId: `item-${index}`, title: `Login ${index}`,
    vaultName: 'Personal', updatedAt: new Date(2026, 0, index + 1).toISOString(),
    websites: [website('example.com')],
  }));
  candidates.push({
    vaultId: 'v', itemId: 'exact', title: 'Exact', vaultName: 'Personal',
    updatedAt: new Date(2020, 0, 1).toISOString(),
    websites: [website('https://login.example.com', AUTOFILL.EXACT)],
  });
  const result = rankMatches(candidates, 'https://login.example.com/');
  assert.equal(result.kept.length, PICKER_MAX);
  assert.equal(result.kept[0].itemId, 'exact');
  assert.equal(result.truncated, 4);
});

const candidate = (i, type, extra = {}) => ({
  i, type, formKey: 0, isVisible: true, isFocused: false,
  autocomplete: '', name: '', id: '', placeholder: '', ariaLabel: '',
  labelText: '', formText: 'Sign in', inSearchScope: false, ...extra,
});

test('field policy prefers explicit current-password and username annotations', () => {
  assert.deepEqual(selectFields([
    candidate(0, 'text', { autocomplete: 'section-login username' }),
    candidate(1, 'password', { autocomplete: 'current-password' }),
  ]), { passwordIndex: 1, usernameIndex: 0, passwordBasis: 'authoritative' });
});

test('field policy refuses signup/new-password pages and does not fill a username alone', () => {
  assert.deepEqual(selectFields([
    candidate(0, 'email', { autocomplete: 'username', formText: 'Create account' }),
    candidate(1, 'password', { autocomplete: 'new-password', formText: 'Create account' }),
    candidate(2, 'password', { labelText: 'Confirm password', formText: 'Create account' }),
  ]), { passwordIndex: null, usernameIndex: null, passwordBasis: null });
});

test('inspect is credential-free and fill spends its isolated-world authorization first', () => {
  const inspect = buildInspectScript({
    expectedURL: 'https://example.com/login', expectedTimeOrigin: 123, nonce: 'nonce',
  });
  assert.doesNotMatch(inspect, /hunter2|alice@example/);
  const fill = buildFillScript({
    expectedURL: 'https://example.com/login', expectedTimeOrigin: 123,
    nonce: 'nonce', username: 'alice@example.test', password: 'hunter2',
  });
  assert.match(fill, /globalThis\.__blancOnePasswordFill = null/);
  assert.ok(fill.indexOf('globalThis.__blancOnePasswordFill = null') < fill.indexOf('location.href !=='));
  assert.match(fill, /alice@example\.test/);
  assert.match(fill, /hunter2/);
});
