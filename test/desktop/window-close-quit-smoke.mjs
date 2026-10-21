import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// Closing Blanc's last window with its own close button, on Windows and Linux.
//
// 1. It must end the process (github issue #368). Those platforms quit from
//    `window-all-closed`, which Electron only emits once every BrowserWindow
//    is closed — the hidden display-capture helper included. Before that fix
//    the helper outlived the visible window, Blanc stayed in Task Manager, and
//    a relaunch deferred to the stuck instance through the single-instance
//    lock. macOS deliberately keeps running without windows, so there the
//    helper must survive for the next dock reopen. The helper is created on
//    the first share request, so the test creates it the same way first.
// 2. It must keep the window's tabs for the next launch, exactly as Quit does.
//    From #340 until the October 2026 fix, the close first rewrote
//    session.json without the closing window, even when it was the last one,
//    so the relaunch restored only a New Tab. The second launch here closes
//    the primary window while a secondary is open (that close removes it, as
//    F32-1 removes any non-last window), then closes the secondary, which is
//    now the last window and must keep its tabs and its size and position.

const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const repo = path.resolve('.');
// `--simulate-platform=linux` lets a macOS developer drive the Windows/Linux
// close path end to end: main.js reads `process.platform` at close time, so
// overriding it in the running main process after startup exercises the real
// close checkpoint, the real last-close release and the real
// `window-all-closed` quit handler.
const simulated = process.argv.find((a) => a.startsWith('--simulate-platform='))?.split('=')[1];
const platform = simulated ?? process.platform;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-window-close-quit-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
const uncaughtLog = path.join(root, 'uncaught.log');
const sessionFile = path.join(profile, 'session.json');
const ledgerFile = path.join(profile, 'crash-ledger.json');
fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));

const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'page';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>${name}</title><p>${name}</p>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pageUrl = (name) => `http://127.0.0.1:${server.address().port}/${name}`;

