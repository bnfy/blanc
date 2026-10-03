'use strict';

// Fixture-only, bounded native event history. Never records webpage URLs,
// headers or bodies; managed tool names come from a fixed allowlist.
async function install(electron) {
  await electron.evaluate(({ app, webContents }) => {
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
    const watch = wc => {
      if (seen.has(wc)) return;
      seen.add(wc);
      const id = wc.id;
      for (const name of ['focus', 'blur', 'did-finish-load', 'destroyed']) wc.on(name, () => {
        events.push({ time: Date.now(), event: name, id, source: describe(wc), focused: describe(webContents.getFocusedWebContents()) });
        if (events.length > 64) events.shift();
      });
    };
    for (const wc of webContents.getAllWebContents()) watch(wc);
    app.on('web-contents-created', (_event, wc) => watch(wc));
  });
}
async function read(electron) {
  return electron.evaluate(() => globalThis.fixturePopupFocusEvents ?? []);
}
module.exports = { install, read };
