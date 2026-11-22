// The pure rules of a Windows night (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 1): the next build number, the beta's version edit, argument drift, when a
// night skips, and whether its evidence passes. No I/O; desktop-nightly.mjs and
// chromium/windows/server/nightly-build.sh call these.
import {judgeSuite} from './nightly.mjs';
import {windowsForkExclusions} from '../../tests/windows-fork-exclusions.mjs';

const SEQUENCE = 'desktop-158';
const VERSION_LINE = /^blanc_beta_version\s*=/;
const BUILD_LINE = /^blanc_beta_build\s*=/;

// One above every Windows build in the ledger and every build claimed in the
// shared desktop sequence (any platform).
export function nextWindowsBuild(ledger, reservations = null) {
  const claimed = (reservations?.sequences?.[SEQUENCE] ?? []).map(entry => entry.build);
  const builds = [...(ledger?.builds ?? []).map(entry => entry.build), ...claimed].filter(Number.isInteger);
  return Math.max(0, ...builds) + 1;
}

// The committed beta-x64.gn with only its two version lines set to |build|.
export function windowsBetaArgs(committedText, build) {
  if (!Number.isInteger(build) || build < 1 || build > 9999) throw new Error('The build must be an integer 1..9999.');
  let version = 0, number = 0;
  const out = committedText.split('\n').map(line => {
    if (VERSION_LINE.test(line)) { version++; return `blanc_beta_version = "2.0.0-beta.${build}"`; }
    if (BUILD_LINE.test(line)) { number++; return `blanc_beta_build = ${build}`; }
    return line;
  }).join('\n');
  if (version !== 1) throw new Error('beta-x64.gn must set blanc_beta_version exactly once.');
  if (number !== 1) throw new Error('beta-x64.gn must set blanc_beta_build exactly once.');
  return out;
}

// Lines of |currentText| that |intendedText| doesn't have, by exact text. With
// ignoreVersion, the two beta version lines are left out on both sides.
export function argsDrift(currentText, intendedText, {ignoreVersion}) {
  const keep = line => line.trim() !== '' && !(ignoreVersion && (VERSION_LINE.test(line) || BUILD_LINE.test(line)));
  const intended = new Set(intendedText.split('\n').filter(keep));
  const current = currentText.split('\n').filter(keep);
  const drift = current.filter(line => !intended.has(line));
  // A line removed from the current file is drift too.
  const currentSet = new Set(current);
  for (const line of intended) if (!currentSet.has(line)) drift.push(`(missing) ${line}`);
  return drift;
}

export function skipReason({hold, macMarker, serverLock, sisoRunning, unchangedSinceLastPass}) {
  if (hold) return `the candidate draft is held (${hold.kind ?? 'unknown'}); the night does not touch it`;
  if (macMarker) return 'a Mac release is prepared on the Mac Studio';
  if (serverLock) return 'the desktop checkout is locked on the build server (setup, apply or another build)';
  if (sisoRunning) return 'a build is running on the server';
  if (unchangedSinceLastPass) return 'nothing new since the last passing night';
  return null;
}

const TERMINAL = new Set(['pass', 'fail', 'undefined']);
const fail = reason => ({status: 'fail', reason});
const casesOf = report => (report?.scenarios ?? []).flatMap(scenario => (scenario.cases ?? []).map(c => ({...c, scenario})));

// Whether a report's rows are exactly the inventory, with exclusions only where
// the inventory or the Windows list approves them. Returns a reason, or null.
function coverageProblem(report, inventory, {requireTerminal}) {
  const excludedScenario = new Map(inventory.scenarios.map(s => [s.id, s.desktopApplicability === 'excluded']));
  const expected = new Map(inventory.scenarios.flatMap(s => s.cases.map(c => [c.id, excludedScenario.get(s.id) || Boolean(windowsForkExclusions[c.id])])));
  const rows = casesOf(report);
  const seen = new Set();
  for (const row of rows) {
    if (!expected.has(row.id)) return `the report has a case the inventory doesn't: ${row.id}`;
    if (seen.has(row.id)) return `the report lists ${row.id} twice`;
    seen.add(row.id);
    const mayExclude = expected.get(row.id);
    if (row.result === 'excluded' && !mayExclude) return `${row.id} is excluded without an approved reason`;
    if (requireTerminal && !mayExclude && !TERMINAL.has(row.result)) return `${row.id} has no result (${row.result})`;
  }
  if (seen.size !== expected.size) return `the report covers ${seen.size} of ${expected.size} inventory cases`;
  return null;
}

function identityProblem(report, runId, expect) {
  if (String(report?.runId) !== String(runId)) return `the report is from run ${report?.runId}, not ${runId}`;
  if (report.platform !== 'windows') return `the report is for ${report.platform}, not windows`;
  if (report.candidate !== expect.prototypeId) return `the report tested ${report.candidate}, not ${expect.prototypeId}`;
  if (report.forkCommit !== expect.sourceCommit) return `the report ran harness ${report.forkCommit}, not ${expect.sourceCommit}`;
  return null;
}

// A night passes when every release-path check passed and the prototype's full
// suite is this night's, complete, and passing (known failures and cases that
// passed their one rerun allowed).
export function judgeWindowsNight({checks, suite, rerun = null, known, inventory, expect}) {
  for (const [name, ok] of Object.entries(checks ?? {})) if (ok !== true) return fail(`check failed: ${name}`);
  if (Object.keys(checks ?? {}).length === 0) return fail('no checks were recorded');
  const identity = identityProblem(suite, expect.runIds?.suite, expect);
  if (identity) return fail(identity);
  if (suite.developmentSubset) return fail('the suite run was a subset, not the full suite');
  const coverage = coverageProblem(suite, inventory, {requireTerminal: true});
  if (coverage) return fail(coverage);
  if (rerun) {
    const rerunIdentity = identityProblem(rerun, expect.runIds?.rerun, expect);
    if (rerunIdentity) return fail(`rerun: ${rerunIdentity}`);
    const rerunCoverage = coverageProblem(rerun, inventory, {requireTerminal: false});
    if (rerunCoverage) return fail(`rerun: ${rerunCoverage}`);
    const requested = [...(expect.rerunCases ?? [])].sort();
    const listed = [...(rerun.developmentSubset?.caseList ?? [])].sort();
    if (JSON.stringify(requested) !== JSON.stringify(listed)) return fail('the rerun ran a different case list than requested');
    const results = new Map(casesOf(rerun).map(c => [c.id, c.result]));
    const missing = requested.filter(id => !TERMINAL.has(results.get(id)));
    if (missing.length) return fail(`the rerun has no result for ${missing.join(', ')}`);
  }
  try {
    // judgeSuite refuses subsets; the rerun's subset flag is checked above.
    return judgeSuite(suite, known, rerun ? {...rerun, developmentSubset: undefined} : null);
  } catch (error) {
    return fail(error.message);
  }
}
