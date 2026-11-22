// The Windows nightly's runner side (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 2): the candidate workflow pins the night's commit and picks an asset,
// run-suite runs a nightly or a case list, and the install check proves the
// installed bytes are this candidate's.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {suiteArguments, nightlySuiteArguments, nightlyRun, nightlyTracker, stampNightly} from '../windows/run-suite.mjs';
import {installedMatches} from '../windows/candidate.mjs';

const file = rel => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const workflow = fs.readFileSync(file('.github/workflows/chromium-windows-candidate.yml'), 'utf8');
const candidateJob = workflow.slice(workflow.indexOf('  candidate:'), workflow.indexOf('\n  sign:'));
const signJob = workflow.slice(workflow.indexOf('\n  sign:'));
const step = (job, name) => {
  const start = job.indexOf(`- name: ${name}`);
  assert.ok(start >= 0, `step "${name}"`);
  const next = job.indexOf('\n      - ', start + 1);
  return job.slice(start, next < 0 ? undefined : next);
};

test('the workflow takes a source commit, an asset, a nightly flag, a case list, a draft and a hold owner', () => {
  for (const input of ['source_commit', 'asset', 'nightly', 'case_list_asset', 'draft_tag', 'hold_owner'])
    assert.match(workflow, new RegExp(`\\n      ${input}:\\n`), input);
  assert.match(workflow, /asset:[\s\S]*?options:\s*\n\s*- blanc-windows-candidate\.zip\s*\n\s*- blanc-windows-prototype\.zip/);
  assert.match(workflow, /draft_tag:[\s\S]*?options:\s*\n\s*- fork-windows-candidate\s*\n\s*- fork-windows-candidate-rehearsal/);
  const validate = step(candidateJob, 'Validate inputs');
  assert.match(validate, /SOURCE_COMMIT -and \$env:SOURCE_COMMIT -notmatch '\^\[0-9a-f\]\{40\}\$'/);
  assert.match(validate, /\^\[A-Za-z0-9 _\.,:@\/-\]\{0,4000\}\$/, 'only takes real case ids');
  assert.match(validate, /CASE_LIST_ASSET -and \$env:CASE_LIST_ASSET -ne 'nightly-rerun\.json'/);
});

test('a given source commit is checked out only after it is proven on chromium/next, before any repository script', () => {
  const pin = step(candidateJob, 'Pin the source commit');
  assert.match(pin, /if: \$\{\{ inputs\.source_commit != '' \}\}/);
  assert.match(pin, /compare\/\$\(\$env:SOURCE_COMMIT\)\.\.\.chromium\/next[\s\S]*'ahead'[\s\S]*'identical'[\s\S]*throw/);
  assert.match(pin, /git checkout --quiet --detach \$env:SOURCE_COMMIT/);
  assert.ok(pin.indexOf('compare/') < pin.indexOf('git checkout'), 'proven before checkout');
  const pinAt = candidateJob.indexOf('- name: Pin the source commit');
  for (const later of ['Fetch the pinned shipping commits', 'Require the fork', 'Install the harness'])
    assert.ok(candidateJob.indexOf(`- name: ${later}`) > pinAt, `${later} runs after the pin`);
});

