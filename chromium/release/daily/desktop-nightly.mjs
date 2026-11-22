#!/usr/bin/env node
// The Windows nightly on the Mac Studio (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 5). The launcher (~/Projects/Blanc/scripts/desktop-nightly.sh) takes the
// night lock (records/nightly/windows/RUNNING/, with its token), checks the
// desktop-nightly worktree out at chromium/next's tip, and runs this with
// BLANC_NIGHT_TOKEN. One night: skip if the draft is held, a Mac release is
// prepared, the server is busy or nothing changed since the last pass; else take
// the draft's hold, have the build server build the prototype and the beta at
// the next free number, upload both zips, run the three GitHub checks pinned to
// the night's commit, rerun once what failed, judge, record, and let go of the
// hold. It never pushes, signs or publishes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nextWindowsBuild, skipReason, judgeWindowsNight} from './desktop-nightly-rules.mjs';
import {acquireHold, readHold, uploadUnderHold, releaseHold, REPO, draftTag} from '../../windows/draft-hold.mjs';

const WORKFLOW = 'chromium-windows-candidate.yml';
const SERVER_EVIDENCE = '~/blanc-evidence/windows';
const VERSION_PREFIX = '158.0.8127.';

export function parseRunId(result) {
  const match = /actions\/runs\/([0-9]+)/.exec(`${result.stdout}\n${result.stderr}`);
  if (result.status !== 0 || !match) throw new Error('The dispatch printed no run id.');
  return match[1];
}
const stampOf = date => date.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

