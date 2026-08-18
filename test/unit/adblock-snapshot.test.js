'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadVerifiedAdblockSnapshot,
  adblockCacheName,
} = require('../../src/main/adblock-snapshot');

const SOURCES = path.resolve(__dirname, '../../adblock/sources');
const ROOT = path.resolve(__dirname, '../..');

test('Git preserves byte-verified blocker inputs as LF on Windows', () => {
  const attributes = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  for (const rule of [
    '/adblock/sources/*.txt text eol=lf',
    '/adblock/sources/pinned.json text eol=lf',
    '/adblock/generated/*.json text eol=lf',
  ]) {
    assert.ok(attributes.split(/\r?\n/).includes(rule), `missing Git attribute: ${rule}`);
  }
});

test('release-pinned desktop lists match their manifest', () => {
  const snapshot = loadVerifiedAdblockSnapshot(SOURCES);
  assert.equal(snapshot.digest.length, 64);
  assert.equal(snapshot.sourceDate, '2026-07-09');
  assert.equal(
    adblockCacheName(snapshot.digest),
    `adblock-engine.v3.${snapshot.digest.slice(0, 16)}.bin`
  );
});

test('a modified bundled list fails closed before parsing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-adblock-snapshot-'));
  try {
    for (const file of ['pinned.json', 'easylist.txt', 'easyprivacy.txt']) {
      fs.copyFileSync(path.join(SOURCES, file), path.join(dir, file));
    }
    fs.appendFileSync(path.join(dir, 'easylist.txt'), '\n||tampered.invalid^');
    assert.throws(
      () => loadVerifiedAdblockSnapshot(dir),
      /hash mismatch/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
