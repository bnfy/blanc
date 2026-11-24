#!/usr/bin/env node
// The desktop nightly on the Mac Studio (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 5), for each platform in PLATFORMS (Windows now; Linux joins once its beta
// is released). The launcher (~/Projects/Blanc/scripts/desktop-nightly.sh) takes
// the night lock (records/nightly/windows/RUNNING/, with its token and stamp),
// checks the desktop-nightly worktree out at chromium/next's tip, and runs this
// with BLANC_NIGHT_TOKEN. One Windows night: skip only on positive evidence (the
// draft held, a Mac release prepared, the server busy, nothing new); else take the
// draft's hold, have the build server build the prototype and the beta at the
// next free number, upload both zips, run the three GitHub checks pinned to the
// night's commit, rerun once what failed, judge, record, clean up, and let go of
// the hold only after every run it started has ended. It never pushes, signs or
// publishes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nextWindowsBuild, skipReason, judgeWindowsNight} from './desktop-nightly-rules.mjs';
import {acquireHold, readHold, uploadUnderHold, deleteUnderHold, releaseHold, REPO} from '../../windows/draft-hold.mjs';

const WORKFLOW = 'chromium-windows-candidate.yml';
const SERVER_EVIDENCE = '~/blanc-evidence/windows';
const VERSION_PREFIX = '158.0.8127.';
const DEFAULT_DRAFT = 'fork-windows-candidate';

export function parseRunId(result) {
  const match = /actions\/runs\/([0-9]+)/.exec(`${result.stdout}\n${result.stderr}`);
  if (result.status !== 0 || !match) throw new Error('The dispatch printed no run id.');
  return match[1];
}

