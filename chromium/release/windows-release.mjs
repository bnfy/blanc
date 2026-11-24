#!/usr/bin/env node
// The Blanc Beta for Windows release (W3 Task E1), as ordered stages the owner
// runs one at a time in a foreground Terminal on the MacBook Pro. A Windows
// beta is its own GitHub pre-release, never latest (owner, 2026-11-19), tag
// chromium-beta-windows-<version>, version 158.0.8127.<build>. Each stage
// checks the one before it and records what it made in WORK/state.json, bound
// to WORK/windows-release.json. Once the draft exists nothing before it runs
// again; the draft and publication ask for a typed confirmation first.
//
//   node chromium/release/windows-release.mjs status WORK
//   node chromium/release/windows-release.mjs <stage> WORK
//
// WORK is a private, owner-only folder outside Git holding windows-release.json
// and release-notes.md. Failures print fixed messages, never command output.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CHROME_VERSION, ReleaseCheckError, check, equal, reason, sha256} from './policy.mjs';
import {ROOT} from './preflight.mjs';
import {REPO, COSIGN_IDENTITY, COSIGN_ISSUER, COSIGN_REDIRECT, confirmAbsent, realIO as macIO} from './release.mjs';
import {releaseData} from './windows-release-data.mjs';
import {claimProblem as desktopClaimProblem} from './build-claims.mjs';
import {verifyCrx3} from './windows-crx3.mjs';
import {parseRunId} from './daily/desktop-nightly.mjs';
import {readHold, releaseHold} from '../windows/draft-hold.mjs';

