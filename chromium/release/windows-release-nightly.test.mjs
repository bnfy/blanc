// Releasing a Windows beta from a passing night (docs/superpowers/plans/
// 2026-11-21-windows-nightly.md, Task 6): schema-2 records bound to their
// claim and candidate, one stage at a time, the draft's hold for every stage
// that writes, exact run ids, proofs bound to the release's own bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateWindowsRelease, claimProblem, runStage, load, markAbandoned, proofPasses} from './windows-release.mjs';
import {prepareRelease} from './daily/windows-beta-prep.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCE = 'a'.repeat(40);
const v2 = {schema: 2, product: 'Blanc Beta', platform: 'windows-x64', version: '158.0.8127.905', build: 905, previousBuild: 904,
  tag: 'chromium-beta-windows-158.0.8127.905', sourceCommit: SOURCE, prerelease: true, makeLatest: false,
  candidate: {id: 'windows-x64-bbbbbbbbbbbbbbbb', zipSha256: 'b'.repeat(64), treeCommit: SOURCE, version: '158.0.8127.905'}};
const ledger = {schema: 1, builds: [{build: 904}]};
const v1 = {...v2, schema: 1, candidate: {id: v2.candidate.id, zipSha256: v2.candidate.zipSha256}};
const seq = entries => ({schema: 1, sequences: {'desktop-158': entries}});
const claim = (build, sourceCommit = SOURCE, platforms = ['windows']) => ({build, sourceCommit, platforms, purpose: 'release'});

function workFolder(r, state) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-win-nightly-'));
  fs.chmodSync(work, 0o700);
  fs.writeFileSync(path.join(work, 'windows-release.json'), JSON.stringify(r));
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({schema: 1, release: sha(fs.readFileSync(path.join(work, 'windows-release.json'))), done: {}, ...state}));
  return work;
}

test('schema 1 records still load; schema 2 binds the candidate to the source and version', () => {
  validateWindowsRelease(v1, ledger);
  validateWindowsRelease(v2, ledger);
  assert.throws(() => validateWindowsRelease({...v2, candidate: {...v2.candidate, treeCommit: 'c'.repeat(40)}}, ledger), /treeCommit/);
  assert.throws(() => validateWindowsRelease({...v2, candidate: {...v2.candidate, version: '158.0.8127.904'}}, ledger), /version/);
  assert.throws(() => validateWindowsRelease({...v2, schema: 3}, ledger), /schema/);
});

test('a claim must name this build, source and platform, with no earlier claim at or above it except a shared same-source one', () => {
  assert.equal(claimProblem(seq([claim(902), claim(903), claim(904), claim(905)]), v2), null);
  assert.equal(claimProblem(seq([claim(905, SOURCE, ['linux', 'windows'])]), v2), null);
  assert.equal(claimProblem(seq([claim(905, SOURCE, ['linux']), claim(905)]), v2), null, 'a shared same-number same-source claim');
  assert.match(claimProblem(seq([claim(904)]), v2), /no claim/);
  assert.match(claimProblem(seq([claim(905, 'c'.repeat(40))]), v2), /no claim/);
  assert.match(claimProblem(seq([claim(906, 'c'.repeat(40), ['linux']), claim(905)]), v2), /earlier claim/, 'an earlier higher claim');
  assert.match(claimProblem(seq([claim(906, SOURCE, ['linux']), claim(905)]), v2), /earlier claim/, 'even for the same source');
  assert.match(claimProblem(seq([claim(905, 'c'.repeat(40), ['linux']), claim(905)]), v2), /earlier claim/, 'the same number for other source');
  assert.equal(claimProblem(seq([claim(905), claim(906, 'c'.repeat(40), ['linux'])]), v2), null, 'a later claim never strands it');
});

