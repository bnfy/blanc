import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { verifyRuntime } = require('./verify-electron-runtime');
const { validateRuntimeRun } = require('./ci-runtime-policy');
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = require('../package.json');
const repo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;
const workflow = '.github/workflows/release-windows-linux.yml';
const runId = process.env.BLANC_RUNTIME_RUN_ID;
if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('BLANC_RUNTIME_RUN_ID must identify a successful private patched-runtime build.');
const platform = process.argv.find((arg) => arg.startsWith('--platform='))?.slice(11) ?? process.platform;
const runnerOS = { win32: 'Windows', linux: 'Linux' }[platform];
if (!runnerOS) throw new Error('CI staging supports the Windows/Linux x64 release targets only.');
const readOnly = process.argv.includes('--verify-only');
function gh(args, capture = false) {
  const result = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 300_000,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.status !== 0) throw new Error(`Runtime verification failed: gh ${args[0]} ${args[1]}`);
  return result.stdout;
}
const run = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${runId}`], true));
const jobPage = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`], true));
if (jobPage.total_count !== jobPage.jobs?.length) throw new Error('Runtime job listing is incomplete.');
validateRuntimeRun(run, { repo, workflow, jobs: jobPage.jobs, platform });
const stage = path.join(root, '.runtime');
fs.mkdirSync(stage, { recursive: true });
const download = fs.mkdtempSync(path.join(stage, `native-${platform}-`));
try {
  gh(['run', 'download', runId, '--repo', repo, '--name', `Blanc-Electron-${runnerOS}-X64-${runId}`, '--dir', download]);
  const archive = path.join(download, 'dist.zip');
  const recordPath = path.join(download, 'blanc-runtime-build.json');
  for (const file of [archive, recordPath]) {
    gh(['attestation', 'verify', file, '--repo', repo, '--signer-workflow', `${repo}/${workflow}`,
      '--source-digest', run.head_sha, '--signer-digest', run.head_sha, '--deny-self-hosted-runners']);
  }
  verifyRuntime({ root, platform, arch: 'x64', archive, recordPath });
  if (!readOnly) {
    fs.copyFileSync(archive, path.join(stage, 'electron.zip'));
    fs.copyFileSync(recordPath, path.join(stage, 'blanc-runtime-build.json'));
  }
  console.log(`Verified ${runnerOS} x64 patched runtime from workflow run ${runId}${readOnly ? '; local staging unchanged' : '; staged for packaging'}.`);
} finally {
  fs.rmSync(download, { recursive: true, force: true });
}