export const STAGES = ['preflight', 'sign', 'package', 'upload', 'staging-gate', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'];
const POINT_OF_NO_RETURN = STAGES.indexOf('draft');
export const STAGING = 'https://blanc-update-staging.bnfy-441.workers.dev';
export const PRODUCTION = 'https://blanc.day';
export const CANDIDATE_DRAFTS = Object.freeze(['fork-windows-candidate', 'fork-windows-candidate-rehearsal']);
// The draft a release was prepared against (a rehearsal's own), saved in state.json.
const draftOf = ctx => ctx.state?.draft ?? CANDIDATE_DRAFTS[0];
const WORKFLOW = 'chromium-windows-candidate.yml';
const SIGNED_INSTALLER = 'blanc-windows-installer-signed.exe';
const SIGNED_SETUP = 'Blanc-Beta-Setup.exe';
const SIGNATURE = 'windows-signature.json';
const PUBLISHER = /^CN=Bananify Creative,/;
const WORKER = path.join(ROOT, 'cloudflare/update-worker');
const CUP_PUBLIC = path.join(ROOT, 'chromium/windows/keys/cup-public.der');
const CRX_PUBLIC = fs.readFileSync(path.join(ROOT, 'chromium/windows/keys/crx-public.der'));
const CRX_PUBLIC_SHA256 = sha256(CRX_PUBLIC);
const OWNER_SIGN = path.join(ROOT, 'chromium/windows/owner/update-package-sign.command');
const NOTICE = 'chromium/blanc/notices/THIRD_PARTY_NOTICES.txt';
const LEDGER = path.join(ROOT, 'chromium/release/windows-ledger.json');
const VERSION_PREFIX = CHROME_VERSION.split('.').slice(0, 3).join('.');

export function validateWindowsRelease(r, ledger) {
  check(r?.schema === 1 || r?.schema === 2, 'windows-release.json schema must be 1 or 2');
  equal(r.product, 'Blanc Beta', 'product');
  equal(r.platform, 'windows-x64', 'platform');
  check(Number.isInteger(r.build) && r.build > 0 && r.build <= 9999, 'build must be an integer 1..9999');
  equal(r.version, `${VERSION_PREFIX}.${r.build}`, 'the version must be the pinned Chromium with the build as its last number');
  equal(r.tag, `chromium-beta-windows-${r.version}`, 'tag must be chromium-beta-windows-<version>');
  check(r.prerelease === true && r.makeLatest === false, 'GitHub pre-release and latest=false required');
  check(/^[a-f0-9]{40}$/.test(r.sourceCommit ?? ''), 'source commit required');
  check(/^windows-x64-[0-9a-f]{16}$/.test(r.candidate?.id ?? ''), 'Windows candidate id required');
  check(/^[0-9a-f]{64}$/.test(r.candidate?.zipSha256 ?? ''), 'candidate zip SHA-256 required');
  if (r.schema === 2) {
    // A release from a night: the candidate's own candidate.json, as prep read it.
    equal(r.candidate.treeCommit, r.sourceCommit, 'the candidate\'s treeCommit must be the source commit');
    equal(r.candidate.version, r.version, 'the candidate\'s version must be the release version');
  }
  const last = ledger.builds.at(-1)?.build ?? 0;
  equal(r.previousBuild, last, 'previousBuild must be the ledger\'s last Windows build');
  check(r.build > last, 'the build must be above the last Windows build');
  return r;
}
// Keep the Windows release-record interface used by prep and existing callers.
export function claimProblem(claims, r) {
  return desktopClaimProblem(claims, {...r, platform: 'windows'});
}
// The shared claims at chromium/next's fetched tip: null only when that commit
// is proven not to have the file; a failed fetch or an unreadable file stops.
export function reservationsAtTip(io, root = ROOT, git = '/usr/bin/git') {
  check(io.exec(git, ['-C', root, 'fetch', '-q', 'origin', 'chromium/next']).status === 0, 'could not fetch chromium/next');
  const tip = io.exec(git, ['-C', root, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  const commit = tip.stdout.trim();
  check(tip.status === 0 && /^[0-9a-f]{40}$/.test(commit), 'could not read chromium/next\'s fetched commit');
  const file = `${commit}:chromium/release/build-reservations.json`;
  if (io.exec(git, ['-C', root, 'cat-file', '-e', file]).status !== 0) return null;
  const shown = io.exec(git, ['-C', root, 'show', file]);
  check(shown.status === 0, 'the build reservations could not be read');
  try { return JSON.parse(shown.stdout); } catch { throw new ReleaseCheckError('the build reservations are not valid JSON'); }
}
function checkClaim(io, r) {
  if (r.schema !== 2) return;
  const reservations = reservationsAtTip(io);
  if (!reservations) return;  // before the shared sequence lands, the ledger rule alone
  const problem = claimProblem(reservations, r);
  check(!problem, `the build claim does not hold: ${problem}`);
}
// An online proof counts only for this release's candidate, in the expected
// mode, and (schema 2) with the installed chrome.exe and chrome.dll among the
// files the signing record verified.
// signedFiles: the signing record's files, name -> SHA-256 (names as the
// record writes them, Chrome-bin\\chrome.exe and Chrome-bin\\<version>\\chrome.dll).
export function proofPasses(ctx, proof, signedFiles) {
  const r = ctx.r;
  if (proof?.pass !== true || proof.details?.installed?.pv !== r.version) return false;
  if (r.schema !== 2) return true;  // schema 1 keeps its old verdict
  if (proof.candidate !== r.candidate.id || proof.mode !== `online ${r.version}`) return false;
  const installed = proof.details?.installedSha256;
  const named = name => signedFiles?.get(name);
  const exe = named('Chrome-bin/chrome.exe'), dll = named(`Chrome-bin/${r.version}/chrome.dll`);
  return Boolean(installed && exe && dll && installed.exe === exe && installed.dll === dll);
}
// The signing record saved by the sign stage, checked against its saved digest.
function signedFilesOf(ctx) {
  const file = path.join(ctx.work ?? '', 'signed', SIGNATURE);
  if (ctx.r.schema !== 2 || !fs.existsSync(file)) return null;
  equal(fileSha(file), ctx.state.done.sign?.signatureSHA256, 'the signing record changed after signing');
  return new Map(JSON.parse(fs.readFileSync(file)).files.map(f => [String(f.file).replaceAll('\\', '/'), f.sha256]));
}
// The receipt of a clean runner installing from the tagged public setup, not the staging one.
export const publicProof = r => proof => !proof?.details?.staging && proof?.details?.setupFile === setupName(r) && proof?.details?.tag === 'read from the file';

export const setupName = r => `Blanc-Beta-Setup-${r.version}.exe`;
export const assetNames = r => [setupName(r), SIGNATURE, 'update-package.json', 'windows-release.json', 'NOTICES.txt'];

export function makeManifest(r, dir) {
  const assets = assetNames(r).map(name => {
    const bytes = fs.readFileSync(path.join(dir, name));
    return {name, size: bytes.length, sha256: sha256(bytes)};
  });
  const json = JSON.stringify({schema: 1, product: r.product, platform: r.platform, version: r.version, tag: r.tag,
    sourceCommit: r.sourceCommit, assets}, null, 2) + '\n';
  const checksums = [...assets.map(a => `${a.sha256}  ${a.name}`), `${sha256(Buffer.from(json))}  RELEASE-MANIFEST.json`].join('\n') + '\n';
  return {json, checksums};
}
export function verifyManifest(dir, r) {
  const json = fs.readFileSync(path.join(dir, 'RELEASE-MANIFEST.json'), 'utf8');
  const manifest = JSON.parse(json);
  check(manifest.version === r.version && manifest.tag === r.tag && manifest.sourceCommit === r.sourceCommit, 'the manifest names another release');
  equal(manifest.assets.map(a => a.name), assetNames(r), 'the manifest lists unexpected files');
  for (const asset of manifest.assets) equal(sha256(fs.readFileSync(path.join(dir, asset.name))), asset.sha256, `${asset.name} differs from the manifest`);
  equal(fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8'), makeManifest(r, dir).checksums, 'SHA256SUMS differs from the manifest');
}

export function load(work, {ledger} = {}) {
  check(path.isAbsolute(work) && fs.statSync(work).isDirectory(), 'absolute release work folder required');
  check(!path.resolve(work).startsWith(path.resolve(ROOT) + path.sep), 'release work folder must be outside the repository');
  check((fs.statSync(work).mode & 0o077) === 0, 'release work folder must be owner-only (chmod 700)');
  const bytes = fs.readFileSync(path.join(work, 'windows-release.json'));
  const state0 = fs.existsSync(path.join(work, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(work, 'state.json'))) : null;
  // After publication the ledger names this build; the record stays valid against the ledger it began with.
  const l = ledger ?? JSON.parse(fs.readFileSync(LEDGER));
  const r = JSON.parse(bytes);
  validateWindowsRelease(r, state0?.done?.publish ? {schema: 1, builds: l.builds.filter(b => b.build < r.build)} : l);
  const state = state0 ?? {schema: 1, release: sha256(bytes), done: {}};
  equal(state.release, sha256(bytes), 'windows-release.json changed after the run began; start a new build');
  const stateFile = path.join(work, 'state.json');
  return {work, r, state, save: () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', {mode: 0o600})};
}
export function nextStage(state) { return STAGES.find(stage => !state.done[stage]) ?? null; }
export function admit(state, stage) {
  const index = STAGES.indexOf(stage);
  check(index >= 0, 'unknown stage');
  for (const before of STAGES.slice(0, index)) check(state.done[before], `run ${before} first`);
  const drafted = STAGES.slice(POINT_OF_NO_RETURN).some(s => state.done[s]);
  check(!state.done[stage] || (!drafted && index < POINT_OF_NO_RETURN),
    'this stage already ran and the release exists on GitHub; never rerun it, fix forward with a new build');
  check(!(drafted && index < POINT_OF_NO_RETURN), 'the tag or draft exists; earlier stages cannot run again');
}

const must = (io, command, args, message, options) => {
  const result = io.exec(command, args, options);
  check(result.status === 0, message);
  return result.stdout;
};
const pause = (io, ms) => (io.pause ?? (t => new Promise(resolve => setTimeout(resolve, t))))(ms);
const scratch = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const fileSha = file => sha256(fs.readFileSync(file));

// One run of the candidate workflow from chromium/next (the only branch the
// signing environment accepts), followed in this Terminal until it ends.
async function workflowRun(io, inputs, message, ctx = null) {
  // A release from a night (schema 2) pins the harness to its commit and lets
  // the signing job re-check the draft's hold; the token itself never leaves
  // this Mac (only its SHA-256, since run logs are public).
  const pinned = ctx?.state?.hold?.owner ? {source_commit: ctx.r.sourceCommit, draft_tag: draftOf(ctx), hold_owner_sha256: sha256(Buffer.from(ctx.state.hold.owner))} : {};
  const dispatched = io.exec('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'chromium/next',
    ...Object.entries({...inputs, ...pinned}).flatMap(([key, value]) => ['-f', `${key}=${value}`])]);
  check(dispatched.status === 0, 'could not start the candidate workflow');
  // The run this dispatch made, from its own output; never the newest run in a time window.
  const run = Number(parseRunId(dispatched));
  check(run, 'the workflow run did not appear');
  console.log(`${message}: https://github.com/${REPO}/actions/runs/${run}`);
  io.exec('gh', ['run', 'watch', String(run), '--repo', REPO, '--interval', '30'], {interactive: true});
  const view = JSON.parse(must(io, 'gh', ['run', 'view', String(run), '--repo', REPO, '--json', 'conclusion'], 'GitHub did not show the run'));
  return {run, success: view.conclusion === 'success'};
}

// A Cloudflare command (op run masks the token in what it prints). If it fails,
// what it said goes to WORK/logs/NAME.log, owner-only, never to the Terminal.
// The 1Password CLI asks for Touch ID through the desktop app only when told to;
// without it a Terminal session answers "not currently signed in".
const opOptions = (io, options) => ({...options, env: {...(io.env ?? process.env), OP_BIOMETRIC_UNLOCK_ENABLED: 'true'}});
function logged(io, work, name, args, message, options) {
  const result = io.exec('op', args, opOptions(io, options));
  if (result.status === 0) return result.stdout;
  const dir = path.join(work, 'logs');
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  fs.appendFileSync(path.join(dir, `${name}.log`), `${new Date().toISOString()} exit ${result.status}\n${result.stdout}\n${result.stderr}\n`, {mode: 0o600});
  throw new ReleaseCheckError(`${message} (what it said: WORK/logs/${name}.log)`);
}
// The update Worker, deployed from this checkout only when its folder is clean.
function deployWorker(io, work, {staging, offer = null}) {
  const dirty = io.exec('/usr/bin/git', ['-C', ROOT, 'status', '--porcelain', '--', 'cloudflare/update-worker']);
  check(dirty.status === 0 && !dirty.stdout.trim(), 'the update Worker has uncommitted changes');
  const args = ['run', '--env-file=.env.1password', '--', 'npx', 'wrangler', 'deploy'];
  if (staging) args.push('--env', 'staging');
  if (offer) args.push('--var', `RELEASE_JSON:${JSON.stringify(offer)}`);
  logged(io, work, `deploy-${staging ? 'staging' : 'production'}`, args, `could not deploy the ${staging ? 'staging' : 'production'} update server`, {cwd: WORKER});
}
async function offers(io, base, version) {
  for (let tries = 0; tries < 6; tries++) {
    await pause(io, 15000);
    const out = io.exec('node', ['scripts/smoke.mjs', base, CUP_PUBLIC], {cwd: WORKER});
    const last = out.stdout.trim().split('\n').at(-1) ?? '';
    try {
      const smoke = JSON.parse(last);
      if (smoke.pass && (version ? smoke.updatecheck === 'ok' && smoke.nextversion === version : smoke.updatecheck === 'noupdate')) return true;
    } catch {}
  }
  return false;
}
const offerFor = (ctx, origin) => releaseData({...ctx.state.done.package, version: ctx.r.version, publisherKeySha256: CRX_PUBLIC_SHA256}, {origin});
function proofFrom(dir) {
  const found = [];
  const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'update-proof.json' && found.push(path.join(d, e.name)); };
  walk(dir);
  check(found.length === 1, 'the run kept no single update proof');
  return JSON.parse(fs.readFileSync(found[0]));
}
async function proveOnline(io, ctx, inputs, message, extra = () => true) {
  const {run, success} = await workflowRun(io, {sha256: ctx.r.candidate.zipSha256, suite: 'smoke', update_expect: `online:${ctx.r.version}`, ...inputs}, message, ctx);
  const dir = scratch('blanc-win-proof-');
  try {
    let proof = null;
    if (io.exec('gh', ['run', 'download', String(run), '--repo', REPO, '-D', dir]).status === 0) { try { proof = proofFrom(dir); } catch {} }
    const passed = success && proofPasses(ctx, proof, signedFilesOf(ctx)) && extra(proof);
    return {run, passed};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

// Runner checks unpack the candidate from the draft, which holds one zip: a
// newer upload replaces it, and then this release can't be checked.
function candidateOnDraft(io, ctx) {
  const r = ctx.r;
  const view = JSON.parse(must(io, 'gh', ['release', 'view', draftOf(ctx), '--repo', REPO, '--json', 'assets'], 'GitHub did not show the candidate draft'));
  const zip = view.assets.find(a => a.name === 'blanc-windows-candidate.zip');
  equal(zip?.digest, `sha256:${r.candidate.zipSha256}`, 'the candidate on the draft is not this release\'s candidate (re-upload it before this stage)');
}

export const RUN = {
  async preflight(ctx, io) {
    must(io, '/usr/bin/git', ['-C', ROOT, 'fetch', '-q', 'origin', 'chromium/next'], 'could not fetch chromium/next');
    must(io, '/usr/bin/git', ['-C', ROOT, 'merge-base', '--is-ancestor', ctx.r.sourceCommit, 'FETCH_HEAD'], 'the source commit is not on chromium/next');
    candidateOnDraft(io, ctx);
    checkClaim(io, ctx.r);
    confirmAbsent(io, ctx.r);
    return {candidate: ctx.r.candidate.id};
  },
  async sign(ctx, io) {
    // The signing job signs only for a run that names the draft's live hold.
    check(ctx.state.hold?.owner, 'signing needs the draft\'s hold (draft-hold.mjs acquire-manual, its owner in state.json hold.owner)');
    console.log('GitHub asks you to approve fork-windows-signing (Review deployments) once the run starts.');
    const {run, success} = await workflowRun(io, {sha256: ctx.r.candidate.zipSha256, sign: 'true'}, 'Signing run', ctx);
    check(success, 'the signing run did not succeed');
    const dir = path.join(ctx.work, 'signed');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {mode: 0o700});
    must(io, 'gh', ['release', 'download', draftOf(ctx), '--repo', REPO, '--pattern', SIGNED_INSTALLER, '--pattern', SIGNED_SETUP,
      '--pattern', SIGNATURE, '--dir', dir], 'could not download the signed files');
    // The draft's copies belong to whichever signing run came last; bind them to this candidate.
    const record = JSON.parse(fs.readFileSync(path.join(dir, SIGNATURE)));
    equal(record.candidateZipSha256, ctx.r.candidate.zipSha256, 'the signing record names another candidate');
    check(Array.isArray(record.files) && record.files.length > 0 && record.files.every(f => PUBLISHER.test(f.publisher ?? '')),
      'a file is not signed by Bananify Creative');
    for (const name of [SIGNED_INSTALLER, SIGNED_SETUP]) {
      const entry = record.files.find(f => f.file === name);
      equal(entry?.sha256, fileSha(path.join(dir, name)), `downloaded ${name} differs from the signing record`);
    }
    return {run, installerSHA256: fileSha(path.join(dir, SIGNED_INSTALLER)), setupSHA256: fileSha(path.join(dir, SIGNED_SETUP)),
      signatureSHA256: fileSha(path.join(dir, SIGNATURE))};
  },
  async package(ctx, io) {
    const signed = path.join(ctx.work, 'signed', SIGNED_INSTALLER);
    equal(fileSha(signed), ctx.state.done.sign.installerSHA256, 'the signed installer changed after signing');
    const packages = path.join(ctx.work, 'package'), dir = path.join(packages, ctx.r.version);
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name));
    fs.copyFileSync(signed, path.join(dir, 'mini_installer.exe'));
    console.log('1Password asks for Touch ID to sign the update package.');
    must(io, 'bash', [OWNER_SIGN], 'the package signing step stopped', {env: {...io.env, BLANC_PACKAGES: packages}, interactive: true});
    const record = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
    equal(record.version, ctx.r.version, 'the package is for another version');
    equal(record.installerSha256, ctx.state.done.sign.installerSHA256, 'the package does not hold the signed installer');
    equal(record.publisherKeySha256, CRX_PUBLIC_SHA256, 'the package is not signed with the committed publisher key');
    const crx = fs.readFileSync(path.join(dir, path.basename(record.file)));
    check(sha256(crx) === record.sha256 && crx.length === record.size, 'the package differs from its record');
    const verified = (io.verifyCrx ?? (bytes => verifyCrx3(bytes, crypto.createHash('sha256').update(CRX_PUBLIC).digest())))(crx);
    check(verified.ok, 'the package does not verify with the committed publisher key');
    return {sha256: record.sha256, size: record.size, run: record.run, file: path.basename(record.file)};
  },
  async upload(ctx, io) {
    const pkg = ctx.state.done.package, file = path.join(ctx.work, 'package', ctx.r.version, pkg.file ?? `blanc-beta-${ctx.r.version}.crx3`);
    equal(fileSha(file), pkg.sha256, 'the package changed after signing');
    const args = ['run', '--env-file=.env.1password', '--', 'npx', 'wrangler', 'r2', 'object', 'put', `blanc-windows-updates/${pkg.sha256}.crx3`,
      '--file', file, '--remote', '--content-type', 'application/x-chrome-extension'];
    // R2 sometimes answers a large put with an internal error (10001); one retry.
    if (io.exec('op', args, opOptions(io, {cwd: WORKER})).status !== 0) logged(io, ctx.work, 'upload', args, 'could not upload the package to R2', {cwd: WORKER});
    return {key: `${pkg.sha256}.crx3`};
  },
  async 'staging-gate'(ctx, io) {
    candidateOnDraft(io, ctx);
    deployWorker(io, ctx.work, {staging: true, offer: offerFor(ctx, STAGING)});
    try {
      check(await offers(io, STAGING, ctx.r.version), 'staging does not offer this release');
      const {run, passed} = await proveOnline(io, ctx, {update_staging: STAGING}, 'Staging gate', proof => proof.details?.staging === STAGING);
      check(passed, 'the staging gate did not pass');
      return {run};
    } finally {
      deployWorker(io, ctx.work, {staging: true});
    }
  },
  async manifest(ctx, io) {
    const dir = path.join(ctx.work, 'assets'), signed = path.join(ctx.work, 'signed');
    check(!fs.existsSync(dir), 'an assets folder already exists; inspect it privately');
    fs.mkdirSync(dir, {mode: 0o700});
    equal(fileSha(path.join(signed, SIGNED_SETUP)), ctx.state.done.sign.setupSHA256, 'the signed setup changed after signing');
    fs.copyFileSync(path.join(signed, SIGNED_SETUP), path.join(dir, setupName(ctx.r)));
    fs.copyFileSync(path.join(signed, SIGNATURE), path.join(dir, SIGNATURE));
    fs.copyFileSync(path.join(ctx.work, 'package', ctx.r.version, 'package.json'), path.join(dir, 'update-package.json'));
    fs.copyFileSync(path.join(ctx.work, 'windows-release.json'), path.join(dir, 'windows-release.json'));
    fs.writeFileSync(path.join(dir, 'NOTICES.txt'), must(io, '/usr/bin/git', ['-C', ROOT, 'show', `${ctx.r.sourceCommit}:${NOTICE}`], 'could not read the notices at the source commit'));
    const {json, checksums} = makeManifest(ctx.r, dir);
    fs.writeFileSync(path.join(dir, 'RELEASE-MANIFEST.json'), json, {flag: 'wx'});
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), checksums, {flag: 'wx'});
    return {checksumsSHA256: sha256(Buffer.from(checksums))};
  },
  async draft(ctx, io) {
    checkClaim(io, ctx.r);
    const r = ctx.r, dir = path.join(ctx.work, 'assets'), names = [...assetNames(r), 'RELEASE-MANIFEST.json', 'SHA256SUMS'];
    confirmAbsent(io, r);
    check(await io.confirm(`tag and draft ${r.tag}`), 'not confirmed; nothing was created');
    confirmAbsent(io, r); // again, immediately before creating anything
    ctx.holdCheck();
    equal(fileSha(path.join(dir, 'SHA256SUMS')), ctx.state.done.manifest.checksumsSHA256, 'assets changed after the manifest');
    verifyManifest(dir, r);
    check(fs.existsSync(path.join(ctx.work, 'release-notes.md')), 'release notes (WORK/release-notes.md) required');
    must(io, '/usr/bin/git', ['-C', ROOT, 'tag', r.tag, r.sourceCommit], 'could not create the tag');
    must(io, '/usr/bin/git', ['-C', ROOT, 'push', 'origin', `refs/tags/${r.tag}`], 'could not push the tag');
    ctx.holdCheck();
    must(io, 'gh', ['release', 'create', r.tag, '--repo', REPO, '--verify-tag', '--draft', '--prerelease', '--latest=false',
      '--title', `Blanc Beta ${r.version} for Windows`, '--notes-file', path.join(ctx.work, 'release-notes.md'),
      ...names.map(name => path.join(dir, name))], 'could not create the draft; the tag exists, so fix forward');
    const fresh = scratch('blanc-win-draft-');
    try {
      must(io, 'gh', ['release', 'download', r.tag, '--repo', REPO, '--dir', fresh], 'could not download the draft');
      equal(fs.readdirSync(fresh).sort(), [...names].sort(), 'the draft holds unexpected assets');
      for (const name of names) equal(fileSha(path.join(fresh, name)), fileSha(path.join(dir, name)), `downloaded ${name} differs from the approved bytes`);
    } finally { fs.rmSync(fresh, {recursive: true, force: true}); }
    return {tag: r.tag, sourceCommit: r.sourceCommit};
  },
  async sigstore(ctx, io) {
    const dir = path.join(ctx.work, 'assets'), sums = path.join(dir, 'SHA256SUMS'), bundle = path.join(dir, 'SHA256SUMS.sigstore.json');
    check(!fs.existsSync(bundle), 'a Sigstore bundle already exists; it was authorized once, do not sign again');
    console.log('Safari opens for the GitHub approval; complete the fresh page immediately, never in Blanc.');
    must(io, 'cosign', ['sign-blob', '--yes', '--oidc-redirect-url', COSIGN_REDIRECT, '--bundle', bundle, sums], 'Sigstore signing did not complete',
      {env: {...io.env, PATH: `${path.join(ROOT, 'scripts/release-bin')}:${io.env.PATH}`}, interactive: true});
    must(io, 'cosign', ['verify-blob', '--bundle', bundle, '--certificate-identity', COSIGN_IDENTITY, '--certificate-oidc-issuer', COSIGN_ISSUER, sums],
      'the Sigstore bundle did not verify against the pinned identity');
    verifyManifest(dir, ctx.r);
    must(io, 'gh', ['release', 'upload', ctx.r.tag, bundle, '--repo', REPO], 'could not upload the Sigstore bundle');
    return {bundleSHA256: fileSha(bundle)};
  },
  async publish(ctx, io) {
    const r = ctx.r;
    check(await io.confirm(`publish ${r.tag}`), 'not confirmed; the draft stays private and blanc.day offers nothing new');
    ctx.holdCheck();
    // blanc.day offers the release first, so the setup anyone downloads can install it.
    deployWorker(io, ctx.work, {staging: false, offer: offerFor(ctx, PRODUCTION)});
    check(await offers(io, PRODUCTION, r.version), 'blanc.day does not offer this release; the draft stays private');
    ctx.holdCheck();
    must(io, 'gh', ['release', 'edit', r.tag, '--repo', REPO, '--draft=false', '--prerelease', '--latest=false'], 'could not publish the draft');
    const view = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/tags/${r.tag}`], 'GitHub did not show the release'));
    check(view.draft === false && view.prerelease === true, 'GitHub does not show a published pre-release');
    const latest = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/latest`], 'GitHub did not show the latest release'));
    check(!String(latest.tag_name).startsWith('chromium-beta-'), 'the beta became the latest release; restore the stable release as latest now');
    return {published: true, latest: latest.tag_name, offered: r.version};
  },
  async 'verify-public'(ctx, io) {
    const r = ctx.r, fresh = scratch('blanc-win-public-');
    try {
      const view = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/tags/${r.tag}`], 'GitHub did not show the release'));
      for (const asset of view.assets) {
        check(/^[\w.-]+$/.test(asset.name), 'unexpected asset name');
        must(io, '/usr/bin/curl', ['-fsSL', '--proto', '=https', '-o', path.join(fresh, asset.name), asset.browser_download_url], 'a public download failed');
      }
      verifyManifest(fresh, r);
      must(io, '/usr/bin/shasum', ['-a', '256', '-c', path.join(fresh, 'SHA256SUMS')], 'checksums did not match', {cwd: fresh});
      must(io, 'cosign', ['verify-blob', '--bundle', path.join(fresh, 'SHA256SUMS.sigstore.json'), '--certificate-identity', COSIGN_IDENTITY,
        '--certificate-oidc-issuer', COSIGN_ISSUER, path.join(fresh, 'SHA256SUMS')], 'the public Sigstore bundle did not verify');
      equal(fileSha(path.join(fresh, setupName(r))), ctx.state.done.sign.setupSHA256, 'the public setup is not the signed one');
    } finally { fs.rmSync(fresh, {recursive: true, force: true}); }
    check(await offers(io, PRODUCTION, r.version), 'blanc.day does not offer this release');
    candidateOnDraft(io, ctx);
    // A clean runner, the public setup alone, installing from blanc.day.
    const {run, passed} = await proveOnline(io, ctx, {public_tag: r.tag}, 'Public install check', publicProof(r));
    check(passed, 'the public setup did not install the release from blanc.day');
    return {run, next: 'records PR: windows-ledger.json entry and cloudflare/update-worker/src/release.json'};
  },
};

const STAGE_LOCK = 'STAGE-RUNNING';
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
// 'free' (no lock), 'dead' (a parsed pid that is gone), or 'held' (alive, or unreadable: never reclaimed).
function lockState(work) {
  let text;
  try { text = fs.readFileSync(path.join(work, STAGE_LOCK), 'utf8'); } catch (error) { return error.code === 'ENOENT' ? 'free' : 'held'; }
  try { const {pid} = JSON.parse(text); return Number.isInteger(pid) && pid > 0 && !alive(pid) ? 'dead' : 'held'; } catch { return 'held'; }
}
// One stage (or the abandonment) at a time: WORK/STAGE-RUNNING appears whole
// (a written file hard-linked into place, which fails if the lock exists) and
// is held until the caller lets go. Only a lock naming a process that is gone
// is cleared, once; anything else refuses.
function takeStageLock(work, what) {
  const lock = path.join(work, STAGE_LOCK);
  const temp = `${lock}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(temp, JSON.stringify({pid: process.pid, stage: what}) + '\n', {mode: 0o600, flag: 'wx'});
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.linkSync(temp, lock);
        return () => fs.rmSync(lock, {force: true});
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const state = lockState(work);
      check(state === 'dead' || state === 'free', what === 'abandon' ? 'a stage is running for this release; wait for it to end' : 'another stage of this release is running');
      if (attempt === 0 && state === 'dead') fs.rmSync(lock, {force: true});
    }
    throw new ReleaseCheckError(what === 'abandon' ? 'a stage is running for this release; wait for it to end' : 'another stage of this release is running');
  } finally { fs.rmSync(temp, {force: true}); }
}
// Marks a release abandoned (draft-hold.mjs break, before it removes the
// release's hold): only the work folder whose state names the live hold, and
// never while one of its stages runs.
export function markAbandoned(work, liveHold) {
  const unlock = takeStageLock(work, 'abandon');
  try {
    const file = path.join(work, 'state.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(liveHold?.owner && state.hold?.owner === liveHold.owner, 'this work folder does not own the draft\'s hold; nothing was marked');
    state.abandoned = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', {mode: 0o600});
  } finally { unlock(); }
}

