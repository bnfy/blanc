// The Windows nightly (docs/superpowers/plans/2026-11-21-windows-nightly.md):
// the pure rules of a night and the orchestrator around them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {nextWindowsBuild, windowsBetaArgs, argsDrift, skipReason, judgeWindowsNight} from './daily/desktop-nightly-rules.mjs';
import {windowsForkExclusions} from '../tests/windows-fork-exclusions.mjs';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const betaCommitted = fs.readFileSync(file('windows/args/beta-x64.gn'), 'utf8');
const protoCommitted = fs.readFileSync(file('windows/args/prototype-x64.gn'), 'utf8');
const inventory = JSON.parse(fs.readFileSync(file('scenarios/inventory.json'), 'utf8'));

const SOURCE = 'a'.repeat(40);
const PROTO = 'windows-x64-1111111111111111';
// A full Windows report in the runner's shape: every inventory case, excluded
// where the inventory or the Windows list excludes it, passing otherwise.
function fullReport({runId = '10', result = () => 'pass'} = {}) {
  return {
    platform: 'windows', candidate: PROTO, forkCommit: SOURCE, runId,
    scenarios: inventory.scenarios.map(s => ({
      id: s.id,
      cases: s.cases.map(c => ({
        id: c.id,
        result: s.desktopApplicability === 'excluded' || windowsForkExclusions[c.id] ? 'excluded' : result(c.id),
      })),
    })),
  };
}
const applicable = fullReport().scenarios.flatMap(s => s.cases).filter(c => c.result !== 'excluded').map(c => c.id);
const allTrue = {betaWorkflow: true, installPass: true, installed: true, installedLaunches: true, installedHashesMatch: true,
  betaIcon: true, prototypeLaunch: true, prototypeFrame: true};
const known = {cases: []};
const expect = {runIds: {suite: '10'}, prototypeId: PROTO, sourceCommit: SOURCE};

test('the next build is above every ledger and claimed build', () => {
  assert.equal(nextWindowsBuild({builds: [{build: 902}, {build: 904}]}), 905);
  assert.equal(nextWindowsBuild({builds: [{build: 904}]}, {sequences: {'desktop-158': [{build: 906, platforms: ['linux']}]}}), 907);
  assert.equal(nextWindowsBuild({builds: [{build: 904}]}, {sequences: {}}), 905);
});

test('only the version lines change in the beta, nothing in the prototype', () => {
  const out = windowsBetaArgs(betaCommitted, 905);
  assert.match(out, /^blanc_beta_version = "2\.0\.0-beta\.905"$/m);
  assert.match(out, /^blanc_beta_build = 905$/m);
  assert.deepEqual(argsDrift(betaCommitted, out, {ignoreVersion: true}), []);
  assert.deepEqual(argsDrift(protoCommitted, protoCommitted, {ignoreVersion: false}), []);
  assert.deepEqual(argsDrift(protoCommitted.replace('is_debug = false', 'is_debug = true'), protoCommitted, {ignoreVersion: false}), ['is_debug = true', '(missing) is_debug = false']);
  // A setting deleted from the output's args.gn is drift too.
  assert.deepEqual(argsDrift(protoCommitted.replace('is_debug = false\n', ''), protoCommitted, {ignoreVersion: false}), ['(missing) is_debug = false']);
  assert.deepEqual(argsDrift(betaCommitted.replace('enable_widevine = false', 'enable_widevine = true'), betaCommitted, {ignoreVersion: true}), ['enable_widevine = true', '(missing) enable_widevine = false']);
  // Without ignoreVersion, a version change is drift too.
  assert.equal(argsDrift(out, betaCommitted, {ignoreVersion: false}).length, 4);
});

test('the beta args edit refuses a file without exactly one of each version line', () => {
  assert.throws(() => windowsBetaArgs(betaCommitted.replace(/^blanc_beta_build = \d+\n/m, ''), 905), /blanc_beta_build/);
  assert.throws(() => windowsBetaArgs(betaCommitted + 'blanc_beta_version = "2.0.0-beta.1"\n', 905), /blanc_beta_version/);
  assert.throws(() => windowsBetaArgs(betaCommitted, 0), /build/);
});