export function runNight({io, paths, token}) {
  const {records, worktree} = paths;
  const readJSON = file => JSON.parse(io.read(file));
  let owner = null;
  try {
    if (readJSON(path.join(records, 'RUNNING/owner')).token !== token) throw new Error('mismatch');
  } catch {
    throw new Error('This process does not hold the night lock; run through desktop-nightly.sh.');
  }
  const stamp = stampOf(io.now());
  const night = path.join(records, stamp);
  io.mkdir(night);
  const record = result => { io.write(path.join(night, 'result.json'), JSON.stringify({stamp, ...result}, null, 2) + '\n'); return {stamp, ...result}; };
  const exec = (command, args, options) => io.exec(command, args, options);
  const ssh = (remote, options) => exec('ssh', ['-i', paths.sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=60', paths.server, remote], options);

  const commit = exec('git', ['-C', worktree, 'rev-parse', 'HEAD']).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) return record({status: 'fail', reason: 'could not read the night\'s commit'});

  // Skips, in the rules' order.
  let hold = null;
  try { hold = readHold(io)?.body ?? null; } catch { hold = {kind: 'unreadable'}; }
  const probe = ssh('test -e ~/chromium-desktop/.blanc-checkout.lock && echo locked; pgrep -f "[s]iso ninja" >/dev/null && echo siso; echo free');
  const lastPassStamp = io.exists(path.join(records, 'LAST-PASS')) ? io.read(path.join(records, 'LAST-PASS')).trim() : null;
  const lastPass = lastPassStamp ? readJSON(path.join(records, lastPassStamp, 'result.json')) : null;
  const skip = skipReason({hold, macMarker: io.exists(paths.macMarker), serverLock: probe.status !== 0 || /locked/.test(probe.stdout),
    sisoRunning: /siso/.test(probe.stdout), unchangedSinceLastPass: lastPass?.sourceCommit === commit});
  if (skip) return record({status: 'skipped', reason: skip, sourceCommit: commit});

  owner = acquireHold(io, 'nightly', `night ${stamp}`).owner;
  let rerunUploaded = false;
  try {
    const ledger = readJSON(path.join(worktree, 'chromium/release/windows-ledger.json'));
    const shown = exec('git', ['-C', worktree, 'show', 'origin/chromium/next:chromium/release/build-reservations.json']);
    const build = nextWindowsBuild(ledger, shown.status === 0 ? JSON.parse(shown.stdout) : null);
    const version = `${VERSION_PREFIX}${build}`;
    const base = {sourceCommit: commit, build, version};

    const server = ssh(`bash -s -- ${commit} ${build} ${stamp}`, {input: io.read(paths.bootstrap)});
    let built;
    try { built = JSON.parse(server.stdout.trim().split('\n').at(-1)); } catch { return record({...base, status: 'fail', reason: 'the build server gave no result'}); }
    if (built.status === 'busy') return record({...base, status: 'skipped', reason: built.reason});
    if (built.status !== 'built') return record({...base, status: 'fail', reason: `server: ${built.reason ?? 'stopped'}`});

    // Both zips, checked against the server's records and their own candidate.json.
    const zips = {};
    for (const kind of ['beta', 'prototype']) {
      const local = path.join(night, `${kind}.zip`);
      const copied = exec('scp', ['-q', '-i', paths.sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
        `${paths.server}:${SERVER_EVIDENCE}/nightly-${stamp}/${kind}/blanc-windows-candidate.zip`, local]);
      if (copied.status !== 0 || io.sha256(local) !== built[kind].zipSha256) return record({...base, status: 'fail', reason: `the ${kind} zip did not arrive intact`});
      const candidate = JSON.parse(exec('unzip', ['-p', local, 'candidate.json']).stdout || '{}');
      const channel = kind === 'beta' ? 'beta' : 'preview';
      if (candidate.treeCommit !== commit || candidate.channel !== channel || (kind === 'beta' && candidate.version !== version) || candidate.id !== built[kind].id)
        return record({...base, status: 'fail', reason: `the ${kind} zip is not this night's build`});
      zips[kind] = {file: local, zipSha256: built[kind].zipSha256, ...candidate};
    }
    uploadUnderHold(io, owner, zips.prototype.file, 'blanc-windows-prototype.zip');
    uploadUnderHold(io, owner, zips.beta.file, 'blanc-windows-candidate.zip');

    const dispatch = inputs => parseRunId(exec('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'chromium/next',
      ...Object.entries({...inputs, source_commit: commit, draft_tag: draftTag()}).flatMap(([key, value]) => ['-f', `${key}=${value}`])]));
    const finish = id => {
      exec('gh', ['run', 'watch', id, '--repo', REPO, '--interval', '60']);
      const conclusion = JSON.parse(exec('gh', ['run', 'view', id, '--repo', REPO, '--json', 'conclusion']).stdout || '{}').conclusion;
      const dir = path.join(night, 'runs', id);
      exec('gh', ['run', 'download', id, '--repo', REPO, '--name', `chromium-windows-candidate-${id}`, '--dir', dir]);
      return {conclusion, dir};
    };
    const receipt = (dir, file) => { try { return readJSON(path.join(dir, file)); } catch { return null; } };
    const runs = {
      betaSmoke: dispatch({sha256: zips.beta.zipSha256, suite: 'smoke'}),
      betaCapture: dispatch({sha256: zips.beta.zipSha256, suite: 'smoke', update_expect: `capture:${version}`}),
      suite: dispatch({sha256: zips.prototype.zipSha256, asset: 'blanc-windows-prototype.zip', suite: 'f0', nightly: 'true'}),
    };
    const smoke = finish(runs.betaSmoke), capture = finish(runs.betaCapture), suiteRun = finish(runs.suite);
    const install = receipt(smoke.dir, 'install/install.json');
    const checks = {
      betaWorkflow: smoke.conclusion === 'success' && capture.conclusion === 'success',
      installPass: install?.pass === true,
      installed: install?.checks?.installed === true,
      installedLaunches: install?.checks?.installedLaunches === true,
      installedHashesMatch: install?.checks?.installedMatchesCandidate === true,
      betaIcon: receipt(capture.dir, 'installer-capture/capture.json')?.iconVerdict?.ok === true,
      prototypeLaunch: receipt(suiteRun.dir, 'smoke/smoke.json')?.pass === true,
      prototypeFrame: receipt(suiteRun.dir, 'frame/frame.json')?.pass === true,
    };
    const suite = receipt(suiteRun.dir, 'f0/baseline.json');
    const expect = {runIds: {suite: runs.suite}, prototypeId: zips.prototype.id, sourceCommit: commit};
    const judge = (rerun, extra = {}) => judgeWindowsNight({checks, suite: suite ?? {}, rerun, known: paths.knownFailures, inventory: paths.inventory,
      expect: {...expect, ...extra}});
    let verdict = judge(null);
    if (verdict.status === 'fail' && verdict.rerunCandidates?.length) {
      const list = path.join(night, 'nightly-rerun.json');
      io.write(list, JSON.stringify(verdict.rerunCandidates) + '\n');
      uploadUnderHold(io, owner, list, 'nightly-rerun.json');
      rerunUploaded = true;
      runs.rerun = dispatch({sha256: zips.prototype.zipSha256, asset: 'blanc-windows-prototype.zip', suite: 'f0', nightly: 'true',
        case_list_asset: 'nightly-rerun.json'});
      const rerunRun = finish(runs.rerun);
      verdict = judge(receipt(rerunRun.dir, 'f0/baseline.json'), {runIds: {suite: runs.suite, rerun: runs.rerun}, rerunCases: verdict.rerunCandidates});
    }
    const result = record({...base, status: verdict.status, reason: verdict.reason, runs, checks, judged: verdict,
      beta: {id: zips.beta.id, zipSha256: zips.beta.zipSha256, treeCommit: zips.beta.treeCommit, version: zips.beta.version,
        channel: zips.beta.channel, exeSha256: zips.beta.exeSha256, dllSha256: zips.beta.dllSha256},
      prototype: {id: zips.prototype.id, zipSha256: zips.prototype.zipSha256, treeCommit: zips.prototype.treeCommit}});
    if (verdict.status === 'pass') {
      io.write(path.join(records, 'LAST-PASS'), stamp + '\n');
      if (lastPassStamp && lastPassStamp !== stamp) {
        for (const kind of ['beta', 'prototype']) io.remove(path.join(records, lastPassStamp, `${kind}.zip`));
        ssh(`rm -rf ${SERVER_EVIDENCE}/nightly-${lastPassStamp}`);
      }
    } else {
      for (const kind of ['beta', 'prototype']) io.remove(path.join(night, `${kind}.zip`));
      ssh(`rm -rf ${SERVER_EVIDENCE}/nightly-${stamp}`);
    }
    return result;
  } finally {
    if (rerunUploaded) exec('gh', ['release', 'delete-asset', draftTag(), 'nightly-rerun.json', '--repo', REPO, '-y']);
    if (owner) releaseHold(io, owner);
  }
}

