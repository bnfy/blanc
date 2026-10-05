'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ELIGIBLE_CERTIFICATE_ERRORS, originKey, isTimeValid,
  createCertificateExceptions,
} = require('../../src/main/certificate-exceptions');

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const cert = (over = {}) => ({
  subject: 'nas.home.arpa', issuer: 'nas.home.arpa', fingerprint: 'sha256/AAA',
  validFrom: NOW - DAY, validTo: NOW + DAY, ...over,
});
const URL_A = 'https://nas.home.arpa:8006/';
const ERR = 'net::ERR_CERT_AUTHORITY_INVALID';
const eligible = { url: URL_A, error: ERR, certificate: cert(), verifiedThisRun: false };

test('origin keys default the port and lower-case the host', () => {
  assert.equal(originKey('https://NAS.home.arpa/x'), 'https://nas.home.arpa:443');
  assert.equal(originKey('https://[fd00::1]:8443/'), 'https://[fd00::1]:8443');
  assert.equal(originKey('http://nas.home.arpa/'), null);
  assert.equal(originKey('nonsense'), null);
});

test('eligibility follows host, error allowlist, certificate shape and run history', () => {
  const store = createCertificateExceptions();
  assert.equal(store.isEligible(eligible), true);
  for (const error of ELIGIBLE_CERTIFICATE_ERRORS) {
    assert.equal(store.isEligible({ ...eligible, error: `net::${error}` }), true, error);
  }
  for (const error of ['net::ERR_CERT_INVALID', 'net::ERR_CERT_REVOKED',
    'net::ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN', 'net::ERR_CERT_KNOWN_INTERCEPTION_BLOCKED', '']) {
    assert.equal(store.isEligible({ ...eligible, error }), false, error);
  }
  assert.equal(store.isEligible({ ...eligible, url: 'https://example.com/' }), false);
  assert.equal(store.isEligible({ ...eligible, url: 'http://nas.home.arpa/' }), false);
  assert.equal(store.isEligible({ ...eligible, verifiedThisRun: true }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: cert({ fingerprint: null }) }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: cert({ validTo: null }) }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: null }), false);
});

test('matches requires origin, fingerprint, error, session and unchanged validity', () => {
  const store = createCertificateExceptions();
  const s1 = {}; const s2 = {};
  assert.equal(store.allow(s1, { url: URL_A, error: ERR, certificate: cert(), now: NOW }), true);
  const req = { url: 'https://nas.home.arpa:8006/js/app.js', error: ERR, certificate: cert(), now: NOW };
  assert.equal(store.matches(s1, req), true);
  assert.equal(store.matches(s2, req), false, 'other session (private/profile)');
  assert.equal(store.matches(s1, { ...req, url: 'https://nas.home.arpa:8007/' }), false, 'port');
  assert.equal(store.matches(s1, { ...req, url: 'https://other.home.arpa:8006/' }), false, 'host');
  assert.equal(store.matches(s1, { ...req, certificate: cert({ fingerprint: 'sha256/BBB' }) }), false, 'fingerprint');
  assert.equal(store.matches(s1, { ...req, error: 'net::ERR_CERT_COMMON_NAME_INVALID' }), false, 'error');
  assert.deepEqual(store.get(s1, URL_A), { error: ERR, certificate: cert() });
  assert.equal(store.get(s2, URL_A), null);
});

test('crossing validTo ends the match even though the error string is unchanged', () => {
  const store = createCertificateExceptions();
  const s = {};
  const c = cert({ validTo: NOW + 1000 });
  store.allow(s, { url: URL_A, error: ERR, certificate: c, now: NOW });
  assert.equal(store.matches(s, { url: URL_A, error: ERR, certificate: c, now: NOW + 1000 }), true);
  assert.equal(store.matches(s, { url: URL_A, error: ERR, certificate: c, now: NOW + 1001 }), false);
});

test('crossing validFrom ends a match made while not yet valid', () => {
  const store = createCertificateExceptions();
  const s = {};
  const c = cert({ validFrom: NOW + 1000, validTo: NOW + DAY });
  store.allow(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW });
  assert.equal(store.matches(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW + 999 }), true);
  assert.equal(store.matches(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW + 1000 }), false);
  assert.equal(isTimeValid(c, NOW + 1000), true);
});

test('allow refuses ineligible input; forget and clear are scoped', () => {
  const store = createCertificateExceptions();
  const s1 = {}; const s2 = {};
  assert.equal(store.allow(s1, { url: 'https://example.com/', error: ERR, certificate: cert(), now: NOW }), false);
  store.allow(s1, { url: URL_A, error: ERR, certificate: cert(), now: NOW });
  store.allow(s1, { url: 'https://10.0.0.2/', error: ERR, certificate: cert(), now: NOW });
  store.allow(s2, { url: URL_A, error: ERR, certificate: cert(), now: NOW });
  assert.equal(store.forget(s1, URL_A), true);
  assert.equal(store.forget(s1, URL_A), false);
  assert.ok(store.get(s1, 'https://10.0.0.2/'));
  store.clear(s1);
  assert.equal(store.get(s1, 'https://10.0.0.2/'), null);
  assert.ok(store.get(s2, URL_A), 'clear leaves other sessions');
});

test('the cap evicts the oldest origin and reports the session', () => {
  const evicted = [];
  const store = createCertificateExceptions({ cap: 2, onEvict: (s) => evicted.push(s) });
  const s = {};
  for (const host of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
    store.allow(s, { url: `https://${host}/`, error: ERR, certificate: cert(), now: NOW });
  }
  assert.equal(store.get(s, 'https://10.0.0.1/'), null);
  assert.ok(store.get(s, 'https://10.0.0.3/'));
  assert.deepEqual(evicted, [s]);
  store.setCapForTest(1);
  assert.equal(store.get(s, 'https://10.0.0.2/'), null, 'lowering the cap evicts immediately');
  assert.equal(evicted.length, 2);
});