test('a night skips for a hold, a Mac release, a busy server or nothing new', () => {
  const clear = {hold: null, macMarker: false, serverLock: false, sisoRunning: false, unchangedSinceLastPass: false};
  assert.equal(skipReason(clear), null);
  assert.match(skipReason({...clear, hold: {kind: 'release'}}), /the candidate draft is held/);
  assert.match(skipReason({...clear, macMarker: true}), /Mac release/);
  assert.match(skipReason({...clear, serverLock: true}), /desktop checkout is locked/);
  assert.match(skipReason({...clear, sisoRunning: true}), /build is running on the server/);
  assert.match(skipReason({...clear, unchangedSinceLastPass: true}), /nothing new since the last passing night/);
  // In order: the hold wins over everything after it.
  assert.match(skipReason({hold: {kind: 'nightly'}, macMarker: true, serverLock: true, sisoRunning: true, unchangedSinceLastPass: true}), /held/);
});

test('a full, matching, passing night passes', () => {
  assert.equal(judgeWindowsNight({checks: allTrue, suite: fullReport(), known, inventory, expect}).status, 'pass');
});

test('evidence that is not this night\'s, or not complete, fails it', () => {
  const full = fullReport();
  for (const suite of [{...full, runId: '9'}, {...full, candidate: 'windows-x64-0000000000000000'}, {...full, forkCommit: 'b'.repeat(40)},
                       {...full, scenarios: []}, {...full, developmentSubset: 'x'}, {...full, platform: 'macos'}])
    assert.equal(judgeWindowsNight({checks: allTrue, suite, known, inventory, expect}).status, 'fail');
  for (const key of Object.keys(allTrue))
    assert.equal(judgeWindowsNight({checks: {...allTrue, [key]: false}, suite: full, known, inventory, expect}).status, 'fail', key);
});

test('a run that executed nothing fails, and so does an unapproved exclusion', () => {
  assert.equal(judgeWindowsNight({checks: allTrue, suite: fullReport({result: () => 'not-run'}), known, inventory, expect}).status, 'fail');
  const sneaky = fullReport();
  sneaky.scenarios.flatMap(s => s.cases).find(c => c.id === applicable[0]).result = 'excluded';
  assert.equal(judgeWindowsNight({checks: allTrue, suite: sneaky, known, inventory, expect}).status, 'fail');
});

test('a rerun counts only when it is this night\'s and covers exactly the failed cases', () => {
  const failed = applicable[0];
  const suite = fullReport({result: id => id === failed ? 'fail' : 'pass'});
  const rerunOf = (ids, runId = '11') => ({...fullReport({runId, result: id => ids.includes(id) ? 'pass' : 'not-run'}),
    developmentSubset: {caseList: ids}});
  const withRerun = {...expect, runIds: {suite: '10', rerun: '11'}, rerunCases: [failed]};
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun: rerunOf([failed]), known, inventory, expect: withRerun}).status, 'pass');
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun: rerunOf([applicable[1]]), known, inventory,
    expect: {...withRerun, rerunCases: [failed]}}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun: rerunOf([failed], '12'), known, inventory, expect: withRerun}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun: {...rerunOf([failed]), candidate: 'windows-x64-2222222222222222'}, known, inventory,
    expect: withRerun}).status, 'fail');
  // Without a rerun, the failure stands.
  assert.equal(judgeWindowsNight({checks: allTrue, suite, known, inventory, expect}).status, 'fail');
});

