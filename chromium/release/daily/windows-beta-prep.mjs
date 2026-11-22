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
// LAST-PASS names and checks its beta in full, makes sure the draft holds that
// night's beta zip (uploading the kept copy if a later night replaced it),
// refuses once shared build claims exist (no exact claim helper yet), builds a
// schema-2 work folder in a staging folder, checks it through
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
import {ReleaseCheckError, reason} from '../policy.mjs';
import {load, reservationsAtTip, CANDIDATE_DRAFTS} from '../windows-release.mjs';
import {acquireHold, releaseHold, uploadUnderHold, REPO} from '../../windows/draft-hold.mjs';

const STUDIO = ['-i', path.join(os.homedir(), '.ssh/id_ed25519_macmini'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15', 'anthonyjloria@Mac-Studio.local'];
export const NIGHTS = '~/Projects/Blanc/records/nightly/windows';
export const PREP_HOLD = 'PREP-HOLD';
const VERSION_PREFIX = '158.0.8127.';
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
  let taken;
  try { taken = acquireHold(io, 'release', 'Windows beta release prep', draft); } catch {
    stop('the candidate draft is held or could not be taken; see node chromium/windows/draft-hold.mjs status');
  }
  const {owner, apiUrl} = taken;
  // Until the work folder holds the owner, this file does: an interrupted prep can still be undone.
  const recovery = path.join(records, PREP_HOLD);
  fs.writeFileSync(recovery, JSON.stringify({owner, draft, at: new Date().toISOString()}) + '\n', {mode: 0o600});
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

    // The shared claims: once the file exists, a release needs an exact claim,
    // which the Linux lane's helper makes; until it lands, nothing is released
    // under the shared sequence.
    if (reservationsAtTip(io, ROOT, 'git')) stop('the shared build claims exist, but no exact claim helper is here yet; claim the night\'s number first');
    console.log('No shared build claims on chromium/next yet: the Windows ledger alone numbers this release.');
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
    if (fs.existsSync(work)) stop('a work folder for this version already exists');
    // Built beside its final place, checked, then moved in whole.
    const staged = fs.mkdtempSync(path.join(records, '.prep-'));
    let placed = false;
    try {
      fs.chmodSync(staged, 0o700);
      const bytes = Buffer.from(JSON.stringify(release, null, 2) + '\n');
      fs.writeFileSync(path.join(staged, 'windows-release.json'), bytes, {mode: 0o600});
      fs.writeFileSync(path.join(staged, 'release-notes.md'),
        `DRAFT, for the owner to rewrite and approve before the draft stage.\n\nCommits since ${last ? `build ${last.build}` : 'the first build'}:\n\n${log.stdout}`, {mode: 0o600});
      fs.writeFileSync(path.join(staged, 'state.json'), JSON.stringify({schema: 1, release: sha256(bytes), done: {}, hold: {owner, apiUrl}, draft}, null, 2) + '\n', {mode: 0o600});
      load(staged, {ledger});
      step();
      fs.renameSync(staged, work);
      placed = true;
      const current = path.join(records, 'CURRENT');
      fs.writeFileSync(current + '.tmp', work + '\n');
      fs.renameSync(current + '.tmp', current);
    } catch (error) {
      fs.rmSync(placed ? work : staged, {recursive: true, force: true});
      fs.rmSync(path.join(records, 'CURRENT.tmp'), {force: true});
      throw error;
    }
    fs.rmSync(recovery, {force: true});
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
  // A signal reaches ssh or scp too; prep then stops at its next step and lets go of the hold.
  let interrupted = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { interrupted = true; });
  const io = {
    exec(command, args) {
      const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
    sha256: file => sha256(fs.readFileSync(file)),
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
