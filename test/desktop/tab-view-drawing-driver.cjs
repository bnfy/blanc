'use strict';
// Main-process driver for tab-view-drawing-smoke.mjs, loaded with `electron -r`.
// It deliberately avoids Playwright: Playwright turns on DevTools focus
// emulation for every page, which forces a stuck page to draw and hides this
// bug from the acceptance suite.
//
// Each path below shows a tab view again after it left its window. On Linux
// (Wayland, X11 and xvfb) such pages drew few or no frames and barely scrolled
// until src/main/tab-view-lifecycle.js. A page counts as drawing when it
// reports "visible", produces at least MIN_FRAMES animation frames in 700 ms
// (a working page draws about 42 at 60 Hz, a stuck one never drew more than
// 17), and a 400 px wheel scroll lands.
const fs = require('node:fs');
const { app, webContents } = require('electron');

const RESULT = process.env.TAB_DRAWING_RESULT;
const BASE = process.env.TAB_DRAWING_BASE;
const MIN_FRAMES = 25;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = (promise, ms) => Promise.race([promise, sleep(ms).then(() => { throw new Error(`timed out after ${ms} ms`); })]);

async function waitFor(read, label, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    try { const value = await read(); if (value) return value; } catch {}
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(100);
  }
}

const FRAME_PROBE = `new Promise((resolve) => {
  let frames = 0;
  let live = true;
  const step = () => { if (!live) return; frames += 1; requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { live = false; resolve({ visibility: document.visibilityState, frames }); }, 700);
})`;

const drew = (sample) => sample.visibility === 'visible' && sample.frames >= MIN_FRAMES;
const results = [];

// The floating Island's pill (auto-hide, float style) is a view of its own
// that stays window-owned for life: it must keep drawing wherever its window
// goes. It has nothing to scroll, so only frames count.
async function measureFloatPill(H, runtimeId, path) {
  const result = { path, attempts: [] };
  try {
    // The user is looking at this window (see measure): an unfocused window
    // on xvfb or Windows draws slowly, and its strip may not have placed the
    // pill yet.
    H.focusWindowRuntime(runtimeId);
    const wc = webContents.fromId(await waitFor(() => H.floatPillWebContentsId(runtimeId), `the floating pill in ${runtimeId}`));
    await waitFor(() => H.floatPillDiagnostics(runtimeId)?.shown, `the floating pill in ${runtimeId} to show`, 5000).catch(() => {});
    await sleep(300);
    for (let attempt = 0; attempt < 3; attempt++) {
      const sample = await bounded(wc.executeJavaScript(FRAME_PROBE), 4000);
      result.attempts.push(sample);
      if (drew(sample)) break;
    }
    result.drawing = drew(result.attempts.at(-1));
    if (!result.drawing) result.error = `not drawing: ${JSON.stringify(H.floatPillDiagnostics(runtimeId))}`;
  } catch (error) {
    result.error = String(error?.message ?? error);
    result.drawing = false;
  }
  results.push(result);
}

async function measure(H, id, path) {
  const result = { path, attempts: [] };
  try {
    const wc = webContents.fromId(H.tabWebContentsId(id));
    // The user is looking at this page. Under xvfb there is no window manager,
    // and a window that hands a view to another one can take focus back; a
    // page in an unfocused window there draws slowly even when it works.
    // Focus does not revive a stuck page (verified on unpatched main).
    wc.focus();
    await sleep(300);
    for (let attempt = 0; attempt < 3; attempt++) {
      const sample = await bounded(wc.executeJavaScript(FRAME_PROBE), 4000);
      result.attempts.push(sample);
      if (drew(sample)) break;
    }
    const before = await wc.executeJavaScript('Math.round(scrollY)');
    wc.sendInputEvent({ type: 'mouseWheel', x: 200, y: 200, deltaX: 0, deltaY: -400, canScroll: true });
    await sleep(1000);
    result.scrolled = (await wc.executeJavaScript('Math.round(scrollY)')) - before;
    result.drawing = drew(result.attempts.at(-1)) && result.scrolled >= 350;
  } catch (error) {
    result.error = String(error?.message ?? error);
    result.drawing = false;
  }
  results.push(result);
}