// Codex review of Task 1 (2026-11-21).
test('every one of the eight checks must be present and true', () => {
  assert.equal(judgeWindowsNight({checks: {betaWorkflow: true}, suite: fullReport(), known, inventory, expect}).status, 'fail');
  const {prototypeFrame, ...seven} = allTrue;
  assert.equal(judgeWindowsNight({checks: seven, suite: fullReport(), known, inventory, expect}).status, 'fail');
});
test('a rerun must give results for exactly the requested cases, and both runs need recorded ids', () => {
  const [a, b] = applicable;
  const suite = fullReport({result: id => id === a || id === b ? 'fail' : 'pass'});
  const rerun = {...fullReport({runId: '11', result: id => id === a || id === b ? 'pass' : 'not-run'}), developmentSubset: {caseList: [a]}};
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun, known, inventory,
    expect: {...expect, runIds: {suite: '10', rerun: '11'}, rerunCases: [a]}}).status, 'fail', 'b cleared without being requested');
  const unbound = {...rerun, runId: undefined, developmentSubset: {caseList: [a, b]}};
  assert.equal(judgeWindowsNight({checks: allTrue, suite, rerun: unbound, known, inventory,
    expect: {...expect, runIds: {suite: '10'}, rerunCases: [a, b]}}).status, 'fail', 'no recorded rerun id');
  assert.equal(judgeWindowsNight({checks: allTrue, suite: {...fullReport(), runId: undefined}, known, inventory,
    expect: {...expect, runIds: {}}}).status, 'fail', 'no recorded suite id');
});
test('order, duplicates and the final newline count as drift', () => {
  const lines = protoCommitted.split('\n');
  const swapped = [lines[1], lines[0], ...lines.slice(2)].join('\n');
  assert.notDeepEqual(argsDrift(swapped, protoCommitted, {ignoreVersion: false}), []);
  assert.notDeepEqual(argsDrift(protoCommitted + 'is_debug = false\n', protoCommitted, {ignoreVersion: false}), []);
  assert.notDeepEqual(argsDrift(protoCommitted.replace(/\n$/, ''), protoCommitted, {ignoreVersion: false}), []);
  assert.notDeepEqual(argsDrift(betaCommitted + 'blanc_beta_build = 7\n', betaCommitted, {ignoreVersion: true}), [], 'a second version line');
});
test('an indented duplicate version line is refused', () => {
  assert.throws(() => windowsBetaArgs(betaCommitted + '  blanc_beta_build = 904\n', 905), /blanc_beta_build/);
});
test('an exclusion-eligible case left not-run fails a full suite, and a null subset field is a subset', () => {
  const eligible = fullReport().scenarios.flatMap(s => s.cases).find(c => c.result === 'excluded').id;
  const suite = fullReport();
  suite.scenarios.flatMap(s => s.cases).find(c => c.id === eligible).result = 'not-run';
  assert.equal(judgeWindowsNight({checks: allTrue, suite, known, inventory, expect}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: allTrue, suite: {...fullReport(), developmentSubset: null}, known, inventory, expect}).status, 'fail');
});
test('failure reasons and skip messages are fixed text, never report values', () => {
  const evil = 'windows-x64-<evil>';
  const verdict = judgeWindowsNight({checks: allTrue, suite: {...fullReport(), candidate: evil}, known, inventory, expect});
  assert.doesNotMatch(verdict.reason, /evil/);
  assert.doesNotMatch(skipReason({hold: {kind: '<evil>'}, macMarker: false, serverLock: false, sisoRunning: false, unchangedSinceLastPass: false}), /evil/);
});
test('the rules import cleanly from stdin, as the server script loads them', async () => {
  const {spawnSync} = await import('node:child_process');
  const rules = fileURLToPath(new URL('./daily/desktop-nightly-rules.mjs', import.meta.url));
  const run = spawnSync(process.execPath, ['--input-type=module', '-'], {input: `import(${JSON.stringify('file://' + rules)}).then(m => console.log(typeof m.argsDrift))`, encoding: 'utf8'});
  assert.equal(run.stdout.trim(), 'function', run.stderr);
});

// Task 5: the orchestrator on the Mac Studio, against a simulated Studio,
// build server and GitHub.
import {runNight, runNights, parseRunId, PLATFORMS} from './daily/desktop-nightly.mjs';
import crypto2 from 'node:crypto';

