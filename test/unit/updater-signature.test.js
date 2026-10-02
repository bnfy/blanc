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
});

test('a present-but-invalid signature is rejected (fail-closed)', async () => {
  const verify = verifierWith({
    stdout: JSON.stringify({ Status: 4, SignerCertificate: { Subject: 'CN=Bananify Creative' } }), // 4 = NotTrusted
  });
  const result = await verify(['Bananify Creative'], 'C:/x.exe');
  assert.match(result, /not valid/);
  assert.match(result, /status 4/);
});

test('an infrastructure failure defers the update for retry', async () => {
  const warnings = [];
  const verify = verifierWith(
    { error: Object.assign(new Error('spawnSync cmd.exe ETIMEDOUT'), { killed: true }) },
    { warn: (m) => warnings.push(m) },
  );
  assert.match(await verify(['Bananify Creative'], 'C:/x.exe'), /retry/);
  assert.match(warnings.join('\n'), /could not complete/);
});

test('unparseable verifier output rejects the installer', async () => {
  const verify = verifierWith({ stdout: 'not json at all' }, { warn: () => {} });
  assert.notEqual(await verify(['Bananify Creative'], 'C:/x.exe'), null);
});

test('missing configuration, certificate and malformed success output reject', async () => {
  for (const output of ['null', '[]', '{}', '{"Status":"0"}', '{"Status":0}', '{"Status":0,"SignerCertificate":{"Subject":""}}']) {
    assert.notEqual(await verifierWith({ stdout: output })(['Bananify Creative'], 'C:/x.exe'), null, output);
  }
  for (const names of [undefined, [], [''], [null]]) {
    assert.notEqual(await verifierWith({ stdout: '{"Status":0,"SignerCertificate":{"Subject":"CN=Bananify Creative"}}' })(names, 'C:/x.exe'), null);
  }
  const throws = createWindowsSignatureVerifier({ run: async () => { throw new Error('missing PowerShell'); } });
  assert.notEqual(await throws(['Bananify Creative'], 'C:/x.exe'), null);
});

test('runAuthenticodeSignature owns PowerShell directly so timeout releases the installer', async () => {
  const { runAuthenticodeSignature, SIGNATURE_TIMEOUT_MS } = require('../../src/main/updater-signature');
  let invocation;
  await runAuthenticodeSignature("C:/O'Brien/installer.exe", {
    execFileImpl: (cmd, args, options, cb) => {
      invocation = { cmd, args, options };
      cb(null, '{"Status":0}');
    },
  });
  assert.equal(invocation.cmd, 'powershell.exe');
  assert.equal(invocation.options.timeout, SIGNATURE_TIMEOUT_MS);
  assert.equal(invocation.options.shell, undefined, 'no cmd.exe parent can survive while PowerShell holds the installer');
  assert.equal(invocation.options.env.PSModulePath, '');
  assert.match(invocation.args.at(-1), /OutputEncoding/);
  assert.match(invocation.args.at(-1), /O''Brien/, 'single quotes in the literal path stay escaped');
  assert.ok(SIGNATURE_TIMEOUT_MS > 20 * 1000, 'well above electron-updater\'s 20s cliff');
});
