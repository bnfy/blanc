// Restart intent lasts through the user's Leave/Stay decision. A wall-clock
// timeout must never disarm relaunch while a valid quit is still pending.
/** Restart only after normal quit completes; never arm a future unrelated quit. */
function createAppRestarter({ app, webContents, onCancelled = () => {} }) {
  let pending = null;
  return function restartApp() {
    if (pending) return pending;
    let resolve;
    pending = new Promise(done => { resolve = done; });
    const result = pending;
    const observers = [];
    let settled = false;
    const cleanup = () => {
      app.removeListener('quit', quit);
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
      // 'quit' cannot be cancelled. Scheduling here avoids an orphan relaunch
      // after a page's Stay decision or a cancelled normal shutdown.
      app.relaunch();
      resolve(true);
    };
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
