'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPackage } = require('@electron/asar');
const {
  FILES,
  archiveMemberPath,
  verifyPackagedAdblock,
} = require('../../scripts/verify-packaged-adblock');

const ROOT = path.resolve(__dirname, '../..');
async function fixture({ crlf = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-adblock-'));
  const input = path.join(temp, 'input');
  for (const relative of FILES) {
    const target = path.join(input, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let bytes = fs.readFileSync(path.join(ROOT, relative));
    if (crlf && relative.endsWith('easylist.txt')) {
      bytes = Buffer.from(bytes.toString('utf8').replaceAll('\n', '\r\n'));
    }
    fs.writeFileSync(target, bytes);
  }
  const asarPath = path.join(temp, 'app.asar');
  await createPackage(input, asarPath);
  return { asarPath, temp };
}

test('the post-pack gate accepts exact verified blocker bytes', async () => {
  const { asarPath, temp } = await fixture();
  try {
    assert.doesNotThrow(() => verifyPackagedAdblock(asarPath));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('the post-pack gate rejects Windows CRLF conversion', async () => {
  const { asarPath, temp } = await fixture({ crlf: true });
  try {
    assert.throws(
      () => verifyPackagedAdblock(asarPath),
      /not byte-identical to the verified release input/
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('the post-pack gate uses Windows separators for ASAR member lookup', () => {
  assert.equal(
    archiveMemberPath('adblock/sources/pinned.json', '\\'),
    'adblock\\sources\\pinned.json'
  );
});