const launch = async (label) => {
  const app = await _electron.launch({
    chromiumSandbox: true,
    args: [repo, `--user-data-dir=${userData}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, `${label} startup`, 30_000);
  return app;
};

const simulatePlatform = async (app) => {
  if (!simulated) return;
  await app.evaluate((_electron, value) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  }, simulated);
};

const describeWindows = (app) => app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().map((w) => ({
    id: w.id, visible: w.isVisible(), url: w.webContents.getURL(),
  })));

// Exactly what Blanc's close button does (`window:close` → window.close()).
const closeWindows = (app, ids) => app.evaluate(({ BrowserWindow }, targets) => {
  for (const id of targets) BrowserWindow.fromId(id)?.close();
}, ids);

const visibleChromeWindowIds = async (app) => (await describeWindows(app))
  .filter((w) => w.visible && w.url === 'blanc-chrome://index/')
  .map((w) => w.id)
  .sort((a, b) => a - b);

const normalBounds = (app, id) => app.evaluate(({ BrowserWindow }, target) =>
  BrowserWindow.fromId(target)?.getNormalBounds() ?? null, id);

const openPage = async (app, runtimeId, name) => {
  const url = pageUrl(name);
  await callTestHook(app, 'openTabInWindow', [runtimeId, url]);
  return url;
};

const savedUrls = (session, runtimeId) =>
  session?.windows?.find((entry) => entry.id === runtimeId)?.urls ?? [];

const waitForExit = async (app, exited, label) => {
  let timer;
  try {
    const code = await Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          `${label}: Blanc still running 10s after its last window closed`,
        )), 10_000);
      }),
    ]);
    assert.equal(code, 0, `${label}: Blanc exits cleanly after its last window closes`);
  } catch (error) {
    console.error(`${label} uncaught log:`, fs.existsSync(uncaughtLog)
      ? fs.readFileSync(uncaughtLog, 'utf8') : '(absent)');
    // Preserve the original failure while bounding diagnostic collection if
    // the main process itself is unresponsive.
    let diagnosticTimer;
    try {
      const windows = await Promise.race([
        describeWindows(app),
        new Promise((resolve) => {
          diagnosticTimer = setTimeout(() => resolve('main-process inspector unresponsive'), 1000);
        }),
      ]);
      console.error(`${label} remaining windows:`, JSON.stringify(windows));
    } catch (diagnosticError) {
      console.error('Shutdown diagnostics unavailable:', diagnosticError.message);
    } finally {
      clearTimeout(diagnosticTimer);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

// A clean exit leaves no open run, no pending recovery and no crash events.
// It is also what lets the relaunch restore tabs without a recovery prompt.
const assertCleanLedger = (label) => {
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(ledger.currentRun, null, `${label}: crash ledger closed its run`);
  assert.equal(ledger.recoveryPending, false, `${label}: no session recovery is pending`);
  assert.deepEqual(ledger.events, [], `${label}: no crash or child-process events`);
};

const assertNoUncaught = (label) => {
  const log = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  assert.equal(log, '', `${label}: main process threw`);
};

const quit = async (app) => {
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await exited;
};

let app;
try {
  // Launch 1: one window with two pages, closed with its own close button.
  app = await launch('first launch');
  const pageA = await openPage(app, 'primary', 'close-check-a');
  const pageB = await openPage(app, 'primary', 'close-check-b');
  await waitForValue(
    () => callTestHook(app, 'persistedSessionData'),
    (session) => [pageA, pageB].every((url) => savedUrls(session, 'primary').includes(url)),
    'both pages in session.json',
    10_000,
  );

  assert.ok(!(await describeWindows(app)).some((w) => !w.visible),
    'no hidden display-capture helper exists before any share request');
  await callTestHook(app, 'prepareDisplayCaptureHelper');
  const before = await describeWindows(app);
  assert.ok(before.some((w) => w.visible), 'a visible browser window exists before the close');
  assert.ok(before.some((w) => !w.visible), 'the hidden display-capture helper exists (the precondition this test guards)');

  // An internal helper must not be able to veto final application teardown.
  // Model a helper whose cooperative close does not finish, without hanging
  // a renderer or changing any user page's beforeunload behavior.
  if (platform !== 'darwin') {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isVisible()) window.on('close', (event) => event.preventDefault());
      }
    });
  }

  await simulatePlatform(app);
  const exited = new Promise((resolve) => app.process().once('exit', (code) => resolve(code)));
  await closeWindows(app, before.filter((w) => w.visible).map((w) => w.id));

  if (platform === 'darwin') {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal(app.process().exitCode, null, 'macOS keeps Blanc running after the last window closes');
    const after = await describeWindows(app);
    assert.deepEqual(after.map((w) => w.visible), [false], 'macOS keeps the hidden helper for dock reopen');
    const session = await callTestHook(app, 'persistedSessionData');
    assert.ok([pageA, pageB].every((url) => savedUrls(session, 'primary').includes(url)),
      `macOS Dock close keeps the primary window's saved tabs: ${JSON.stringify(session.windows)}`);
    console.log(`window-close-quit: ok (${platform}${simulated ? ', simulated' : ''})`);
  } else {
    await waitForExit(app, exited, 'first launch');
    app = null;
    assertCleanLedger('first launch');
    assertNoUncaught('first launch');
    const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    assert.ok([pageA, pageB].every((url) => savedUrls(saved, 'primary').includes(url)),
      `closing the last window keeps its tabs in session.json: ${JSON.stringify(saved.windows)}`);

    // Launch 2: the saved tabs come back. Then open a secondary window, close
    // the primary first (it is not the last window, so it leaves the
    // session), and close the secondary last.
    app = await launch('second launch');
    const restored = await waitForValue(
      () => callTestHook(app, 'windowRuntimes'),
      (runtimes) => runtimes.find((runtime) => runtime.id === 'primary')?.attached,
      'restored primary window',
      10_000,
    );
    const restoredUrls = restored.find((runtime) => runtime.id === 'primary').tabs.map((tab) => tab.url);
    assert.ok([pageA, pageB].every((url) => restoredUrls.includes(url)),
      `relaunch restores the closed window's tabs: ${JSON.stringify(restoredUrls)}`);

    const secondaryId = await callTestHook(app, 'openNewWindow');
    await waitForValue(
      () => callTestHook(app, 'windowRuntimes'),
      (runtimes) => runtimes.find((runtime) => runtime.id === secondaryId)?.attached,
      'secondary window',
      10_000,
    );
    const pageC = await openPage(app, secondaryId, 'close-check-c');
    await waitForValue(
      () => callTestHook(app, 'persistedSessionData'),
      (session) => savedUrls(session, secondaryId).includes(pageC),
      'secondary page in session.json',
      10_000,
    );
    // Native ids are allocated in creation order: the restored primary first.
    const [primaryWindowId, secondaryWindowId] = await waitForValue(
      () => visibleChromeWindowIds(app),
      (ids) => ids.length === 2,
      'two visible Blanc windows',
      10_000,
    );

    // A distinct placement for the secondary. Closed as the last window, it
    // must come back here; a window removed from the session forgets it.
    const placed = await app.evaluate(({ BrowserWindow, screen }, id) => {
      const area = screen.getPrimaryDisplay().workArea;
      const window = BrowserWindow.fromId(id);
      window.setBounds({
        x: area.x + 48,
        y: area.y + 40,
        width: Math.max(640, Math.min(820, area.width - 140)),
        height: Math.max(480, Math.min(560, area.height - 140)),
      });
      return window.getNormalBounds();
    }, secondaryWindowId);
    // Let Electron's 200 ms window-state debounce record the placement.
    await new Promise((resolve) => setTimeout(resolve, 350));

    await simulatePlatform(app);
    await closeWindows(app, [primaryWindowId]);
    await waitForValue(
      () => callTestHook(app, 'windowRuntimes'),
      (runtimes) => !runtimes.find((runtime) => runtime.id === 'primary')?.attached,
      'primary window to close',
      10_000,
    );
    assert.equal(app.process().exitCode, null, 'closing a window that is not the last keeps Blanc running');

    const secondExit = new Promise((resolve) => app.process().once('exit', (code) => resolve(code)));
    await closeWindows(app, [secondaryWindowId]);
    await waitForExit(app, secondExit, 'second launch');
    app = null;
    assertCleanLedger('second launch');
    assertNoUncaught('second launch');
    const savedAgain = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    assert.deepEqual(savedAgain.windows.map((entry) => entry.id), [secondaryId],
      `only the last window remains saved: ${JSON.stringify(savedAgain.windows)}`);
    assert.ok(savedUrls(savedAgain, secondaryId).includes(pageC),
      `the last window's tabs are saved: ${JSON.stringify(savedAgain.windows)}`);

    // Launch 3: the secondary window and its page come back.
    app = await launch('third launch');
    const third = await waitForValue(
      () => callTestHook(app, 'windowRuntimes'),
      (runtimes) => runtimes.find((runtime) => runtime.id === secondaryId)?.attached,
      'restored secondary window',
      10_000,
    );
    assert.ok(third.find((runtime) => runtime.id === secondaryId).tabs.some((tab) => tab.url === pageC),
      `relaunch restores the last window's tabs: ${JSON.stringify(third)}`);
    const [restoredWindowId, ...extra] = await visibleChromeWindowIds(app);
    assert.deepEqual(extra, [], 'only the last window comes back');
    assert.deepEqual(await normalBounds(app, restoredWindowId), placed,
      'the last window comes back where it was');
    await quit(app);
    app = null;
    console.log(`window-close-quit: ok (${platform}${simulated ? ', simulated' : ''})`);
  }
} finally {
  // On Windows/Linux the app has already exited by design, and Playwright may
  // have torn down its handle — `app.process()` itself can throw then. The
  // assertions above are the test; cleanup must never turn a pass into a fail.
  try {
    if (app && app.process().exitCode === null) await app.close();
  } catch {}
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
