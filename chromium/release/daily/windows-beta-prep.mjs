#!/usr/bin/env node
// Starts a Windows beta release from the newest passing night (docs/superpowers/
// plans/2026-11-21-windows-nightly.md, Task 6), on the MacBook Pro:
//
//   node chromium/release/daily/windows-beta-prep.mjs [--records DIR] [--nights DIR] [--draft TAG]
//
// --nights (the Mac Studio's night records) and --draft come from arguments
// only, so a rehearsal never reads production nights or touches the real draft.
// It takes the draft's hold for the release (its owner is kept in
// RECORDS/PREP-HOLD until the work folder holds it), reads the night that
// LAST-PASS names and checks its beta in full, claims the night's build for
// Windows on chromium/next before it touches the draft (build-claims.mjs
// claimExact: an identical claim is a no-op, and a number held for other
// source stops), makes sure the draft holds that night's beta zip (uploading
// the kept copy if a later night replaced it), builds a schema-2 work folder in a
// staging folder, checks it through
// windows-release.mjs's own loader, moves it into place and only then points
// CURRENT at it. Any stop releases the hold it took and leaves CURRENT and the
// records as they were. Failures print fixed messages.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../preflight.mjs';
import {CHROME_VERSION, ReleaseCheckError, reason} from '../policy.mjs';
import {load, CANDIDATE_DRAFTS} from '../windows-release.mjs';
import {claimExact} from '../build-claims.mjs';
import {acquireHold, newOwner, releaseHold, uploadUnderHold, REPO} from '../../windows/draft-hold.mjs';

