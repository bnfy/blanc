'use strict';
// The release press gate's acceptance step (scripts/acceptance-gate.mjs): one
// full `runnable` run, then, for 1–10 failed scenarios, exactly those again in
// a fresh Cucumber process, logged as a marked block in the release log.
// Spec: docs/superpowers/specs/2026-10-27-acceptance-gate-speed-design.md §3.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const gate = () => import(pathToFileURL(path.join(root, 'scripts', 'acceptance-gate.mjs')).href);
const cucumberConfig = () => import(pathToFileURL(path.join(root, 'test', 'desktop', 'cucumber.mjs')).href);

const ok = { result: { status: 'passed' } };
const failed = (message) => ({ result: { status: 'failed', error_message: message } });
function scenario(line, name, steps, extra = {}) {
  return { type: 'scenario', line, name, steps, ...extra };
}
const report = [
  { uri: 'spec/acceptance/a.feature', elements: [
    scenario(10, 'Passes', [ok, ok]),
    scenario(20, 'Fails in a step', [ok, failed('Error: timed out waiting for the strip\n    at x (poll.js:13)')]),
    scenario(30, 'Fails in a Before hook', [{ result: { status: 'skipped' } }], { before: [failed('Before hook broke')] }),
  ] },
  { uri: 'spec/acceptance/b.feature', elements: [
    { type: 'background', line: 3, name: '', steps: [ok] },
    scenario(41, 'Undefined step', [{ result: { status: 'undefined' } }]),
    scenario(50, 'Fails in an After hook', [ok], { after: [failed('AssertionError: main-process exception')] }),
  ] },
];

test('failed scenarios are found by location, with the first line of their first error', async () => {
  const { failedScenarios } = await gate();
  assert.deepEqual(failedScenarios(report), [
    { location: 'spec/acceptance/a.feature:20', name: 'Fails in a step', error: 'Error: timed out waiting for the strip' },
    { location: 'spec/acceptance/a.feature:30', name: 'Fails in a Before hook', error: 'Before hook broke' },
    { location: 'spec/acceptance/b.feature:41', name: 'Undefined step', error: 'undefined' },
    { location: 'spec/acceptance/b.feature:50', name: 'Fails in an After hook', error: 'AssertionError: main-process exception' },
  ]);
});

test('no failures pass, 1–10 rerun, more than 10 fail without rerunning', async () => {
  const { decide, FIRST_RUN_CAP } = await gate();
  assert.equal(FIRST_RUN_CAP, 10);
  const many = (n) => Array.from({ length: n }, (_, i) => ({ location: `x.feature:${i + 1}` }));
  assert.equal(decide([]), 'pass');
  assert.equal(decide(many(1)), 'rerun');
  assert.equal(decide(many(10)), 'rerun');
  assert.equal(decide(many(11)), 'too-many');
});

test('a rerun counts only when every expected scenario ran again and passed', async () => {
  const { checkRerun } = await gate();
  const expected = [
    { location: 'spec/acceptance/a.feature:20', name: 'Fails in a step' },
    { location: 'spec/acceptance/b.feature:50', name: 'Fails in an After hook' },
  ];
  const rerun = (elements) => [{ uri: 'spec/acceptance/a.feature', elements: elements.a }, { uri: 'spec/acceptance/b.feature', elements: elements.b }];
  assert.deepEqual(checkRerun(expected, rerun({ a: [scenario(20, 'Fails in a step', [ok])], b: [scenario(50, 'Fails in an After hook', [ok])] })), []);
  assert.deepEqual(checkRerun(expected, rerun({ a: [scenario(20, 'Fails in a step', [ok])], b: [] })),
    ['spec/acceptance/b.feature:50 did not run again']);
  assert.deepEqual(checkRerun(expected, rerun({ a: [scenario(20, 'Fails in a step', [failed('Error: again')])], b: [scenario(50, 'Fails in an After hook', [ok])] })),
    ['spec/acceptance/a.feature:20 failed again: Error: again']);
  assert.deepEqual(checkRerun(expected, rerun({ a: [scenario(20, 'Fails in a step', [ok]), scenario(60, 'Extra', [ok])], b: [scenario(50, 'Fails in an After hook', [ok])] })),
    ['spec/acceptance/a.feature:60 ran but was not selected']);
  assert.deepEqual(checkRerun(expected, null), ['the rerun wrote no readable report']);
});

