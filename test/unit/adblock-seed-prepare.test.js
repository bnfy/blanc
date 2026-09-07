'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('clean checkout prepares the pinned seed and rejects changed manifests', () => {
  const root = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-seed-prepare-'));
  try {
    fs.cpSync(path.join(root, 'adblock'), path.join(dir, 'adblock'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/main/assets'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
    const manifestPath = path.join(dir, 'src/main/assets/adblock-engine-seed.json');
    const binaryPath = path.join(dir, 'src/main/assets/adblock-engine-seed.bin');
    const original = fs.readFileSync(path.join(root, 'src/main/assets/adblock-engine-seed.json'));
    fs.writeFileSync(manifestPath, original);
    const run = (...args) => spawnSync(process.execPath, ['adblock/seed.mjs', ...args], {
      cwd: dir, encoding: 'utf8', timeout: 30000,
    });

    assert.equal(fs.existsSync(binaryPath), false);
    const prepared = run('--prepare');
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.deepEqual(fs.readFileSync(manifestPath), original, 'setup must not rewrite the pin');
    assert.equal(run('--check').status, 0);

    fs.writeFileSync(binaryPath, 'corrupt generated output');
    assert.notEqual(run('--check').status, 0, 'verification must still reject corrupt output');
    const changed = JSON.parse(original);
    changed.sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(changed));
    const rejected = run('--prepare');
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /manifest mismatch/);
    assert.equal(fs.readFileSync(binaryPath, 'utf8'), 'corrupt generated output',
      'failed preparation must not replace output');
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), changed,
      'failed preparation must not silently approve the changed manifest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
