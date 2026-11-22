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
