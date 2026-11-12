'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const helper = import('../desktop/support/smoke-driver-result.mjs');

async function run(t, { report, exitCode = null, platform = 'linux' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-driver-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const resultFile = path.join(root, 'result.json');
  const script = `const fs = require('node:fs');
    const file = process.argv[1]; const report = JSON.parse(process.argv[2]);
    if (report !== null) { fs.writeFileSync(file + '.tmp', JSON.stringify(report)); fs.renameSync(file + '.tmp', file); }
    const code = JSON.parse(process.argv[3]); if (code !== null) process.exit(code);
    setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['-e', script, resultFile, JSON.stringify(report ?? null), JSON.stringify(exitCode)], { stdio: 'ignore' });
  const { collectDriverResult } = await helper;
  return collectDriverResult({ child, resultFile, expectedChecks: 2, platform, timeoutMs: 2000, graceMs: 100 });
}
const successful = { completed: true, checks: ['first assertion passed', 'last assertion passed'] };

test('a complete Linux result permits bounded cleanup of a stuck test process', async t => {
  const report = await run(t, { report: successful });
  assert.equal(report.controlledLinuxCleanup, true);
});
test('normal clean exit after the result remains successful', async t => {
  const report = await run(t, { report: successful, exitCode: 0 });
  assert.equal(report.controlledLinuxCleanup, false);
});
test('a crash after reporting is not hidden by a complete result', async t => {
  await assert.rejects(run(t, { report: successful, exitCode: 1 }), /exited unexpectedly/);
});
test('an early process exit without a report fails', async t => {
  await assert.rejects(run(t, { exitCode: 0 }), /before reporting/);
});
test('failed or incomplete reports cannot use the Linux cleanup exception', async t => {
  for (const report of [{ ...successful, error: 'assertion failed' }, { ...successful, completed: false },
    { ...successful, checks: ['only first assertion'] }]) {
    await assert.rejects(run(t, { report }), /did not complete all checks/);
  }
});
test('the known Linux shutdown exception does not mask a hang on other platforms', async t => {
  await assert.rejects(run(t, { report: successful, platform: 'darwin' }), /did not exit after reporting/);
});
