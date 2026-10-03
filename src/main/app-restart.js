// Restart intent lasts through the user's Leave/Stay decision. A wall-clock
// timeout must never disarm relaunch while a valid quit is still pending.
/** Relaunch for the current normal quit intent, after page unload decisions. */
function createAppRestarter({ app, webContents, onCancelled = () => {} }) {
  let pending = null;
  return function restartApp() {
    if (pending) return pending;
    let resolve;
    pending = new Promise(done => { resolve = done; });
    const result = pending;
    const observers = [];
    let settled = false;
    let prepared = false;
    const cleanup = () => {
      app.removeListener('quit', quit);
      app.removeListener('will-quit', willQuit);
      for (const [contents, listener] of observers) contents.removeListener('will-prevent-unload', listener);
      pending = null;
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      onCancelled();
      resolve(false);
    };
    const quit = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(prepared);
    };
    const willQuit = event => {
      // Page unload decisions have completed. Prepare the native helper while
      // Electron still owns its shutdown resources, before the quit event.
      // Blanc's existing will-quit handlers are registered before this one.
      if (event.defaultPrevented) { cancel(); return; }
      app.relaunch();
      prepared = true;
    };
    app.once('will-quit', willQuit);
    app.once('quit', quit);
    for (const contents of webContents.getAllWebContents()) {
      const listener = event => {
        // Existing page handlers decide Leave/Stay first. Electron's inverted
        // polarity: preventing this event permits the underlying unload.
        queueMicrotask(() => { if (!event.defaultPrevented) cancel(); });
      };
      contents.on('will-prevent-unload', listener);
      observers.push([contents, listener]);
    }
    try { app.quit(); } catch { cancel(); }
    return result;
  };
}
module.exports = { createAppRestarter };
