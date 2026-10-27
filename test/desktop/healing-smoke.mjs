// Runs the acceptance harness's self-test (test/desktop/harness/) and checks
// that healing does what the hooks promise: the scenarios that break the app
// fail, every scenario after them runs on a healthy app, and the run's summary
// reports each relaunch. Exits 0 only if the outcome is exactly that.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expected = [
  { name: 'A renderer crash fails only its own scenario', status: 'failed', message: /Target crashed/ },
  { name: 'The next scenario runs on a healed app', status: 'passed' },
  { name: 'A main-process exception fails its own scenario', status: 'failed', message: /synthetic main-process exception/ },
  { name: 'The healed app keeps its profile and environment', status: 'passed' },
  { name: 'A main-process exception is attributed even when an After relaunches the app', status: 'failed', message: /synthetic main-process exception/ },
  { name: 'No extra relaunch follows an After that already relaunched', status: 'passed' },
  { name: 'A renderer crash followed by an After that relaunches', status: 'failed', message: /Target crashed/ },
  { name: 'No extra relaunch follows a renderer crash an After already dealt with', status: 'passed' },
  { name: 'An app that dies on a temporary profile is relaunched back onto the main one', status: 'failed', message: /synthetic main-process exception/ },
  { name: 'The scenario after a death on a temporary profile runs on the main profile', status: 'passed' },
];
const SUMMARY = /^acceptance: the harness relaunched Blanc 2 time\(s\)$/m;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-healing-smoke-'));
const jsonPath = path.join(dir, 'healing.json');
const run = spawnSync('npx', [
  'cucumber-js', '-c', 'test/desktop/cucumber.mjs', '-p', 'harness',
  '--format', 'progress', '--format', `json:${jsonPath}`,
], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });

const RANK = { passed: 0, skipped: 1, pending: 2, undefined: 3, ambiguous: 4, failed: 5 };
// A scenario's status is its worst step or hook; its message is every error
// it produced, since a tagged After may fail before the attributing one.
function outcome(element) {
  let status = 'passed';
  const messages = [];
  for (const step of [...(element.before ?? []), ...element.steps, ...(element.after ?? [])]) {
    const s = step.result?.status ?? 'passed';
    if ((RANK[s] ?? 0) > (RANK[status] ?? 0)) status = s;
    if (step.result?.error_message) messages.push(step.result.error_message);
  }
  return { name: element.name, status, message: messages.join('\n') };
}

const problems = [];
let actual = [];
try {
  actual = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).flatMap((feature) => feature.elements.map(outcome));
} catch (error) {
  problems.push(`no readable JSON report at ${jsonPath}: ${error.message}`);
}
expected.forEach((want, index) => {
  const got = actual[index];
  if (!got) return problems.push(`missing scenario ${index + 1}: ${want.name}`);
  if (got.name !== want.name) problems.push(`scenario ${index + 1} is "${got.name}", expected "${want.name}"`);
  if (got.status !== want.status) problems.push(`"${want.name}" ${got.status}, expected ${want.status}: ${got.message.split('\n')[0]}`);
  if (want.message && !want.message.test(got.message)) problems.push(`"${want.name}" failed with "${got.message.split('\n')[0]}", expected ${want.message}`);
});
if (actual.length > expected.length) problems.push(`${actual.length - expected.length} unexpected extra scenario(s)`);
if (!SUMMARY.test(run.stderr ?? '')) problems.push('the run did not report exactly two relaunches');

for (const got of actual) console.log(`${got.status.padEnd(7)} ${got.name}`);
if (problems.length) {
  console.error(`\nHarness healing smoke FAILED (report: ${jsonPath}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('\n--- cucumber stderr ---\n' + (run.stderr ?? '').slice(-8000));
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log('\nHarness healing smoke passed.');
