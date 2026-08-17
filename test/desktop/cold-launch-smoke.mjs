// Cold-launch startup lifecycle: the state a first keystroke lands in (F37).
//
// The acceptance scenario for F37-2 reconstructs this state — it creates a tab
// and focuses its contents through the test hook — so it covers the renderer's
// half of the affordance but would keep passing if main.js stopped activating
// the startup tab with focusContent: true, or if the startup tab stopped being
// blank. Only a process that actually started can be asked what it started
// with, hence a launch per run and an isolated profile.
//
// Split from packaged-first-run-smoke.mjs deliberately. That file drives a
// PACKAGED build over CDP, which proves the affordance's whole chain survives
// packaging (the blanc: preload bridge, type-to-open.js served out of the
// asar) — but it cannot see which view holds focus: document.hasFocus() in a
// renderer reports WINDOW activation, so every document in the active window
// reads as focused, and a CDP key event is delivered straight to its target's
// widget rather than routed by focus. Both were measured against a build with
// focusContent flipped to false: every renderer-visible signal was identical
// to the correct build's. Focus is only truthful in the browser process, which
// a packaged build deliberately does not expose (no --inspect, no test hook),
// so it is asserted here instead, on an unpackaged cold launch.
import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;

const NEW_TAB_URL = 'blanc://newtab/';
const CHROME_INDEX_URL = 'blanc-chrome://index/';

// A fresh profile, so first-run onboarding is on screen throughout. That is
// deliberate — it is the launch a new user gets — and it does not weaken the
// focus assertion: the dialog lives INSIDE the start page, so focusing its
// Continue button moves focus within that document, not between views. (The
// packaged smoke seeds a completed marker instead, because its keystroke does
// have to get past the modal.)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-cold-launch-'));
const app = await _electron.launch({
  args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
  env: { ...process.env, BLANC_TEST: '1' },
});

/**
 * Ground truth from the browser process: which WebContents Chromium would
 * deliver a keystroke to. Read by URL rather than through the tab model so the
 * assertion states the contract (the blank page has focus, the chrome does
 * not) without depending on how tabs are bookkept.
 */
const readFocus = () => app.evaluate(({ BrowserWindow, webContents }) => ({
  windowFocused: BrowserWindow.getAllWindows()[0]?.isFocused() ?? null,
  contents: webContents.getAllWebContents()
    .filter((wc) => !wc.isDestroyed())
    .map((wc) => ({ url: wc.getURL(), focused: wc.isFocused() })),
}));

const focusOf = (snapshot, url) => {
  const matches = snapshot.contents.filter((entry) => entry.url === url);
  assert.equal(
    matches.length,
    1,
    `expected exactly one ${url} WebContents at cold launch; saw ${JSON.stringify(snapshot.contents)}`,
  );
  return matches[0].focused;
};

try {
  await app.firstWindow(); // a throwing ready handler would never get here
  await waitForValue(
    () => callTestHook(app, 'startupReady'),
    (ready) => ready === true,
    'startup to finish releasing',
    30_000,
  );

  // 1. The tab the process opened for itself is blank — no tab is created here,
  //    which is the whole point.
  const state = await callTestHook(app, 'state');
  assert.equal(state.tabs.length, 1, `a cold launch opens exactly one tab; saw ${JSON.stringify(state.tabs)}`);
  const [startupTab] = state.tabs;
  assert.equal(state.activeTabId, startupTab.id, 'the startup tab must be the active one');
  assert.equal(startupTab.url, NEW_TAB_URL, 'the startup tab must be the blank start page');

  // 2. Nothing opened the island on the way in. This is what makes the focus
  //    assertion meaningful: Cmd/Ctrl+T reaches a blank tab with
  //    focusAddress: true, which opens and focuses the island itself.
  assert.equal(
    await callTestHook(app, 'overlayRendererMode'),
    null,
    'a cold launch must leave the island closed',
  );

  // 3. Page content holds focus, not the island — so the caret the blank pill
  //    draws is promising something the next keystroke will actually do.
  //    Polled: the chrome document holds focus until setActiveTab hands it to
  //    the tab view, and WebContentsView focus settles asynchronously.
  const focus = await waitForValue(
    readFocus,
    (snapshot) => snapshot?.contents?.some((entry) => entry.url === NEW_TAB_URL && entry.focused),
    'the startup tab to take content focus — main must activate it with '
      + 'focusContent: true (windowFocused false below means no window has OS '
      + 'focus and another app is holding it, which is an environment problem)',
    10_000,
  );
  assert.equal(focusOf(focus, CHROME_INDEX_URL), false, 'the island must not hold focus at cold launch');

  console.log(`cold-launch-smoke OK on ${process.platform}`);
} finally {
  await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  // Unpackaged runs relocate userData to <dir>-Dev (main.js), so the profile
  // this launch actually wrote is not the directory that was passed in.
  fs.rmSync(`${userDataDir}-Dev`, { recursive: true, force: true });
}