// Whether this release may write to the shared draft now. Schema 2 needs its
// own live hold; schema 1 (before holds) needs the draft not to be held by anyone.
function holdCheckFor(ctx, io) {
  return () => {
    let hold;
    try { hold = readHold(io, draftOf(ctx))?.body ?? null; } catch { throw new ReleaseCheckError('the candidate draft\'s hold could not be read'); }
    if (ctx.r.schema === 2 || ctx.state.hold) check(hold?.owner && hold.owner === ctx.state.hold?.owner, 'this release does not hold the candidate draft');
    else check(!hold, 'the candidate draft is held (draft-hold.mjs status); wait for it to be released');
  };
}

export async function runStage(stage, work, io = realIO()) {
  check(STAGES.includes(stage), 'unknown stage');
  const unlock = takeStageLock(work, stage);
  let ctx;
  try {
    ctx = load(work, {ledger: io.ledger?.()});
    check(!ctx.state.abandoned, 'this release was abandoned; start a new one');
    // A rehearsal's work folder is for status only: its stages would sign, tag and offer for real.
    check(draftOf(ctx) === CANDIDATE_DRAFTS[0], 'a rehearsal release runs no stages; only status');
    admit(ctx.state, stage);
    ctx.holdCheck = holdCheckFor(ctx, io);
    ctx.holdCheck();
    const result = await RUN[stage](ctx, io);
    ctx.state.done[stage] = {at: new Date().toISOString(), ...result};
    ctx.save();
  } finally {
    unlock();
  }
  // Only after verify-public is saved: the draft is free for the next night.
  if (stage === 'verify-public' && ctx.r.schema === 2) {
    try { releaseHold(io, ctx.state.hold.owner, draftOf(ctx)); } catch { console.error('The draft hold is still held; run status for the recovery command.'); }
  }
  return {stage, next: nextStage(ctx.state)};
}

