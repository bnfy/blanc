const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildStagingStatus, writeStagingStatus } = require('../../src/main/updater-staging-status');

test('staging status is bounded, redacted, atomic, and owner-only', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-updater-status-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'status.json');
  const status = buildStagingStatus('error', {
    currentVersion: '1.10.0',
    updateVersion: '1.11.0-staging.1',
    error: 'failed https://user:secret@example.test/feed?token=nope API_TOKEN=secret',
    at: 1000,
  });
  writeStagingStatus(file, status, { nonce: () => 'fixed' });
  const serialized = fs.readFileSync(file, 'utf8');
  assert.equal(JSON.parse(serialized).phase, 'error');
  assert.doesNotMatch(serialized, /example\.test|user:secret|token=nope|API_TOKEN=secret/i);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${file}.fixed.tmp`), false);
});