const sha2 = text => crypto2.createHash('sha256').update(text).digest('hex');
const NIGHT_COMMIT = 'a'.repeat(40);
const BETA_ZIP = 'beta zip bytes', PROTO_ZIP = 'proto zip bytes';
function world({hold = null, serverReply = null, betaTree = NIGHT_COMMIT, suiteResult = () => 'pass', rerunResult = () => 'pass',
                lastPass = null, macMarker = false, runningToken = 'tok', throwAt = null, suiteConclusion = 'success', probe = {status: 0, stdout: 'free\n'},
                holdReadFails = false, reservationsShow = null, failDispatch = 0, runStatus = () => 'completed', removeFails = () => false} = {}) {
  const files = new Map(), calls = [], uploads = [];
  const R = '/rec';
  files.set(`${R}/RUNNING/owner`, JSON.stringify({pid: 1, token: runningToken, stamp: '20261122-0400'}));
  files.set('/wt/chromium/release/windows-ledger.json', JSON.stringify({builds: [{build: 904}]}));
  if (lastPass) { files.set(`${R}/LAST-PASS`, lastPass.stamp); files.set(`${R}/${lastPass.stamp}/result.json`, JSON.stringify({status: 'pass', sourceCommit: lastPass.commit}));
    files.set(`${R}/${lastPass.stamp}/beta.zip`, 'old'); files.set(`${R}/${lastPass.stamp}/prototype.zip`, 'old'); }
  if (macMarker) files.set('/mac/RELEASE-IN-PROGRESS', '');
  let draftHold = hold, nextRun = 100, rerunOnDraft = false;
  const cancelled = [];
  const runs = new Map();
  const protoId = 'windows-x64-' + 'p'.repeat(16);
  const report = (runId, result, subset) => ({platform: 'windows', candidate: protoId, forkCommit: NIGHT_COMMIT, runId: String(runId),
    ...(subset ? {developmentSubset: {caseList: subset}} : {}),
    scenarios: inventory.scenarios.map(s => ({id: s.id, cases: s.cases.map(c => ({id: c.id,
      result: s.desktopApplicability === 'excluded' || windowsForkExclusions[c.id] ? 'excluded' : (subset ? (subset.includes(c.id) ? result(c.id) : 'not-run') : result(c.id))}))}))});
  const io = {
    now: () => new Date('2026-11-22T09:00:00Z'),
    read: p => { if (!files.has(p)) throw Object.assign(new Error('ENOENT ' + p), {code: 'ENOENT'}); return files.get(p); },
    write: (p, t) => files.set(p, t), exists: p => files.has(p) || [...files.keys()].some(k => k.startsWith(p + '/')),
    remove: p => { if (removeFails(p)) throw new Error('EPERM ' + p); for (const k of [...files.keys()]) if (k === p || k.startsWith(p + '/')) files.delete(k); },
    rename: (from, to) => { if (!files.has(from)) throw new Error('ENOENT ' + from); files.set(to, files.get(from)); files.delete(from); },
    mkdir: p => { if (files.has(p + '/.dir')) throw Object.assign(new Error('EEXIST'), {code: 'EEXIST'}); files.set(p + '/.dir', ''); }, sha256: p => sha2(files.get(p)),
    copyFile: (from, to) => fs.writeFileSync(to, files.get(from)),
    exec(command, args, options = {}) {
      calls.push([command, ...args]);
      if (throwAt && args.join(' ').includes(throwAt)) throw new Error('boom');
      if (command === 'git' && args.includes('rev-parse')) return {status: 0, stdout: NIGHT_COMMIT + '\n', stderr: ''};
      if (command === 'git' && args.includes('cat-file')) return {status: reservationsShow ? 0 : 1, stdout: '', stderr: ''};
      if (command === 'git' && args.includes('show')) return reservationsShow ?? {status: 128, stdout: '', stderr: 'fatal'};
      if (command === 'git' && args.includes('--verify')) return {status: 0, stdout: NIGHT_COMMIT + '\n', stderr: ''};
      if (command === 'ssh' && args.some(a => a.includes('pgrep') || a.includes('blanc-checkout.lock')) && !options.input) return {stderr: '', ...probe};
      if (command === 'ssh' && options.input) return {status: 0, stdout: JSON.stringify(serverReply ?? {status: 'built',
        beta: {id: 'windows-x64-' + 'b'.repeat(16), zipSha256: sha2(BETA_ZIP)}, prototype: {id: protoId, zipSha256: sha2(PROTO_ZIP)}}) + '\n', stderr: ''};
      if (command === 'ssh') return {status: 0, stdout: '', stderr: ''};
      if (command === 'scp') { const dest = args.at(-1); files.set(dest, dest.includes('beta') ? BETA_ZIP : PROTO_ZIP); return {status: 0, stdout: '', stderr: ''}; }
      if (command === 'unzip') {
        const zip = args.find(a => a.endsWith('.zip'));
        const beta = zip.includes('beta');
        return {status: 0, stdout: JSON.stringify({id: beta ? 'windows-x64-' + 'b'.repeat(16) : protoId, treeCommit: beta ? betaTree : NIGHT_COMMIT,
          version: beta ? '158.0.8127.905' : '158.0.8127.2', channel: beta ? 'beta' : 'preview', exeSha256: 'e'.repeat(64), dllSha256: 'd'.repeat(64)}), stderr: ''};
      }
      if (command !== 'gh') return {status: 1, stdout: '', stderr: 'unexpected ' + command};
      if (args[0] === 'release' && args[1] === 'view') {
        if (args.includes('isDraft')) return {status: 0, stdout: 'true', stderr: ''};
        return {status: 0, stdout: JSON.stringify({assets: [...(draftHold ? [{name: 'draft-hold.json', apiUrl: 'https://api.github.com/x/1'}] : []),
          ...(rerunOnDraft ? [{name: 'nightly-rerun.json', apiUrl: 'https://api.github.com/x/rerun'}] : [])]}), stderr: ''};
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const name = args[3].split('/').pop();
        if (name === 'draft-hold.json') {
          if (draftHold) return {status: 1, stdout: '', stderr: 'exists'};
          draftHold = JSON.parse(fs.readFileSync(args[3], 'utf8'));
        } else { uploads.push(name); if (name === 'nightly-rerun.json') rerunOnDraft = true; }
        return {status: 0, stdout: '', stderr: ''};
      }
      if (args[0] === 'api') {
        if (args.includes('DELETE')) {
          const url = args.at(-1);
          if (url.endsWith('/rerun')) { rerunOnDraft = false; return {status: 0, stdout: '', stderr: ''}; }
          draftHold = null; return {status: 0, stdout: '', stderr: ''};
        }
        if (holdReadFails) return {status: 1, stdout: '', stderr: 'boom'};
        return {status: 0, stdout: JSON.stringify(draftHold), stderr: ''};
      }
      if (args[0] === 'workflow' && args[1] === 'run') {
        if (failDispatch && nextRun - 100 === failDispatch - 1) { nextRun++; return {status: 1, stdout: '', stderr: 'dispatch failed'}; }
        const id = nextRun++;
        runs.set(id, Object.fromEntries(args.filter((a, i) => args[i - 1] === '-f').map(kv => kv.split('='))));
        return {status: 0, stdout: '', stderr: `https://github.com/bnfy/blanc/actions/runs/${id}\n`};
      }
      if (args[0] === 'run' && args[1] === 'watch') return {status: 0, stdout: '', stderr: ''};
      if (args[0] === 'run' && args[1] === 'cancel') { cancelled.push(args[2]); return {status: 0, stdout: '', stderr: ''}; }
      if (args[0] === 'run' && args[1] === 'view') {
        const status = runStatus(Number(args[2]));
        return {status: 0, stdout: JSON.stringify({status, conclusion: status !== 'completed' ? '' : runs.get(Number(args[2]))?.asset === 'blanc-windows-prototype.zip' ? suiteConclusion : 'success'}), stderr: ''};
      }
      if (args[0] === 'run' && args[1] === 'download') {
        const id = Number(args[2]), inputs = runs.get(id), dir = args[args.indexOf('--dir') + 1];
        if (inputs.asset === 'blanc-windows-prototype.zip') {
          files.set(`${dir}/smoke/smoke.json`, JSON.stringify({pass: true}));
          files.set(`${dir}/frame/frame.json`, JSON.stringify({pass: true}));
          const subset = inputs.case_list_asset ? JSON.parse(uploadsBody.rerun) : null;
          files.set(`${dir}/f0/baseline.json`, JSON.stringify(report(id, subset ? rerunResult : suiteResult, subset)));
        } else if (inputs.update_expect) files.set(`${dir}/installer-capture/capture.json`, JSON.stringify({iconVerdict: {ok: true}}));
        else files.set(`${dir}/install/install.json`, JSON.stringify({pass: true, checks: {installed: true, installedLaunches: true, installedMatchesCandidate: true}}));
        return {status: 0, stdout: '', stderr: ''};
      }
      return {status: 1, stdout: '', stderr: 'unexpected gh ' + args.join(' ')};
    },
  };
  const uploadsBody = {};
  const exec = io.exec;
  io.exec = (command, args, options) => {
    if (command === 'gh' && args[0] === 'release' && args[1] === 'upload' && args[3].endsWith('nightly-rerun.json')) uploadsBody.rerun = fs.readFileSync(args[3], 'utf8');
    return exec(command, args, options);
  };
  const paths = {records: R, worktree: '/wt', bootstrap: '/wt/chromium/windows/server/nightly-bootstrap.sh', server: 'blanc@server', macMarker: '/mac/RELEASE-IN-PROGRESS',
    sshKey: '/k', knownFailures: {cases: []}, inventory};
  files.set('/wt/chromium/windows/server/nightly-bootstrap.sh', '#!/bin/bash');
  return {io, files, calls, uploads, runs, paths, cancelled, hold: () => draftHold, rerunOnDraft: () => rerunOnDraft};
}
const go = (w, token = 'tok') => runNight({io: w.io, paths: w.paths, token});