// What status reports; for a finished schema-2 release, whether it still holds the draft.
export function statusOf(work, io) {
  const {r, state} = load(work, {ledger: io?.ledger?.()});
  const status = {done: Object.keys(state.done), next: nextStage(state), ...(state.abandoned ? {abandoned: state.abandoned} : {})};
  if (r.schema === 2 && state.done['verify-public'] && state.hold?.owner) {
    let hold;
    try { hold = readHold(io, draftOf({state}))?.body ?? null; } catch { return {...status, hold: 'unknown: the draft could not be read'}; }
    if (hold?.owner === state.hold.owner) {
      return {...status, hold: 'still held by this release', recover: `node chromium/windows/draft-hold.mjs release <hold.owner from ${path.join(work, 'state.json')}>`};
    }
  }
  return status;
}
export function realIO() { return macIO(); }

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [stage, work] = process.argv.slice(2);
  try {
    check(process.platform === 'darwin', 'macOS required');
    check(stage && work && process.argv.length === 4, `usage: windows-release.mjs status|${STAGES.join('|')} WORK`);
    if (stage === 'status') {
      console.log(JSON.stringify(statusOf(path.resolve(work), realIO())));
    } else {
      check(process.stdin.isTTY, 'run release stages from a foreground Terminal');
      console.log(JSON.stringify(await runStage(stage, path.resolve(work))));
    }
  } catch (error) {
    console.error(`Windows beta release stopped: ${reason(error)}.`);
    process.exitCode = 1;
  }
}
