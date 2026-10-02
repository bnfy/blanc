const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createWindowsSignatureVerifier } = require('../../src/main/updater-signature');
const { createWindowsUpdateTrustGate } = require('../../src/main/windows-update-trust');
if (process.platform !== 'win32') throw new Error('native Windows verifier test only');
(async () => {
  const evidence = JSON.parse(fs.readFileSync('dist/windows-signature.json', 'utf8'));
  const file = path.resolve('dist', evidence.artifact);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(digest, evidence.sha256);
  const verify = createWindowsSignatureVerifier();
  assert.equal(await verify([evidence.publisher], file), null, 'real PowerShell accepts the signed candidate');
  assert.notEqual(await verify(['Blanc synthetic unexpected publisher'], file), null);
  assert.notEqual(await verify([evidence.publisher], `${file}.missing`), null);
  const updater = new EventEmitter();
  updater.on('error', () => {});
  let installs = 0;
  let armed = 0;
  Object.assign(updater, {
    installerPath: file, configOnDisk: { value: Promise.resolve({ publisherName: [evidence.publisher] }) },
    install: () => { installs++; return true; }, addQuitHandler: () => armed++,
  });
  const gate = createWindowsUpdateTrustGate({ autoUpdater: updater });
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.install(false, true), false);
  assert.equal(installs, 0);
  assert.equal(await gate.acceptDownloaded({ downloadedFile: file }), null, 'cache from another process is verified with real PowerShell');
  assert.equal(armed, 1);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.install(false, true), true);
  assert.equal(installs, 1, 'delegates to installer seam; this test never executes NSIS');
  console.log('native Windows trust: signed bytes, actual verifier, unexpected publisher, missing file and cached install gate passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
