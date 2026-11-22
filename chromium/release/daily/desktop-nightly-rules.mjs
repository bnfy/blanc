// The pure rules of a Windows night (docs/superpowers/plans/2026-11-21-windows-nightly.md,
// Task 1): the next build number, the beta's version edit, argument drift, when a
// night skips, and whether its evidence passes. No I/O, and no imports with I/O,
// so chromium/windows/server/nightly-build.sh can load it from stdin.
import {judgeSuite} from './judge.mjs';
import {windowsForkExclusions} from '../../tests/windows-fork-exclusions.mjs';

const SEQUENCE = 'desktop-158';
const VERSION_LINE = /^[ \t]*blanc_beta_version[ \t]*=/;
const BUILD_LINE = /^[ \t]*blanc_beta_build[ \t]*=/;
export const NIGHT_CHECKS = Object.freeze(['betaWorkflow', 'installPass', 'installed', 'installedLaunches', 'installedHashesMatch',
  'betaIcon', 'prototypeLaunch', 'prototypeFrame']);

// One above every Windows build in the ledger and every build claimed in the
// shared desktop sequence (any platform).
export function nextWindowsBuild(ledger, reservations = null) {
  const claimed = (reservations?.sequences?.[SEQUENCE] ?? []).map(entry => entry.build);
  const builds = [...(ledger?.builds ?? []).map(entry => entry.build), ...claimed].filter(Number.isInteger);
  return Math.max(0, ...builds) + 1;
}

function countVersionLines(text) {
  const lines = text.split('\n');
  return {version: lines.filter(line => VERSION_LINE.test(line)).length, build: lines.filter(line => BUILD_LINE.test(line)).length};
}

// The committed beta-x64.gn with only its two version lines set to |build|.
export function windowsBetaArgs(committedText, build) {
  if (!Number.isInteger(build) || build < 1 || build > 9999) throw new Error('The build must be an integer 1..9999.');
  const counts = countVersionLines(committedText);
  if (counts.version !== 1) throw new Error('beta-x64.gn must set blanc_beta_version exactly once.');
  if (counts.build !== 1) throw new Error('beta-x64.gn must set blanc_beta_build exactly once.');
  return committedText.split('\n').map(line => {
    if (VERSION_LINE.test(line)) return `blanc_beta_version = "2.0.0-beta.${build}"`;
    if (BUILD_LINE.test(line)) return `blanc_beta_build = ${build}`;
    return line;
  }).join('\n');
}

// How |currentText| differs from |intendedText|, comparing the whole texts in
// order (final newline included). With ignoreVersion, exactly one of each beta
// version line must be on each side, and only their values are masked. [] means
// identical; otherwise the changed lines, then "(missing) <line>" for lines only
// |intendedText| has, or a note when only order, repetition or the final
// newline differ.
export function argsDrift(currentText, intendedText, {ignoreVersion}) {
  const mask = text => {
    if (!ignoreVersion) return text;
    const counts = countVersionLines(text);
    if (counts.version !== 1 || counts.build !== 1) return null;
    return text.split('\n').map(line => VERSION_LINE.test(line) ? 'blanc_beta_version = <masked>'
      : BUILD_LINE.test(line) ? 'blanc_beta_build = <masked>' : line).join('\n');
  };
  const current = mask(currentText), intended = mask(intendedText);
  if (current === null || intended === null) return ['(the beta version lines must appear exactly once each)'];
  if (current === intended) return [];
  const currentLines = current.split('\n'), intendedLines = intended.split('\n');
  const intendedSet = new Set(intendedLines), currentSet = new Set(currentLines);
  const drift = [...currentLines.filter(line => !intendedSet.has(line)),
    ...intendedLines.filter(line => !currentSet.has(line)).map(line => `(missing) ${line}`)].filter(line => line !== '' && line !== '(missing) ');
  return drift.length ? drift : ['(the lines are the same but their order, repetition or final newline differs)'];
}

