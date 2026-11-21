// Runs one of the fork's native checks (chromium/tests/native-*.mjs, which
// take a run config and a results folder) against an unpacked Windows
// candidate, with the run config made from its candidate.json.
//
//   node chromium/windows/run-native-check.mjs CANDIDATE_FOLDER CHECK RESULTS_FOLDER
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeConfig } from './candidate.mjs';

export function nativeCheckPath(root, check) {
  if (!/^native-[a-z0-9-]+\.mjs$/.test(check)) throw new Error(`Not a native check: ${check}`);
  return path.join(root, 'chromium', 'tests', check);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [candidateFolder, check, resultsFolder] = process.argv.slice(2);
  if (!candidateFolder || !check || !resultsFolder) throw new Error('Usage: run-native-check.mjs CANDIDATE_FOLDER CHECK RESULTS_FOLDER');
  const directory = path.resolve(candidateFolder);
  const config = runtimeConfig(directory, JSON.parse(fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8')));
  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-native-')), 'runtime-config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const run = spawnSync(process.execPath, [nativeCheckPath(root, check), configFile, path.resolve(resultsFolder)], { stdio: 'inherit' });
  process.exitCode = run.status ?? 1;
}