function io(answers = [], extra = {}) {
  const calls = [];
  return {calls, env: {PATH: '/usr/bin:/bin'}, now: () => 0, pause: async () => {}, ledger: () => ledger,
    exec(command, args) {
      const line = [command, ...args].join(' ');
      calls.push(line);
      for (const [pattern, answer] of answers) if (line.includes(pattern)) return {status: 0, stdout: '', stderr: '', ...(typeof answer === 'function' ? answer(args) : answer)};
      return {status: 0, stdout: '', stderr: ''};
    },
    async confirm() { return true; }, ...extra};
}
const holdAnswers = owner => [['release view fork-windows-candidate --repo bnfy/blanc --json assets', {stdout: JSON.stringify({assets: [{name: 'draft-hold.json', apiUrl: 'https://api.github.com/h/1'}]})}],
  ['api -H Accept: application/octet-stream https://api.github.com/h/1', {stdout: JSON.stringify({kind: 'release', owner})}]];

test('a schema-2 stage needs the live hold, and an abandoned release runs nothing', async () => {
  const work = workFolder(v2, {hold: {owner: 'mine'}});
  await assert.rejects(runStage('preflight', work, io(holdAnswers('someone-else'))), /hold/);
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({...JSON.parse(fs.readFileSync(path.join(work, 'state.json'))), abandoned: 'x'}));
  await assert.rejects(runStage('preflight', work, io(holdAnswers('mine'))), /abandoned/);
});

test('only one stage runs at a time, and abandoning waits for a running stage', () => {
  const work = workFolder(v2, {hold: {owner: 'mine'}});
  fs.writeFileSync(path.join(work, 'STAGE-RUNNING'), JSON.stringify({pid: process.pid}));
  assert.throws(() => markAbandoned(work, {owner: 'mine'}), /stage is running/);
  fs.writeFileSync(path.join(work, 'STAGE-RUNNING'), JSON.stringify({pid: 2 ** 22 + 12345}));
  markAbandoned(work, {owner: 'mine'});
  assert.equal(fs.existsSync(path.join(work, 'STAGE-RUNNING')), false, 'the abandonment let go of the lock');
  assert.ok(JSON.parse(fs.readFileSync(path.join(work, 'state.json'))).abandoned);
  // load() still reads an abandoned record, for status.
  assert.ok(load(work, {ledger}).state.abandoned);
});

test('an online proof passes only for this release\'s candidate, mode and signed bytes', () => {
  const ctx = {r: v2};
  const signed = new Map([['Chrome-bin/chrome.exe', 'e'.repeat(64)], [`Chrome-bin/${v2.version}/chrome.dll`, 'd'.repeat(64)]]);
  const proof = {pass: true, candidate: v2.candidate.id, mode: `online ${v2.version}`, details: {installed: {pv: v2.version}, installedSha256: {exe: 'e'.repeat(64), dll: 'd'.repeat(64)}}};
  assert.equal(proofPasses(ctx, proof, signed), true);
  assert.equal(proofPasses(ctx, {...proof, candidate: 'windows-x64-0000000000000000'}, signed), false);
  assert.equal(proofPasses(ctx, {...proof, mode: 'expect 158.0.8127.905'}, signed), false);
  assert.equal(proofPasses(ctx, {...proof, details: {...proof.details, installedSha256: {exe: 'f'.repeat(64), dll: 'd'.repeat(64)}}}, signed), false);
  // Each installed file matches its own entry, never any signed hash (or the same one twice).
  assert.equal(proofPasses(ctx, {...proof, details: {...proof.details, installedSha256: {exe: 'd'.repeat(64), dll: 'e'.repeat(64)}}}, signed), false);
  assert.equal(proofPasses(ctx, {...proof, details: {...proof.details, installedSha256: {exe: 'e'.repeat(64), dll: 'e'.repeat(64)}}}, signed), false);
  // Schema 1 keeps its old verdict even without the newer candidate and mode fields.
  assert.equal(proofPasses({r: v1}, {pass: true, details: {installed: {pv: v2.version}}}, null), true);
  // Schema 1 keeps its old rule (no hashes recorded before the signing record existed).
  assert.equal(proofPasses({r: v1}, {...proof, details: {installed: {pv: v2.version}}}, null), true);
});