export function skipReason({hold, macMarker, serverLock, sisoRunning, unchangedSinceLastPass}) {
  if (hold) return 'the candidate draft is held; the night does not touch it';
  if (macMarker) return 'a Mac release is prepared on the Mac Studio';
  if (serverLock) return 'the desktop checkout is locked on the build server (setup, apply or another build)';
  if (sisoRunning) return 'a build is running on the server';
  if (unchangedSinceLastPass) return 'nothing new since the last passing night';
  return null;
}

const TERMINAL = new Set(['pass', 'fail', 'undefined']);
const fail = reason => ({status: 'fail', reason});
const casesOf = report => (report?.scenarios ?? []).flatMap(scenario => scenario.cases ?? []);

// Whether a report's rows are exactly the inventory. An approved exclusion is
// one the inventory (a scenario not applicable to desktop) or the Windows list
// names. In a full run every row is terminal or an approved exclusion; in a
// rerun unselected rows may be not-run. Returns a fixed reason, or null.
function coverageProblem(report, inventory, {full}) {
  const scenarioExcluded = new Map(inventory.scenarios.map(s => [s.id, s.desktopApplicability === 'excluded']));
  const approved = new Map(inventory.scenarios.flatMap(s => s.cases.map(c => [c.id, scenarioExcluded.get(s.id) || Object.hasOwn(windowsForkExclusions, c.id)])));
  const seen = new Set();
  for (const row of casesOf(report)) {
    if (!approved.has(row.id)) return 'the report has a case the inventory does not';
    if (seen.has(row.id)) return 'the report lists a case twice';
    seen.add(row.id);
    if (row.result === 'excluded' && !approved.get(row.id)) return 'the report excludes a case without an approved reason';
    if (full && !(TERMINAL.has(row.result) || (row.result === 'excluded' && approved.get(row.id)))) return 'the full suite left a case without a result';
  }
  if (seen.size !== approved.size) return 'the report does not cover the whole inventory';
  return null;
}

function identityProblem(report, runId, expect) {
  if (runId === undefined || runId === null || report?.runId === undefined || report?.runId === null) return 'a run id is missing';
  if (String(report.runId) !== String(runId)) return 'the report is from another run';
  if (report.platform !== 'windows') return 'the report is not for Windows';
  if (report.candidate !== expect.prototypeId) return 'the report tested another candidate';
  if (report.forkCommit !== expect.sourceCommit) return 'the report ran another harness commit';
  return null;
}

// A night passes when all eight release-path checks passed and the prototype's
// full suite is this night's, complete, and passing (known failures, and cases
// that passed their one rerun, allowed).
export function judgeWindowsNight({checks, suite, rerun = null, known, inventory, expect}) {
  for (const name of NIGHT_CHECKS) if (checks?.[name] !== true) return fail('a release-path check did not pass');
  const identity = identityProblem(suite, expect.runIds?.suite, expect);
  if (identity) return fail(identity);
  if (Object.hasOwn(suite, 'developmentSubset')) return fail('the suite run was a subset, not the full suite');
  const coverage = coverageProblem(suite, inventory, {full: true});
  if (coverage) return fail(coverage);
  if (rerun) {
    const rerunIdentity = identityProblem(rerun, expect.runIds?.rerun, expect);
    if (rerunIdentity) return fail(`rerun: ${rerunIdentity}`);
    const rerunCoverage = coverageProblem(rerun, inventory, {full: false});
    if (rerunCoverage) return fail(`rerun: ${rerunCoverage}`);
    const requested = [...new Set(expect.rerunCases ?? [])].sort();
    const listed = [...new Set(rerun.developmentSubset?.caseList ?? [])].sort();
    const resulted = [...new Set(casesOf(rerun).filter(c => TERMINAL.has(c.result)).map(c => c.id))].sort();
    if (JSON.stringify(requested) !== JSON.stringify(listed)) return fail('the rerun ran a different case list than requested');
    if (JSON.stringify(requested) !== JSON.stringify(resulted)) return fail('the rerun results are not exactly the requested cases');
  }
  try {
    // judgeSuite refuses subsets; the rerun's subset list is checked above.
    const {developmentSubset, ...rerunRows} = rerun ?? {};
    return judgeSuite(suite, known, rerun ? rerunRows : null);
  } catch {
    return fail('the suite verdict could not be computed');
  }
}
