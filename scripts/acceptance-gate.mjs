#!/usr/bin/env node
// The release press gate's acceptance step. Runs the `runnable` profile once;
// if 1–10 scenarios fail, reruns exactly those in a fresh Cucumber process
// (a fresh app, fixture servers and profile) with no retry, and passes only if
// each passes there. A passing rerun prints a marked block that release.sh's
// log keeps and the release incident quotes. More than 10 failures means a
// broken build or environment, so the gate fails without rerunning.
// Nightly and pull-request runs keep the plain `test:acceptance:desktop`.
// Spec: docs/superpowers/specs/2026-10-27-acceptance-gate-speed-design.md §3.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FIRST_RUN_CAP = 10;

const FAILING = new Set(['failed', 'undefined', 'ambiguous', 'pending']);

function outcomes(report) {
  return report.flatMap((feature) => (feature.elements ?? [])
    .filter((element) => element.type === 'scenario')
    .map((element) => {
      const results = [...(element.before ?? []), ...(element.steps ?? []), ...(element.after ?? [])]
        .map((step) => step.result ?? {});
      const bad = results.find((result) => FAILING.has(result.status));
      return {
        location: `${feature.uri}:${element.line}`,
        name: element.name,
        failed: Boolean(bad),
        error: bad ? (bad.error_message ?? bad.status).split('\n')[0].trim() : null,
      };
    }));
}

/** Scenarios that failed, as { location: 'path:line', name, error } (first line of the first error). */
export function failedScenarios(report) {
  return outcomes(report).filter((s) => s.failed).map(({ location, name, error }) => ({ location, name, error }));
}

/** 'pass' with no failures, 'rerun' for 1..cap, 'too-many' above the cap. */
export function decide(failed, cap = FIRST_RUN_CAP) {
  if (failed.length === 0) return 'pass';
  return failed.length > cap ? 'too-many' : 'rerun';
}

/** Problems with a rerun report; empty when every expected scenario ran once more and passed. */
export function checkRerun(expected, report) {
  if (!Array.isArray(report)) return ['the rerun wrote no readable report'];
  const ran = new Map(outcomes(report).map((s) => [s.location, s]));
  const problems = [];
  for (const { location } of expected) {
    const s = ran.get(location);
    if (!s) problems.push(`${location} did not run again`);
    else if (s.failed) problems.push(`${location} failed again: ${s.error}`);
  }
  const wanted = new Set(expected.map((s) => s.location));
  for (const location of ran.keys()) if (!wanted.has(location)) problems.push(`${location} ran but was not selected`);
  return problems;
}

/** The marked block a passing rerun prints. */
export function rerunBlock(passed) {
  return [
    `Acceptance rerun passed: ${passed.length} scenario(s)`,
    ...passed.flatMap((s) => [`  ${s.location}  ${s.name}`, `    first attempt: ${s.error}`]),
  ].join('\n');
}

function readReport(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function cucumber(profile, args, report, cwd) {
  const run = spawnSync('npx', ['cucumber-js', '-c', 'test/desktop/cucumber.mjs', '-p', profile, ...args], {
    cwd, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, BLANC_ACCEPTANCE_REPORT: report },
  });
  return run.status ?? 1;
}

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-acceptance-gate-'));
  const firstReport = path.join(dir, 'first-run.json');
  console.log(`acceptance gate: reports in ${dir}`);

  const firstStatus = cucumber('runnable', [], firstReport, root);
  const first = readReport(firstReport);
  if (!first) {
    console.error('acceptance gate: the run wrote no readable report; failing.');
    return 1;
  }
  const failed = failedScenarios(first);
  const decision = decide(failed);
  if (decision === 'pass') {
    if (firstStatus === 0) return 0;
    console.error(`acceptance gate: Cucumber exited ${firstStatus} with no failed scenario (a hook outside any scenario?); failing.`);
    return firstStatus;
  }
  if (decision === 'too-many') {
    console.error(`acceptance gate: ${failed.length} scenarios failed (more than ${FIRST_RUN_CAP}); not rerunning.`);
    return 1;
  }

  console.log(`\nacceptance gate: rerunning ${failed.length} failed scenario(s) once in a fresh process:`);
  for (const s of failed) console.log(`  ${s.location}  ${s.name}\n    ${s.error}`);
  const rerunReport = path.join(dir, 'rerun.json');
  const rerunStatus = cucumber('rerun', failed.map((s) => s.location), rerunReport, root);
  const problems = checkRerun(failed, readReport(rerunReport));
  if (rerunStatus !== 0 && problems.length === 0) problems.push(`the rerun exited ${rerunStatus}`);
  if (problems.length) {
    console.error('\nacceptance gate: the rerun did not pass:');
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  console.log(`\n${rerunBlock(failed)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
