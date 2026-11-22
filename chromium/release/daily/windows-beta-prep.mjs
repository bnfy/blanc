#!/usr/bin/env node
// Starts a Windows beta release from the newest passing night (docs/superpowers/
// plans/2026-11-21-windows-nightly.md, Task 6), on the MacBook Pro:
//
//   node chromium/release/daily/windows-beta-prep.mjs [--records DIR]
//
// It takes the candidate draft's hold for the release, reads the Mac Studio's
// LAST-PASS night, makes sure the draft holds that night's beta zip (uploading
// the kept copy if a later night replaced it), claims the night's build number
// once the shared reservation file exists, writes a schema-2 work folder (the
// owner token stays in state.json, never in the public descriptor), checks it
// through windows-release.mjs's own loader, and only then points CURRENT at it.
// Any stop releases the hold it took and leaves CURRENT as it was.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../preflight.mjs';
import {load} from '../windows-release.mjs';
import {acquireHold, releaseHold, uploadUnderHold, REPO, draftTag} from '../../windows/draft-hold.mjs';

const STUDIO = ['-i', path.join(os.homedir(), '.ssh/id_ed25519_macmini'), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15', 'anthonyjloria@Mac-Studio.local'];
const NIGHTS = '~/Projects/Blanc/records/nightly/windows';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function prepareRelease({io, records, ledger}) {
  const {owner, apiUrl} = acquireHold(io, 'release', 'Windows beta release prep');
  try {
    const shown = io.exec('ssh', [...STUDIO, `cat ${NIGHTS}/$(cat ${NIGHTS}/LAST-PASS)/result.json`]);
    if (shown.status !== 0) throw new Error('The Mac Studio has no passing night to release.');
    const night = JSON.parse(shown.stdout);
    if (night.status !== 'pass' || !/^[0-9a-f]{40}$/.test(night.sourceCommit ?? '')) throw new Error('The newest night did not pass.');
    const beta = night.beta;

    // The shared claims: once the file exists, a release needs an exact claim,
    // which the Linux lane's helper makes; until it lands, nothing is released
    // under the shared sequence.
    io.exec('git', ['-C', ROOT, 'fetch', '-q', 'origin', 'chromium/next']);
    const reservations = io.exec('git', ['-C', ROOT, 'show', 'FETCH_HEAD:chromium/release/build-reservations.json']);
    if (reservations.status === 0) throw new Error('The shared build claims exist, but no exact claim helper is here yet; claim the night\'s number first.');

    // The draft must hold this night's beta zip.
    const assets = JSON.parse(io.exec('gh', ['release', 'view', draftTag(), '--repo', REPO, '--json', 'assets']).stdout || '{}').assets ?? [];
    const onDraft = assets.find(a => a.name === 'blanc-windows-candidate.zip')?.digest;
    if (onDraft !== `sha256:${beta.zipSha256}`) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prep-'));
      try {
        const kept = path.join(temp, 'beta.zip');
        const copied = io.exec('scp', ['-q', ...STUDIO.slice(0, -1), `${STUDIO.at(-1)}:${NIGHTS.replace('~/', '')}/${night.stamp}/beta.zip`, kept]);
        if (copied.status !== 0 || io.sha256(kept) !== beta.zipSha256) throw new Error('The kept beta zip did not arrive intact.');
        uploadUnderHold(io, owner, kept, 'blanc-windows-candidate.zip');
      } finally { fs.rmSync(temp, {recursive: true, force: true}); }
      const again = JSON.parse(io.exec('gh', ['release', 'view', draftTag(), '--repo', REPO, '--json', 'assets']).stdout || '{}').assets ?? [];
      if (again.find(a => a.name === 'blanc-windows-candidate.zip')?.digest !== `sha256:${beta.zipSha256}`) throw new Error('The draft still holds another zip.');
    }

    const last = ledger.builds.at(-1);
    const release = {schema: 2, product: 'Blanc Beta', platform: 'windows-x64', version: night.version, build: night.build,
      previousBuild: last?.build ?? 0, tag: `chromium-beta-windows-${night.version}`, sourceCommit: night.sourceCommit, prerelease: true, makeLatest: false,
      candidate: {id: beta.id, zipSha256: beta.zipSha256, treeCommit: beta.treeCommit, version: beta.version}};
    const work = path.join(records, night.version);
    if (fs.existsSync(work)) throw new Error('A work folder for this version already exists.');
    fs.mkdirSync(work, {mode: 0o700});
    fs.chmodSync(work, 0o700);
    const bytes = Buffer.from(JSON.stringify(release, null, 2) + '\n');
    fs.writeFileSync(path.join(work, 'windows-release.json'), bytes, {mode: 0o600});
    const log = last?.sourceCommit ? io.exec('git', ['-C', ROOT, 'log', '--oneline', '--no-merges', `${last.sourceCommit}..${night.sourceCommit}`]).stdout : '';
    fs.writeFileSync(path.join(work, 'release-notes.md'),
      `DRAFT, for the owner to rewrite and approve before the draft stage.\n\nCommits since ${last ? `build ${last.build}` : 'the first build'}:\n\n${log}`, {mode: 0o600});
    fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({schema: 1, release: sha256(bytes), done: {}, hold: {owner, apiUrl}}, null, 2) + '\n', {mode: 0o600});
    try {
      load(work, {ledger});
    } catch (error) {
      fs.rmSync(work, {recursive: true, force: true});
      throw error;
    }
    const current = path.join(records, 'CURRENT');
    fs.writeFileSync(current + '.tmp', work + '\n');
    fs.renameSync(current + '.tmp', current);
    return {work, owner};
  } catch (error) {
    releaseHold(io, owner);
    throw error;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const at = process.argv.indexOf('--records');
  const records = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(os.homedir(), 'Projects/Blanc/records/windows-release');
  const io = {
    exec(command, args) {
      const result = spawnSync(command, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
    sha256: file => sha256(fs.readFileSync(file)),
  };
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'chromium/release/windows-ledger.json'), 'utf8'));
    const {work} = prepareRelease({io, records, ledger});
    console.log(`Prepared ${work}. Rewrite release-notes.md for the owner's approval, then run the stages.`);
  } catch (error) {
    console.error(`windows-beta-prep: ${error.message}`);
    process.exitCode = 1;
  }
}
