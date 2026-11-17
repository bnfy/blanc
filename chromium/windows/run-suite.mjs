// Runs the fork's acceptance runner against an unpacked Windows candidate on
// a hosted Windows runner (.github/workflows/chromium-windows-candidate.yml):
//
//   node chromium/windows/run-suite.mjs CANDIDATE_FOLDER RESULTS_FOLDER --slice=f0 [--only=case-id-text]
//
// It writes the run config from the candidate's candidate.json and starts
// tests/runner.mjs, which itself refuses a candidate the tracker doesn't
// name. With --only the run is a development subset and never a baseline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeConfig } from './candidate.mjs';

export function suiteArguments(options) {
  const slices = options.filter(option => option.startsWith('--slice='));
  const only = options.filter(option => option.startsWith('--only='));
  if (options.length !== slices.length + only.length || slices.length !== 1 || slices[0] !== '--slice=f0' || only.length > 1)
    throw new Error(`Use --slice=f0 and at most one --only=case-id-text (got ${JSON.stringify(options)}).`);
  // An empty filter would mark a full run as a subset.
  if (only.length && only[0] === '--only=') throw new Error('--only needs case-id text; leave it out for a full run.');
  return only;
}
function main() {
  const [candidateFolder, resultsFolder, ...options] = process.argv.slice(2);
  if (!candidateFolder || !resultsFolder) throw new Error('Usage: run-suite.mjs CANDIDATE_FOLDER RESULTS_FOLDER --slice=f0 [--only=case-id-text]');
  const extra = suiteArguments(options);
  const directory = path.resolve(candidateFolder);
  const config = runtimeConfig(directory, JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8')));
  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-suite-')), 'runtime-config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tests/runner.mjs');
  const run = spawnSync(process.execPath, [runner, configFile, path.resolve(resultsFolder), ...extra], { stdio: 'inherit' });
  if (run.error) throw run.error;
  // The runner exits 1 when cases fail or are undefined: a recorded result,
  // not a broken run. Only a crash or a guard stop fails this step.
  const baseline = path.join(path.resolve(resultsFolder), 'baseline.json');
  if (!fs.existsSync(baseline)) throw new Error(`The runner stopped without a baseline (exit ${run.status ?? run.signal}).`);
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { console.error(`run-suite: ${error.message}`); process.exitCode = 1; }
}