test('a passing rerun prints a marked block naming each scenario and its first-attempt error', async () => {
  const { rerunBlock } = await gate();
  const block = rerunBlock([
    { location: 'spec/acceptance/a.feature:20', name: 'Fails in a step', error: 'Error: timed out waiting for the strip' },
  ]);
  assert.match(block, /^Acceptance rerun passed: 1 scenario\(s\)$/m);
  assert.match(block, /spec\/acceptance\/a\.feature:20 {2}Fails in a step$/m);
  assert.match(block, /first attempt: Error: timed out waiting for the strip$/m);
});

test('the rerun profile is runnable without paths and without retries', async () => {
  const { runnable, rerun } = await cucumberConfig();
  assert.equal(rerun.paths, undefined, 'positional path:line arguments are the whole selection');
  assert.equal(rerun.retry, 0, 'the rerun is exactly one more attempt');
  assert.equal(rerun.tags, runnable.tags);
  assert.deepEqual(rerun.require, runnable.require);
  assert.deepEqual(rerun.import, runnable.import);
});

test('a path:line rerun selects exactly those scenarios, Outline example rows included', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-gate-select-'));
  try {
    const cucumber = (profile, args, report) => spawnSync('npx', ['cucumber-js', '-c', 'test/desktop/cucumber.mjs', '-p', profile, '--dry-run', ...args], {
      cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
      env: { ...process.env, BLANC_ACCEPTANCE_REPORT: report },
    });
    const all = path.join(dir, 'all.json');
    assert.equal(cucumber('rerun', ['spec/acceptance/tab-drag.feature', 'spec/acceptance/vertical-tabs.feature'], all).status, 0);
    const scenarios = JSON.parse(fs.readFileSync(all, 'utf8')).flatMap((f) =>
      f.elements.filter((e) => e.type === 'scenario').map((e) => ({ location: `${f.uri}:${e.line}`, name: e.name, keyword: e.keyword })));
    const outlineRows = scenarios.filter((s) => /Outline/.test(s.keyword));
    assert.ok(outlineRows.length >= 2, 'tab-drag.feature has Scenario Outline rows');
    const pick = [outlineRows[1], scenarios.find((s) => s.name.startsWith('Larger vertical tab text'))];
    const picked = path.join(dir, 'picked.json');
    assert.equal(cucumber('rerun', pick.map((s) => s.location), picked).status, 0);
    const got = JSON.parse(fs.readFileSync(picked, 'utf8')).flatMap((f) =>
      f.elements.filter((e) => e.type === 'scenario').map((e) => `${f.uri}:${e.line}`));
    assert.deepEqual(got.sort(), pick.map((s) => s.location).sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the press gate runs acceptance through the rerunning gate', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const press = pkg.scripts['release:verify:press'];
  assert.match(press, /npm run test:acceptance:gate &&/);
  assert.doesNotMatch(press, /test:acceptance:desktop/);
  assert.equal(pkg.scripts['test:acceptance:gate'], 'node scripts/acceptance-gate.mjs');
  assert.equal(pkg.scripts['pretest:acceptance:gate'], 'npm run runtime:check');
  assert.equal(pkg.scripts['test:acceptance:desktop'], 'cucumber-js -c test/desktop/cucumber.mjs -p runnable', 'nightly and PR runs stay plain');
});

test('release.sh keeps the Mac awake for the whole release, and the skill says how to record a rerun', () => {
  const release = fs.readFileSync(path.join(root, 'scripts', 'release.sh'), 'utf8');
  assert.match(release, /if command -v caffeinate >\/dev\/null 2>&1; then\n\s+caffeinate -dimsu -w \$\$ &/);
  assert.ok(release.indexOf('caffeinate -dimsu -w $$') < release.indexOf('npm run release:verify:press'), 'before the press gate');
  const skill = fs.readFileSync(path.join(root, '.claude', 'skills', 'releasing-blanc', 'SKILL.md'), 'utf8');
  assert.match(skill, /Acceptance rerun passed/);
  assert.match(skill, /verbatim/);
});