test('a run id comes from the dispatch output, never a search', () => {
  assert.equal(parseRunId({status: 0, stdout: '', stderr: 'https://github.com/bnfy/blanc/actions/runs/123\n'}), '123');
  assert.throws(() => parseRunId({status: 0, stdout: 'Created workflow_dispatch event', stderr: ''}), /run id/);
});
test('a passing night uploads both zips before dispatching, pins every dispatch, and records the pass', () => {
  const w = world();
  const result = go(w);
  assert.equal(result.status, 'pass', result.reason);
  assert.equal(result.build, 905);
  assert.deepEqual(w.uploads, ['blanc-windows-prototype.zip', 'blanc-windows-candidate.zip']);
  const firstDispatch = w.calls.findIndex(c => c[0] === 'gh' && c[1] === 'workflow');
  const lastUpload = w.calls.findLastIndex(c => c[0] === 'gh' && c[2] === 'upload' && !c[4]?.endsWith('draft-hold.json'));
  assert.ok(lastUpload < firstDispatch, 'no upload after the first dispatch');
  for (const inputs of w.runs.values()) assert.equal(inputs.source_commit, NIGHT_COMMIT);
  assert.equal(w.files.get('/rec/LAST-PASS').trim(), result.stamp);
  assert.ok(w.files.has(`/rec/${result.stamp}/beta.zip`) && w.files.has(`/rec/${result.stamp}/prototype.zip`));
  assert.equal(w.hold(), null, 'the night released its hold');
});
test('a held draft skips the night without touching it', () => {
  const w = world({hold: {kind: 'release', owner: 'x'}});
  const result = go(w);
  assert.equal(result.status, 'skipped');
  assert.deepEqual(w.uploads, []);
  assert.ok(!w.calls.some(c => c[0] === 'ssh' && c.some(a => String(a).includes('bash -s'))));
});
test('a night started without the launcher\'s token does nothing', () => {
  const w = world({runningToken: 'other'});
  assert.throws(() => go(w), /night lock/);
  assert.deepEqual(w.calls.filter(c => c[0] === 'gh' && c[2] === 'upload'), []);
});
test('a beta built from another commit stops the night before any upload', () => {
  const w = world({betaTree: 'b'.repeat(40)});
  assert.equal(go(w).status, 'fail');
  assert.deepEqual(w.uploads, []);
  assert.equal(w.hold(), null);
});
test('a busy server is a skip, not a failure', () => {
  const w = world({serverReply: {status: 'busy', reason: 'a build is running on the server'}});
  assert.equal(go(w).status, 'skipped');
});
test('a new failure that fails its rerun leaves LAST-PASS where it was', () => {
  const failing = applicable[0];
  const w = world({lastPass: {stamp: '20261121-0400', commit: 'f'.repeat(40)}, suiteResult: id => id === failing ? 'fail' : 'pass', rerunResult: () => 'fail'});
  const result = go(w);
  assert.equal(result.status, 'fail');
  assert.equal(w.files.get('/rec/LAST-PASS').trim(), '20261121-0400');
  assert.ok(w.uploads.includes('nightly-rerun.json'));
  assert.ok(!w.files.has(`/rec/${result.stamp}/beta.zip`), 'a failed night keeps no zips');
});
test('a failure that passes its rerun passes the night', () => {
  const flaky = applicable[0];
  const w = world({suiteResult: id => id === flaky ? 'fail' : 'pass', rerunResult: () => 'pass'});
  assert.equal(go(w).status, 'pass');
});
test('pass after pass keeps only the newest pass\'s zips and asks the server to drop the older folder', () => {
  const w = world({lastPass: {stamp: '20261121-0400', commit: 'f'.repeat(40)}});
  const result = go(w);
  assert.equal(result.status, 'pass');
  assert.ok(!w.files.has('/rec/20261121-0400/beta.zip'));
  assert.ok(w.calls.some(c => c[0] === 'ssh' && c.some(a => String(a).includes('nightly-20261121-0400'))));
});
test('nothing new since the last pass skips the night', () => {
  const w = world({lastPass: {stamp: '20261121-0400', commit: NIGHT_COMMIT}});
  assert.equal(go(w).status, 'skipped');
});
test('an exception still releases the night\'s own hold', () => {
  const w = world({throwAt: 'run download'});
  assert.throws(() => go(w), /boom/);
  assert.equal(w.hold(), null);
});
test('the Windows known failures are inventory cases, each with a reason that cites the W2 triage', () => {
  const known = JSON.parse(fs.readFileSync(file('release/daily/windows-known-failures.json'), 'utf8'));
  const ids = new Set(inventory.scenarios.flatMap(s => s.cases.map(c => c.id)));
  assert.ok(known.cases.length > 0);
  for (const entry of known.cases) {
    assert.ok(ids.has(entry.id), entry.id);
    assert.ok(entry.results.every(r => ['fail', 'undefined'].includes(r)));
    assert.match(entry.reason, /w2-windows/);
  }
});

