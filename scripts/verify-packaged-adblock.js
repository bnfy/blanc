'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { extractFile } = require('@electron/asar');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'adblock/sources/pinned.json',
  'adblock/sources/easylist.txt',
  'adblock/sources/easyprivacy.txt',
];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const archiveMemberPath = (relativePath, separator = path.sep) => (
  relativePath.split('/').join(separator)
);

function verifyPackagedAdblock(asarPath, { root = ROOT } = {}) {
  if (!asarPath) throw new Error('app.asar path is required');
  const packaged = new Map();

  for (const relativePath of FILES) {
    const sourceBytes = fs.readFileSync(path.join(root, relativePath));
    // @electron/asar traverses member names with the host path separator.
    const packagedBytes = extractFile(asarPath, archiveMemberPath(relativePath));
    assert.ok(
      packagedBytes.equals(sourceBytes),
      `${relativePath} in app.asar is not byte-identical to the verified release input`
    );
    packaged.set(relativePath, packagedBytes);
  }

  const manifest = JSON.parse(packaged.get(FILES[0]).toString('utf8'));
  const expectedFiles = ['easylist.txt', 'easyprivacy.txt'];
  assert.equal(manifest.version, 1, 'packaged blocker manifest version changed');
  assert.deepEqual(
    manifest.lists.map((entry) => entry.file),
    expectedFiles,
    'packaged blocker manifest list set or order changed'
  );

  const listBytes = expectedFiles.map((file) => {
    const bytes = packaged.get(`adblock/sources/${file}`);
    assert.equal(bytes.includes(0x0d), false, `${file} in app.asar contains CR bytes`);
    const expected = manifest.lists.find((entry) => entry.file === file)?.sha256;
    assert.equal(sha256(bytes), expected, `packaged blocker hash mismatch: ${file}`);
    return bytes;
  });
  assert.equal(
    sha256(Buffer.concat([listBytes[0], Buffer.from('\n'), listBytes[1]])),
    manifest.combinedSha256,
    'packaged blocker combined hash mismatch'
  );

  const summary = expectedFiles
    .map((file, index) => `${file}=${sha256(listBytes[index]).slice(0, 12)}…`)
    .join(', ');
  console.log(`verify-packaged-adblock: ok — ${summary}`);
}

if (require.main === module) {
  try {
    verifyPackagedAdblock(path.resolve(process.argv[2] || ''));
  } catch (error) {
    console.error(`verify-packaged-adblock: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { FILES, archiveMemberPath, verifyPackagedAdblock };
