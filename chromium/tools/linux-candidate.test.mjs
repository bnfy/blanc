import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ASSET_NAME, candidateId, runtimeFiles, runtimeConfig } from '../linux/candidate.mjs';

const exeSha256 = 'ab'.repeat(32);
const id = 'linux-x64-abababababababab';

test('Linux candidate IDs come from the chrome SHA-256', () => {
  assert.equal(candidateId(exeSha256), id);
  assert.equal(ASSET_NAME, 'blanc-linux-candidate.tar.gz');
  for (const bad of ['abc', 'ab'.repeat(33), 'ag'.repeat(32), exeSha256.toUpperCase(), undefined]) {
    assert.throws(() => candidateId(bad), /SHA-256/);
  }
});

test('Linux runtime dependencies stay inside the output and include chrome', () => {
  assert.deepEqual(runtimeFiles(['./chrome', 'locales/en-US.pak', '  icudtl.dat ', '', 'chrome']),
    ['chrome', 'icudtl.dat', 'locales/en-US.pak']);
  for (const outside of ['/etc/passwd', '..', 'locales/../../outside', './a/../b', 'C:/outside', 'a\\b']) {
    assert.throws(() => runtimeFiles(['chrome', outside]), /outside the output/);
  }
  assert.throws(() => runtimeFiles(['chrome_sandbox', 'resources.pak']), /chrome/);
});

test('Linux run config binds the candidate ID to its executable hash', () => {
  const record = { id, exeSha256 };
  assert.deepEqual(runtimeConfig('unpacked', record), {
    candidate: id, executable: path.join('unpacked', 'chrome'), executableSha256: exeSha256,
    singleBinary: true, blockerAssets: path.join('unpacked', 'blocker'), diskAssets: false,
  });
  for (const wrongId of ['windows-x64-abababababababab', 'linux-x64-0000000000000000']) {
    assert.throws(() => runtimeConfig('unpacked', { ...record, id: wrongId }), /does not match/);
  }
  assert.throws(() => runtimeConfig('unpacked', { id }));
});