test('the unpacked candidate must name the source commit, when one is given', () => {
  const unpack = step(candidateJob, 'Verify and unpack it');
  assert.match(unpack, /if \(\$env:SOURCE_COMMIT\) \{[\s\S]*\.treeCommit\s*\n\s*if \(\$built -ne \$env:SOURCE_COMMIT\) \{ throw/);
});

test('the download reads the chosen draft and asset', () => {
  assert.match(candidateJob, /DRAFT_TAG: \$\{\{ inputs\.draft_tag \|\| 'fork-windows-candidate' \}\}/);
  assert.match(candidateJob, /ASSET: \$\{\{ inputs\.asset \|\| 'blanc-windows-candidate\.zip' \}\}/);
  const download = step(candidateJob, 'Download the candidate from the draft release');
  assert.match(download, /if \(\$env:CASE_LIST_ASSET\) \{[\s\S]*--pattern \$env:CASE_LIST_ASSET/);
});

test('the suite runs as a nightly, and from a case list, only when asked', () => {
  const suite = step(candidateJob, 'Foundation suite');
  assert.match(suite, /if \(\$env:NIGHTLY -eq 'true'\) \{ \$arguments \+= "--nightly=\$env:GITHUB_RUN_ID" \}/);
  assert.match(suite, /if \(\$env:CASE_LIST_ASSET\) \{ \$arguments \+= "--case-list=\$env:RUNNER_TEMP\\candidate\\\$env:CASE_LIST_ASSET" \}/);
});

test('the signing job re-checks the hold just before its upload, and never reads source_commit', () => {
  assert.doesNotMatch(signJob, /source_commit|SOURCE_COMMIT/);
  const upload = step(signJob, 'Keep the signed installer on the draft release');
  assert.match(upload, /if \(\$env:HOLD_OWNER\) \{[\s\S]*draft-hold\.json[\s\S]*owner -ne \$env:HOLD_OWNER[\s\S]*throw[\s\S]*\}[\s\S]*gh release upload/);
  assert.match(upload, /isDraft[\s\S]*gh release upload/);
});

test('run-suite accepts a nightly and a case list beside the slice', () => {
  assert.deepEqual(nightlySuiteArguments(['--slice=f0', '--nightly=123']), []);
  assert.equal(nightlyRun(['--slice=f0', '--nightly=123']), '123');
  assert.deepEqual(nightlySuiteArguments(['--slice=f0', '--nightly=123', '--case-list=C:\\t\\nightly-rerun.json']), ['--case-list=C:\\t\\nightly-rerun.json']);
  assert.deepEqual(nightlySuiteArguments(['--slice=f0']), []);
  assert.equal(nightlyRun(['--slice=f0']), null);
  assert.deepEqual(nightlySuiteArguments(['--slice=f0', '--only=tab-groups']), ['--only=tab-groups']);
  for (const bad of [['--nightly=123'], ['--slice=f0', '--nightly='], ['--slice=f0', '--nightly=12a'], ['--slice=f0', '--case-list='],
                     ['--slice=f0', '--only=x', '--case-list=y']])
    assert.throws(() => nightlySuiteArguments(bad), undefined, bad.join(' '));
  // The shared parser, which Linux's run-suite.mjs also uses, stays strict.
  for (const bad of [['--slice=f0', '--nightly=123'], ['--slice=f0', '--case-list=x']])
    assert.throws(() => suiteArguments(bad), undefined, bad.join(' '));
});

test('a nightly points the tracker at its candidate for the run, and its report carries the run id', () => {
  const tracker = {currentCandidates: {windows: {id: 'windows-x64-0000000000000000'}}};
  const config = {candidate: 'windows-x64-1111111111111111', executableSha256: 'e'.repeat(64), dllSha256: 'd'.repeat(64)};
  const next = nightlyTracker(tracker, config, '123');
  assert.deepEqual(next.currentCandidates.windows, {id: config.candidate, exeSha256: config.executableSha256, dllSha256: config.dllSha256,
    qualification: 'nightly run 123; not a tracker baseline'});
  assert.equal(tracker.currentCandidates.windows.id, 'windows-x64-0000000000000000', 'the input is not changed');
  assert.deepEqual(stampNightly({platform: 'windows', scenarios: []}, '123'), {platform: 'windows', scenarios: [], runId: '123', nightly: '123'});
});

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// A minimal PE32+ file with an empty security directory, and its signed copy.
function pe(body) {
  const buffer = Buffer.alloc(0x200);
  buffer.writeUInt16LE(0x5a4d, 0); buffer.writeUInt32LE(0x80, 0x3c); buffer.writeUInt32LE(0x4550, 0x80);
  buffer.writeUInt16LE(0x20b, 0x98); buffer.writeUInt32LE(16, 0x98 + 108);
  buffer.write(body, 0x180);
  return buffer;
}
function sign(unsigned) {
  const signature = Buffer.from('signature');
  const signed = Buffer.concat([unsigned, signature]);
  const directory = 0x98 + 112 + 32;
  signed.writeUInt32LE(unsigned.length, directory); signed.writeUInt32LE(signature.length, directory + 4);
  return signed;
}

test('the installed files must be this candidate\'s, signed copies included', () => {
  const exe = pe('exe'), dll = pe('dll');
  const candidate = {exeSha256: sha256(exe), dllSha256: sha256(dll)};
  const files = {'i/exe': exe, 'i/dll': dll, 'c/exe': exe, 'c/dll': dll, 's/exe': sign(exe), 's/dll': sign(dll), 'o/dll': pe('old')};
  const read = name => files[name];
  const paths = {installedExe: 'i/exe', installedDll: 'i/dll', originalExe: 'c/exe', originalDll: 'c/dll'};
  assert.equal(installedMatches(candidate, paths, {signed: false, read, sha256}).match, true);
  assert.equal(installedMatches(candidate, {...paths, installedDll: 'o/dll'}, {signed: false, read, sha256}).match, false, 'an older payload');
  assert.equal(installedMatches(candidate, {...paths, installedExe: 's/exe', installedDll: 's/dll'}, {signed: true, read, sha256}).match, true);
  assert.equal(installedMatches(candidate, {...paths, installedExe: 's/exe', installedDll: 'o/dll'}, {signed: true, read, sha256}).match, false);
  const result = installedMatches(candidate, paths, {signed: false, read, sha256});
  assert.deepEqual(result.sha256, {exe: candidate.exeSha256, dll: candidate.dllSha256});
});

test('the install check records the installed bytes and requires them to match', () => {
  const install = fs.readFileSync(file('chromium/tests/windows-install.mjs'), 'utf8');
  assert.match(install, /installedMatches\(candidate,/);
  assert.match(install, /record\.details\.installedSha256=/);
  assert.match(install, /const required=\[[^\]]*'installedMatchesCandidate'/);
});