test('the update proof records the installed bytes', () => {
  const proof = fs.readFileSync(new URL('../tests/windows-update-proof.mjs', import.meta.url), 'utf8');
  assert.match(proof, /record\.details\.installedSha256=|record\.details\.installedSha256 =/);
});

test('a dispatch\'s run id comes from its own output', () => {
  const source = fs.readFileSync(new URL('./windows-release.mjs', import.meta.url), 'utf8');
  const workflowRun = source.slice(source.indexOf('async function workflowRun'), source.indexOf('\n}\n', source.indexOf('async function workflowRun')));
  assert.match(workflowRun, /parseRunId\(/);
  assert.doesNotMatch(workflowRun, /run', 'list'|'run', 'list'/);
});

// Codex review of Task 6 (2026-11-21).
test('two stages can never both take the lock, and abandoning takes the same lock', async () => {
  const work = workFolder(v2, {hold: {owner: 'mine'}});
  fs.writeFileSync(path.join(work, 'STAGE-RUNNING'), JSON.stringify({pid: process.pid, stage: 'preflight'}));
  await assert.rejects(runStage('preflight', work, io(holdAnswers('mine'))), /another stage/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'STAGE-RUNNING'), 'utf8')).stage, 'preflight', 'the running stage\'s lock is untouched');
  // The lock is created exclusively, and taken before the stage reads its state.
  const source = fs.readFileSync(new URL('./windows-release.mjs', import.meta.url), 'utf8');
  const locker = source.slice(source.indexOf('function takeStageLock'), source.indexOf('\n}\n', source.indexOf('function takeStageLock')));
  assert.match(locker, /linkSync\(temp, lock\)/);
  const runner = source.slice(source.indexOf('export async function runStage'));
  assert.ok(runner.indexOf('takeStageLock(') < runner.indexOf('load(work'), 'lock before load');
});
test('abandoning marks only the work folder that owns the live hold', () => {
  const old = workFolder(v2, {hold: {owner: 'old'}});
  assert.throws(() => markAbandoned(old, {owner: 'live'}), /does not own/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(old, 'state.json'))).abandoned, undefined);
  assert.throws(() => markAbandoned(old, null), /does not own/);
});
test('draft and publish check the hold again after the typed confirmation', async () => {
  const source = fs.readFileSync(new URL('./windows-release.mjs', import.meta.url), 'utf8');
  for (const stage of ['async draft(', 'async publish(']) {
    const body = source.slice(source.indexOf(stage), source.indexOf('\n  },\n', source.indexOf(stage)));
    const confirmAt = body.indexOf('io.confirm(');
    assert.ok(confirmAt > 0 && body.indexOf('ctx.holdCheck()', confirmAt) > confirmAt, `${stage} rechecks after confirming`);
    const writes = stage.startsWith('async draft') ? ["'release', 'create'", "'push', 'origin'"] : ["'release', 'edit'"];
    for (const write of writes) assert.ok(body.lastIndexOf('ctx.holdCheck()', body.indexOf(write)) > confirmAt, `${stage} rechecks before ${write}`);
  }
});
test('a schema-1 stage refuses while anyone holds the draft', async () => {
  const work = workFolder(v1, {});
  await assert.rejects(runStage('preflight', work, io(holdAnswers('a-night'))), /held/);
});
test('the claims come only from a fetched, readable tip', async () => {
  const work = () => workFolder(v2, {hold: {owner: 'mine'}});
  const base = [['release view fork-windows-candidate --repo bnfy/blanc --json assets', {stdout: JSON.stringify({assets: [
      {name: 'draft-hold.json', apiUrl: 'https://api.github.com/h/1'}, {name: 'blanc-windows-candidate.zip', digest: `sha256:${v2.candidate.zipSha256}`}]})}],
    holdAnswers('mine')[1], ['rev-parse --verify FETCH_HEAD', {stdout: 'f'.repeat(40) + '\n'}], ['--is-ancestor', {status: 0}]];
  await assert.rejects(runStage('preflight', work(), io([['fetch -q origin chromium/next', {status: 1}], ...base])), /fetch/);
  await assert.rejects(runStage('preflight', work(), io([['cat-file -e', {status: 0}], ['show ' + 'f'.repeat(40), {status: 128}], ...base])), /reservations/);
  await assert.rejects(runStage('preflight', work(), io([['cat-file -e', {status: 0}], ['show ' + 'f'.repeat(40), {stdout: 'not json'}], ...base])), /reservations/);
});
test('a schema-2 release reads the draft it was prepared against', async () => {
  const {statusOf} = await import('./windows-release.mjs');
  const doneAll = Object.fromEntries(['preflight', 'sign', 'package', 'upload', 'staging-gate', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'].map(s => [s, {at: 'x'}]));
  const work = workFolder(v2, {hold: {owner: 'mine'}, draft: 'fork-windows-candidate-rehearsal', done: doneAll});
  const calls = io([
    ['release view fork-windows-candidate-rehearsal --repo bnfy/blanc --json assets', {stdout: JSON.stringify({assets: [{name: 'draft-hold.json', apiUrl: 'https://api.github.com/h/1'}]})}],
    ['api -H Accept: application/octet-stream https://api.github.com/h/1', {stdout: JSON.stringify({kind: 'release', owner: 'mine'})}],
    ['release view fork-windows-candidate --repo', {status: 1}]]);
  assert.match(statusOf(work, calls).hold, /still held/);
  assert.ok(!calls.calls.some(c => /release view fork-windows-candidate --repo/.test(c)), 'never the production draft');
});
test('status says when a finished release still holds the draft, and how to free it', async () => {
  const {statusOf} = await import('./windows-release.mjs');
  const doneAll = Object.fromEntries(['preflight', 'sign', 'package', 'upload', 'staging-gate', 'manifest', 'draft', 'sigstore', 'publish', 'verify-public'].map(s => [s, {at: 'x'}]));
  const work = workFolder(v2, {hold: {owner: 'mine'}, done: doneAll});
  const status = statusOf(work, io(holdAnswers('mine')));
  assert.equal(status.next, null);
  assert.match(status.hold, /still held/);
  assert.match(status.recover, /draft-hold\.mjs release/);
  assert.doesNotMatch(JSON.stringify(status), /mine/, 'the token is never printed');
  assert.equal(statusOf(work, io(holdAnswers('someone-else'))).hold, undefined);
});

// Codex final review (2026-11-21).
test('a rehearsal release folder runs no stage, only status', async () => {
  const work = workFolder(v2, {hold: {owner: 'mine'}, draft: 'fork-windows-candidate-rehearsal'});
  await assert.rejects(runStage('preflight', work, io(holdAnswers('mine'))), /rehearsal release runs no stages/);
  const {statusOf} = await import('./windows-release.mjs');
  assert.equal(statusOf(work, io()).next, 'preflight');
});

// Prep, against a simulated MacBook Pro, Mac Studio and GitHub.
function prepWorld({hold = null, draftDigest = 'b'.repeat(64), lastPass = true, reservations = null, nightChange = {}, gitLog = 0, fetch = 0,
    claimAnswer = {commit: 'e'.repeat(40), created: true}} = {}) {
  const records = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prep-'));
  fs.chmodSync(records, 0o700);
  fs.writeFileSync(path.join(records, 'CURRENT'), '/previous/work');
  let draftHold = hold, digest = draftDigest;
  const calls = [], claims = [];
  const night = {status: 'pass', stamp: '20261122-0400', sourceCommit: SOURCE, build: 905, version: '158.0.8127.905',
    beta: {id: v2.candidate.id, zipSha256: 'b'.repeat(64), treeCommit: SOURCE, version: '158.0.8127.905', channel: 'beta'}, ...nightChange};
  const exec = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    if (command === 'ssh' && line.includes('LAST-PASS')) return lastPass ? {status: 0, stdout: JSON.stringify(night), stderr: ''} : {status: 1, stdout: '', stderr: ''};
    if (command === 'scp') { fs.writeFileSync(args.at(-1), 'zip'); return {status: 0, stdout: '', stderr: ''}; }
    if (command === 'git' && line.includes('build-reservations.json')) return reservations ? {status: 0, stdout: JSON.stringify(reservations), stderr: ''} : {status: 128, stdout: '', stderr: ''};
    if (command === 'git' && args.includes('fetch')) return {status: fetch, stdout: '', stderr: ''};
    if (command === 'git' && args.includes('rev-parse')) return {status: 0, stdout: 'f'.repeat(40) + '\n', stderr: ''};
    if (command === 'git' && args.includes('log')) return {status: gitLog, stdout: 'one change\n', stderr: ''};
    if (command === 'git') return {status: 0, stdout: 'one change\n', stderr: ''};
    if (command !== 'gh') return {status: 1, stdout: '', stderr: ''};
    if (args[1] === 'view' && args.includes('isDraft')) return {status: 0, stdout: 'true', stderr: ''};
    if (args[1] === 'view') return {status: 0, stdout: JSON.stringify({assets: [
      ...(draftHold ? [{name: 'draft-hold.json', apiUrl: 'https://api.github.com/h/1'}] : []),
      {name: 'blanc-windows-candidate.zip', digest: `sha256:${digest}`}]}), stderr: ''};
    if (args[1] === 'upload') {
      if (args[3].endsWith('draft-hold.json')) { if (draftHold) return {status: 1, stdout: '', stderr: ''}; draftHold = JSON.parse(fs.readFileSync(args[3], 'utf8')); }
      else digest = 'b'.repeat(64);
      return {status: 0, stdout: '', stderr: ''};
    }
    if (args[0] === 'api' && args.includes('DELETE')) { draftHold = null; return {status: 0, stdout: '', stderr: ''}; }
    if (args[0] === 'api') return {status: 0, stdout: JSON.stringify(draftHold), stderr: ''};
    return {status: 0, stdout: '', stderr: ''};
  };
  const claim = entry => {
    claims.push(entry);
    if (claimAnswer instanceof Error) throw claimAnswer;
    calls.push('claim');
    return claimAnswer;
  };
  return {records, calls, claims, io: {exec, claim, sha256: () => 'b'.repeat(64)}, hold: () => draftHold, setDigest: d => { digest = d; }};
}

test('prep refuses while a night holds the draft', () => {
  const w = prepWorld({hold: {kind: 'nightly', owner: 'n'}});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /held/);
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8'), '/previous/work');
});

