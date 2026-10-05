const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildSiteInfo, certificateErrorMessage, certificateErrorQuery,
  createCertificateObserver, isLocalNetworkHost, isLoopbackHost, sanitizeCertificate,
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

test('certificate query offers continue only when main says the failure is eligible', () => {
  const record = {
    url: 'https://bad.test/', error: 'net::ERR_CERT_DATE_INVALID',
    certificate: { subject: 'bad.test', issuer: 'Expired CA', validTo: 1000 },
  };
  const publicQuery = certificateErrorQuery(record, { code: -201, desc: 'certificate error' });
  assert.equal(publicQuery.get('kind'), 'certificate');
  assert.equal(publicQuery.get('subject'), 'bad.test');
  assert.match(certificateErrorMessage(publicQuery.get('certError')), /expired/);
  assert.equal(publicQuery.has('continue'), false);
  assert.doesNotMatch(publicQuery.toString(), /proceed|bypass|raw|fingerprint/i);

  const localQuery = certificateErrorQuery(
    { ...record, url: 'https://192.168.1.5:8006/' }, { code: -202 }, { canContinue: true });
  assert.equal(localQuery.get('continue'), '1');
  assert.doesNotMatch(localQuery.toString(), /fingerprint/i);
});

test('site info reports a document loaded past a certificate warning', () => {
  const certificate = { subject: 'nas.home.arpa', issuer: 'nas.home.arpa', validFrom: 1, validTo: 2, fingerprint: 'sha256/AAA' };
  const info = buildSiteInfo('https://nas.home.arpa:8006/', {
    certificateException: { origin: 'https://nas.home.arpa:8006', certificate },
  });
  assert.equal(info.state, 'certificate-exception');
  assert.equal(info.title, 'Not secure');
  assert.equal(info.summary,
    'You chose to continue even though this site’s certificate isn’t trusted. Blanc will warn you again after it restarts.');
  assert.deepEqual(info.certificate, certificate);
  const errored = buildSiteInfo('https://nas.home.arpa:8006/', {
    certificateError: { url: 'https://nas.home.arpa:8006/', error: 'net::ERR_CERT_AUTHORITY_INVALID', certificate },
    certificateException: { origin: 'https://nas.home.arpa:8006', certificate },
  });
  assert.equal(errored.state, 'certificate-error', 'a live error outranks a stale document record');
});

test('local-network hosts: private, link-local, CGNAT, IPv6 and local-use names', () => {
  const yes = [
    'localhost', 'app.localhost', '127.0.0.1', '[::1]',
    '10.0.0.0', '10.255.255.255',
    '172.16.0.0', '172.31.255.255',
    '192.168.0.1', '192.168.255.255',
    '169.254.1.1',
    '100.64.0.0', '100.127.255.255',
    '[fd00::1]', '[fc00::]', 'fd12:3456::1', '[fe80::1]', '[febf::1]',
    'proxmox', 'nas.local', 'router.lan', 'svc.internal', 'nas.home.arpa', 'NAS.HOME.ARPA',
  ];
  const no = [
    '', 'example.com', '8.8.8.8', '172.15.255.255', '172.32.0.0',
    '100.63.255.255', '100.128.0.0', '192.169.0.1', '11.0.0.1',
    '[2001:db8::1]', '[fec0::1]', 'badcert.test', 'lan.example.com',
    'local.example.com', 'home.arpa.example.com', '256.1.1.1', '10.0.0',
  ];
  for (const host of yes) assert.equal(isLocalNetworkHost(host), true, host);
  for (const host of no) assert.equal(isLocalNetworkHost(host), false, host);
});

test('observer remembers hosts verified this run even after a later failure', () => {
  const observer = createCertificateObserver();
  let proc;
  const browsingSession = { setCertificateVerifyProc: (fn) => { proc = fn; } };
  const other = { setCertificateVerifyProc: () => {} };
  observer.observe(browsingSession);
  observer.observe(other);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'https://nas.home.arpa/'), false);
  proc({ hostname: 'nas.home.arpa', verificationResult: 'OK' }, () => {});
  proc({ hostname: 'nas.home.arpa', verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID' }, () => {});
  assert.equal(observer.get(browsingSession, 'https://nas.home.arpa/'), null);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'https://nas.home.arpa:8006/x'), true);
  assert.equal(observer.wasVerifiedThisRun(other, 'https://nas.home.arpa/'), false);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'not a url'), false);
});
