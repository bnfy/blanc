#!/usr/bin/env node
// Prepares a daily Blanc Beta release on the Mac Studio from a passing night
// (docs/chromium-beta-release.md, "Daily betas"). Run by Claude, never during
// a build. Everything the owner used to decide during a release is decided
// here: the descriptor, the gate sources, the notes and which hand checks are
// due. The owner then runs one release command from the MacBook Pro.
//
//   node chromium/release/daily/beta-prep.mjs NIGHT.json CHANGES.md [TARGETED.json]
//   node chromium/release/daily/beta-prep.mjs --abandon
//
// NIGHT.json is nightly.mjs's result; CHANGES.md the "Fixed/New in this beta"
// sections Claude writes from the commits since the last beta; TARGETED.json
// a same-day rerun on newer source (targeted.mjs). It writes
// records/beta<N>-work (owner-only, never over an existing one) with frozen
// copies of the unsigned app and its GN arguments, and the marker
// records/RELEASE-IN-PROGRESS that keeps the nightly job away until
// beta-record.mjs (or --abandon) removes it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { check, equal, reason, sha256 } from '../policy.mjs';
import { ROOT } from '../preflight.mjs';
import { loadStanding, changedFiles, betaNumber } from '../standing.mjs';
import { releaseDescriptor, carriedGates, gateSources, releaseNotes } from './descriptor.mjs';

export const BASE = process.env.BLANC_STUDIO_BASE ?? path.join(os.homedir(), 'Projects/Blanc');
export const MARKER = path.join(BASE, 'records/RELEASE-IN-PROGRESS');
export const workFolder = version => path.join(BASE, 'records', `beta${betaNumber(version)}-work`);

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const git = (...args) => {
  const r = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' });
  check(r.status === 0, 'Git did not answer');
  return r.stdout.trim();
};

// The carried evidence on this Mac must be the bytes standing.json pinned.
export function checkCarriedEvidence(carried, base = BASE) {
  for (const [gate, c] of Object.entries(carried)) {
    if (!c.carried) continue;
    const file = path.join(base, c.lastPass.evidence);
    check(fs.existsSync(file), `carried evidence missing on this Mac: ${gate}`);
    equal(sha256(fs.readFileSync(file)), c.lastPass.sha256, `carried evidence changed since it was pinned: ${gate}`);
  }
}

// The framework digest names the candidate (macos- + its first 16 hex digits).
export function candidateOf(app) {
  const versions = path.join(app, 'Contents/Frameworks/Blanc Beta Framework.framework/Versions');
  const dirs = fs.readdirSync(versions).filter(d => d !== 'Current');
  check(dirs.length === 1, 'the beta app has one framework version');
  return `macos-${sha256(fs.readFileSync(path.join(versions, dirs[0], 'Blanc Beta Framework'))).slice(0, 16)}`;
}