test('prep re-uploads the kept beta when the draft holds another zip, writes a valid schema-2 folder, and only then moves CURRENT', () => {
  const w = prepWorld({draftDigest: 'c'.repeat(64)});
  const {work, owner} = prepareRelease({io: w.io, records: w.records, ledger});
  assert.ok(w.calls.some(c => c.includes('release upload') && c.includes('blanc-windows-candidate.zip')));
  const r = JSON.parse(fs.readFileSync(path.join(work, 'windows-release.json'), 'utf8'));
  assert.equal(r.schema, 2);
  assert.deepEqual(r.candidate, {id: v2.candidate.id, zipSha256: 'b'.repeat(64), treeCommit: SOURCE, version: '158.0.8127.905'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8')).hold.owner, owner);
  assert.doesNotMatch(fs.readFileSync(path.join(work, 'windows-release.json'), 'utf8'), new RegExp(owner), 'the token stays out of the public descriptor');
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8').trim(), work);
  assert.equal(fs.statSync(work).mode & 0o777, 0o700);
});

test('prep claims the night\'s exact build and source for Windows before it touches the draft', () => {
  const w = prepWorld({draftDigest: 'c'.repeat(64)});
  prepareRelease({io: w.io, records: w.records, ledger});
  assert.deepEqual(w.claims, [{build: 905, sourceCommit: SOURCE, platforms: ['windows'], purpose: 'release'}]);
  const claimed = w.calls.indexOf('claim');
  assert.ok(claimed >= 0);
  assert.ok(w.calls.findIndex(c => c.includes('release upload') && c.includes('blanc-windows-candidate.zip')) > claimed, 'the zip goes up only after the claim');
});

test('prep stops, releasing only its own hold, when another claim holds the number', async () => {
  const {ClaimTaken} = await import('./build-claims.mjs');
  const w = prepWorld({draftDigest: 'c'.repeat(64), claimAnswer: new ClaimTaken('an earlier claim holds a higher number or this build for other source')});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /earlier claim/);
  assert.equal(w.hold(), null);
  assert.ok(!w.calls.some(c => c.includes('release upload') && c.includes('blanc-windows-candidate.zip')), 'no zip for a night that cannot be released');
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8'), '/previous/work');
});

test('prep refuses an io with no claim helper rather than releasing unclaimed', () => {
  const w = prepWorld();
  delete w.io.claim;
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /claim/);
  assert.equal(w.hold(), null);
});

