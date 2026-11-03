'use strict';
// The release press gate's ledger (scripts/release-gate.mjs): a relaunch on
// the same commit and installed inputs reruns only stages and acceptance
// scenarios that have not passed, and every reuse is re-derived from evidence
// files whose digests and key still match.
// Spec: docs/superpowers/specs/2026-11-02-press-gate-ledger-design.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');

const root = path.join(__dirname, '..', '..');
const gate = () => import(pathToFileURL(path.join(root, 'scripts', 'release-gate.mjs')).href);

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-02T20:00:00Z');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-release-gate-test-'));
}

const baseKey = {
  commit: '4f79a13ba0000000000000000000000000000000', node: 'v22.17.0', npm: '10.9.2', platform: 'darwin', arch: 'arm64',
  rootInstall: 'r'.repeat(64), siteInstall: 's'.repeat(64),
  electron: { version: '44.9.3', executable: 'e'.repeat(64), framework: 'f'.repeat(64) }, env: 'v'.repeat(64),
};

// A Cucumber message stream. Each scenario lists its attempts as arrays of
// step statuses; `unfinished` leaves the last attempt without testCaseFinished.
function stream(scenarios) {
  const out = [];
  for (const [i, s] of scenarios.entries()) {
    const [uri, line] = s.location.split(':');
    out.push({ pickle: { id: `p${i}`, uri, location: { line: Number(line), column: 3 }, name: s.name } });
    out.push({ testCase: { id: `c${i}`, pickleId: `p${i}` } });
  }
  for (const [i, s] of scenarios.entries()) {
    for (const [n, statuses] of s.attempts.entries()) {
      const id = `t${i}-${n}`;
      out.push({ testCaseStarted: { id, testCaseId: `c${i}`, attempt: n } });
      for (const status of statuses) {
        out.push({ testStepFinished: { testCaseStartedId: id, testStepResult: status === 'PASSED' ? { status } : { status, message: `Error: ${s.name} broke\n    at step.js:1` } } });
      }
      const last = n === s.attempts.length - 1;
      if (!(last && s.unfinished)) out.push({ testCaseFinished: { testCaseStartedId: id, willBeRetried: !last } });
    }
  }
  return out.map((m) => JSON.stringify(m)).join('\n') + '\n';
}

test('the key digest is stable and changes with every input', async () => {
  const { keyDigest } = await gate();
  const digest = keyDigest(baseKey);
  assert.equal(digest, keyDigest(JSON.parse(JSON.stringify({ ...baseKey }))));
  assert.equal(digest, keyDigest(Object.fromEntries(Object.entries(baseKey).reverse())), 'field order does not matter');
  const variants = [
    { commit: 'b'.repeat(40) }, { node: 'v22.18.0' }, { npm: '11.0.0' }, { platform: 'linux' }, { arch: 'x64' },
    { rootInstall: 'x'.repeat(64) }, { siteInstall: null }, { electron: { ...baseKey.electron, framework: 'g'.repeat(64) } },
    { electron: { ...baseKey.electron, version: '44.9.4' } }, { env: 'w'.repeat(64) },
  ];
  for (const change of variants) assert.notEqual(keyDigest({ ...baseKey, ...change }), digest, JSON.stringify(change));
});

