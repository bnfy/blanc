'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractFile, listPackage, statFile } = require('@electron/asar');
const { readVerifiedPackage, hash, adaptPackage, readHostSources } = require('../src/main/ublock-package');
const ROOT = path.join(__dirname, '..');
function verifyPackagedUblock(asarPath, { root = ROOT } = {}) {
  const inventory = listPackage(asarPath).map(raw => raw.replaceAll('\\', '/').replace(/^\//, ''));
  const metadata = JSON.parse(extractFile(asarPath, 'package.json').toString());
  if (metadata.blancUblockBundled === false) {
    assert(!metadata.blancUblockInternalValidation, 'Excluded uBO cannot carry an internal marker');
    assert(!inventory.some(member => member === 'ublock' || member.startsWith('ublock/')), 'Uncleared uBO payload in ordinary Blanc build');
    console.log('verify-packaged-ublock: optional upstream payload excluded.');
    return;
  }
  assert.equal(metadata.blancUblockBundled, true, 'Missing uBO payload declaration');
  if (!metadata.blancUblockInternalValidation) {
    const gate = JSON.parse(extractFile(asarPath, 'ublock/distribution.json'));
    assert(gate.cleared && gate.assessment && gate.correspondingSource && gate.noticeReview, 'Uncleared public uBO payload');
  }
  const { pin, files } = readVerifiedPackage(path.join(root, 'ublock'));
  const read = member => extractFile(asarPath, member.split('/').join(path.sep));
  const exact = member => assert(read(member).equals(fs.readFileSync(path.join(root, member))), 'Packaged uBO input mismatch: ' + member);
  for (const name of ['pinned.json', 'LICENSE.txt', 'README.md', 'adaptation.json', 'adaptation.patch', 'distribution.json', 'source-audit.json']) exact('ublock/' + name);
  for (const entry of pin.sources) exact('ublock/' + entry.path);
  for (const [name, bytes] of files) assert(read('ublock/upstream/' + name).equals(bytes), 'Packaged upstream mismatch: ' + name);
  for (const raw of listPackage(asarPath)) {
    const member = raw.replaceAll('\\', '/').replace(/^\//, '');
    if (!member.startsWith('ublock/upstream/')) continue;
    const entry = statFile(asarPath, member.split('/').join(path.sep));
    assert(!entry.link, 'Symlink in packaged uBO');
    if (!entry.files) assert(files.has(member.slice('ublock/upstream/'.length)), 'Unlisted packaged uBO file: ' + member);
  }
  const adaptation = JSON.parse(read('ublock/adaptation.json'));
  for (const entry of adaptation.host) {
    exact(entry.path); assert.equal(hash(read(entry.path)), entry.sha256);
  }
  for (const member of ['scripts/check-ublock-package.cjs', 'scripts/build-ublock-adaptation.cjs']) exact(member);
  const sources = readHostSources(root);
  sources.adapter = read('src/main/ublock-host-mainworld.js');
  sources.bridge = read('src/main/ublock-bridge-mainworld.js');
  const output = adaptPackage(files, sources);
  for (const entry of adaptation.changes) assert.equal(hash(output.get(entry.path)), entry.adaptedSha256);
  assert.equal(hash(read('ublock/adaptation.patch')), adaptation.patchSha256);
  console.log(`verify-packaged-ublock: ${pin.version}, ${files.size} upstream files, source, license, host and adaptation verified.`);
}
if (require.main === module) {
  try { verifyPackagedUblock(path.resolve(process.argv[2] || '')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verifyPackagedUblock };
