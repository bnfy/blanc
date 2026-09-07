const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildSiteInfo, certificateErrorMessage, certificateErrorQuery,
  createCertificateObserver, isLoopbackHost, sanitizeCertificate,
} = require('../../src/main/site-security');

test('certificate metadata is bounded and contains display fields only', () => {
  const certificate = sanitizeCertificate({
    subjectName: 'example.test', issuerName: 'Test Root',
    validStart: 100, validExpiry: 200, fingerprint: 'AA:BB',
    data: 'secret raw certificate', serialNumber: 'secret',
  });
  assert.deepEqual(certificate, {
    subject: 'example.test', issuer: 'Test Root',
    validFrom: 100000, validTo: 200000, fingerprint: 'AA:BB',
  });
  assert.doesNotMatch(JSON.stringify(certificate), /secret/);
});

test('site state covers secure, certificate failure, insecure, local, internal, and neutral', () => {
  assert.equal(buildSiteInfo('https://example.com/').state, 'secure');
  assert.equal(buildSiteInfo('http://example.com/').state, 'insecure');
  assert.equal(buildSiteInfo('http://localhost:8080/').state, 'local');
  assert.equal(buildSiteInfo('blanc://newtab/').state, 'internal');
  assert.equal(buildSiteInfo('file:///tmp/test').state, 'neutral');
  assert.equal(buildSiteInfo('not a url').state, 'neutral');
  const failed = buildSiteInfo('blanc://error/', {
    certificateError: { url: 'https://bad.test/', error: 'net::ERR_CERT_AUTHORITY_INVALID' },
  });
  assert.equal(failed.state, 'certificate-error');
  assert.match(failed.summary, /not trusted/);
});

test('loopback classification is narrow', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('foo.localhost'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('localhost.example'), false);
});

test('observer records success but always delegates the decision to Chromium', () => {
  let verify;
  const browsingSession = { setCertificateVerifyProc(fn) { verify = fn; } };
  const observer = createCertificateObserver();
  observer.observe(browsingSession);
  observer.observe(browsingSession);
  let decision;
  verify({
    hostname: 'Example.COM', verificationResult: 'OK', isIssuedByKnownRoot: true,
    validatedCertificate: { subjectName: 'example.com' },
  }, (value) => { decision = value; });
  assert.equal(decision, -3);
  assert.equal(observer.get(browsingSession, 'https://example.com/').certificate.subject, 'example.com');
});

test('certificate query is dedicated, display-only, and contains no bypass', () => {
  const query = certificateErrorQuery({
    url: 'https://bad.test/', error: 'net::ERR_CERT_DATE_INVALID',
    certificate: { subject: 'bad.test', issuer: 'Expired CA', validTo: 1000 },
  }, { code: -201, desc: 'certificate error' });
  assert.equal(query.get('kind'), 'certificate');
  assert.equal(query.get('subject'), 'bad.test');
  assert.match(certificateErrorMessage(query.get('certError')), /expired/);
  assert.doesNotMatch(query.toString(), /proceed|bypass|raw/i);
});
