#!/usr/bin/env node
// The release press gate, with a ledger so a relaunch never repeats a pass.
// `release:verify:press` (run by release.sh) and `release:prepare` (run ahead
// of the release, unattended) both come here. Each stage's pass is recorded in
// output/release-gate/<commit>/ledger.ndjson under a key (commit, clean tree,
// Node, npm, the installed dependency trees, the Electron binary, test env
// overrides), and is reused only while that key, its evidence file's SHA-256
// and its age (48 hours) all still match. Acceptance resumes per scenario from
// Cucumber's own message streams. `release:security` always reruns.
// Spec: docs/superpowers/specs/2026-11-02-press-gate-ledger-design.md.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FRESHNESS_MS = 48 * 60 * 60 * 1000;

// The former `release:verify:press` && chain, in its order. `fresh` stages
// depend on more than the commit and always run.
export const STAGES = [
  { id: 'substrate', script: 'substrate:check' },
  { id: 'windows-icons', script: 'icons:windows:check' },
  { id: 'unit', script: 'test:unit' },
  { id: 'acceptance-dry', script: 'test:acceptance:dry' },
  { id: 'acceptance', script: 'test:acceptance:gate', acceptance: true },
  { id: 'favorites-picker', script: 'test:favorites-picker:desktop' },
  { id: 'wallpaper', script: 'test:wallpaper:desktop' },
  { id: 'cold-launch', script: 'test:cold-launch' },
  { id: 'browser-shortcuts', script: 'test:browser-shortcuts:desktop' },
  { id: 'reader', script: 'test:reader:desktop' },
  { id: 'web-store', script: 'test:web-store' },
  { id: 'oauth', script: 'test:oauth:desktop' },
  { id: 'modified-links', script: 'test:modified-links:desktop' },
  { id: 'dns-smoke', script: 'test:dns-smoke' },
  { id: 'security', script: 'release:security', fresh: true },
  { id: 'site', script: 'site:build' },
];

// ---- key ----------------------------------------------------------------