// Codex review of Task 6, prep (2026-11-21).
const ledgerWithSource = {schema: 1, builds: [{build: 904, sourceCommit: 'c'.repeat(40)}]};
test('prep fails on a failed fetch instead of falling back to the ledger', async () => {
  const {ReleaseCheckError} = await import('./policy.mjs');
  const w = prepWorld({claimAnswer: new ReleaseCheckError('could not fetch the build claims branch')});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /fetch/);
  assert.equal(w.hold(), null);
});
test('prep reads the nights and writes to the draft it was given, and saves that draft', () => {
  const w = prepWorld({draftDigest: 'c'.repeat(64)});
  const {work} = prepareRelease({io: w.io, records: w.records, ledger, nights: '~/rehearsal/nights', draft: 'fork-windows-candidate-rehearsal'});
  assert.ok(w.calls.some(c => c.startsWith('ssh') && c.includes('~/rehearsal/nights/LAST-PASS')));
  assert.ok(w.calls.some(c => c.startsWith('scp') && c.includes('rehearsal/nights/20261122-0400/beta.zip')));
  assert.ok(!w.calls.some(c => /fork-windows-candidate( |$)/.test(c)), 'never the production draft');
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8')).draft, 'fork-windows-candidate-rehearsal');
  assert.throws(() => prepareRelease({io: prepWorld().io, records: w.records, ledger, draft: 'some-other-release'}), /unknown candidate draft/);
});
test('prep checks the night\'s beta in full before uploading anything', () => {
  for (const change of [{beta: {id: v2.candidate.id, zipSha256: 'b'.repeat(64), treeCommit: SOURCE, version: '158.0.8127.905', channel: 'preview'}},
      {beta: {id: v2.candidate.id, zipSha256: 'b'.repeat(64), treeCommit: 'c'.repeat(40), version: '158.0.8127.905', channel: 'beta'}},
      {version: '158.0.8127.906'}]) {
    const w = prepWorld({draftDigest: 'c'.repeat(64), nightChange: change});
    assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /night/);
    assert.ok(!w.calls.some(c => c.includes('release upload') && c.includes('blanc-windows-candidate.zip')), JSON.stringify(change));
    assert.equal(w.hold(), null);
  }
});
test('an interrupted prep lets go of its hold, and a hold it cannot release is recoverable from PREP-HOLD', () => {
  const w = prepWorld();
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger, interrupted: () => true}), /interrupted/);
  assert.equal(w.hold(), null);
  assert.equal(fs.existsSync(path.join(w.records, 'PREP-HOLD')), false);
  const stuck = prepWorld();
  const exec = stuck.io.exec;
  stuck.io.exec = (command, args) => command === 'gh' && args.includes('DELETE') ? {status: 1, stdout: '', stderr: ''} : exec(command, args);
  assert.throws(() => prepareRelease({io: stuck.io, records: stuck.records, ledger, interrupted: () => true}), /PREP-HOLD/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stuck.records, 'PREP-HOLD'), 'utf8')).owner, stuck.hold().owner);
});
test('a failed write leaves no version folder behind, so the same night can be prepared again', () => {
  const w = prepWorld();
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => { if (String(to).endsWith('CURRENT')) throw new Error('disk full'); return rename(from, to); };
  try { assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger})); } finally { fs.renameSync = rename; }
  assert.deepEqual(fs.readdirSync(w.records).filter(n => n !== 'CURRENT'), []);
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8'), '/previous/work');
  assert.ok(prepareRelease({io: w.io, records: w.records, ledger}).work.endsWith('158.0.8127.905'));
});
test('a failed git log stops prep before CURRENT moves', () => {
  const w = prepWorld({gitLog: 128});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger: ledgerWithSource}), /commits/);
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8'), '/previous/work');
});
test('prep failures are fixed messages that point at the hold status', () => {
  const w = prepWorld({hold: {kind: 'nightly', owner: 'n'}});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /draft-hold\.mjs status/);
  const source = fs.readFileSync(new URL('./daily/windows-beta-prep.mjs', import.meta.url), 'utf8');
  assert.match(source, /reason\(error\)/, 'the CLI prints reason(), which withholds unexpected errors');
  assert.match(source, /Claimed build \$\{night\.build\} on chromium\/next/);
});

