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
function sourceInputs(directory) {
  const recordPath = 'preferred-sources.json';
  const recordBytes = fs.readFileSync(path.join(directory, recordPath));
  const record = JSON.parse(recordBytes);
  if (record.format !== 1 || record.version !== '1.75.0' || !Array.isArray(record.components)
    || record.components.length > 100) throw new Error('ubo-preferred-sources-invalid');
  const sources = [
    { path: 'sources/uBlock-1.75.0.tar.gz', url: 'https://codeload.github.com/gorhill/uBlock/tar.gz/refs/tags/1.75.0', sha256: 'a518c7d6e6b3f81d1a738befeb617abba59f93bd6b1e626da079a1003e9db52b' },
    { path: 'LICENSE.txt', sha256: hash(fs.readFileSync(path.join(directory, 'LICENSE.txt'))) },
    { path: 'licenses/LGPL-3.0.txt', url: 'https://www.gnu.org/licenses/lgpl-3.0.txt', sha256: 'e3a994d82e644b03a792a930f574002658412f62407f5fee083f2555c5f23118' },
    { path: recordPath, sha256: hash(recordBytes) },
    { path: 'repack-preferred-sources.py', sha256: hash(fs.readFileSync(path.join(directory, 'repack-preferred-sources.py'))) },
  ];
  const seen = new Set(sources.map(source => source.path));
  for (const component of record.components) {
    const member = component.sourcePath;
    if (typeof member !== 'string' || !/^sources\/[a-zA-Z0-9_.+-]+\.(?:tar\.gz|zip)$/.test(member)
      || seen.has(member) || !/^[a-f0-9]{40}$/.test(component.revision)
      || !/^[a-f0-9]{64}$/.test(component.sha256)
      || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(component.repository)
      || component.url !== `https://codeload.github.com/${component.repository}/tar.gz/${component.revision}`
      || hash(fs.readFileSync(path.join(directory, member))) !== component.sha256) throw new Error('ubo-preferred-source-integrity');
    // Only this reviewed conversion may differ from the upstream container.
    // Every upstream source file and permission is retained; no hash-only repack.
    const conversions = {
      'sources/hsluv-0.1.0-source.zip': {
        name: 'hsluv-0.1.0', repository: 'hsluv/hsluv', revision: '9cd8574fad8874828b3a8119843527d62d79887a',
        upstreamSha256: '1691357d86b2bbeead0ad2e31f0c4eeb40497e50bcf0faa8e97e91df50b7f9ee',
        sha256: '00479f218504d20cc463ea169966c0c28b01c6492da77c43317fa794ab49678f',
      },
      'sources/uAssets-1.75.0-main-source.zip': {
        name: 'uAssets-1.75.0-main', repository: 'uBlockOrigin/uAssets', revision: 'f9bd781375aeefae03196d07d079c772fa15e3e6',
        upstreamSha256: '1e0b65e660123f6015d84485d5ec6ac8571eeee957a0cbc0b5ea083850afe7d7',
        sha256: 'a064e149e27bfdae081cd6bde41eaa31d5d7dcb1cacb297de5f24e4259b83d38',
      },
    };
    const conversion = conversions[member];
    if (conversion ? Object.entries(conversion).some(([key, value]) => component[key] !== value)
      || component.sourceFormat !== 'lossless-tar-gz-to-zip'
      || component.repackScript !== 'repack-preferred-sources.py'
      : member.endsWith('.zip') || component.sourceFormat !== undefined
        || component.upstreamSha256 !== undefined || component.repackScript !== undefined) {
      throw new Error('ubo-preferred-source-conversion');
    }
    seen.add(member);
    sources.push({ path: member, url: component.url, sha256: component.sha256 });
  }
  for (const entry of enumerate(path.join(directory, 'sources'))) {
    if (!seen.has('sources/' + entry.path)) throw new Error('ubo-source-unlisted');
  }
  return sources;
}
if (process.argv.includes('--write')) {
  const pin = {
    format: 1, version: '1.75.0',
    upstream: {
      url: 'https://github.com/gorhill/uBlock/releases/download/1.75.0/uBlock0_1.75.0.chromium.zip',
      sha256: '393cf95709d1074d4022970e9014e434395c53a822387f1e25f43be97cf4b582',
    },
    sources: sourceInputs(root),
    files: enumerate(path.join(root, 'upstream')),
  };
  fs.writeFileSync(path.join(root, 'pinned.json'), JSON.stringify(pin, null, 2) + '\n');
}
const verified = readVerifiedPackage(root);
if (JSON.stringify(sourceInputs(root)) !== JSON.stringify(verified.pin.sources)) throw new Error('ubo-source-record-unlisted');
if (JSON.stringify(enumerate(path.join(root, 'upstream'))) !== JSON.stringify(verified.pin.files)) throw new Error('ubo-package-unlisted');
console.log('Verified uBlock Origin ' + verified.pin.version + ': ' + verified.files.size + ' pinned files and matching upstream source archive.');

module.exports = { sourceInputs };
