import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import windowState from '../../src/main/window-state-persistence.js';

// Native integration proof for Electron's cross-platform persistence. It uses
// the real Blanc multi-window/session lifecycle across three process launches:
// save two distinct geometries, restore them (including maximized state),
// forget an explicitly closed secondary, then restore fullscreen on primary.

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const { windowStateName } = windowState;
const repo = path.resolve('.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-window-state-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
const uncaughtLog = path.join(root, 'uncaught.log');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1,
  adblockEnabled: false,
  usagePing: false,
  searchSuggestions: false,
}));

const launch = () => _electron.launch({
  args: [repo, `--user-data-dir=${userData}`],
  env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
});

const startup = async (app, label) => {
  await app.firstWindow();
  await waitForValue(
    () => callTestHook(app, 'startupReady'),
    Boolean,
    `${label} startup`,
    30_000,
  );
};

const chromeWindowStates = (app) => app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()
    .filter((window) => window.webContents.getURL() === 'blanc-chrome://index/')
    .map((window) => ({
      id: window.id,
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
    })));

const sameBounds = (a, b) => a && b &&
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const quit = async (app) => {
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await exited;
};

let app;
try {
  // Launch 1: assign different normal bounds to primary and secondary. Quit
  // shortly after Electron's 200 ms state-save debounce instead of waiting for
  // PrefService's ten-second disk batch; graceful shutdown must flush it.
  app = await launch();
  await startup(app, 'first launch');
  const initialWindows = await chromeWindowStates(app);
  assert.equal(initialWindows.length, 1, 'first launch has one Blanc window');
  const primaryNativeId = initialWindows[0].id;
  const secondaryRuntimeId = await callTestHook(app, 'openNewWindow');
  const twoWindows = await waitForValue(
    () => chromeWindowStates(app),
    (windows) => windows.length === 2,
    'secondary native window',
    10_000,
  );
  const secondaryNativeId = twoWindows.find((window) => window.id !== primaryNativeId)?.id;
  assert.ok(secondaryNativeId, 'secondary native window has a distinct id');

  const expected = await app.evaluate(({ BrowserWindow, screen }, ids) => {
    const area = screen.getPrimaryDisplay().workArea;
    const primary = BrowserWindow.fromId(ids.primary);
    const secondary = BrowserWindow.fromId(ids.secondary);
    if (!primary || !secondary) throw new Error('Blanc windows disappeared during layout');
    primary.setBounds({
      x: area.x + 24,
      y: area.y + 24,
      width: Math.max(640, Math.min(900, area.width - 120)),
      height: Math.max(480, Math.min(640, area.height - 120)),
    });
    secondary.setBounds({
      x: area.x + 72,
      y: area.y + 64,
      width: Math.max(640, Math.min(840, area.width - 160)),
      height: Math.max(480, Math.min(590, area.height - 160)),
    });
    return {
      primary: primary.getNormalBounds(),
      secondary: secondary.getNormalBounds(),
    };
  }, { primary: primaryNativeId, secondary: secondaryNativeId });
  assert.equal(sameBounds(expected.primary, expected.secondary), false,
    'the two persistence names describe distinct geometries');

  await waitForValue(
    () => callTestHook(app, 'persistedSessionData'),
    (session) => session.windows?.some((window) => window.id === secondaryRuntimeId),
    'secondary runtime in session.json',
    10_000,
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  if (process.platform !== 'linux') {
    await app.evaluate(({ BrowserWindow }, id) => new Promise((resolve) => {
      const window = BrowserWindow.fromId(id);
      if (!window || window.isMaximized()) return resolve();
      const timer = setTimeout(resolve, 3000);
      window.once('maximize', () => { clearTimeout(timer); resolve(); });
      window.maximize();
    }), secondaryNativeId);
    // The native transition schedules Electron's 200 ms state-save debounce.
    // Let that callback update PrefService before asking app.quit() to flush
    // PrefService itself; Windows emits `maximize` before that debounce runs.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  await quit(app);
  app = null;

  // Launch 2: both logical windows recover their own normal bounds. Platforms
  // with a window manager also prove maximized-state restoration here; Linux
  // under bare Xvfb proves displayMode separately with fullscreen below.
  app = await launch();
  await startup(app, 'second launch');
  await waitForValue(
    () => callTestHook(app, 'windowRuntimes'),
    (runtimes) => runtimes.length === 2 && runtimes.every((runtime) => runtime.attached),
    'two restored Blanc runtimes',
    10_000,
  );
  const restored = await waitForValue(
    () => chromeWindowStates(app),
    (windows) => windows.length === 2 &&
      windows.some((window) => sameBounds(window.bounds, expected.primary)) &&
      windows.some((window) => sameBounds(window.bounds, expected.secondary)) &&
      (process.platform === 'linux' || windows.some((window) =>
        sameBounds(window.bounds, expected.secondary) && window.maximized)),
    'two native geometries and display mode to restore',
    10_000,
  );
  assert.equal(restored.filter((window) => sameBounds(window.bounds, expected.primary)).length, 1);
  assert.equal(restored.filter((window) => sameBounds(window.bounds, expected.secondary)).length, 1);

  // A user-closed secondary leaves session.json and must also lose Electron's
  // native entry. Reusing the now-free name in a probe must get constructor
  // defaults, not the removed window's geometry.
  assert.equal(await callTestHook(app, 'closeWindowRuntime', [secondaryRuntimeId]), true);
  await waitForValue(
    () => callTestHook(app, 'windowRuntimes'),
    (runtimes) => !runtimes.some((runtime) => runtime.id === secondaryRuntimeId),
    'secondary runtime removal',
    10_000,
  );
  const probe = await app.evaluate(({ BrowserWindow, screen }, name) => {
    const area = screen.getPrimaryDisplay().workArea;
    const requested = {
      x: area.x + 12,
      y: area.y + 12,
      width: Math.max(640, Math.min(760, area.width - 80)),
      height: Math.max(480, Math.min(520, area.height - 80)),
    };
    const window = new BrowserWindow({
      ...requested,
      name,
      show: false,
      windowStatePersistence: { bounds: true, displayMode: true },
    });
    const actual = window.getNormalBounds();
    window.destroy();
    BrowserWindow.clearPersistedState(name);
    return { requested, actual };
  }, windowStateName(secondaryRuntimeId));
  assert.deepEqual(probe.actual, probe.requested,
    'closed secondary state was cleared before its name was reused');

  // Fullscreen is a separate native transition from maximize. Persist it on
  // the surviving primary, quit immediately after the transition/debounce,
  // then verify it on a third process launch.
  await app.evaluate(({ BrowserWindow }) => new Promise((resolve) => {
    const window = BrowserWindow.getAllWindows()
      .find((candidate) => candidate.webContents.getURL() === 'blanc-chrome://index/');
    if (!window || window.isFullScreen()) return resolve();
    const timer = setTimeout(resolve, 3000);
    window.once('enter-full-screen', () => { clearTimeout(timer); resolve(); });
    window.setFullScreen(true);
  }));
  const enteredFullScreen = await waitForValue(
    () => chromeWindowStates(app),
    (windows) => windows.length === 1 && windows[0].fullScreen,
    'primary fullscreen transition',
    10_000,
  );
  assert.equal(enteredFullScreen[0].fullScreen, true);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await quit(app);
  app = null;

  app = await launch();
  await startup(app, 'third launch');
  const finalState = await waitForValue(
    () => chromeWindowStates(app),
    (windows) => windows.length === 1 && windows[0].fullScreen,
    'fullscreen state restoration',
    10_000,
  );
  assert.equal(finalState[0].fullScreen, true);
  // Bare Xvfb has no window manager to preserve the pre-fullscreen normal
  // rectangle. Its ordinary bounds were already proven on launch 2; here it
  // can still exercise Electron's display-mode persistence. On real window
  // managers, leave fullscreen before reading the restored normal rectangle:
  // Windows reports the fullscreen rectangle from getNormalBounds() while the
  // native window is still fullscreen.
  if (process.platform !== 'linux') {
    await app.evaluate(({ BrowserWindow }) => new Promise((resolve) => {
      const window = BrowserWindow.getAllWindows()
        .find((candidate) => candidate.webContents.getURL() === 'blanc-chrome://index/');
      if (!window || !window.isFullScreen()) return resolve();
      const timer = setTimeout(resolve, 3000);
      window.once('leave-full-screen', () => { clearTimeout(timer); resolve(); });
      window.setFullScreen(false);
    }));
    const restoredNormalBounds = await waitForValue(
      () => chromeWindowStates(app),
      (windows) => windows.length === 1 && !windows[0].fullScreen &&
        sameBounds(windows[0].bounds, expected.primary),
      'normal bounds after leaving restored fullscreen',
      10_000,
    );
    assert.equal(sameBounds(restoredNormalBounds[0].bounds, expected.primary), true,
      'primary normal bounds survive fullscreen restoration');
  }

  console.log(`window-state-persistence-smoke OK on ${process.platform}`);
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