// Codex final review, prep (2026-11-21).
test('prep creates a missing records folder and keeps the proposed owner before uploading the hold', () => {
  const w = prepWorld();
  const records = path.join(w.records, 'new', 'records');
  const exec = w.io.exec;
  let ownerAtUpload = null;
  w.io.exec = (command, args) => {
    if (command === 'gh' && args[1] === 'upload' && args[3].endsWith('draft-hold.json')) ownerAtUpload = JSON.parse(fs.readFileSync(path.join(records, 'PREP-HOLD'), 'utf8')).owner;
    return exec(command, args);
  };
  const {owner} = prepareRelease({io: w.io, records, ledger});
  assert.equal(ownerAtUpload, owner, 'PREP-HOLD named the owner before the hold was uploaded');
  assert.equal(fs.statSync(records).mode & 0o777, 0o700);
});
test('a take whose readback is lost is undone by the proposed owner it kept', () => {
  const w = prepWorld();
  const exec = w.io.exec;
  let reads = 0;
  w.io.exec = (command, args) => (command === 'gh' && args[0] === 'api' && !args.includes('DELETE') && reads++ === 0) ? {status: 1, stdout: '', stderr: ''} : exec(command, args);
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /draft-hold\.mjs status/);
  assert.equal(w.hold(), null, 'the hold it uploaded was released');
  assert.equal(fs.existsSync(path.join(w.records, 'PREP-HOLD')), false);
});
test('an abandoned release of the same version is moved aside, never reused or deleted', () => {
  const w = prepWorld();
  const old = path.join(w.records, '158.0.8127.905');
  fs.mkdirSync(old, {mode: 0o700});
  fs.writeFileSync(path.join(old, 'state.json'), JSON.stringify({abandoned: '2026-11-21T00:00:00Z', done: {}}));
  const {work} = prepareRelease({io: w.io, records: w.records, ledger});
  assert.equal(work, old);
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'state.json'), 'utf8')).abandoned, undefined);
  const aside = fs.readdirSync(w.records).filter(n => n.startsWith('158.0.8127.905.abandoned-'));
  assert.equal(aside.length, 1);
  assert.ok(JSON.parse(fs.readFileSync(path.join(w.records, aside[0], 'state.json'), 'utf8')).abandoned);
  // A live (not abandoned) folder still stops prep.
  const again = prepWorld();
  fs.mkdirSync(path.join(again.records, '158.0.8127.905'));
  fs.writeFileSync(path.join(again.records, '158.0.8127.905', 'state.json'), JSON.stringify({done: {}}));
  assert.throws(() => prepareRelease({io: again.io, records: again.records, ledger}), /already exists/);
});
test('a PREP-HOLD left by an earlier prep stops the next one with its recovery step', () => {
  const w = prepWorld();
  fs.writeFileSync(path.join(w.records, 'PREP-HOLD'), '{"owner":"x"}');
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /earlier prep left a hold owner/);
  assert.equal(w.hold(), null, 'nothing was taken');
});
test('a lock that is still being written, or unreadable, is never taken for a dead one', async () => {
  for (const content of ['', '{"pid":', 'not json']) {
    const work = workFolder(v2, {hold: {owner: 'mine'}});
    fs.writeFileSync(path.join(work, 'STAGE-RUNNING'), content);
    await assert.rejects(runStage('preflight', work, io(holdAnswers('mine'))), /another stage/);
    assert.equal(fs.readFileSync(path.join(work, 'STAGE-RUNNING'), 'utf8'), content, 'left alone');
    assert.throws(() => markAbandoned(work, {owner: 'mine'}), /stage is running/);
  }
  const source = fs.readFileSync(new URL('./windows-release.mjs', import.meta.url), 'utf8');
  const locker = source.slice(source.indexOf('function takeStageLock'), source.indexOf('\n}\n', source.indexOf('function takeStageLock')));
  assert.match(locker, /linkSync\(/, 'the lock appears whole, by a hard link of a written file');
});
test('a child stopped by a signal counts as an interrupt, since a handler cannot run during synchronous work', () => {
  const source = fs.readFileSync(new URL('./daily/windows-beta-prep.mjs', import.meta.url), 'utf8');
  const cli = source.slice(source.indexOf('if (process.argv[1]'));
  assert.match(cli, /if \(result\.signal\) interrupted = true;/);
});

// Codex review of the claim wiring (2026-11-22).
test('a rehearsal prep claims no build number', () => {
  const w = prepWorld({draftDigest: 'c'.repeat(64)});
  prepareRelease({io: w.io, records: w.records, ledger, nights: '~/rehearsal/nights', draft: 'fork-windows-candidate-rehearsal'});
  assert.deepEqual(w.claims, []);
});
test('once CURRENT names the prepared release, a PREP-HOLD cleanup error keeps the release and its hold', () => {
  const w = prepWorld();
  const rm = fs.rmSync;
  fs.rmSync = (target, options) => { if (String(target).endsWith('PREP-HOLD') && fs.existsSync(path.join(w.records, 'CURRENT'))
      && fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8').includes('158.0.8127.905')) throw new Error('busy'); return rm(target, options); };
  let result;
  try { result = prepareRelease({io: w.io, records: w.records, ledger}); } finally { fs.rmSync = rm; }
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8').trim(), result.work);
  assert.ok(w.hold(), 'the prepared release keeps its hold');
  assert.ok(fs.existsSync(path.join(result.work, 'windows-release.json')));
});
test('a failed retry of an abandoned version leaves the abandoned folder where CURRENT names it', () => {
  const w = prepWorld();
  const old = path.join(w.records, '158.0.8127.905');
  fs.mkdirSync(old, {mode: 0o700});
  fs.writeFileSync(path.join(old, 'state.json'), JSON.stringify({abandoned: '2026-11-21T00:00:00Z', done: {}}));
  fs.writeFileSync(path.join(w.records, 'CURRENT'), old + '\n');
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, ...rest) => { if (String(file).includes('.prep-') && String(file).endsWith('release-notes.md')) throw new Error('disk full'); return write(file, ...rest); };
  try { assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /disk full/); } finally { fs.writeFileSync = write; }
  assert.ok(JSON.parse(fs.readFileSync(path.join(old, 'state.json'), 'utf8')).abandoned, 'the abandoned record is still where CURRENT points');
  assert.deepEqual(fs.readdirSync(w.records).filter(n => n.includes('.abandoned-') || n.startsWith('.prep-')), []);
  assert.equal(w.hold(), null);
});
