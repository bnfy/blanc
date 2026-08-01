const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLoopbackHost,
  sanitizeCertificate,
  certificateErrorMessage,
  createCertificateObserver,
  buildSiteInfo,
  certificateErrorQuery,
  MAX_CERTIFICATE_RECORDS,
} = require('../../src/main/site-security');

const CERTIFICATE = {
  subjectName: 'secure.example',
  issuerName: 'Example Root',
  validStart: 1_700_000_000,
  validExpiry: 1_900_000_000,
  fingerprint: 'AA:BB:CC',
  data: 'PEM MUST NOT CROSS',
  serialNumber: 'SECRETLY NOISY',
};

test('certificate sanitizer projects only bounded display metadata', () => {
  assert.deepEqual(sanitizeCertificate(CERTIFICATE), {
    subject: 'secure.example',
    issuer: 'Example Root',
    validFrom: 1_700_000_000_000,
    validTo: 1_900_000_000_000,
    fingerprint: 'AA:BB:CC',
  });
  assert.equal(JSON.stringify(sanitizeCertificate(CERTIFICATE)).includes('PEM'), false);
});

test('observer records trusted certificate metadata but delegates the decision to Chromium', () => {
  let verify;
  const session = {
    setCertificateVerifyProc(fn) { verify = fn; },
  };
  const observer = createCertificateObserver();
  observer.observe(session);

  let callbackValue = null;
  verify({
    hostname: 'secure.example',
    certificate: CERTIFICATE,
    validatedCertificate: CERTIFICATE,
    verificationResult: 'OK',
    isIssuedByKnownRoot: true,
  }, (value) => { callbackValue = value; });

  assert.equal(callbackValue, -3, 'must preserve Chromium verification and CT');
  assert.equal(observer.get(session, 'https://secure.example/path').certificate.issuer, 'Example Root');
  assert.equal(observer.get(session, 'http://secure.example/'), null);
});

test('observer drops failed verification records and still delegates to Chromium', () => {
  let verify;
  const session = { setCertificateVerifyProc(fn) { verify = fn; } };
  const observer = createCertificateObserver();
  observer.observe(session);
  verify({
    hostname: 'bad.example',
    certificate: CERTIFICATE,
    verificationResult: 'ERR_CERT_REVOKED',
  }, (value) => assert.equal(value, -3));
  assert.equal(observer.get(session, 'https://bad.example/'), null);
});

test('observer keeps a bounded most-recent certificate working set', () => {
  let verify;
  const session = { setCertificateVerifyProc(fn) { verify = fn; } };
  const observer = createCertificateObserver();
  observer.observe(session);

  for (let i = 0; i <= MAX_CERTIFICATE_RECORDS; i++) {
    verify({
      hostname: `host-${i}.example`,
      certificate: CERTIFICATE,
      verificationResult: 'OK',
    }, () => {});
  }

  assert.equal(observer.get(session, 'https://host-0.example/'), null);
  assert.ok(observer.get(
    session,
    `https://host-${MAX_CERTIFICATE_RECORDS}.example/`
  ));
});

test('site information distinguishes secure, insecure, loopback, and internal pages', () => {
  const certRecord = { certificate: sanitizeCertificate(CERTIFICATE), isIssuedByKnownRoot: true };
  assert.equal(buildSiteInfo('https://secure.example/', { certificateRecord: certRecord }).state, 'secure');
  assert.equal(buildSiteInfo('http://plain.example/').state, 'insecure');
  assert.equal(buildSiteInfo('http://localhost:3000/').state, 'local');
  assert.equal(buildSiteInfo('http://127.0.0.2/').state, 'local');
  assert.equal(buildSiteInfo('blanc://newtab/').state, 'internal');
  assert.equal(isLoopbackHost('not-localhost.example'), false);
});

test('certificate errors carry a non-bypassable explanation and bounded query data', () => {
  const record = {
    url: 'https://expired.example/',
    error: 'net::ERR_CERT_DATE_INVALID',
    certificate: sanitizeCertificate(CERTIFICATE),
  };
  const info = buildSiteInfo('blanc://error/', { certificateError: record });
  assert.equal(info.state, 'certificate-error');
  assert.equal(info.summary, 'The certificate is expired or not valid yet.');
  assert.equal(
    certificateErrorMessage('net::ERR_CERT_COMMON_NAME_INVALID'),
    'The certificate does not match this site.'
  );
  const query = certificateErrorQuery(record, { code: -201, desc: 'certificate error' });
  assert.equal(query.get('kind'), 'certificate');
  assert.equal(query.get('issuer'), 'Example Root');
  assert.equal(query.has('proceed'), false);
  assert.equal(query.toString().includes('PEM'), false);
});
