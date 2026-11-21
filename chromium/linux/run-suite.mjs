// Runs the fork's acceptance runner against an unpacked Linux candidate on a
// hosted runner (.github/workflows/chromium-linux-candidate.yml), as
// chromium/windows/run-suite.mjs does on Windows:
//
//   node chromium/linux/run-suite.mjs CANDIDATE_DIR RESULTS_DIR --slice=f0 [--only=case-id-text]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { suiteArguments } from '../windows/run-suite.mjs';
import { runtimeConfig } from './candidate.mjs';

export { suiteArguments };

function main() {
  const [candidateFolder, resultsFolder, ...options] = process.argv.slice(2);
  if (!candidateFolder || !resultsFolder) throw new Error('Usage: run-suite.mjs CANDIDATE_DIR RESULTS_DIR --slice=f0 [--only=case-id-text]');
  const extra = suiteArguments(options);
  const directory = path.resolve(candidateFolder);
  const out = path.resolve(resultsFolder);
  if (fs.existsSync(out)) throw new Error('Refusing to overwrite prior results');
  const candidate = JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
  const config = runtimeConfig(directory, candidate);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-suite-'));
  const trackerFile = new URL('../tracker.json', import.meta.url);
  let savedTracker;
  try {
    const configFile = path.join(scratch, 'runtime-config.json');
    fs.writeFileSync(configFile, JSON.stringify(config));
    // Only development subsets may temporarily use an unrecorded candidate.
    if (extra.length) {
      const original = fs.readFileSync(trackerFile, 'utf8');
      const tracker = JSON.parse(original);
      if (tracker.currentCandidates.linux?.id !== config.candidate) {
        savedTracker = original;
        tracker.currentCandidates.linux = { id: config.candidate, exeSha256: config.executableSha256,
          qualification: 'development subset on a throwaway checkout; not recorded' };
        fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2) + '\n');
      }
    }
    const runner = fileURLToPath(new URL('../tests/runner.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [runner, configFile, out, ...extra], { stdio: 'inherit' });
    if (run.error) throw run.error;
    // A completed F0 with failing or undefined cases is still a result.
    if (![0, 1].includes(run.status) || !fs.existsSync(path.join(out, 'baseline.json'))) {
      throw new Error(`The runner did not complete (exit ${run.status ?? run.signal}).`);
    }
  } finally {
    if (savedTracker !== undefined) fs.writeFileSync(trackerFile, savedTracker);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); } catch (error) { console.error(`run-suite: ${error.message}`); process.exitCode = 1; }
}