// The release operator's own inputs: no stage reads them, so a pass made by
// release:prepare without them still counts inside release.sh.
const OPERATOR_ENV = /^(BLANC_RELEASE_|BLANC_COSIGN_|BLANC_MAC_)|^(BLANC_EVS_PYTHON|BLANC_MIGRATION_BASE_VERSION)$/;

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (let n; (n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function fileDigest(file) {
  return fs.existsSync(file) ? sha256File(file) : null;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Digest of the test-relevant environment overrides; values are hashed, never kept. */
export function envFingerprint(env) {
  const names = Object.keys(env)
    .filter((name) => (/^(BLANC_|ELECTRON_)/.test(name) || name === 'NODE_OPTIONS') && !OPERATOR_ENV.test(name))
    .sort();
  return sha256(canonical(names.map((name) => [name, env[name]])));
}

export function keyDigest(key) {
  return sha256(canonical(key));
}

function electronIdentity(root) {
  const dir = path.join(root, 'node_modules', 'electron');
  let version = null;
  let executable = null;
  try { version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch {}
  try { executable = fileDigest(path.join(dir, 'dist', fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim())); } catch {}
  const framework = fileDigest(path.join(dir, 'dist', 'Electron.app', 'Contents', 'Frameworks',
    'Electron Framework.framework', 'Versions', 'A', 'Electron Framework'));
  return { version, executable, framework };
}

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function capture(file, args, cwd) {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

/** The key a pass is recorded under, and whether the tree is clean enough to record at all. */
export function computeKey(root, env = process.env) {
  const commit = capture('git', ['rev-parse', 'HEAD'], root);
  const clean = capture('git', ['status', '--porcelain'], root) === '';
  const key = {
    commit,
    node: process.version,
    npm: capture(command('npm'), ['--version'], root),
    platform: process.platform,
    arch: process.arch,
    rootInstall: fileDigest(path.join(root, 'node_modules', '.package-lock.json')),
    siteInstall: fileDigest(path.join(root, 'site', 'node_modules', '.package-lock.json')),
    electron: electronIdentity(root),
    env: envFingerprint(env),
  };
  return { key, clean };
}

// ---- ledger -------------------------------------------------------------

export function ledgerDir(root, commit) {
  return path.join(root, 'output', 'release-gate', commit);
}

/** Ledger records in order; a torn line (a killed writer) is skipped. */
export function parseLedger(text) {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function readLedger(dir) {
  return readMessages(path.join(dir, 'ledger.ndjson'));
}

export function appendRecord(dir, record) {
  fs.mkdirSync(dir, { recursive: true });
  const fd = fs.openSync(path.join(dir, 'ledger.ndjson'), 'a');
  try {
    fs.writeSync(fd, `${JSON.stringify(record)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function withinAge(record, now, maxAge) {
  const age = now - Date.parse(record.finishedAt);
  return Number.isFinite(age) && age >= 0 && age <= maxAge;
}

/** `name` must be a bare file name inside `folder`, with the recorded digest. */
function evidenceIntact(folder, name, digest) {
  if (!name || !digest || path.basename(name) !== name) return false;
  const file = path.join(folder, name);
  return fs.existsSync(file) && sha256File(file) === digest;
}

/**
 * The newest pass of `stage` that can still be reused: same key digest, its log
 * unchanged, not older than maxAge. A `fresh` stage counts only when it passed
 * in `attempt` (the current one); otherwise never.
 */
export function stagePass(records, stage, digest, { dir, now = Date.now(), maxAge = FRESHNESS_MS, attempt } = {}) {
  for (const record of [...records].reverse()) {
    if (record.type !== 'stage' || record.stage !== stage.id || record.key !== digest || record.status !== 'passed') continue;
    if (stage.fresh && (attempt === undefined || record.attempt !== attempt)) continue;
    if (!withinAge(record, now, maxAge) || !evidenceIntact(path.join(dir, 'logs'), record.log, record.logSha256)) continue;
    return record;
  }
  return null;
}

// ---- acceptance ---------------------------------------------------------

/** Records from an NDJSON file (the ledger, a Cucumber message stream); a torn line is skipped. */
export function readMessages(file) {
  return fs.existsSync(file) ? parseLedger(fs.readFileSync(file, 'utf8')) : [];
}

// Cucumber reports a pickle's uri with the platform's separator; locations use
// '/', which it accepts as a path:line selection everywhere.
function picklesById(messages) {
  return new Map(messages.filter((m) => m.pickle).map(({ pickle }) => [pickle.id, {
    location: `${pickle.uri.replaceAll('\\', '/')}:${pickle.location?.line}`, name: pickle.name,
  }]));
}

/** The scenarios a run selected (a dry run's test cases), as { location, name }. */
export function expectedScenarios(messages) {
  const pickles = picklesById(messages);
  return messages.filter((m) => m.testCase).map(({ testCase }) => pickles.get(testCase.pickleId)).filter(Boolean);
}

/**
 * Each scenario's final attempt in one Cucumber message stream: passed only if
 * every step and hook result was PASSED. A scenario still running when the
 * stream ends (Ctrl+C, a crash) has no final attempt and is left out.
 */
export function scenarioOutcomes(messages) {
  const pickles = picklesById(messages);
  const testCases = new Map(messages.filter((m) => m.testCase).map(({ testCase }) => [testCase.id, testCase.pickleId]));
  const attempts = new Map();
  const outcomes = [];
  for (const m of messages) {
    if (m.testCaseStarted) {
      attempts.set(m.testCaseStarted.id, { testCaseId: m.testCaseStarted.testCaseId, attempt: m.testCaseStarted.attempt ?? 0, bad: null });
    } else if (m.testStepFinished) {
      const a = attempts.get(m.testStepFinished.testCaseStartedId);
      const result = m.testStepFinished.testStepResult ?? {};
      if (a && !a.bad && result.status !== 'PASSED') a.bad = result;
    } else if (m.testCaseFinished) {
      const a = attempts.get(m.testCaseFinished.testCaseStartedId);
      if (!a || m.testCaseFinished.willBeRetried) continue;
      const pickle = pickles.get(testCases.get(a.testCaseId));
      if (!pickle) continue;
      outcomes.push({
        ...pickle,
        passed: !a.bad,
        tries: a.attempt + 1,
        error: a.bad ? String(a.bad.message ?? a.bad.status).split('\n')[0].trim() : null,
      });
    }
  }
  return outcomes;
}

/**
 * Per expected scenario: the run it first passed in (or null) and every earlier
 * final failure. `runs` are { attempt, label, outcomes } in the order they ran.
 */
export function acceptanceState(expected, runs) {
  const state = new Map(expected.map((s) => [s.location, { ...s, passed: null, failures: [] }]));
  for (const run of runs) {
    for (const outcome of run.outcomes) {
      const s = state.get(outcome.location);
      if (!s || s.passed || s.name !== outcome.name) continue;
      if (outcome.passed) s.passed = { attempt: run.attempt, label: run.label };
      else s.failures.push({ attempt: run.attempt, label: run.label, error: outcome.error });
    }
  }
  return state;
}

export function owed(state) {
  return [...state.values()].filter((s) => !s.passed).map((s) => s.location);
}

/** The recorded acceptance runs under `digest` whose message files are intact and fresh. */
export function acceptanceRuns(records, digest, { dir, now = Date.now(), maxAge = FRESHNESS_MS } = {}) {
  return records
    .filter((r) => r.type === 'acceptance-run' && r.key === digest && withinAge(r, now, maxAge)
      && evidenceIntact(path.join(dir, 'acceptance'), r.file, r.sha256))
    .map((r) => ({ attempt: r.attempt, label: r.label, outcomes: scenarioOutcomes(readMessages(path.join(dir, 'acceptance', r.file))) }));
}

// ---- evidence -----------------------------------------------------------

function shortTime(iso) {
  return iso ? iso.replace(/\.\d+Z$/, 'Z') : '';
}

/** The block release.sh's log keeps and the release incident quotes verbatim. */
export function evidenceBlock({ commit, digest, stages, acceptance, ledgerSha256 }) {
  const lines = [`Press gate evidence: commit ${commit} key ${digest.slice(0, 12)}`];
  for (const { stage, record } of stages) {
    const id = stage.id.padEnd(18);
    if (stage.acceptance && acceptance) {
      lines.push(`  ${id} ${acceptance.passed}/${acceptance.expected} passed in ${acceptance.attempts.length} attempt(s) (${acceptance.attempts.join(', ')})`
        + (record ? `  log ${record.logSha256.slice(0, 12)}` : ''));
      if (acceptance.afterFailure.length) {
        lines.push('    passed after failing in an earlier run:');
        for (const s of acceptance.afterFailure) {
          lines.push(`      ${s.location}  ${s.name}`);
          for (const f of s.failures) lines.push(`        attempt ${f.attempt} (${f.label}): ${f.error}`);
        }
      }
    } else if (record) {
      lines.push(`  ${id} passed ${shortTime(record.finishedAt)}  attempt ${record.attempt}  log ${record.logSha256.slice(0, 12)}${stage.fresh ? '  (always rerun)' : ''}`);
    } else {
      lines.push(`  ${id} NOT PASSED`);
    }
  }
  if (ledgerSha256) lines.push(`Ledger: ${path.posix.join('output/release-gate', commit, 'ledger.ndjson')} sha256 ${ledgerSha256}`);
  return lines.join('\n');
}

/**
 * Whether every stage has a reusable pass under the key, re-derived from the
 * ledger and its evidence files. `attempt` is the current attempt, for the
 * `fresh` stages; without it they cannot pass (status, not a release).
 */
export function verifyLedger({ commit, digest, dir, expected, now = Date.now(), maxAge = FRESHNESS_MS, attempt }) {
  const records = readLedger(dir);
  const problems = [];
  const stages = STAGES.map((stage) => {
    const record = stagePass(records, stage, digest, { dir, now, maxAge, attempt });
    if (!record) problems.push(`${stage.id} has no reusable pass`);
    return { stage, record };
  });
  let acceptance = null;
  if (expected) {
    const runs = acceptanceRuns(records, digest, { dir, now, maxAge });
    const state = acceptanceState(expected, runs);
    const missing = owed(state);
    if (missing.length) problems.push(`acceptance: ${missing.length} of ${expected.length} scenario(s) not passed`);
    const all = [...state.values()];
    acceptance = {
      expected: expected.length,
      passed: all.filter((s) => s.passed).length,
      attempts: [...new Set(all.filter((s) => s.passed).map((s) => s.passed.attempt))].sort((a, b) => a - b),
      afterFailure: all.filter((s) => s.passed && s.failures.length),
      owed: missing,
    };
  } else {
    problems.push('acceptance: the expected scenario set is unknown');
  }
  const ledgerFile = path.join(dir, 'ledger.ndjson');
  const ledgerSha256 = fs.existsSync(ledgerFile) ? sha256File(ledgerFile) : null;
  return { ok: problems.length === 0, problems, acceptance, text: evidenceBlock({ commit, digest, stages, acceptance, ledgerSha256 }) };
}

// ---- running ------------------------------------------------------------

/** Runs `npm run <script> [-- args]`, teeing its output to the terminal and `logFile`. */
function npmStage(root, script, { args = [], env, logFile, onChild }) {
  return new Promise((resolve) => {
    const log = logFile ? fs.createWriteStream(logFile) : null;
    const child = spawn(command('npm'), ['run', script, ...(args.length ? ['--', ...args] : [])], {
      cwd: root, env, stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32',
    });
    onChild?.(child);
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); log?.write(chunk); });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); log?.write(chunk); });
    child.on('close', (code, signal) => {
      if (log) log.end(() => resolve({ code, signal }));
      else resolve({ code, signal });
    });
  });
}

/** The `runnable` scenarios, from a 1–2 s dry run. */
function dryRunExpected(root) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-gate-expected-'));
  try {
    const file = path.join(tmp, 'expected.ndjson');
    const result = spawnSync(command('npx'), ['cucumber-js', '-c', 'test/desktop/cucumber.mjs', '-p', 'dry'], {
      cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32',
      env: { ...process.env, BLANC_ACCEPTANCE_MESSAGES: file },
    });
    if (result.status !== 0) throw new Error(`the acceptance dry run exited ${result.status}`);
    const expected = expectedScenarios(readMessages(file));
    if (!expected.length) throw new Error('the acceptance dry run selected no scenarios');
    return expected;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export const realRunner = {
  key: computeKey,
  expected: dryRunExpected,
  stage: npmStage,
};

/**
 * Runs every stage without a reusable pass, records each result, then verifies.
 * Returns the exit code. `keepGoing` (release:prepare) runs past a failed stage.
 */
export async function run({
  root, env = process.env, runner = realRunner, now = () => Date.now(), keepGoing = false, log = console.log, signals = process,
}) {
  const { key, clean } = runner.key(root, env);
  const digest = keyDigest(key);
  if (!clean) {
    log('release gate: the working tree is not clean, so this run is not recorded and reuses nothing.');
    for (const stage of STAGES) {
      log(`\n==> ${stage.id}: npm run ${stage.script}`);
      const { code } = await runner.stage(root, stage.script, { env });
      if (code !== 0) return code || 1;
    }
    return 0;
  }

  const dir = ledgerDir(root, key.commit);
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'acceptance'), { recursive: true });
  const attempt = readLedger(dir).filter((r) => r.type === 'attempt').length + 1;
  const stamp = () => new Date(now()).toISOString();
  appendRecord(dir, { type: 'attempt', attempt, key: digest, startedAt: stamp(), keyFields: key });
  log(`release gate: attempt ${attempt} on ${key.commit}, key ${digest.slice(0, 12)}, ledger ${path.relative(root, dir)}`);

  let interrupted = null;
  let current = null;
  const onSignal = (signal) => {
    interrupted = signal;
    current?.kill(signal);
  };
  signals.on('SIGINT', onSignal);
  signals.on('SIGTERM', onSignal);
  let expected = null;
  let failed = false;
  try {
    for (const stage of STAGES) {
      if (interrupted) break;
      const records = readLedger(dir);
      let args = [];
      let stageEnv = env;
      if (stage.acceptance) {
        try {
          expected ??= runner.expected(root);
        } catch (error) {
          log(`\n==> acceptance: ${error.message}`);
          failed = true;
          if (keepGoing) continue;
          break;
        }
        const state = acceptanceState(expected, acceptanceRuns(records, digest, { dir, now: now() }));
        const remaining = owed(state);
        const passedRecord = stagePass(records, stage, digest, { dir, now: now() });
        if (!remaining.length && passedRecord) {
          log(`skip acceptance: all ${expected.length} scenarios passed (attempt(s) ${[...new Set([...state.values()].map((s) => s.passed.attempt))].join(', ')})`);
          continue;
        }
        if (remaining.length && remaining.length < expected.length) {
          const only = path.join(dir, 'acceptance', `${attempt}-only.json`);
          fs.writeFileSync(only, JSON.stringify(remaining));
          args = ['--only', only];
          log(`\n==> acceptance: ${expected.length - remaining.length} of ${expected.length} scenarios already passed; running the ${remaining.length} still owed`);
        }
        stageEnv = { ...env, BLANC_ACCEPTANCE_MESSAGES_DIR: path.join(dir, 'acceptance'), BLANC_ACCEPTANCE_RUN_PREFIX: `${attempt}-` };
      } else {
        const pass = stagePass(records, stage, digest, { dir, now: now() });
        if (pass) {
          log(`skip ${stage.id}: passed ${shortTime(pass.finishedAt)} (attempt ${pass.attempt}), log sha256 ${pass.logSha256.slice(0, 12)}`);
          continue;
        }
      }

      log(`\n==> ${stage.id}: npm run ${stage.script}${args.length ? ` -- ${args.join(' ')}` : ''}`);
      const logName = `${attempt}-${stage.id}.log`;
      const startedAt = stamp();
      const { code, signal } = await runner.stage(root, stage.script, {
        args, env: stageEnv, logFile: path.join(dir, 'logs', logName), onChild: (child) => { current = child; },
      });
      current = null;
      const finishedAt = stamp();
      let passed = code === 0 && !signal && !interrupted;
      if (stage.acceptance) {
        for (const label of ['first', 'rerun']) {
          const file = `${attempt}-${label}.ndjson`;
          const full = path.join(dir, 'acceptance', file);
          if (fs.existsSync(full)) appendRecord(dir, { type: 'acceptance-run', attempt, label, key: digest, file, sha256: sha256File(full), finishedAt });
        }
        const left = owed(acceptanceState(expected, acceptanceRuns(readLedger(dir), digest, { dir, now: now() })));
        if (passed && left.length) {
          log(`acceptance: the run exited 0 but ${left.length} scenario(s) are still not passed; failing.`);
          passed = false;
        }
      }
      appendRecord(dir, {
        type: 'stage', attempt, stage: stage.id, key: digest, status: passed ? 'passed' : (interrupted ? 'interrupted' : 'failed'),
        exitCode: code, signal: signal ?? null, startedAt, finishedAt, log: logName, logSha256: sha256File(path.join(dir, 'logs', logName)),
      });
      if (!passed) {
        failed = true;
        if (interrupted || !keepGoing) break;
      }
    }
  } finally {
    signals.off('SIGINT', onSignal);
    signals.off('SIGTERM', onSignal);
  }

  if (interrupted) {
    log(`\nrelease gate: stopped by ${interrupted}. Passes so far are recorded; the next run resumes from what is still owed.`);
    return 130;
  }
  let verdict;
  try {
    expected ??= runner.expected(root);
    verdict = verifyLedger({ commit: key.commit, digest, dir, expected, now: now(), attempt });
  } catch (error) {
    log(`release gate: could not verify: ${error.message}`);
    return 1;
  }
  log(`\n${verdict.text}\n`);
  if (verdict.ok && !failed) return 0;
  log('release gate: not passed yet:');
  for (const problem of verdict.problems) log(`  ${problem}`);
  if (verdict.acceptance?.owed.length && verdict.acceptance.owed.length <= 20) {
    for (const location of verdict.acceptance.owed) log(`    ${location}`);
  }
  log('Run the same command again on this commit to run only what is still owed.');
  return 1;
}

/** Reports what is recorded under the current key, running nothing. */
export function status({ root, env = process.env, runner = realRunner, now = Date.now(), log = console.log }) {
  const { key, clean } = runner.key(root, env);
  if (!clean) {
    log('release gate: the working tree is not clean; nothing can be reused.');
    return 1;
  }
  const digest = keyDigest(key);
  const verdict = verifyLedger({ commit: key.commit, digest, dir: ledgerDir(root, key.commit), expected: runner.expected(root), now });
  log(verdict.text);
  const pending = verdict.problems.filter((p) => !p.startsWith('security '));
  log(pending.length ? `\nStill owed:\n${pending.map((p) => `  ${p}`).join('\n')}` : '\nEverything but release:security (always rerun) has a reusable pass.');
  return pending.length ? 1 : 0;
}

/** Installs exactly as release.sh does, then runs every owed stage, keeping going past failures. */
export async function prepare({ root, env = process.env, log = console.log }) {
  if (capture('git', ['status', '--porcelain'], root) !== '') {
    log('release:prepare: the working tree is not clean. Use the clean release worktree.');
    return 1;
  }
  spawnSync('git', ['fetch', 'origin', '--quiet'], { cwd: root, stdio: 'inherit' });
  const head = capture('git', ['rev-parse', 'HEAD'], root);
  let main = null;
  try { main = capture('git', ['rev-parse', 'origin/main'], root); } catch {}
  if (head !== main) {
    log(`release:prepare: warning: HEAD ${head} is not origin/main (${main ?? 'unknown'}). These passes count only if this commit is what ships.`);
  }
  if (process.platform === 'darwin') {
    spawn('caffeinate', ['-dimsu', '-w', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
  }
  for (const args of [['run', 'ublock:distribution'], ['ci'], ['ci', '--prefix', 'site']]) {
    log(`\n==> npm ${args.join(' ')}`);
    const result = spawnSync(command('npm'), args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) return result.status || 1;
  }
  return run({ root, env, keepGoing: true, log });
}

async function main(argv) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  switch (argv[0]) {
    case 'run': return run({ root });
    case 'prepare': return prepare({ root });
    case 'status': return status({ root });
    default:
      console.error('usage: release-gate.mjs run | prepare | status');
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
