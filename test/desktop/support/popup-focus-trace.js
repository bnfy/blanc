'use strict';

// Fixture-only, bounded native event history. Never records webpage URLs,
// headers or bodies; managed tool names come from a fixed allowlist.
async function install(electron) {
  await electron.evaluate(({ app, webContents, ipcMain, BrowserWindow }) => {
    const events = globalThis.fixturePopupFocusEvents = [];
    const seen = new WeakSet();
    const toolNames = new Set(['/popup-fenix.html', '/dashboard.html', '/logger-ui.html']);
    const describe = wc => {
      if (!wc || wc.isDestroyed()) return null;
      let tool = null;
      try {
        const url = new URL(wc.getURL());
        if (url.protocol === 'chrome-extension:' && toolNames.has(url.pathname)) tool = url.pathname;
      } catch {}
      return { id: wc.id, type: wc.getType(), tool };
    };
    const record = (wc, event, extra = {}) => {
      events.push({ time: Date.now(), event, id: wc.id, source: describe(wc), focused: describe(webContents.getFocusedWebContents()), ...extra });
      if (events.length > 64) events.shift();
    };
    const watch = wc => {
      if (seen.has(wc)) return;
      seen.add(wc);
      for (const operation of ['focus', 'close']) {
        const original = wc[operation];
        wc[operation] = function(...args) {
          const stack = new Error().stack || '';
          const mainLines = [...stack.matchAll(/src[\\/]main[\\/]main\.js:(\d+):/g)].slice(0, 3).map(match => Number(match[1]));
          record(wc, operation + '-call', { mainLines });
          return original.apply(this, args);
        };
      }
      for (const name of ['focus', 'blur', 'did-finish-load', 'destroyed']) wc.on(name, () => {
        record(wc, name);
      });
      wc.on('before-mouse-event', (_event, input) => {
        if (input.type === 'mouseDown') record(wc, 'outside-mouse-down');
      });
      wc.on('before-input-event', (_event, input) => {
        if (input.type === 'keyDown') record(wc, 'outside-key-down');
      });
    };
    const watchedWindows = new WeakSet();
    const watchWindow = window => {
      if (watchedWindows.has(window)) return;
      watchedWindows.add(window);
      window.on('blur', () => record(window.webContents, 'window-blur', {
        windowId: window.id, windowFocused: window.isFocused(),
        focusedWindowId: BrowserWindow.getFocusedWindow()?.id ?? null,
      }));
    };
    for (const window of BrowserWindow.getAllWindows()) watchWindow(window);
    app.on('browser-window-created', (_event, window) => watchWindow(window));
    for (const wc of webContents.getAllWebContents()) watch(wc);
    ipcMain.on('ublock:popup', (event, value) => {
      if (['close', 'back', 'layout'].includes(value?.action)) record(event.sender, 'popup-ipc', { action: value.action, ...(value.action === 'layout' ? { height: value.height } : {}) });
    });
    app.on('web-contents-created', (_event, wc) => watch(wc));
  });
}
// Direct fixture/DevTools calls do not imply the foreground window state a
// native shield click has. Keep real production blur dismissal enabled.
async function focusFixtureWindow(electron) {
  await electron.evaluate(({ app, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id)
      .find(win => win.webContents.getURL() === 'blanc-chrome://index/');
    if (!win) throw new Error('Fixture chrome window unavailable');
    win.show(); app.focus({ steal: true }); win.focus();
  });
  const { waitForValue } = require('./poll');
  await waitForValue(() => electron.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getFocusedWindow())), Boolean, 'fixture window focused');
}
async function read(electron) {
  return electron.evaluate(() => globalThis.fixturePopupFocusEvents ?? []);
}
module.exports = { install, read, focusFixtureWindow };
