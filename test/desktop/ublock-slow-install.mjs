// The start page must keep loading while a slow disk stretches the verified
// uBO install over many seconds. Every file operation on the uBO package and
// its managed copy is delayed in this child process only, for the awaited and
// the synchronous file APIs alike. `--control` installs synchronously on the
// same slow disk and must fail: that proves the check detects a blocked main
// process (CI job 111905234502 waited 18+ s for blanc://newtab).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import hooks from './support/test-hook-call.js';
const { waitForValue } = poll;
const root = path.resolve('.');
const control = process.argv.includes('--control');
const DELAY_MS = 6;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ubo-slow-install-'));
// Preloaded with -r so the app itself keeps its real path: Blanc's internal
// pages are exempt from uBO's startup hold only inside the app directory.
const slowDisk = path.join(temp, 'slow-disk.cjs');
fs.writeFileSync(slowDisk, `
  const fs = require('node:fs');
  const slow = file => /[\\\\/](managed-ublock|ublock)[\\\\/]/.test(String(file));
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (const name of ['readFile', 'writeFile', 'readdir', 'lstat', 'mkdir', 'mkdtemp', 'rename', 'rm']) {
    const original = fs[name + 'Sync'];
    fs[name + 'Sync'] = function (file, ...rest) { if (slow(file)) Atomics.wait(pause, 0, 0, ${DELAY_MS}); return original.call(this, file, ...rest); };
  }
  const existsSync = fs.existsSync;
  fs.existsSync = file => { if (slow(file)) Atomics.wait(pause, 0, 0, ${DELAY_MS}); return existsSync(file); };
  for (const name of ['readFile', 'writeFile', 'readdir', 'lstat', 'access', 'mkdir', 'mkdtemp', 'rename', 'rm']) {
    const original = fs.promises[name];
    fs.promises[name] = async function (file, ...rest) {
      if (slow(file)) await new Promise(resolve => setTimeout(resolve, ${DELAY_MS}));
      return original.call(this, file, ...rest);
    };
  }
  if (${control}) {
    const verified = require(${JSON.stringify(path.join(root, 'src/main/ublock-package.js'))});
    verified.installVerifiedPackageAsync = async options => verified.installVerifiedPackage(options);
  }
`);
const profile = path.join(temp, 'profile'); fs.mkdirSync(profile); fs.mkdirSync(profile + '-Dev');
fs.writeFileSync(path.join(profile + '-Dev', 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true, searchSuggestions: false, usagePing: false, onePasswordEnabled: false }));
let hits = 0;
const server = http.createServer((_request, response) => { hits++; response.end('<!doctype html><title>Held fixture</title>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env; void ignored;
let electron;
// app.process() throws once Playwright disposes an exited app, so keep the
// ChildProcess captured at launch (see ublock-origin.mjs).
let electronProcess;
let stderr = '';
let passed = false;
let blockedMainProcess = false;
const call = (method, ...args) => hooks.callTestHook(electron, method, args);
const watchdog = setTimeout(() => { console.error('Slow-install suite deadline'); electronProcess?.kill('SIGKILL'); }, 150000);
try {
  electron = await _electron.launch({ args: ['-r', slowDisk, root, `--user-data-dir=${profile}`], chromiumSandbox: true,
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1' } });
  electronProcess = electron.process();
  electronProcess.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
  await electron.firstWindow();
  // A blocked main process answers again only after its install has finished.
  const installing = await waitForValue(() => call('blockingStatus'), state => state.stage === 'install' || state.timings?.install !== undefined || state.phase !== 'initializing', 'uBO install stage', 30000);
  assert.equal(installing.stage, 'install', `the main process must answer while the uBO install runs; it next answered at ${JSON.stringify(installing.timings)}`);
  const before = new Set(await electron.windows());
  const opened = Date.now();
  await call('openTab', 'blanc://newtab/');
  const page = await waitForValue(async () => (await electron.windows()).find(item => !before.has(item) && item.url() === 'blanc://newtab/'), Boolean, 'new start page', 10000);
  // The footer is filled from main-process start data, not static HTML.
  await page.waitForFunction(() => document.readyState === 'complete'
    && /ads blocked this week/.test(document.getElementById('footerLeft')?.textContent || ''), null, { timeout: 10000 });
  const loadedMs = Date.now() - opened;
  await call('openTab', `http://127.0.0.1:${server.address().port}/held`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const during = await call('blockingStatus');
  assert.equal(during.phase, 'initializing', 'the start page loaded before uBO was ready');
  assert.equal(during.stage, 'install', `the start page must load while the install is still running (took ${loadedMs} ms; stage now ${during.stage})`);
  assert.equal(hits, 0, 'web traffic stays held during the install');
  console.log(`start page loaded in ${loadedMs} ms during the slowed install; web traffic held`);
  const ready = await waitForValue(() => call('blockingStatus'), state => state.phase !== 'initializing', 'uBO startup settled', 120000);
  assert.equal(ready.phase, 'ready', `uBO reaches ready after the slowed install: ${JSON.stringify(ready)}`);
  assert.equal(ready.stage, null);
  assert.deepEqual(Object.keys(ready.timings), ['cssHostLoad', 'cssHostReady', 'install', 'loadExtension', 'background', 'bridge', 'ready']);
  assert(ready.timings.install > 2000, `the delayed file operations applied to the install: ${ready.timings.install} ms`);
  console.log('uBO slow-install desktop passed:', JSON.stringify(ready.timings));
  passed = true;
} catch (error) {
  blockedMainProcess = /must answer while the uBO install runs|must load while the install is still running/.test(error.message);
  console.error(control && blockedMainProcess ? 'Control run failed as expected:' : 'Slow-install suite failed:', error.message);
  // A blocked main process cannot answer until the install has finished.
  if (electron) console.error('Provider state:', await Promise.race([call('blockingStatus'), new Promise(resolve => setTimeout(() => resolve('unavailable'), 5000))]).catch(() => 'unavailable'));
  if (!control) console.error(stderr);
} finally {
  clearTimeout(watchdog);
  await electron?.close().catch(() => electronProcess?.kill('SIGKILL'));
  server.close();
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (control && passed) console.error('Control run unexpectedly passed: this check cannot detect a blocked main process.');
process.exitCode = (control ? blockedMainProcess : passed) ? 0 : 1;
