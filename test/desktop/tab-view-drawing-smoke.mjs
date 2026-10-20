import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Regression for tab views that stop drawing on Linux after leaving their
// window: switching back, Glance, Reopen Closed Tab, waking a quiet tab that
// kept its session storage, moving a tab to a new window, and returning to a
// space. See src/main/tab-view-lifecycle.js. Run under `xvfb-run -a` on
// Linux; xvfb reproduces the bug.
//
// Electron is launched directly with a main-process driver
// (tab-view-drawing-driver.cjs), not through Playwright: Playwright turns on
// DevTools focus emulation for every page, which makes a stuck page draw and
// hides this bug.

const require = createRequire(import.meta.url);
const electron = require('electron');
const fixtures = require('./support/fixtures-server.js');

const repo = path.resolve('.');
const driver = path.join(repo, 'test/desktop/tab-view-drawing-driver.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-view-drawing-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
const resultFile = path.join(root, 'result.json');
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const server = await fixtures.start();
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const EXPECTED_PATHS = 22;
const child = spawn(electron, ['-r', driver, repo, `--user-data-dir=${userData}`], {
  env: { ...env, BLANC_TEST: '1', TAB_DRAWING_RESULT: resultFile, TAB_DRAWING_BASE: server.base },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let spawnError = null;
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
child.once('error', (error) => { spawnError = error; output += `${error}\n`; });
const exited = new Promise((resolve) => child.once('exit', resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stop() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

let report = null;
try {
  const deadline = Date.now() + 180_000;
  while (!fs.existsSync(resultFile)) {
    if (spawnError) throw new Error(`Blanc could not start: ${spawnError.message}`);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Blanc exited (${child.exitCode ?? child.signalCode}) before reporting`);
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for the driver');
    await sleep(250);
  }
  report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
} catch (error) {
  console.error(error.message);
} finally {
  // Linux test apps can hang on quit, so stop whatever is left.
  await Promise.race([exited, sleep(5000)]);
  stop();
  await Promise.race([exited, sleep(2000)]);
  await server.close();
}

let passed = false;
if (report) {
  for (const result of report.results) {
    const last = result.attempts.at(-1) ?? {};
    console.log(`${result.drawing ? 'ok  ' : 'FAIL'} ${result.path}: ${last.visibility ?? '-'}, ` +
      `${last.frames ?? '-'} frames in 700 ms, scrolled ${result.scrolled ?? '-'} px` +
      (result.error ? ` (${result.error})` : ''));
  }
  const failed = report.results.filter((result) => !result.drawing);
  if (report.error) console.error(`driver error: ${report.error}`);
  if (report.results.length !== EXPECTED_PATHS) console.error(`${report.results.length} of ${EXPECTED_PATHS} paths were measured`);
  if (failed.length) console.error(`${failed.length} tab view(s) stopped drawing`);
  passed = !report.error && !failed.length && report.results.length === EXPECTED_PATHS;
  if (passed) console.log(`all ${report.results.length} tab views kept drawing`);
}
if (!passed) console.error(output.split('\n').slice(-40).join('\n'));

// Windows can keep a child process's cache file open briefly after Blanc
// exits. A leftover temporary profile never fails the drawing check.
try {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
} catch (error) {
  console.error(`left ${root} behind: ${error.code ?? error.message}`);
}
process.exitCode = passed ? 0 : 1;
