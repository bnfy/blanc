import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';

// Regression for github issue #368: closing Blanc's last visible window must
// end the process on Windows and Linux. Those platforms quit from
// `window-all-closed`, which Electron only emits once every BrowserWindow is
// closed — the hidden display-capture helper included. Before the fix the
// helper outlived the visible window, Blanc stayed in Task Manager, and a
// relaunch deferred to the stuck instance through the single-instance lock.
// macOS deliberately keeps running without windows, so there the helper must
// survive for the next dock reopen.

const { waitForValue } = poll;
const repo = path.resolve('.');
// `--simulate-platform=linux` lets a macOS developer drive the Windows/Linux
// quit path end to end: main.js reads `process.platform` at close time, so
// overriding it in the running main process after startup exercises the real
// last-close release and the real `window-all-closed` quit handler.
const simulated = process.argv.find((a) => a.startsWith('--simulate-platform='))?.split('=')[1];
const platform = simulated ?? process.platform;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-window-close-quit-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const describeWindows = (app) => app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), url: w.webContents.getURL() })));

let app;
try {
  app = await _electron.launch({ args: [repo, `--user-data-dir=${userData}`], env: { ...env, BLANC_TEST: '1' } });
  await app.firstWindow();
  await waitForValue(() => app.evaluate(() => !!globalThis.__blanc?.startupReady?.()), Boolean, 'startup released', 15000);
  const exited = new Promise((resolve) => app.process().once('exit', (code) => resolve(code)));

  const before = await describeWindows(app);
  assert.ok(before.some((w) => w.visible), 'a visible browser window exists before the close');
  assert.ok(before.some((w) => !w.visible), 'the hidden display-capture helper exists (the precondition this test guards)');

  if (simulated) {
    await app.evaluate((_electron, value) => {
      Object.defineProperty(process, 'platform', { value, configurable: true });
    }, simulated);
  }

  // Exactly what the X button / Alt+F4 does: close visible windows only.
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) if (w.isVisible()) w.close();
  });

  if (platform === 'darwin') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal(app.process().exitCode, null, 'macOS keeps Blanc running after the last window closes');
    const after = await describeWindows(app);
    assert.deepEqual(after.map((w) => w.visible), [false], 'macOS keeps the hidden helper for dock reopen');
  } else {
    const code = await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        `Blanc still running 10s after its last visible window closed; windows: ${JSON.stringify(before)}`
      )), 10000)),
    ]);
    assert.equal(code, 0, 'Blanc exits cleanly after the last visible window closes');
  }
  console.log(`window-close-quit: ok (${platform}${simulated ? ', simulated' : ''})`);
} finally {
  if (app && app.process().exitCode === null) await app.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
