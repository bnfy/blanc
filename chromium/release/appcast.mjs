#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPublicKey, verify } from 'node:crypto';
import { check, validateRelease, base64, assetName, assetURL, feedURL } from './policy.mjs';
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function verifyEdDSA(bytes, signature, publicKey) {
  check(base64(signature, 64) && base64(publicKey, 32), 'canonical Ed25519 signature and public key required');
  const key = createPublicKey({format: 'der', type: 'spki', key: Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), Buffer.from(publicKey,'base64')])});
  check(verify(null, bytes, key, Buffer.from(signature, 'base64')), 'invalid archive EdDSA signature');
}
export function generateAppcast(r, arch, bytes, signature) {
  validateRelease(r); check(r.arches.includes(arch), 'architecture not selected');
  check(bytes.length > 0, 'empty archive'); verifyEdDSA(bytes, signature, r.sparkle.publicKey);
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Blanc Beta for macOS (${escape(arch)})</title>
    <link>${escape(feedURL(arch))}</link>
    <description>Blanc Chromium beta updates</description>
    <item>
      <title>Blanc Beta ${escape(r.version)}</title>
      <sparkle:version>${r.build}</sparkle:version>
      <sparkle:shortVersionString>${escape(r.version)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${escape(r.minimumSystemVersion)}</sparkle:minimumSystemVersion>
      <enclosure url="${escape(assetURL(r, arch))}" length="${bytes.length}" type="application/octet-stream" sparkle:edSignature="${escape(signature)}" />
    </item>
  </channel>
</rss>
`;
}
// Intentionally accepts only our canonical single-item full-DMG format. No DTD,
// external entities, arbitrary URLs, deltas, namespace aliases or extension tags.
export function validateAppcast(xml, r, arch, bytes, signature) {
  check(xml === generateAppcast(r, arch, bytes, signature), 'appcast differs from validated canonical feed');
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, releaseFile, arch, directory, signatureFile, output] = process.argv.slice(2);
    check(process.argv.length === 8 && ['generate', 'validate'].includes(mode), 'usage: appcast.mjs generate|validate RELEASE.json ARCH ASSET_DIR SIGNATURE.txt XML_FILE');
    const r = JSON.parse(fs.readFileSync(releaseFile)); validateRelease(r);
    const bytes = fs.readFileSync(path.join(directory, assetName(r, arch))), signature = fs.readFileSync(signatureFile, 'utf8').trim();
    if (mode === 'generate') fs.writeFileSync(output, generateAppcast(r, arch, bytes, signature), {flag: 'wx'});
    else validateAppcast(fs.readFileSync(output, 'utf8'), r, arch, bytes, signature);
    console.log(`appcast ${mode}: verified`);
  } catch { console.error('Appcast operation failed; no feed published.'); process.exitCode = 1; }
}