export function runNight({io, paths, token}) {
  const {records, worktree} = paths;
  const draft = paths.draft ?? DEFAULT_DRAFT;
  const reservationsRef = paths.reservationsRef ?? 'origin/chromium/next';
  const readJSON = file => JSON.parse(io.read(file));
  let lockOwner;
  try { lockOwner = readJSON(path.join(records, 'RUNNING/owner')); } catch { lockOwner = null; }
  if (!token || !lockOwner?.token || lockOwner.token !== token) throw new Error('This process does not hold the night lock; run through desktop-nightly.sh.');
  const stamp = lockOwner.stamp;
  if (!/^[0-9]{8}-[0-9]{4}$/.test(stamp ?? '')) throw new Error('The night lock has no stamp.');
  const night = path.join(records, stamp);
  try { io.mkdir(night); } catch { throw new Error(`A night ${stamp} is already recorded; its record is kept.`); }

  const record = result => { io.write(path.join(night, 'result.json'), JSON.stringify({stamp, platform: 'windows', ...result}, null, 2) + '\n'); return {stamp, platform: 'windows', ...result}; };
  const exec = (command, args, options) => io.exec(command, args, options);
  const ssh = (remote, options) => exec('ssh', ['-i', paths.sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=60', paths.server, remote], options);
  const dropZips = () => { for (const kind of ['beta', 'prototype']) io.remove(path.join(night, `${kind}.zip`)); };
  // GitHub's word that a run ended; null while it hasn't (a failed watch never counts).
  const completed = id => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { exec('gh', ['run', 'watch', id, '--repo', REPO, '--interval', '60']); } catch { /* the view decides */ }
      let view = {};
      try { view = JSON.parse(exec('gh', ['run', 'view', id, '--repo', REPO, '--json', 'status,conclusion']).stdout || '{}'); } catch { view = {}; }
      if (view.status === 'completed') return view.conclusion ?? '';
    }
    return null;
  };
  // Set once the server phase has run under this night's checkout lock (never for busy).
  let serverRan = false;

  const commit = exec('git', ['-C', worktree, 'rev-parse', 'HEAD']).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) return record({status: 'fail', reason: 'could not read the night\'s commit'});

  // Skip only on positive evidence; a probe that fails is a failed night.
  let hold;
  try { hold = readHold(io, draft)?.body ?? null; } catch { return record({status: 'fail', reason: 'could not read the candidate draft', sourceCommit: commit}); }
  const probe = ssh('test -e ~/chromium-desktop/.blanc-checkout.lock && echo locked; pgrep -f "[s]iso ninja" >/dev/null && echo siso; echo free');
  if (probe.status !== 0 || !/free/.test(probe.stdout)) return record({status: 'fail', reason: 'could not reach the build server', sourceCommit: commit});
  const lastPassStamp = io.exists(path.join(records, 'LAST-PASS')) ? io.read(path.join(records, 'LAST-PASS')).trim() : null;
  const lastPass = lastPassStamp ? readJSON(path.join(records, lastPassStamp, 'result.json')) : null;
  const skip = skipReason({hold, macMarker: io.exists(paths.macMarker), serverLock: /locked/.test(probe.stdout),
    sisoRunning: /siso/.test(probe.stdout), unchangedSinceLastPass: lastPass?.sourceCommit === commit});
  if (skip) return record({status: 'skipped', reason: skip, sourceCommit: commit});

  // The shared claims, from the requested ref: absent is the ledger alone;
  // present but unreadable is a failed night.
  let reservations = null;
  if (exec('git', ['-C', worktree, 'cat-file', '-e', `${reservationsRef}:chromium/release/build-reservations.json`]).status === 0) {
    const shown = exec('git', ['-C', worktree, 'show', `${reservationsRef}:chromium/release/build-reservations.json`]);
    try { reservations = JSON.parse(shown.stdout); } catch { reservations = undefined; }
    if (shown.status !== 0 || !reservations) return record({status: 'fail', reason: 'the build reservations could not be read', sourceCommit: commit});
  } else if (exec('git', ['-C', worktree, 'rev-parse', '--verify', '--quiet', reservationsRef]).status !== 0) {
    return record({status: 'fail', reason: 'the reservations ref does not exist', sourceCommit: commit});
  }

  let owner;
  try { owner = acquireHold(io, 'nightly', `night ${stamp}`, draft).owner; } catch {
    return record({status: 'fail', reason: 'could not take the candidate draft\'s hold', sourceCommit: commit});
  }
  const started = [], finished = new Set();
  let rerunUploaded = false, keepHold = false, result = null;
  try {
    const ledger = readJSON(path.join(worktree, 'chromium/release/windows-ledger.json'));
    const build = nextWindowsBuild(ledger, reservations);
    const version = `${VERSION_PREFIX}${build}`;
    const base = {sourceCommit: commit, build, version};

    const server = ssh(`bash -s -- ${commit} ${build} ${stamp}`, {input: io.read(paths.bootstrap)});
    let built;
    try { built = JSON.parse(server.stdout.trim().split('\n').at(-1)); } catch { built = null; }
    if (!built) return (result = record({...base, status: 'fail', reason: 'the build server gave no result'}));
    serverRan = built.status === 'built' || built.phase === 'build';
    if (built.status === 'busy') return (result = record({...base, status: 'skipped', reason: built.reason}));
    if (built.status !== 'built') return (result = record({...base, status: 'fail', reason: `server: ${built.reason ?? 'stopped'}`}));

    const zips = {};
    for (const kind of ['beta', 'prototype']) {
      const local = path.join(night, `${kind}.zip`);
      const copied = exec('scp', ['-q', '-i', paths.sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
        `${paths.server}:${SERVER_EVIDENCE}/nightly-${stamp}/${kind}/blanc-windows-candidate.zip`, local]);
      if (copied.status !== 0 || io.sha256(local) !== built[kind].zipSha256) return (result = record({...base, status: 'fail', reason: `the ${kind} zip did not arrive intact`}));
      const candidate = JSON.parse(exec('unzip', ['-p', local, 'candidate.json']).stdout || '{}');
      const channel = kind === 'beta' ? 'beta' : 'preview';
      if (candidate.treeCommit !== commit || candidate.channel !== channel || (kind === 'beta' && candidate.version !== version) || candidate.id !== built[kind].id)
        return (result = record({...base, status: 'fail', reason: `the ${kind} zip is not this night's build`}));
      zips[kind] = {file: local, zipSha256: built[kind].zipSha256, ...candidate};
    }
    uploadUnderHold(io, owner, zips.prototype.file, 'blanc-windows-prototype.zip', draft);
    uploadUnderHold(io, owner, zips.beta.file, 'blanc-windows-candidate.zip', draft);

    const dispatch = inputs => {
      const id = parseRunId(exec('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'chromium/next',
        ...Object.entries({...inputs, source_commit: commit, draft_tag: draft}).flatMap(([key, value]) => ['-f', `${key}=${value}`])]));
      started.push(id);
      return id;
    };
    const finish = id => {
      const conclusion = completed(id);
      if (conclusion === null) throw new Error(`Run ${id} did not complete.`);
      finished.add(id);
      const dir = path.join(night, 'runs', id);
      exec('gh', ['run', 'download', id, '--repo', REPO, '--name', `chromium-windows-candidate-${id}`, '--dir', dir]);
      return {conclusion, dir};
    };
    const receipt = (dir, file) => { try { return readJSON(path.join(dir, file)); } catch { return null; } };
    const runs = {};
    runs.betaSmoke = dispatch({sha256: zips.beta.zipSha256, suite: 'smoke'});
    runs.betaCapture = dispatch({sha256: zips.beta.zipSha256, suite: 'smoke', update_expect: `capture:${version}`});
    runs.suite = dispatch({sha256: zips.prototype.zipSha256, asset: 'blanc-windows-prototype.zip', suite: 'f0', nightly: 'true'});
    const smoke = finish(runs.betaSmoke), capture = finish(runs.betaCapture), suiteRun = finish(runs.suite);
    const install = receipt(smoke.dir, 'install/install.json');
    const checks = {
      betaWorkflow: smoke.conclusion === 'success' && capture.conclusion === 'success',
      installPass: install?.pass === true,
      installed: install?.checks?.installed === true,
      installedLaunches: install?.checks?.installedLaunches === true,
      installedHashesMatch: install?.checks?.installedMatchesCandidate === true,
      betaIcon: receipt(capture.dir, 'installer-capture/capture.json')?.iconVerdict?.ok === true,
      // The suite run's own conclusion too: green receipts from a failed run count for nothing.
      prototypeLaunch: suiteRun.conclusion === 'success' && receipt(suiteRun.dir, 'smoke/smoke.json')?.pass === true,
      prototypeFrame: suiteRun.conclusion === 'success' && receipt(suiteRun.dir, 'frame/frame.json')?.pass === true,
    };
    const suite = receipt(suiteRun.dir, 'f0/baseline.json');
    const expect = {runIds: {suite: runs.suite}, prototypeId: zips.prototype.id, sourceCommit: commit};
    const judge = (rerun, extra = {}) => judgeWindowsNight({checks, suite: suite ?? {}, rerun, known: paths.knownFailures, inventory: paths.inventory,
      expect: {...expect, ...extra}});
    let verdict = judge(null);
    if (verdict.status === 'fail' && verdict.rerunCandidates?.length) {
      const list = path.join(night, 'nightly-rerun.json');
      io.write(list, JSON.stringify(verdict.rerunCandidates) + '\n');
      uploadUnderHold(io, owner, list, 'nightly-rerun.json', draft);
      rerunUploaded = true;
      runs.rerun = dispatch({sha256: zips.prototype.zipSha256, asset: 'blanc-windows-prototype.zip', suite: 'f0', nightly: 'true',
        case_list_asset: 'nightly-rerun.json'});
      const rerunRun = finish(runs.rerun);
      const rerunReport = rerunRun.conclusion === 'success' ? receipt(rerunRun.dir, 'f0/baseline.json') : null;
      verdict = rerunReport
        ? judge(rerunReport, {runIds: {suite: runs.suite, rerun: runs.rerun}, rerunCases: verdict.rerunCandidates})
        : {status: 'fail', reason: 'the rerun did not complete'};
    }
    result = record({...base, status: verdict.status, reason: verdict.reason, runs, checks, judged: verdict,
      beta: {id: zips.beta.id, zipSha256: zips.beta.zipSha256, treeCommit: zips.beta.treeCommit, version: zips.beta.version,
        channel: zips.beta.channel, executableSha256: zips.beta.exeSha256, dllSha256: zips.beta.dllSha256},
      prototype: {id: zips.prototype.id, zipSha256: zips.prototype.zipSha256, treeCommit: zips.prototype.treeCommit}});
    if (verdict.status === 'pass') {
      io.write(path.join(records, 'LAST-PASS.tmp'), stamp + '\n');
      io.rename(path.join(records, 'LAST-PASS.tmp'), path.join(records, 'LAST-PASS'));
      // The older pass's files go best effort: a failure there never undoes this pass.
      if (lastPassStamp && lastPassStamp !== stamp) {
        for (const kind of ['beta', 'prototype']) { try { io.remove(path.join(records, lastPassStamp, `${kind}.zip`)); } catch { /* kept; harmless */ } }
        try { ssh(`rm -rf ${SERVER_EVIDENCE}/nightly-${lastPassStamp}`); } catch { /* kept on the server */ }
      }
    }
    return result;
  } catch (error) {
    result = record({status: 'fail', reason: 'the night failed unexpectedly', sourceCommit: commit});
    throw error;
  } finally {
    if (result?.status !== 'pass') {
      try { dropZips(); } catch { /* best effort */ }
      // Only this night's packages, and only if its server phase ran: the apply backup stays.
      if (serverRan) { try { ssh(`rm -rf ${SERVER_EVIDENCE}/nightly-${stamp}/beta ${SERVER_EVIDENCE}/nightly-${stamp}/prototype`); } catch { /* kept */ } }
    }
    // Every run this night started ends before the draft can change hands.
    // A run whose cancel was refused may still write to the draft, so the hold stays.
    for (const id of started.filter(id => !finished.has(id))) {
      try { exec('gh', ['run', 'cancel', id, '--repo', REPO]); } catch { /* the status decides */ }
      if (completed(id) === null) keepHold = true;
    }
    if (rerunUploaded) {
      try { deleteUnderHold(io, owner, 'nightly-rerun.json', draft); } catch { keepHold = true; }
    }
    if (!keepHold) releaseHold(io, owner, draft);
  }
}