function prepare(nightFile, changesFile, targetedFile) {
  const night = readJSON(nightFile), targeted = targetedFile ? readJSON(targetedFile) : null;
  check(night.status === 'pass', 'the night did not pass; nothing was prepared');
  check(!fs.existsSync(MARKER), 'a release is already in progress (records/RELEASE-IN-PROGRESS)');
  const build = targeted?.beta ?? night.beta;
  equal(git('rev-parse', 'HEAD'), build.sourceCommit, 'the Mac Studio checkout is not at the release source');
  equal(git('status', '--porcelain'), '', 'the Mac Studio checkout has uncommitted changes');
  const standing = loadStanding();
  const ledger = readJSON(path.join(ROOT, 'chromium/release/ledger.json'));
  const profileSHA256 = sha256(fs.readFileSync(path.join(ROOT, 'chromium/release/blanc-beta.provisionprofile')));
  const r = releaseDescriptor({ ledger, standing, build, profileSHA256 });
  // The evidence was made under the night's descriptor; a decision changed since needs a new night.
  equal(r, (targeted ?? night).release, 'the release differs from the one the checks ran under (standing decisions or the ledger changed); wait for the next night');
  const carried = carriedGates(standing, r, commit => changedFiles(commit, r.sourceCommit, ROOT));
  checkCarriedEvidence(carried);
  const { sources, handChecks } = gateSources({ r, night, carried, base: BASE, targeted });
  const notes = releaseNotes({ changes: fs.readFileSync(changesFile, 'utf8'), standing, r });

  const work = workFolder(r.version);
  fs.mkdirSync(work, { mode: 0o700 }); // refuses an existing folder
  const write = (name, text) => fs.writeFileSync(path.join(work, name), text, { flag: 'wx', mode: 0o600 });
  // Frozen inputs: a later build can't change what is signed.
  fs.mkdirSync(path.join(work, 'unsigned'), { mode: 0o700 });
  const app = path.join(work, 'unsigned/Blanc Beta.app');
  check(spawnSync('/usr/bin/ditto', [build.app, app]).status === 0, 'could not copy the unsigned app');
  equal(candidateOf(app), r.candidates.arm64, 'the unsigned app is not the candidate the checks ran on');
  const gnArgs = path.join(work, 'unsigned/args.gn');
  fs.copyFileSync(build.gnArgs, gnArgs, fs.constants.COPYFILE_EXCL);
  equal(sha256(fs.readFileSync(gnArgs)), r.gnArgsSHA256.arm64, 'the GN arguments are not the candidate\'s');
  write('release.json', JSON.stringify(r, null, 1) + '\n');
  write('local-inputs.json', JSON.stringify({
    profile: path.join(ROOT, 'chromium/release/blanc-beta.provisionprofile'),
    sparkleArchive: path.join(BASE, 'evidence/foundation/sparkle-2.10.1-review/Sparkle-2.10.1.tar.xz'),
    gnArgs: { arm64: gnArgs }, unsigned: { arm64: app }, sparkle: path.join(BASE, 'records/sparkle-2.10.1'),
  }, null, 2) + '\n');
  fs.mkdirSync(path.join(work, 'payloads'), { mode: 0o700 });
  for (const [name, from] of [['Blanc-Beta.cdx.json', build.payloads.sbom], ['NOTICES.txt', build.payloads.notices]])
    fs.copyFileSync(from, path.join(work, 'payloads', name), fs.constants.COPYFILE_EXCL);
  write('payloads/release-notes.md', notes);
  write('gate-sources.json', JSON.stringify(sources, null, 2) + '\n');
  write('hand-checks.json', JSON.stringify(handChecks, null, 2) + '\n');
  fs.mkdirSync(path.join(BASE, 'evidence/foundation', `beta${betaNumber(r.version)}`), { recursive: true, mode: 0o700 });
  // The outbound check copies this exact app (beta.4 lesson: point it at the new candidate first).
  const setup = spawnSync('sh', [path.join(ROOT, 'chromium/tests/outbound/setup.sh'), '--refresh', '--beta', app, night.prototype.runtimeConfig], { stdio: ['ignore', 'ignore', 'inherit'] });
  check(setup.status === 0, 'the outbound check could not be pointed at the candidate');
  fs.writeFileSync(MARKER, JSON.stringify({ version: r.version, work }) + '\n', { flag: 'wx', mode: 0o600 });
  return { r, work, handChecks, carried };
}

function abandon() {
  check(fs.existsSync(MARKER), 'no release is in progress');
  const { work } = readJSON(MARKER);
  const state = path.join(work, 'state.json');
  const done = fs.existsSync(state) ? readJSON(state).done : {};
  check(!done.draft, 'the tag and draft exist; this release can only go forward');
  fs.rmSync(MARKER);
  return work;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--abandon' && args.length === 1) {
      console.log(`Abandoned; the nightly job may run again. The work folder stays for the record: ${abandon()}`);
    } else {
      check(args.length === 2 || args.length === 3, 'usage: beta-prep.mjs NIGHT.json CHANGES.md [TARGETED.json] | --abandon');
      const { r, work, handChecks, carried } = prepare(...args);
      console.log(`Prepared Blanc Beta ${r.version} (build ${r.build}) from ${r.sourceCommit.slice(0, 9)}, candidate ${r.candidates.arm64}.`);
      console.log(`Work folder: ${work}`);
      console.log(`Waived (standing): ${Object.keys(r.gateWaivers ?? {}).join(', ') || 'none'}`);
      for (const [gate, c] of Object.entries(carried)) console.log(`${gate}: ${c.carried ? `carried from ${c.lastPass.version}` : `DUE (${c.who}): ${c.check}; changed: ${c.touched.slice(0, 5).join(', ')}`}`);
      console.log(handChecks.length ? `${handChecks.length} check(s) due before the release command can finish.` : 'No hand checks are due.');
    }
  } catch (error) {
    console.error(`Beta prep stopped: ${reason(error)}.`);
    process.exitCode = 1;
  }
}
