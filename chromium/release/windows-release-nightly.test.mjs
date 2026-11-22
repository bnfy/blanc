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
  assert.throws(() => markAbandoned(work), /stage is running/);
  fs.writeFileSync(path.join(work, 'STAGE-RUNNING'), JSON.stringify({pid: 2 ** 22 + 12345}));
  markAbandoned(work);
  assert.ok(JSON.parse(fs.readFileSync(path.join(work, 'state.json'))).abandoned);
  // load() still reads an abandoned record, for status.
  assert.ok(load(work, {ledger}).state.abandoned);
});

test('an online proof passes only for this release\'s candidate, mode and signed bytes', () => {
  const ctx = {r: v2};
  const signed = new Set(['e'.repeat(64), 'd'.repeat(64)]);
  const proof = {pass: true, candidate: v2.candidate.id, mode: `online ${v2.version}`, details: {installed: {pv: v2.version}, installedSha256: {exe: 'e'.repeat(64), dll: 'd'.repeat(64)}}};
  assert.equal(proofPasses(ctx, proof, signed), true);
  assert.equal(proofPasses(ctx, {...proof, candidate: 'windows-x64-0000000000000000'}, signed), false);
  assert.equal(proofPasses(ctx, {...proof, mode: 'expect 158.0.8127.905'}, signed), false);
  assert.equal(proofPasses(ctx, {...proof, details: {...proof.details, installedSha256: {exe: 'f'.repeat(64), dll: 'd'.repeat(64)}}}, signed), false);
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

// Prep, against a simulated MacBook Pro, Mac Studio and GitHub.
function prepWorld({hold = null, draftDigest = 'b'.repeat(64), lastPass = true, reservations = null} = {}) {
  const records = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-prep-'));
  fs.chmodSync(records, 0o700);
  fs.writeFileSync(path.join(records, 'CURRENT'), '/previous/work');
  let draftHold = hold, digest = draftDigest;
  const calls = [];
  const night = {status: 'pass', stamp: '20261122-0400', sourceCommit: SOURCE, build: 905, version: '158.0.8127.905',
    beta: {id: v2.candidate.id, zipSha256: 'b'.repeat(64), treeCommit: SOURCE, version: '158.0.8127.905', channel: 'beta'}};
  const exec = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    if (command === 'ssh' && line.includes('LAST-PASS')) return lastPass ? {status: 0, stdout: JSON.stringify(night), stderr: ''} : {status: 1, stdout: '', stderr: ''};
    if (command === 'scp') { fs.writeFileSync(args.at(-1), 'zip'); return {status: 0, stdout: '', stderr: ''}; }
    if (command === 'git' && line.includes('build-reservations.json')) return reservations ? {status: 0, stdout: JSON.stringify(reservations), stderr: ''} : {status: 128, stdout: '', stderr: ''};
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
  return {records, calls, io: {exec, sha256: () => 'b'.repeat(64)}, hold: () => draftHold, setDigest: d => { digest = d; }};
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

test('prep stops, releasing only its own hold, when the reservation file exists but no exact claim can be made yet', () => {
  const w = prepWorld({reservations: seq([claim(904)])});
  assert.throws(() => prepareRelease({io: w.io, records: w.records, ledger}), /claim/);
  assert.equal(w.hold(), null);
  assert.equal(fs.readFileSync(path.join(w.records, 'CURRENT'), 'utf8'), '/previous/work');
});