// The platforms a night runs, in order. Linux joins here once its beta is released.
export const PLATFORMS = Object.freeze([{name: 'windows', run: runNight}]);
export function runNights(options, platforms = PLATFORMS) {
  return platforms.map(platform => platform.run(options));
}

export function realIO() {
  return {
    now: () => new Date(),
    read: file => fs.readFileSync(file, 'utf8'),
    write: (file, text) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); },
    exists: file => fs.existsSync(file),
    remove: file => fs.rmSync(file, {recursive: true, force: true}),
    rename: (from, to) => fs.renameSync(from, to),
    mkdir: dir => fs.mkdirSync(dir),
    sha256: file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    exec(command, args, {input} = {}) {
      const result = spawnSync(command, args, {input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  // Paths come from the launcher's arguments over fixed defaults, never from
  // inherited environment, so a rehearsal stays isolated.
  const base = path.join(os.homedir(), 'Projects/Blanc');
  const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
  const worktree = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const paths = {
    records: arg('--records') ?? path.join(base, 'records/nightly/windows'),
    draft: arg('--draft') ?? DEFAULT_DRAFT,
    reservationsRef: arg('--reservations-ref') ?? 'origin/chromium/next',
    worktree,
    bootstrap: path.join(worktree, 'chromium/windows/server/nightly-bootstrap.sh'),
    server: arg('--server') ?? 'blanc@blanc-android-build',
    sshKey: path.join(os.homedir(), '.ssh/id_ed25519_blanc_android'),
    macMarker: path.join(base, 'records/RELEASE-IN-PROGRESS'),
    knownFailures: JSON.parse(fs.readFileSync(path.join(worktree, 'chromium/release/daily/windows-known-failures.json'), 'utf8')),
    inventory: JSON.parse(fs.readFileSync(path.join(worktree, 'chromium/scenarios/inventory.json'), 'utf8')),
  };
  try {
    const results = runNights({io: realIO(), paths, token: process.env.BLANC_NIGHT_TOKEN});
    console.log(JSON.stringify(results));
    if (results.some(r => r.status === 'fail')) process.exitCode = 1;
  } catch (error) {
    console.error(`desktop-nightly: ${error.message}`);
    process.exitCode = 1;
  }
}
