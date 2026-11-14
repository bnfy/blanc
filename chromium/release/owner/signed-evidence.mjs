#!/usr/bin/env node
// Evidence for the native-signature and gatekeeper gates from a notarized beta DMG.
//   node signed-evidence.mjs WORK ARCH OUT_DIR
// Read-only: verify.mjs on the DMG, then the DMG mounted read-only for codesign,
// spctl (Gatekeeper; may contact Apple) and stapler on the DMG and the app inside.
// Writes OUT_DIR/native-signature.json and OUT_DIR/gatekeeper.json; exits 1 unless both pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const [work, arch, out] = process.argv.slice(2);
const repo = path.join(os.homedir(), 'Projects/Blanc/repo');
const {sha256, assetName, validateRelease} = await import(pathToFileURL(path.join(repo, 'chromium/release/policy.mjs')));
const {verifyArtifact} = await import(pathToFileURL(path.join(repo, 'chromium/release/verify.mjs')));
const r = validateRelease(JSON.parse(fs.readFileSync(path.join(work, 'release.json'), 'utf8')));
const state = JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8'));
const dmg = path.join(work, 'assets', assetName(r, arch));
const dmgSHA256 = sha256(fs.readFileSync(dmg));
const run = (cmd, args) => { const x = spawnSync(cmd, args, {encoding: 'utf8'}); return {status: x.status, text: `${x.stdout}${x.stderr}`.trim()}; };
const release = {version: r.version, build: r.build, sourceCommit: r.sourceCommit, inputDigest: r.inputDigest, candidate: r.candidates[arch], dmgSHA256};
const notary = {app: state.done['notarize-app'][arch], dmg: state.done['notarize-dmg'][arch].notarization};

const sig = {schema: 1, gate: 'native-signature', arch, release, notarization: notary, failures: []};
const gk = {schema: 1, gate: 'gatekeeper', arch, release, failures: []};
try { sig.verifyMjs = verifyArtifact(dmg, r, arch); } catch (e) { sig.failures.push(`verify.mjs: ${e.message}`); }
const accepted = (res, what, into) => {
  const ok = res.status === 0 && /: accepted/.test(res.text) && /source=Notarized Developer ID/.test(res.text) && /origin=Developer ID Application: .*\(XYGUCY4498\)/.test(res.text);
  if (!ok) into.failures.push(`${what} not accepted as Notarized Developer ID`);
  return res.text.split('\n').map(l => l.replace(/^.*: (accepted|rejected)/, '$1'));
};
gk.dmgAssessment = accepted(run('/usr/sbin/spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', dmg]), 'the DMG', gk);
const stapled = (file, what, into) => { const res = run('/usr/bin/xcrun', ['stapler', 'validate', file]); if (res.status !== 0) into.failures.push(`${what} stapled ticket did not validate`); return res.status === 0; };
gk.dmgTicket = stapled(dmg, 'the DMG', gk);
const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-evidence-'));
const attach = run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
if (attach.status !== 0) { sig.failures.push('the DMG did not mount'); gk.failures.push('the DMG did not mount'); }
else try {
  const app = path.join(mount, 'Blanc Beta.app');
  const strict = run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  sig.strictDeepVerify = strict.status === 0 ? 'pass' : 'fail';
  if (strict.status !== 0) sig.failures.push('strict deep codesign verification failed');
  const info = run('/usr/bin/codesign', ['-dvv', app]).text.split('\n');
  sig.signer = {authorities: info.filter(l => l.startsWith('Authority=')).map(l => l.slice(10)),
    identifier: info.find(l => l.startsWith('Identifier='))?.slice(11), teamId: info.find(l => l.startsWith('TeamIdentifier='))?.slice(15),
    timestamp: info.find(l => l.startsWith('Timestamp='))?.slice(10)};
  if (sig.signer.teamId !== 'XYGUCY4498' || sig.signer.identifier !== 'me.bnfy.blanc.beta' || sig.signer.authorities[0] !== 'Developer ID Application: Anthony Loria (XYGUCY4498)') sig.failures.push('unexpected signer');
  gk.appAssessment = accepted(run('/usr/sbin/spctl', ['-a', '-t', 'exec', '-vv', app]), 'the app', gk);
  gk.appTicket = stapled(app, 'the app', gk);
} finally { run('/usr/bin/hdiutil', ['detach', mount]); fs.rmSync(mount, {recursive: true, force: true}); }
for (const e of [sig, gk]) {
  e.status = e.failures.length ? 'fail' : 'pass';
  fs.writeFileSync(path.join(out, `${e.gate}.json`), JSON.stringify(e, null, 2) + '\n');
  console.log(`${e.gate}: ${e.status}${e.failures.length ? ` (${e.failures.join('; ')})` : ''}`);
}
if (sig.failures.length || gk.failures.length) process.exitCode = 1;
