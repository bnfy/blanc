#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRelease, payloadNames, assetName, sha256, check, equal, reason } from './policy.mjs';
import { validateAppcast } from './appcast.mjs';
export const GATES = ['acceptance', 'desktop-sync', 'production-sync-real-device', 'notices-and-credits', 'blocker-payload', 'outbound-isolation', 'profile-coexistence', 'webauthn', 'no-drm-handoff', 'official-hooks-absent', 'sparkle-N-to-N+1', 'native-signature', 'gatekeeper'];
export function validateAcceptance(evidence, r, payloads) {
  equal(evidence.sourceCommit, r.sourceCommit, 'acceptance source'); equal(evidence.inputDigest, r.inputDigest, 'acceptance inputs');
  equal(evidence.build, r.build, 'acceptance build');
  equal(Object.keys(evidence.arches).sort(), [...r.arches].sort(), 'acceptance architectures');
  for (const arch of r.arches) {
    const e = evidence.arches[arch]; equal(e.candidate, r.candidates[arch], 'acceptance candidate');
    equal(e.dmgSHA256, sha256(payloads[assetName(r, arch)]), 'acceptance must bind final DMG bytes');
    equal(e.gnArgsSHA256, r.gnArgsSHA256[arch], 'acceptance build arguments');
    for (const gate of GATES) check(e.gates?.[gate]?.status === 'pass' && /^[a-f0-9]{64}$/.test(e.gates[gate].evidenceSHA256), `missing candidate gate: ${gate}`);
  }
}
// acceptance.json is an index of attestations. At manifest build the operator must hand over the
// evidence bundles themselves: EVIDENCE_DIR/<arch>/<gate>.evidence, each matching its recorded digest.
export function verifyEvidenceFiles(evidence, r, dir) {
  for (const arch of r.arches) for (const gate of GATES) {
    const file = path.join(dir, arch, `${gate}.evidence`);
    check(fs.existsSync(file) && fs.lstatSync(file).isFile() && fs.statSync(file).size > 0, `missing evidence bundle: ${arch}/${gate}`);
    equal(sha256(fs.readFileSync(file)), evidence.arches?.[arch]?.gates?.[gate]?.evidenceSHA256, `evidence bundle digest mismatch: ${arch}/${gate}`);
  }
}
export function makeManifest(r, payloads) {
  validateRelease(r); equal(Object.keys(payloads).sort(), payloadNames(r), 'exact beta assets required (no stable updater metadata)');
  for (const bytes of Object.values(payloads)) check(Buffer.isBuffer(bytes) && bytes.length > 0, 'nonempty file bytes required');
  equal(JSON.parse(payloads['release.json']), r, 'release descriptor must match');
  validateAcceptance(JSON.parse(payloads['acceptance.json']), r, payloads);
  const sbom = JSON.parse(payloads['Blanc-Beta.cdx.json']);
  check(sbom.bomFormat === 'CycloneDX' && ['1.5','1.6'].includes(sbom.specVersion) && sbom.version === 1, 'CycloneDX SBOM required');
  for (const [name, version] of [['Chromium', r.chromiumVersion], ['Sparkle', r.sparkle.version]])
    check(sbom.components?.some(c => c.name === name && c.version === version && c.licenses?.length > 0), `SBOM must include ${name} with licence`);
  for (const arch of r.arches) {
    const xml = payloads[`appcast-${arch}.xml`].toString('utf8');
    const signature = xml.match(/sparkle:edSignature="([A-Za-z0-9+/=]+)"/)?.[1];
    validateAppcast(xml, r, arch, payloads[assetName(r, arch)], signature);
  }
  const manifest = {schema: 1, tag: r.tag, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest,
    artifacts: Object.keys(payloads).sort().map(name => [name, payloads[name]]).map(([name, bytes]) => ({name, size: bytes.length, sha256: sha256(bytes)}))};
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const all = {...payloads, 'RELEASE-MANIFEST.json': Buffer.from(json)};
  const checksums = Object.keys(all).sort().map(name => `${sha256(all[name])}  ${name}\n`).join('');
  return {json, checksums};
}
export function readPayloads(dir, r, finalized = false) {
  const expected = [...payloadNames(r), ...(finalized ? ['RELEASE-MANIFEST.json', 'SHA256SUMS', 'SHA256SUMS.sigstore.json'] : [])].sort();
  equal(fs.readdirSync(dir).sort(), expected, 'unexpected, missing or duplicate assets');
  for (const name of expected) check(fs.lstatSync(path.join(dir,name)).isFile(), 'regular artifact files only; no symlinks');
  return Object.fromEntries(payloadNames(r).map(name => [name, fs.readFileSync(path.join(dir,name))]));
}
export function verifyManifest(dir, r) {
  const expected = makeManifest(r, readPayloads(dir, r, true));
  equal(fs.readFileSync(path.join(dir,'RELEASE-MANIFEST.json'),'utf8'), expected.json, 'manifest mismatch');
  equal(fs.readFileSync(path.join(dir,'SHA256SUMS'),'utf8'), expected.checksums, 'checksum mismatch');
  const sigstore = JSON.parse(fs.readFileSync(path.join(dir,'SHA256SUMS.sigstore.json')));
  check(sigstore && Object.keys(sigstore).length > 0, 'missing Sigstore bundle');
  return {status: 'contents-verified', sigstoreAuthentication: 'REQUIRES cosign verify-blob with pinned identity/issuer', gateEvidence: 'NOT VERIFIED HERE (acceptance.json is an attestation index; evidence bundles are checked at manifest build)'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, releaseFile, dir, evidenceDir] = process.argv.slice(2);
    check((mode === 'build' && process.argv.length === 6) || (mode === 'verify' && process.argv.length === 5), 'usage: manifest.mjs build RELEASE.json ASSET_DIR EVIDENCE_DIR | verify RELEASE.json ASSET_DIR');
    const r = JSON.parse(fs.readFileSync(releaseFile)); validateRelease(r);
    if (mode === 'build') {
      const payloads = readPayloads(dir,r), result = makeManifest(r, payloads);
      verifyEvidenceFiles(JSON.parse(payloads['acceptance.json']), r, evidenceDir);
      fs.writeFileSync(path.join(dir,'RELEASE-MANIFEST.json'),result.json,{flag:'wx'});
      fs.writeFileSync(path.join(dir,'SHA256SUMS'),result.checksums,{flag:'wx'});
      console.log('Manifest created; Sigstore authentication still required.');
    } else console.log(JSON.stringify(verifyManifest(dir,r)));
  } catch (error) { console.error(`Beta manifest operation failed: ${reason(error)}. No release published.`); process.exitCode = 1; }
}
