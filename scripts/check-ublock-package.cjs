'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, readVerifiedPackage } = require('../src/main/ublock-package');
if (require.main === module) require('./check-ublock-runtime.cjs').checkRuntime();
const root = path.join(__dirname, '..', 'ublock');
function enumerate(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isDirectory()) return enumerate(path.join(directory, entry.name), name + '/');
    if (!entry.isFile()) throw new Error('ubo-package-type');
    const bytes = fs.readFileSync(path.join(directory, entry.name));
    return [{ path: name, size: bytes.length, sha256: hash(bytes) }];
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
if (process.argv.includes('--write')) {
  const pin = {
    format: 1, version: '1.75.0',
    upstream: {
      url: 'https://github.com/gorhill/uBlock/releases/download/1.75.0/uBlock0_1.75.0.chromium.zip',
      sha256: '393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582',
    },
    sources: [
      { path: 'sources/uBlock-1.75.0.tar.gz', url: 'https://codeload.github.com/gorhill/uBlock/tar.gz/refs/tags/1.75.0', sha256: 'a518c7d6e6b3f81d1a738befeb617abba59f93bd6b1e626da079a1003e9db52b' },
      { path: 'LICENSE.txt', sha256: hash(fs.readFileSync(path.join(root, 'LICENSE.txt'))) },
    ],
    files: enumerate(path.join(root, 'upstream')),
  };
  fs.writeFileSync(path.join(root, 'pinned.json'), JSON.stringify(pin, null, 2) + '\n');
}
const verified = readVerifiedPackage(root);
if (JSON.stringify(enumerate(path.join(root, 'upstream'))) !== JSON.stringify(verified.pin.files)) throw new Error('ubo-package-unlisted');
console.log('Verified uBlock Origin ' + verified.pin.version + ': ' + verified.files.size + ' pinned files and matching upstream source archive.');