// Codex review of Task 5 (2026-11-21).
test('a failed suite workflow fails the night whatever its receipts say', () => {
  const w = world({suiteConclusion: 'failure'});
  assert.equal(go(w).status, 'fail');
  assert.equal(w.files.has('/rec/LAST-PASS'), false);
});
test('a failed dispatch cancels the runs already started before the hold is released', () => {
  const w = world({failDispatch: 2});
  assert.throws(() => go(w), /run id/);
  assert.deepEqual(w.cancelled, ['100']);
  assert.equal(w.hold(), null);
  const result = JSON.parse(w.files.get('/rec/20261122-0400/result.json'));
  assert.equal(result.status, 'fail');
  assert.ok(!w.files.has('/rec/20261122-0400/beta.zip'), 'the failed night keeps no zips');
});
test('the rerun list is deleted under the hold, by its asset, before the hold goes', () => {
  const flaky = applicable[0];
  const w = world({suiteResult: id => id === flaky ? 'fail' : 'pass', rerunResult: () => 'pass'});
  go(w);
  assert.equal(w.rerunOnDraft(), false);
  const deleteRerun = w.calls.findIndex(c => c.join(' ').includes('DELETE') && c.join(' ').includes('/rerun'));
  const deleteHold = w.calls.findIndex(c => c.join(' ').includes('DELETE') && c.join(' ').includes('/x/1'));
  assert.ok(deleteRerun >= 0 && deleteRerun < deleteHold);
});
test('an empty or missing launcher token is never a match', () => {
  const w = world();
  w.files.set('/rec/RUNNING/owner', JSON.stringify({pid: 1, stamp: '20261122-0400'}));
  assert.throws(() => runNight({io: w.io, paths: w.paths, token: undefined}), /night lock/);
});
test('a draft that cannot be read, or a server that cannot be reached, fails the night instead of skipping it', () => {
  assert.equal(go(world({holdReadFails: true})).status, 'fail');
  assert.equal(go(world({probe: {status: 255, stdout: ''}})).status, 'fail');
});
test('the reservation file is read from the requested ref, and an unreadable one fails the night', () => {
  const w = world({reservationsShow: {status: 0, stdout: JSON.stringify({sequences: {'desktop-158': [{build: 910, platforms: ['linux']}]}}), stderr: ''}});
  w.paths.reservationsRef = 'refs/test/claims';
  assert.equal(go(w).build, 911);
  assert.ok(w.calls.some(c => c.join(' ').includes('refs/test/claims:chromium/release/build-reservations.json')));
  const bad = world({reservationsShow: {status: 128, stdout: '', stderr: 'fatal: bad object'}});
  assert.equal(go(bad).status, 'fail');
});
test('the night uses the launcher\'s stamp, and never overwrites an earlier record', () => {
  const w = world();
  assert.equal(go(w).stamp, '20261122-0400');
  w.files.set('/rec/RUNNING/owner', JSON.stringify({pid: 1, token: 'tok', stamp: '20261122-0400'}));
  assert.throws(() => go(w), /already/);
});
test('the record names the beta\'s executable hash as executableSha256', () => {
  const result = go(world());
  assert.equal(result.beta.executableSha256, 'e'.repeat(64));
  assert.equal(result.beta.exeSha256, undefined);
});
test('nights run through the platform list, Windows first and only for now', () => {
  assert.deepEqual(PLATFORMS.map(p => p.name), ['windows']);
  const results = runNights({io: world().io, paths: world().paths, token: 'tok'}, PLATFORMS.map(p => ({...p, run: () => ({status: 'pass', platform: p.name})})));
  assert.deepEqual(results.map(r => r.platform), ['windows']);
});