app.whenReady().then(async () => {
  let error = null;
  try {
    const H = await waitFor(() => globalThis.__blanc, 'the test hook', 30000);
    await waitFor(() => H.startupReady(), 'startup', 30000);
    const loaded = (id) => waitFor(() => {
      const tab = H.state().tabs.find((candidate) => candidate.id === id);
      return tab && !tab.asleep && !tab.loading && !tab.isLoading && H.tabWebContentsId(id);
    }, `tab ${id} to load`);
    // Unbound hook calls act on the focused window, so every call names its window.
    const open = async (name, options, runtimeId = 'primary') => {
      const id = H.openTabInWindow(runtimeId, `${BASE}/site/${name}`, options);
      await loaded(id);
      await sleep(500);
      return id;
    };
    const settle = () => sleep(800);
    const runtimeOf = (id) => H.windowRuntimes().find((runtime) => runtime.tabOrder.includes(id));
    const activate = async (id) => {
      H.activateTabInWindow(runtimeOf(id).id, id, true);
      if (runtimeOf(id)?.activeTabId !== id) throw new Error(`tab ${id} did not become active`);
      await settle();
    };
    const move = (id) => {
      const from = runtimeOf(id)?.id;
      const to = H.moveTabToNewWindow(id);
      if (!to || to === from) throw new Error(`tab ${id} did not move to a new window`);
      return to;
    };
    // Quiet exactly one tab: only it has been idle past the threshold, and the
    // threshold is restored before any other sweep can run.
    const quiet = async (id) => {
      H.setSleepThresholdOverride(5 * 60 * 1000);
      H.setTabIdleSince(id, 10 * 60 * 1000);
      try {
        await H.runSleepSweep();
      } finally {
        H.setSleepThresholdOverride(null);
      }
      await waitFor(() => H.sleepState(id)?.asleep, `tab ${id} to go quiet`);
    };

    const a = await open('drawing-a');
    await measure(H, a, 'first attach (control)');
    const b = await open('drawing-b');

    for (let round = 1; round <= 2; round++) {
      await activate(a);
      await measure(H, a, `switch back #${round}`);
      await activate(b);
    }

    await H.setWindowGlance('primary', a); await settle();
    await measure(H, a, 'Glance');
    await H.closeWindowGlance('primary'); await settle();

    // Split View (F53): both panes draw when the split shows, after it is
    // hidden by another tab, and after it comes back. Its own two tabs, so
    // the measuring scroll never makes a later case's tab "deep scrolled".
    const left = await open('drawing-split-left');
    const right = await open('drawing-split-right');
    if (!H.makeSplit(left, [right])) throw new Error('the split was not made');
    await activate(left);
    await measure(H, left, 'split: first pane');
    await measure(H, right, 'split: second pane');
    await activate(b);
    await activate(right);
    await measure(H, right, 'split: second pane, shown again');
    await measure(H, left, 'split: first pane, shown again');
    H.runTabMenuItem(left, 'remove-from-split'); await settle();
    await activate(b);

    const closed = await open('drawing-closed');
    H.closeTabInWindow('primary', closed); await sleep(300);
    H.reopenClosedInWindow('primary');
    const reopened = await waitFor(() => H.state().tabs.find((tab) => tab.url.includes('drawing-closed'))?.id, 'the reopened tab');
    await settle();
    await measure(H, reopened, 'Reopen Closed Tab');

    const plain = await open('drawing-plain?nostore=1');
    await activate(b);
    await quiet(plain);
    await activate(plain); await loaded(plain); await settle();
    await measure(H, plain, 'quiet tab woken, rebuilt (control)');

    await activate(b);
    await quiet(a);
    await activate(a); await loaded(a); await settle();
    await measure(H, a, 'quiet tab woken, session storage kept');

    const privateTab = await open('drawing-private', { private: true });
    await activate(b);
    await activate(privateTab);
    await measure(H, privateTab, 'private tab switch back');

    await activate(b);
    const bWindow = move(b); await loaded(b); await settle();
    await measure(H, b, 'Move Tab to New Window (active tab)');

    const background = await open('drawing-background');
    await activate(a);
    if (runtimeOf(background)?.activeTabId === background) throw new Error('the background tab is active');
    move(background); await loaded(background); await settle();
    await measure(H, background, 'Move Tab to New Window (background tab)');

    const sleeper = await open('drawing-sleeper');
    await activate(a);
    await quiet(sleeper);
    const sleeperWindow = move(sleeper); await loaded(sleeper); await settle();
    await measure(H, sleeper, 'Move Tab to New Window (quiet tab)');

    const saved = H.workspaceActionInWindow('primary', 'save', 'drawing one');
    if (!saved?.ok) throw new Error(`saving a space failed: ${JSON.stringify(saved)}`);
    const one = saved.workspace.id;
    await H.workspaceActionInWindow('primary', 'create', 'drawing two'); await settle();
    await H.workspaceActionInWindow('primary', 'open', one); await settle();
    const returned = H.windowRuntimes().find((runtime) => runtime.id === 'primary').activeTabId;
    await loaded(returned); await settle();
    await measure(H, returned, 'return to a space');

    await H.workspaceActionInWindow('primary', 'create', 'drawing three'); await settle();
    const elsewhere = await H.workspaceActionInWindow(bWindow, 'open', one);
    if (!elsewhere?.ok) throw new Error(`opening the space in another window failed: ${JSON.stringify(elsewhere)}`);
    const moved = H.windowRuntimes().find((runtime) => runtime.id === bWindow).activeTabId;
    await loaded(moved); await settle();
    await measure(H, moved, 'open a space in another window');

    // A window closes while it still holds the hidden views of a space set
    // aside there (they stay its children on Linux); the space then opens in
    // another window. Fresh windows hold only a blank tab, so neither switch
    // asks to save anything.
    const holder = H.openNewWindow(); await settle();
    const first = await open('drawing-first', {}, holder);
    const second = await open('drawing-second', {}, holder);
    const four = H.workspaceActionInWindow(holder, 'save', 'drawing four');
    if (!four?.ok) throw new Error(`saving a space failed: ${JSON.stringify(four)}`);
    const five = await H.workspaceActionInWindow(holder, 'create', 'drawing five');
    if (!five?.ok) throw new Error(`creating a space failed: ${JSON.stringify(five)}`);
    await settle();
    if (!H.closeWindowRuntime(holder)) throw new Error('closing the window failed');
    await waitFor(() => !H.windowRuntimes().some((runtime) => runtime.id === holder), 'the window to close');
    const opener = H.openNewWindow(); await settle();
    const reopened4 = await H.workspaceActionInWindow(opener, 'open', four.workspace.id);
    if (!reopened4?.ok) throw new Error(`opening the space failed: ${JSON.stringify(reopened4)}`);
    const shown = H.windowRuntimes().find((runtime) => runtime.id === opener).activeTabId;
    if (shown !== second) throw new Error('the space did not reopen on its active tab');
    await loaded(second); await settle();
    await measure(H, second, 'open a space whose window closed');
    await activate(first); await loaded(first); await settle();
    await measure(H, first, 'switch within a space whose window closed');

    // The floating Island: its pill view stays window-owned and must keep
    // drawing after tab switches, in a window a tab moved to, and in a
    // window a space opened in.
    H.setIslandAutoHideStyle('float');
    H.setIslandAutoHide(true); await settle();
    H.holdIslandInWindow('primary', true); await settle();
    await activate(a); await activate(returned);
    await measureFloatPill(H, 'primary', 'floating pill after tab switches');
    const floatTab = await open('drawing-float');
    const floatWindow = move(floatTab); await loaded(floatTab); await settle();
    H.holdIslandInWindow(floatWindow, true); await settle();
    await measureFloatPill(H, floatWindow, 'floating pill in a window a tab moved to');
    // A fresh window holds only a blank tab, so the switch asks to save nothing.
    const spaceWindow = H.openNewWindow(); await settle();
    H.holdIslandInWindow(spaceWindow, true);
    const opened = await H.workspaceActionInWindow(spaceWindow, 'open', one);
    if (!opened?.ok) throw new Error(`opening the space failed: ${JSON.stringify(opened)}`);
    await settle();
    await measureFloatPill(H, spaceWindow, 'floating pill after a space opened in its window');
    H.holdIslandInWindow('primary', false);
    H.setIslandAutoHide(false); await settle();

    // A window that still owns hidden tab views closes cleanly.
    if (!H.closeWindowRuntime(sleeperWindow)) throw new Error('closing a window failed');
    await waitFor(() => !H.windowRuntimes().some((runtime) => runtime.id === sleeperWindow), 'the closed window to go');
  } catch (caught) {
    error = String(caught?.stack ?? caught);
  }
  fs.writeFileSync(`${RESULT}.tmp`, JSON.stringify({ results, error }, null, 2));
  fs.renameSync(`${RESULT}.tmp`, RESULT);
  // Linux test apps can hang on quit; the launcher stops the process tree.
  app.exit(0);
});
