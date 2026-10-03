'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { hash, readVerifiedPackage, adaptPackage, readHostSources, HOST_INPUTS } = require('../src/main/ublock-package');
const root = path.join(__dirname, '..');
const upstream = readVerifiedPackage(path.join(root, 'ublock'));
const host = HOST_INPUTS;
const read = name => fs.readFileSync(path.join(root, name));
const adapted = adaptPackage(upstream.files, readHostSources(root));
const changes = [];
let patch = '';
for (const [name, bytes] of adapted) {
  const before = upstream.files.get(name);
  if (before?.equals(bytes)) continue;
  changes.push({ path: name, upstreamSha256: before ? hash(before) : null, adaptedSha256: hash(bytes) });
  // Binary additions are reproduced from the hash-bound host inputs above.
  // Never serialize font/image bytes as a lossy UTF-8 text hunk.
  if (/\.(png|woff2)$/.test(name)) {
    patch += `Binary files ${before ? 'a/' + name : '/dev/null'} and b/${name} differ\n`;
    continue;
  }
  const oldLines = before ? before.toString('utf8').split('\n') : [];
  const newLines = bytes.toString('utf8').split('\n');
  if (oldLines.at(-1) === '') oldLines.pop();
  if (newLines.at(-1) === '') newLines.pop();
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines.at(-1 - suffix) === newLines.at(-1 - suffix)) suffix++;
  const start = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  patch += `--- ${before ? 'a/' + name : '/dev/null'}\n+++ b/${name}\n@@ -${before ? start + 1 : 0},${oldEnd - start} +${start + 1},${newEnd - start} @@\n`;
  for (let i = start; i < prefix; i++) patch += ' ' + oldLines[i] + '\n';
  for (let i = prefix; i < oldLines.length - suffix; i++) patch += '-' + oldLines[i] + '\n';
  for (let i = prefix; i < newLines.length - suffix; i++) patch += '+' + newLines[i] + '\n';
  for (let i = oldLines.length - suffix; i < oldEnd; i++) patch += ' ' + oldLines[i] + '\n';
}
const manifest = { format: 1, version: upstream.pin.version,
  modifiedBy: 'Blanc, 2026-10-02',
  host: host.map(name => ({ path: name, sha256: hash(read(name)) })), changes,
  patchSha256: hash(Buffer.from(patch)),
};
for (const [name, expected] of Object.entries({
  'ublock/adaptation.json': JSON.stringify(manifest, null, 2) + '\n', 'ublock/adaptation.patch': patch,
})) {
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, name), expected);
  else if (fs.readFileSync(path.join(root, name), 'utf8') !== expected) throw new Error('Stale uBlock adaptation record: ' + name);
}
console.log(`Verified reproducible host adaptation: ${changes.length} changed/added files; filtering-engine modules remain upstream.`);