// Codex final review (2026-11-21).
test('a run counts as finished only once GitHub says it completed; an unknown run keeps the hold', () => {
  const w = world({runStatus: id => id === 102 ? 'in_progress' : 'completed'});
  const outcome = (() => { try { return go(w); } catch (error) { return {status: 'threw', error}; } })();
  assert.notEqual(outcome.status, 'pass');
  assert.ok(w.cancelled.includes('102'), 'the run that never completed was cancelled');
  assert.ok(w.hold(), 'the hold stays while a run may still use the draft');
  assert.equal(w.files.has('/rec/LAST-PASS'), false);
});
test('a busy server is never cleaned up after; a stopped build loses only its packages', () => {
  const busy = world({serverReply: {status: 'busy', reason: 'a build is running on the server'}});
  go(busy);
  assert.ok(!busy.calls.some(c => c[0] === 'ssh' && c.join(' ').includes('rm ')), 'nothing removed on a busy server');
  const stopped = world({serverReply: {status: 'stopped', reason: 'the apply check refused the checkout', phase: 'build'}});
  go(stopped);
  const removal = stopped.calls.filter(c => c[0] === 'ssh' && c.join(' ').includes('rm '));
  assert.equal(removal.length, 1);
  assert.match(removal[0].join(' '), /nightly-20261122-0400\/beta \S*nightly-20261122-0400\/prototype$/);
  assert.doesNotMatch(removal[0].join(' '), /rm -rf [^ ]*nightly-20261122-0400( |$)/, 'the apply backup stays');
});
test('a pass stays a pass when the older pass\'s files cannot be removed, and LAST-PASS moves atomically', () => {
  const w = world({lastPass: {stamp: '20261121-0400', commit: 'f'.repeat(40)}, removeFails: p => p.includes('20261121-0400')});
  const result = go(w);
  assert.equal(result.status, 'pass');
  assert.equal(w.files.get('/rec/LAST-PASS').trim(), '20261122-0400');
  assert.ok(w.files.has('/rec/20261122-0400/beta.zip'), 'the new pass keeps its zips');
  assert.equal(JSON.parse(w.files.get('/rec/20261122-0400/result.json')).status, 'pass');
  assert.ok(!w.files.has('/rec/LAST-PASS.tmp'));
});
