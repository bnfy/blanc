import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

if (process.platform !== 'darwin') throw new Error('This gate requires an interactive macOS desktop.');
const run = promisify(execFile);
const nativeScript = fileURLToPath(new URL('./support/macos-activation-state.jxa', import.meta.url));
const native = async (action, pid = '') => JSON.parse((await run('/usr/bin/osascript',
  ['-l', 'JavaScript', nativeScript, action, String(pid)])).stdout);
const executablePath = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE
  || 'dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
// This variant checks Blanc's own activation: LaunchServices delivers the URL
// without independently foregrounding the app on the test's behalf.
const backgroundDelivery = process.argv.includes('--background-delivery');
const bundlePath = executablePath.slice(0, executablePath.lastIndexOf('.app/') + 4);
assert.ok(fs.existsSync(executablePath) && bundlePath.endsWith('.app'), 'Packaged Blanc executable required');
const inventory = await native('inventory');
assert.ok(!inventory.some((app) => app.bundleId === 'me.bnfy.bowser'),
  'Quit other Blanc instances first: LaunchServices must deliver only to this isolated test process.');
const finderPid = inventory.find((app) => app.bundleId === 'com.apple.finder')?.pid;
assert.ok(finderPid, 'A logged-in macOS desktop with Finder is required');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(read, matches, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  do {
    let timer;
    try {
      value = await Promise.race([
        read(),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${label}: observation timed out`)),
            Math.max(1, deadline - Date.now()));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (matches(value)) return value;
    await delay(100);
  } while (Date.now() < deadline);
  assert.fail(`${label}; last observation: ${JSON.stringify(value)}`);
}

const server = http.createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>External link activation</title><main>External link activation</main>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-external-links-'));
fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
  adblockEnabled: false, onboardingVersion: 1, searchSuggestions: false, usagePing: false,
}));
let browser;
let targetPid;
try {
  console.log(`external-links launch ${bundlePath} (background delivery: ${backgroundDelivery})`);
  browser = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '0' },
  });
  console.log('external-links connected to packaged chrome');
  const instance = await poll(() => native('inventory'), (apps) =>
    apps.some((app) => app.path === bundlePath), 'Launched bundle must appear in native process inventory');
  targetPid = instance.find((app) => app.path === bundlePath).pid;
  const chrome = () => browser.pages().find((page) => page.url() === 'blanc-chrome://index/');
  const tabs = () => chrome()?.evaluate(() => window.browserAPI.getAllTabs()) ?? null;
  await poll(tabs, (state) => state?.tabs?.length > 0, 'Initial window ready');
  const checkFront = async () => {
    const state = await poll(() => native('state', targetPid), (value) =>
      value.frontmostPid === targetPid && value.active && !value.hidden && value.windows.length === 1,
    'Blanc must be frontmost with its restored browser window onscreen', 5_000);
    // A transient activation that falls back behind the sender is a failure.
    await delay(500);
    assert.deepEqual(await native('state', targetPid), state, 'Native foreground state must remain stable');
  };
  for (const mode of ['background', 'hidden', 'minimized', 'hidden-minimized', 'closed']) {
    const repeats = mode === 'hidden' || mode === 'minimized' ? 10 : 1;
    for (let i = 0; i < repeats; i++) {
      const before = await tabs();
      if (mode.includes('minimized')) {
        await chrome().evaluate(() => window.browserAPI.minimizeWindow());
        await poll(() => native('state', targetPid), (state) => state.windows.length === 0,
          'Window must actually minimize before link delivery');
      }
      if (mode.includes('hidden')) {
        await native('hide', targetPid);
        await poll(() => native('state', targetPid), (state) => state.hidden, 'App must actually hide');
      }
      if (mode === 'closed') {
        await chrome().evaluate(() => window.browserAPI.closeWindow());
        await poll(() => native('state', targetPid), (state) => state.windows.length === 0, 'Window must close');
      }
      await native('activate', finderPid);
      await poll(() => native('state', targetPid), (state) => state.frontmostPid === finderPid,
        'Another application must own foreground before link delivery');
      const url = `${origin}/${mode}/${i}`;
      // Real LaunchServices handoff, not app.emit('open-url') or renderer IPC.
      await run('/usr/bin/open', [...(backgroundDelivery ? ['-g'] : []), '-a', bundlePath, url]);
      const after = await poll(tabs, (state) => state?.tabs?.some((tab) =>
        tab.id === state.activeTabId && tab.url === url), 'Delivered URL must be the selected tab');
      assert.equal(after.tabs.length, before.tabs.length + 1, 'Each delivered URL opens exactly once');
      await checkFront();
      console.log(`external-links ${mode} ${i + 1}/${repeats} PASS`);
    }
  }
  // Background page activity after a completed handoff must not reactivate Blanc.
  const background = browser.pages().find((page) => page.url() === `${origin}/background/0`);
  assert.ok(background);
  await native('activate', finderPid);
  await background.reload();
  await delay(2_200);
  assert.equal((await native('state', targetPid)).frontmostPid, finderPid);
  console.log('external-links background reload PASS');
  console.log('packaged-external-links-smoke PASS (other-Space and actual email click require separate owner evidence)');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