export function realIO() {
  return {
    now: () => new Date(),
    read: file => fs.readFileSync(file, 'utf8'),
    write: (file, text) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); },
    exists: file => fs.existsSync(file),
    remove: file => fs.rmSync(file, {recursive: true, force: true}),
    mkdir: dir => fs.mkdirSync(dir, {recursive: true}),
    sha256: file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    exec(command, args, {input} = {}) {
      const result = spawnSync(command, args, {input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const base = process.env.BLANC_STUDIO_BASE ?? path.join(os.homedir(), 'Projects/Blanc');
  const arg = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
  if (arg('--draft')) process.env.BLANC_CANDIDATE_DRAFT = arg('--draft');
  const worktree = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const paths = {
    records: arg('--records') ?? path.join(base, 'records/nightly/windows'),
    worktree,
    bootstrap: path.join(worktree, 'chromium/windows/server/nightly-bootstrap.sh'),
    server: process.env.BLANC_WINDOWS_BUILD_HOST ?? 'blanc@blanc-android-build',
    sshKey: path.join(os.homedir(), '.ssh/id_ed25519_blanc_android'),
    macMarker: path.join(base, 'records/RELEASE-IN-PROGRESS'),
    knownFailures: JSON.parse(fs.readFileSync(path.join(worktree, 'chromium/release/daily/windows-known-failures.json'), 'utf8')),
    inventory: JSON.parse(fs.readFileSync(path.join(worktree, 'chromium/scenarios/inventory.json'), 'utf8')),
  };
  try {
    console.log(JSON.stringify(runNight({io: realIO(), paths, token: process.env.BLANC_NIGHT_TOKEN})));
  } catch (error) {
    console.error(`desktop-nightly: ${error.message}`);
    process.exitCode = 1;
  }
}
