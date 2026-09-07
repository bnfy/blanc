'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyRuntime } = require('../../scripts/verify-electron-runtime');
const sourceRoot = path.resolve(__dirname, '../..');
test('packaging rejects stock, stale, altered, and wrong-target runtime inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-runtime-test-'));
  try {
    fs.cpSync(path.join(sourceRoot, 'runtime/electron'), path.join(root, 'runtime/electron'), { recursive: true });
    fs.mkdirSync(path.join(root, '.runtime'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'runtime/electron/source.json'), 'utf8'));
    const archive = path.join(root, '.runtime/electron.zip');
    fs.writeFileSync(archive, 'test archive bytes');
    const record = { ...lock, platform: 'darwin', machine: 'arm64', archiveSha256: crypto.createHash('sha256').update('test archive bytes').digest('hex') };
    const recordPath = path.join(root, '.runtime/blanc-runtime-build.json');
    const write = (extra = {}) => fs.writeFileSync(recordPath, JSON.stringify({ ...record, ...extra }));
    write();
    assert.equal(verifyRuntime({ root, platform: 'darwin', arch: 'arm64' }).electronCommit, lock.electronCommit);
    assert.throws(() => verifyRuntime({ root, platform: 'linux', arch: 'x64' }), /target/);
    write({ captureProtocol: 0 });
    assert.throws(() => verifyRuntime({ root, platform: 'darwin', arch: 'arm64' }), /source mismatch/);
    write(); fs.appendFileSync(archive, 'altered');
    assert.throws(() => verifyRuntime({ root, platform: 'darwin', arch: 'arm64' }), /archive/);
    fs.unlinkSync(recordPath);
    assert.throws(() => verifyRuntime({ root, platform: 'darwin', arch: 'arm64' }), /ENOENT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
