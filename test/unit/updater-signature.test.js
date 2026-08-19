const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCommonName,
  createWindowsSignatureVerifier,
  SIGNATURE_TIMEOUT_MS,
} = require('../../src/main/updater-signature');

test('extractCommonName pulls the CN from a variety of distinguished names', () => {
  assert.equal(extractCommonName('CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US'), 'Bananify Creative');
  assert.equal(extractCommonName('Bananify Creative'), 'Bananify Creative', 'a bare name is its own CN');
  assert.equal(extractCommonName('O=Acme, CN=Deep Name, C=US'), 'Deep Name', 'CN need not be first');
  assert.equal(extractCommonName('CN="Acme, Inc.", O=Acme'), 'Acme, Inc.', 'quoted CN keeps its comma');
  assert.equal(extractCommonName('CN=Acme\\, Inc., O=Acme'), 'Acme, Inc.', 'escaped comma is preserved');
  assert.equal(extractCommonName(''), '');
  assert.equal(extractCommonName(null), '');
});

test('the generous timeout is well above electron-updater\'s 20s cliff', () => {
  assert.ok(SIGNATURE_TIMEOUT_MS >= 60 * 1000, 'timeout leaves room for a slow/loaded machine');
});

function verifierWith(result, logger) {
  return createWindowsSignatureVerifier({ run: async () => result, logger });
}

test('a valid signature by the expected publisher is trusted (null)', async () => {
  const verify = verifierWith({
    stdout: JSON.stringify({ Status: 0, SignerCertificate: { Subject: 'CN=Bananify Creative, O=Bananify Creative, C=US' } }),
  });
  assert.equal(await verify(['Bananify Creative'], 'C:/x.exe'), null);
  assert.equal(await verify(['CN=Bananify Creative, O=Bananify Creative, C=US'], 'C:/x.exe'), null, 'matches a full-DN publisherName too');
});

test('a valid signature by an unexpected publisher is rejected (fail-closed)', async () => {
  const verify = verifierWith({
    stdout: JSON.stringify({ Status: 0, SignerCertificate: { Subject: 'CN=Someone Else, O=Evil' } }),
  });
  const result = await verify(['Bananify Creative'], 'C:/x.exe');
  assert.match(result, /unexpected publisher/);
  assert.match(result, /Someone Else/);
});

test('a present-but-invalid signature is rejected (fail-closed)', async () => {
  const verify = verifierWith({
    stdout: JSON.stringify({ Status: 4, SignerCertificate: { Subject: 'CN=Bananify Creative' } }), // 4 = NotTrusted
  });
  const result = await verify(['Bananify Creative'], 'C:/x.exe');
  assert.match(result, /not valid/);
  assert.match(result, /status 4/);
});

test('an infrastructure failure (timeout) fails OPEN so a slow machine is not bricked', async () => {
  const warnings = [];
  const verify = verifierWith(
    { error: Object.assign(new Error('spawnSync cmd.exe ETIMEDOUT'), { killed: true }) },
    { warn: (m) => warnings.push(m) },
  );
  assert.equal(await verify(['Bananify Creative'], 'C:/x.exe'), null, 'update proceeds when the check itself cannot run');
  assert.match(warnings.join('\n'), /could not run/);
});

test('unparseable verifier output fails OPEN', async () => {
  const verify = verifierWith({ stdout: 'not json at all' }, { warn: () => {} });
  assert.equal(await verify(['Bananify Creative'], 'C:/x.exe'), null);
});