test('the environment fingerprint ignores the operator inputs and unrelated variables, but not test overrides', async () => {
  const { envFingerprint } = await gate();
  const base = envFingerprint({ PATH: '/bin', HOME: '/Users/x' });
  assert.equal(envFingerprint({
    PATH: '/usr/bin', TERM: 'xterm', npm_config_x: '1',
    BLANC_RELEASE_MODE: 'stable', BLANC_RELEASE_OPERATOR: 'terminal', BLANC_COSIGN_IDENTITY: 'anthony@bnfy.me',
    BLANC_MAC_ARCHES: 'arm64,x64', BLANC_EVS_PYTHON: '/x/python', EVS_CONFIG_FILE: '/x', BLANC_MIGRATION_BASE_VERSION: '1.45.1',
  }), base);
  for (const name of ['BLANC_TEST', 'BLANC_UBLOCK_TEST', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    assert.notEqual(envFingerprint({ [name]: '1' }), base, name);
  }
  assert.notEqual(envFingerprint({ BLANC_TEST: '0' }), envFingerprint({ BLANC_TEST: '1' }), 'values count, not only names');
});

test('the ledger reads records in order and skips a torn last line', async () => {
  const { parseLedger, appendRecord, readLedger } = await gate();
  assert.deepEqual(parseLedger('{"a":1}\n\n{"b":2}\n{"c":'), [{ a: 1 }, { b: 2 }]);
  const dir = tempDir();
  try {
    appendRecord(dir, { n: 1 });
    appendRecord(dir, { n: 2 });
    fs.appendFileSync(path.join(dir, 'ledger.ndjson'), '{"n":');
    assert.deepEqual(readLedger(dir), [{ n: 1 }, { n: 2 }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a stage pass is reused only with the same key, an unchanged log, inside 48 hours, and never for security', async () => {
  const { stagePass, sha256File, STAGES, FRESHNESS_MS } = await gate();
  assert.equal(FRESHNESS_MS, 48 * HOUR);
  const dir = tempDir();
  try {
    fs.mkdirSync(path.join(dir, 'logs'));
    const logFile = path.join(dir, 'logs', '1-unit.log');
    fs.writeFileSync(logFile, 'ok 5098 tests\n');
    const unit = STAGES.find((s) => s.id === 'unit');
    const record = { type: 'stage', attempt: 1, stage: 'unit', key: 'K', status: 'passed', finishedAt: new Date(T0).toISOString(), log: '1-unit.log', logSha256: sha256File(logFile) };
    const opts = { dir, now: T0 + HOUR };
    assert.equal(stagePass([record], unit, 'K', opts), record);
    assert.equal(stagePass([record], unit, 'OTHER', opts), null, 'another key');
    assert.equal(stagePass([{ ...record, status: 'failed' }], unit, 'K', opts), null, 'a failure');
    assert.equal(stagePass([record], unit, 'K', { dir, now: T0 + 49 * HOUR }), null, 'expired');
    assert.equal(stagePass([record], unit, 'K', { dir, now: T0 - HOUR }), null, 'from the future');
    assert.equal(stagePass([{ ...record, log: '../1-unit.log' }], unit, 'K', opts), null, 'a path outside logs/');
    assert.equal(stagePass([{ ...record, stage: 'site' }], unit, 'K', opts), null, 'another stage');

    const security = STAGES.find((s) => s.id === 'security');
    assert.ok(security.fresh);
    const securityRecord = { ...record, stage: 'security' };
    assert.equal(stagePass([securityRecord], security, 'K', opts), null, 'security never carries over');
    assert.equal(stagePass([securityRecord], security, 'K', { ...opts, attempt: 2 }), null, 'not from an earlier attempt');
    assert.equal(stagePass([securityRecord], security, 'K', { ...opts, attempt: 1 }), securityRecord, 'only from this attempt');

    fs.appendFileSync(logFile, 'edited\n');
    assert.equal(stagePass([record], unit, 'K', opts), null, 'a changed log');
    fs.rmSync(logFile);
    assert.equal(stagePass([record], unit, 'K', opts), null, 'a missing log');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scenario outcomes come from the final attempt in a Cucumber message stream', async () => {
  const { scenarioOutcomes, parseLedger, expectedScenarios } = await gate();
  const messages = parseLedger(stream([
    { location: 'spec/acceptance/a.feature:10', name: 'Passes', attempts: [['PASSED', 'PASSED']] },
    { location: 'spec/acceptance/a.feature:20', name: 'Flakes once', attempts: [['PASSED', 'FAILED', 'SKIPPED'], ['PASSED', 'PASSED', 'PASSED']] },
    { location: 'spec/acceptance/a.feature:30', name: 'Fails twice', attempts: [['FAILED'], ['PASSED', 'FAILED']] },
    { location: 'spec/acceptance/b.feature:7', name: 'Undefined', attempts: [['UNDEFINED']] },
    { location: 'spec/acceptance/b.feature:9', name: 'Stopped mid-run', attempts: [['PASSED']], unfinished: true },
    { location: 'spec/acceptance/b.feature:12', name: 'Stopped in its retry', attempts: [['FAILED'], ['PASSED']], unfinished: true },
  ]));
  assert.deepEqual(scenarioOutcomes(messages), [
    { location: 'spec/acceptance/a.feature:10', name: 'Passes', passed: true, tries: 1, error: null },
    { location: 'spec/acceptance/a.feature:20', name: 'Flakes once', passed: true, tries: 2, error: null },
    { location: 'spec/acceptance/a.feature:30', name: 'Fails twice', passed: false, tries: 2, error: 'Error: Fails twice broke' },
    { location: 'spec/acceptance/b.feature:7', name: 'Undefined', passed: false, tries: 1, error: 'Error: Undefined broke' },
  ]);
  assert.equal(expectedScenarios(messages).length, 6);
  const windows = parseLedger(stream([{ location: 'spec/acceptance/a.feature:10', name: 'Passes', attempts: [['PASSED']] }])
    .replace('"uri":"spec/acceptance/a.feature"', '"uri":"spec\\\\acceptance\\\\a.feature"'));
  assert.equal(windows[0].pickle.uri, 'spec\\acceptance\\a.feature', 'the fixture has Windows separators');
  assert.equal(scenarioOutcomes(windows)[0].location, 'spec/acceptance/a.feature:10', 'locations always use /');
  assert.deepEqual(expectedScenarios(messages)[4], { location: 'spec/acceptance/b.feature:9', name: 'Stopped mid-run' });
});

test('acceptance state keeps the first pass and every earlier failure, and owes the rest', async () => {
  const { acceptanceState, owed } = await gate();
  const expected = [
    { location: 'a.feature:1', name: 'A' }, { location: 'a.feature:2', name: 'B' },
    { location: 'a.feature:3', name: 'C' }, { location: 'a.feature:4', name: 'D' },
  ];
  const runs = [
    { attempt: 1, label: 'first', outcomes: [
      { location: 'a.feature:1', name: 'A', passed: true },
      { location: 'a.feature:2', name: 'B', passed: false, error: 'timed out' },
      { location: 'a.feature:3', name: 'C', passed: false, error: 'focus lost' },
    ] },
    { attempt: 1, label: 'rerun', outcomes: [{ location: 'a.feature:3', name: 'C', passed: false, error: 'focus lost again' }] },
    { attempt: 2, label: 'first', outcomes: [
      { location: 'a.feature:3', name: 'C', passed: true },
      { location: 'a.feature:4', name: 'Renamed D', passed: true },
    ] },
  ];
  const state = acceptanceState(expected, runs);
  assert.deepEqual(state.get('a.feature:1').passed, { attempt: 1, label: 'first' });
  assert.equal(state.get('a.feature:2').passed, null);
  assert.deepEqual(state.get('a.feature:3').passed, { attempt: 2, label: 'first' });
  assert.deepEqual(state.get('a.feature:3').failures.map((f) => f.error), ['focus lost', 'focus lost again']);
  assert.equal(state.get('a.feature:4').passed, null, 'a different scenario at the same line does not count');
  assert.deepEqual(owed(state), ['a.feature:2', 'a.feature:4']);
});

// ---- orchestration with a fake runner ----------------------------------

const EXPECTED = [
  { location: 'spec/acceptance/a.feature:10', name: 'Island hides' },
  { location: 'spec/acceptance/a.feature:20', name: 'Island reveals' },
  { location: 'spec/acceptance/b.feature:5', name: 'Two clients converge' },
];

// `plan` maps a script to its exit code, or for acceptance to a function of
// the owed list returning { code, first, rerun } outcome lists.
function fakeRunner({ key = baseKey, clean = true, plan = {}, calls = [] } = {}) {
  return {
    calls,
    key: () => ({ key, clean }),
    expected: () => EXPECTED,
    async stage(_root, script, { args = [], env, logFile }) {
      calls.push({ script, args });
      if (logFile) fs.writeFileSync(logFile, `${script} output\n`);
      const step = plan[script];
      if (typeof step !== 'function') return { code: step ?? 0, signal: null };
      const only = args[0] === '--only' ? JSON.parse(fs.readFileSync(args[1], 'utf8')) : EXPECTED.map((s) => s.location);
      const result = step(only);
      const dir = env.BLANC_ACCEPTANCE_MESSAGES_DIR;
      const write = (label, outcomes) => {
        if (!outcomes) return;
        fs.writeFileSync(path.join(dir, `${env.BLANC_ACCEPTANCE_RUN_PREFIX}${label}.ndjson`), stream(outcomes.map(([location, attempts, unfinished]) => ({
          location, name: EXPECTED.find((s) => s.location === location).name, attempts, unfinished,
        }))));
      };
      write('first', result.first);
      write('rerun', result.rerun);
      return { code: result.code, signal: result.signal ?? null };
    },
  };
}

const allPass = (only) => ({ code: 0, first: only.map((l) => [l, [['PASSED']]]) });

async function runQuiet(options) {
  const { run } = await gate();
  const lines = [];
  const code = await run({ log: (line) => lines.push(line), ...options });
  return { code, output: lines.join('\n') };
}

test('a second run on the same key reruns only security, and prints the evidence block', async () => {
  const { STAGES } = await gate();
  const repo = tempDir();
  let clock = T0;
  try {
    const first = fakeRunner({ plan: { 'test:acceptance:gate': allPass } });
    const one = await runQuiet({ root: repo, runner: first, now: () => (clock += 1000) });
    assert.equal(one.code, 0, one.output);
    assert.deepEqual(first.calls.map((c) => c.script), STAGES.map((s) => s.script), 'every stage, in order');
    assert.match(one.output, /Press gate evidence: commit 4f79a13ba0+ key [0-9a-f]{12}/);
    assert.match(one.output, /acceptance\s+3\/3 passed in 1 attempt\(s\) \(1\)/);

    const second = fakeRunner({ plan: { 'test:acceptance:gate': allPass } });
    const two = await runQuiet({ root: repo, runner: second, now: () => (clock += 1000) });
    assert.equal(two.code, 0, two.output);
    assert.deepEqual(second.calls.map((c) => c.script), ['release:security']);
    assert.match(two.output, /skip unit: passed .* \(attempt 1\), log sha256 [0-9a-f]{12}/);
    assert.match(two.output, /skip acceptance: all 3 scenarios passed/);
    assert.match(two.output, /security\s+passed .* attempt 2 .*\(always rerun\)/);
    assert.match(two.output, /Ledger: output\/release-gate\/4f79a13ba0+\/ledger\.ndjson sha256 [0-9a-f]{64}/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a failed stage stops the gate, the next run starts at it, and keep-going collects later passes', async () => {
  const repo = tempDir();
  let clock = T0;
  try {
    const failing = fakeRunner({ plan: { 'test:acceptance:gate': allPass, 'test:reader:desktop': 1 } });
    const one = await runQuiet({ root: repo, runner: failing, now: () => (clock += 1000) });
    assert.equal(one.code, 1);
    assert.equal(failing.calls.at(-1).script, 'test:reader:desktop', 'stops at the failure');
    assert.match(one.output, /reader\s+NOT PASSED/);

    const kept = fakeRunner({ plan: { 'test:reader:desktop': 1 } });
    const two = await runQuiet({ root: repo, runner: kept, keepGoing: true, now: () => (clock += 1000) });
    assert.equal(two.code, 1);
    assert.deepEqual(kept.calls.map((c) => c.script), [
      'test:reader:desktop', 'test:web-store', 'test:oauth:desktop', 'test:modified-links:desktop', 'test:dns-smoke', 'release:security', 'site:build',
    ]);

    const fixed = fakeRunner();
    const three = await runQuiet({ root: repo, runner: fixed, now: () => (clock += 1000) });
    assert.equal(three.code, 0, three.output);
    assert.deepEqual(fixed.calls.map((c) => c.script), ['test:reader:desktop', 'release:security']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('acceptance resumes with only the scenarios still owed, and lists the ones that passed after failing', async () => {
  const repo = tempDir();
  let clock = T0;
  try {
    const [hides, reveals, converge] = EXPECTED.map((s) => s.location);
    const firstAttempt = fakeRunner({ plan: { 'test:acceptance:gate': () => ({
      code: 1,
      first: [[hides, [['PASSED']]], [reveals, [['FAILED'], ['FAILED']]], [converge, [['FAILED'], ['FAILED']]]],
      rerun: [[reveals, [['PASSED']]], [converge, [['FAILED']]]],
    }) } });
    const one = await runQuiet({ root: repo, runner: firstAttempt, now: () => (clock += 1000) });
    assert.equal(one.code, 1);
    assert.match(one.output, /acceptance: 1 of 3 scenario\(s\) not passed/);

    const secondAttempt = fakeRunner({ plan: { 'test:acceptance:gate': (only) => {
      assert.deepEqual(only, [converge], 'only what is still owed');
      return allPass(only);
    } } });
    const two = await runQuiet({ root: repo, runner: secondAttempt, now: () => (clock += 1000) });
    assert.equal(two.code, 0, two.output);
    const acceptanceCall = secondAttempt.calls.find((c) => c.script === 'test:acceptance:gate');
    assert.equal(acceptanceCall.args[0], '--only');
    assert.match(two.output, /2 of 3 scenarios already passed; running the 1 still owed/);
    assert.match(two.output, /acceptance\s+3\/3 passed in 2 attempt\(s\) \(1, 2\)/);
    assert.match(two.output, /passed after failing in an earlier run:\n {6}spec\/acceptance\/a\.feature:20 {2}Island reveals\n {8}attempt 1 \(first\): Error: Island reveals broke/);
    assert.match(two.output, /spec\/acceptance\/b\.feature:5 {2}Two clients converge\n {8}attempt 1 \(first\): .*\n {8}attempt 1 \(rerun\): /);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a run stopped mid-acceptance keeps the scenarios it finished; the next run owes only the rest', async () => {
  const repo = tempDir();
  let clock = T0;
  try {
    const [hides, reveals, converge] = EXPECTED.map((s) => s.location);
    const stopped = fakeRunner({ plan: { 'test:acceptance:gate': () => ({
      code: null, signal: 'SIGINT', first: [[hides, [['PASSED']]], [reveals, [['PASSED']], true]],
    }) } });
    const one = await runQuiet({ root: repo, runner: stopped, now: () => (clock += 1000) });
    assert.equal(one.code, 1, 'the stage failed');
    const resumed = fakeRunner({ plan: { 'test:acceptance:gate': (only) => {
      assert.deepEqual(only, [reveals, converge], 'the scenario stopped mid-run is owed again');
      return allPass(only);
    } } });
    const two = await runQuiet({ root: repo, runner: resumed, now: () => (clock += 1000) });
    assert.equal(two.code, 0, two.output);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a real SIGINT during a stage records the stage as interrupted and exits 130', async () => {
  const { readLedger, ledgerDir } = await gate();
  const repo = tempDir();
  try {
    const runner = fakeRunner();
    const signals = new EventEmitter();
    const inner = runner.stage;
    runner.stage = async (rootDir, script, opts) => {
      if (script === 'test:unit') {
        signals.emit('SIGINT', 'SIGINT');
        await inner(rootDir, script, opts);
        return { code: null, signal: 'SIGINT' };
      }
      return inner(rootDir, script, opts);
    };
    const { code, output } = await runQuiet({ root: repo, runner, signals, now: () => T0 });
    assert.equal(signals.listenerCount('SIGINT'), 0, 'the handler is removed');
    assert.equal(code, 130);
    assert.match(output, /stopped by SIGINT/);
    assert.deepEqual(runner.calls.map((c) => c.script), ['substrate:check', 'icons:windows:check', 'test:unit']);
    const records = readLedger(ledgerDir(repo, baseKey.commit)).filter((r) => r.type === 'stage');
    assert.deepEqual(records.map((r) => [r.stage, r.status]), [['substrate', 'passed'], ['windows-icons', 'passed'], ['unit', 'interrupted']]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('a different key or a dirty tree reuses nothing, and a dirty tree records nothing', async () => {
  const { STAGES } = await gate();
  const repo = tempDir();
  let clock = T0;
  try {
    assert.equal((await runQuiet({ root: repo, runner: fakeRunner({ plan: { 'test:acceptance:gate': allPass } }), now: () => (clock += 1000) })).code, 0);
    const reinstalled = fakeRunner({ key: { ...baseKey, rootInstall: 'z'.repeat(64) }, plan: { 'test:acceptance:gate': allPass } });
    assert.equal((await runQuiet({ root: repo, runner: reinstalled, now: () => (clock += 1000) })).code, 0);
    assert.equal(reinstalled.calls.length, STAGES.length, 'another installed tree reruns everything');

    const other = tempDir();
    try {
      const dirty = fakeRunner({ clean: false });
      const result = await runQuiet({ root: other, runner: dirty });
      assert.equal(result.code, 0);
      assert.match(result.output, /not clean, so this run is not recorded/);
      assert.equal(dirty.calls.length, STAGES.length);
      assert.equal(fs.existsSync(path.join(other, 'output')), false);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('an edited acceptance message file voids the passes it held', async () => {
  const { ledgerDir } = await gate();
  const repo = tempDir();
  let clock = T0;
  try {
    assert.equal((await runQuiet({ root: repo, runner: fakeRunner({ plan: { 'test:acceptance:gate': allPass } }), now: () => (clock += 1000) })).code, 0);
    fs.appendFileSync(path.join(ledgerDir(repo, baseKey.commit), 'acceptance', '1-first.ndjson'), '\n');
    const again = fakeRunner({ plan: { 'test:acceptance:gate': (only) => {
      assert.equal(only.length, 3);
      return allPass(only);
    } } });
    assert.equal((await runQuiet({ root: repo, runner: again, now: () => (clock += 1000) })).code, 0);
    assert.ok(again.calls.some((c) => c.script === 'test:acceptance:gate'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('status reports what is owed without running anything', async () => {
  const { status } = await gate();
  const repo = tempDir();
  try {
    const runner = fakeRunner();
    const lines = [];
    assert.equal(status({ root: repo, runner, now: T0, log: (l) => lines.push(l) }), 1);
    assert.equal(runner.calls.length, 0);
    assert.match(lines.join('\n'), /Still owed:\n {2}substrate has no reusable pass/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('the stage list keeps the old press-gate chain, acceptance through the rerunning gate', async () => {
  const { STAGES } = await gate();
  assert.deepEqual(STAGES.map((s) => s.script), [
    'substrate:check', 'icons:windows:check', 'test:unit', 'test:acceptance:dry', 'test:acceptance:gate',
    'test:favorites-picker:desktop', 'test:wallpaper:desktop', 'test:cold-launch', 'test:browser-shortcuts:desktop',
    'test:reader:desktop', 'test:web-store', 'test:oauth:desktop', 'test:modified-links:desktop', 'test:dns-smoke',
    'release:security', 'site:build',
  ]);
  assert.deepEqual(STAGES.filter((s) => s.fresh).map((s) => s.id), ['security']);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const stage of STAGES) assert.ok(pkg.scripts[stage.script], `npm script ${stage.script} exists`);
  assert.equal(pkg.scripts['release:verify:press'], 'node scripts/release-gate.mjs run');
  assert.equal(pkg.scripts['release:prepare'], 'node scripts/release-gate.mjs prepare');
  assert.equal(pkg.scripts['release:gate:status'], 'node scripts/release-gate.mjs status');
});

test('the real key reads the installed trees and the Electron binary in this checkout', async () => {
  const { computeKey } = await gate();
  const { key } = computeKey(root, {});
  assert.match(key.commit, /^[0-9a-f]{40}$/);
  assert.equal(key.node, process.version);
  assert.match(key.npm, /^\d+\.\d+\.\d+/);
  assert.match(key.rootInstall ?? '', /^[0-9a-f]{64}$/, 'npm ci writes node_modules/.package-lock.json');
  assert.equal(key.electron.version, JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version);
  assert.match(key.electron.executable ?? '', /^[0-9a-f]{64}$/);
});