const STUDIO = ['-i', path.join(os.homedir(), '.ssh/id_ed25519_macmini'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15', 'anthonyjloria@Mac-Studio.local'];
export const NIGHTS = '~/Projects/Blanc/records/nightly/windows';
export const PREP_HOLD = 'PREP-HOLD';
// The pinned Chromium's first three numbers; the build is the last.
const VERSION_PREFIX = `${CHROME_VERSION.split('.').slice(0, 3).join('.')}.`;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stop = message => { throw new ReleaseCheckError(message); };

// A passing night whose beta is exactly the build it names, checked before anything is uploaded.
export function nightProblem(night) {
  if (night?.status !== 'pass') return 'the newest night did not pass';
  if (!/^[0-9]{8}-[0-9]{4}$/.test(night.stamp ?? '')) return 'the night has no stamp';
  if (!/^[0-9a-f]{40}$/.test(night.sourceCommit ?? '')) return 'the night names no source commit';
  if (!Number.isInteger(night.build) || night.build < 1 || night.build > 9999 || night.version !== `${VERSION_PREFIX}${night.build}`) return 'the night\'s build and version disagree';
  const beta = night.beta ?? {};
  if (beta.channel !== 'beta') return 'the night\'s beta is not a beta-channel build';
  if (beta.treeCommit !== night.sourceCommit) return 'the night\'s beta was built from other source';
  if (beta.version !== night.version) return 'the night\'s beta is another version';
  if (!/^windows-x64-[0-9a-f]{16}$/.test(beta.id ?? '') || !/^[0-9a-f]{64}$/.test(beta.zipSha256 ?? '')) return 'the night\'s beta has no candidate id or digest';
  return null;
}

export function prepareRelease({io, records, ledger, nights = NIGHTS, draft = CANDIDATE_DRAFTS[0], interrupted = () => false}) {
  if (!CANDIDATE_DRAFTS.includes(draft)) stop('unknown candidate draft');
  if (!/^~\/[\w./-]+$/.test(nights) || nights.includes('..')) stop('the nights folder must be a plain path under ~/');
  fs.mkdirSync(records, {recursive: true, mode: 0o700});
  fs.chmodSync(records, 0o700);
  // The owner is chosen and saved before the hold is uploaded: until the work
  // folder holds it, this file does, so a lost take or an interrupted prep can be undone.
  const owner = newOwner();
  const recovery = path.join(records, PREP_HOLD);
  // 'wx' refuses an existing file, so the check and the write are one step.
  try {
    fs.writeFileSync(recovery, JSON.stringify({owner, draft, at: new Date().toISOString()}) + '\n', {mode: 0o600, flag: 'wx'});
  } catch (error) {
    if (error.code === 'EEXIST') stop(`an earlier prep left a hold owner in ${recovery}; release that hold (draft-hold.mjs release) and remove the file first`);
    throw error;
  }
  let apiUrl;
  try { ({apiUrl} = acquireHold(io, 'release', 'Windows beta release prep', draft, owner)); } catch {
    let undone = false;
    try { releaseHold(io, owner, draft); undone = true; } catch { /* the owner stays in PREP-HOLD */ }
    if (undone) fs.rmSync(recovery, {force: true});
    stop(`the candidate draft is held or could not be taken; see node chromium/windows/draft-hold.mjs status${undone ? '' : ` (a hold this prep may have taken names the owner in ${recovery})`}`);
  }
  const step = () => { if (interrupted()) stop('interrupted'); };
  try {
    const shown = io.exec('ssh', [...STUDIO, `cat ${nights}/$(cat ${nights}/LAST-PASS)/result.json`]);
    if (shown.status !== 0) stop('the Mac Studio has no passing night to release');
    let night;
    try { night = JSON.parse(shown.stdout); } catch { stop('the night\'s record is not readable'); }
    const problem = nightProblem(night);
    if (problem) stop(problem);
    const beta = night.beta;
    step();

    // Windows and Linux share build numbers in claim order on chromium/next:
    // the night's number is claimed for its exact source before the draft is
    // touched, and the release stages check that claim again.
    // A rehearsal's folder runs no stage, so it claims nothing: its number
    // stays free for a real build.
    if (draft !== CANDIDATE_DRAFTS[0]) console.log('A rehearsal claims no build number.');
    else {
      if (typeof io.claim !== 'function') stop('no build claim helper');
      const claimed = io.claim({build: night.build, sourceCommit: night.sourceCommit, platforms: ['windows'], purpose: 'release'});
      console.log(claimed.created ? `Claimed build ${night.build} on chromium/next (${claimed.commit}).`
        : `Build ${night.build} was already claimed for this source on chromium/next.`);
    }
    step();

    // The draft must hold this night's beta zip.
    const zipOnDraft = () => {
      const view = io.exec('gh', ['release', 'view', draft, '--repo', REPO, '--json', 'assets']);
      if (view.status !== 0) stop('GitHub did not show the candidate draft');
      try { return (JSON.parse(view.stdout).assets ?? []).find(a => a.name === 'blanc-windows-candidate.zip')?.digest; } catch { stop('GitHub did not show the candidate draft'); }
    };
    if (zipOnDraft() !== `sha256:${beta.zipSha256}`) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prep-'));
      try {
        const kept = path.join(temp, 'beta.zip');
        const copied = io.exec('scp', ['-q', ...STUDIO.slice(0, -1), `${STUDIO.at(-1)}:${nights.replace('~/', '')}/${night.stamp}/beta.zip`, kept]);
        if (copied.status !== 0 || io.sha256(kept) !== beta.zipSha256) stop('the kept beta zip did not arrive intact');
        step();
        uploadUnderHold(io, owner, kept, 'blanc-windows-candidate.zip', draft);
      } finally { fs.rmSync(temp, {recursive: true, force: true}); }
      if (zipOnDraft() !== `sha256:${beta.zipSha256}`) stop('the draft still holds another zip');
    }

    const last = ledger.builds.at(-1);
    const log = last?.sourceCommit ? io.exec('git', ['-C', ROOT, 'log', '--oneline', '--no-merges', `${last.sourceCommit}..${night.sourceCommit}`]) : {status: 0, stdout: ''};
    if (log.status !== 0) stop('could not list the commits since the last build');
    step();

    const release = {schema: 2, product: 'Blanc Beta', platform: 'windows-x64', version: night.version, build: night.build,
      previousBuild: last?.build ?? 0, tag: `chromium-beta-windows-${night.version}`, sourceCommit: night.sourceCommit, prerelease: true, makeLatest: false,
      candidate: {id: beta.id, zipSha256: beta.zipSha256, treeCommit: beta.treeCommit, version: beta.version}};
    const work = path.join(records, night.version);
    // An abandoned release of this version (it never tagged) is kept beside,
    // never reused or deleted, and moved aside only once its replacement is
    // ready, so a failed retry leaves it where CURRENT may name it.
    let abandonedWork = false;
    if (fs.existsSync(work)) {
      let earlier = null;
      try { earlier = JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8')); } catch { earlier = null; }
      if (!earlier?.abandoned) stop('a work folder for this version already exists');
      abandonedWork = true;
    }
    // Built beside its final place, checked, then moved in whole.
    const staged = fs.mkdtempSync(path.join(records, '.prep-'));
    let placed = false, aside = null;
    try {
      fs.chmodSync(staged, 0o700);
      const bytes = Buffer.from(JSON.stringify(release, null, 2) + '\n');
      fs.writeFileSync(path.join(staged, 'windows-release.json'), bytes, {mode: 0o600});
      fs.writeFileSync(path.join(staged, 'release-notes.md'),
        `DRAFT, for the owner to rewrite and approve before the draft stage.\n\nCommits since ${last ? `build ${last.build}` : 'the first build'}:\n\n${log.stdout}`, {mode: 0o600});
      fs.writeFileSync(path.join(staged, 'state.json'), JSON.stringify({schema: 1, release: sha256(bytes), done: {}, hold: {owner, apiUrl}, draft}, null, 2) + '\n', {mode: 0o600});
      load(staged, {ledger});
      step();
      if (abandonedWork) {
        aside = `${work}.abandoned-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.renameSync(work, aside);
      }
      fs.renameSync(staged, work);
      placed = true;
      const current = path.join(records, 'CURRENT');
      fs.writeFileSync(current + '.tmp', work + '\n');
      fs.renameSync(current + '.tmp', current);
    } catch (error) {
      fs.rmSync(placed ? work : staged, {recursive: true, force: true});
      if (aside && !fs.existsSync(work)) fs.renameSync(aside, work);
      fs.rmSync(path.join(records, 'CURRENT.tmp'), {force: true});
      throw error;
    }
    // CURRENT names the release now, and the work folder holds the hold's
    // owner: a PREP-HOLD left behind is only a stale note, never a reason to
    // let go of the hold.
    try { fs.rmSync(recovery, {force: true}); } catch {
      console.warn(`The release is prepared, but ${recovery} could not be removed; remove it by hand (its hold now belongs to ${work}).`);
    }
    return {work, owner};
  } catch (error) {
    try {
      releaseHold(io, owner, draft);
      fs.rmSync(recovery, {force: true});
    } catch {
      throw new ReleaseCheckError(`${reason(error)}; the hold could not be released, its owner is in ${recovery} (draft-hold.mjs release)`);
    }
    throw error;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
  const records = path.resolve(arg('--records') ?? path.join(os.homedir(), 'Projects/Blanc/records/windows-release'));
  // A signal reaches ssh, scp or gh too (spawnSync reports it); prep then stops at its next step and lets go of the hold.
  let interrupted = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { interrupted = true; });
  const io = {
    exec(command, args) {
      const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      // Ctrl-C reaches the child in the same process group; its signal is how prep hears it in time.
      if (result.signal) interrupted = true;
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
    sha256: file => sha256(fs.readFileSync(file)),
    claim: entry => claimExact(entry, {root: ROOT, git: 'git', remote: 'origin', branch: 'chromium/next'}),
  };
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'chromium/release/windows-ledger.json'), 'utf8'));
    const {work} = prepareRelease({io, records, ledger, nights: arg('--nights') ?? NIGHTS, draft: arg('--draft') ?? CANDIDATE_DRAFTS[0],
      interrupted: () => interrupted});
    console.log(`Prepared ${work}. Rewrite release-notes.md for the owner's approval, then run the stages.`);
  } catch (error) {
    console.error(`windows-beta-prep stopped: ${reason(error)}.`);
    process.exitCode = 1;
  }
}
