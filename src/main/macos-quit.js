function safeWindowState(window, method, fallback) {
  try {
    if (!window || window.isDestroyed()) return fallback;
    return window[method]();
  } catch {
    return fallback;
  }
}

function settleWindowHidden(window, schedule = setImmediate) {
  if (!safeWindowState(window, 'isVisible', false)) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeListener?.('hide', finish);
      window.removeListener?.('closed', finish);
      resolve();
    };

    window.once('hide', finish);
    window.once('closed', finish);
    try {
      window.hide();
    } catch {
      finish();
      return;
    }

    // Some window managers update isVisible() before delivering `hide`.
    // Re-check on the next turn so a coalesced native event cannot strand quit.
    schedule(() => {
      if (!safeWindowState(window, 'isVisible', false)) finish();
    });
  });
}

/**
 * Electron's BrowserWindow shim listens for `hide` and immediately reads the
 * native window again. On macOS, destroying a still-visible window can deliver
 * that event after the native object is gone, producing the modal
 * "Object has been destroyed" main-process exception. Pause the first quit,
 * settle every visible window's hide event while it is still live, then retry.
 */
function installMacOSQuitVisibilityGate({
  app,
  BrowserWindow,
  platform = process.platform,
  schedule = setImmediate,
} = {}) {
  if (platform !== 'darwin') return () => {};

  let settling = null;
  let visibilitySettled = false;

  const beforeQuit = (event) => {
    const windows = BrowserWindow.getAllWindows().filter((window) =>
      safeWindowState(window, 'isVisible', false));

    if (visibilitySettled && windows.length === 0) return;
    visibilitySettled = false;
    event.preventDefault();
    if (settling) return;

    settling = Promise.all(windows.map((window) => settleWindowHidden(window, schedule)))
      .then(() => {
        visibilitySettled = true;
        settling = null;
        schedule(() => app.quit());
      });
  };

  app.prependListener('before-quit', beforeQuit);
  return () => app.removeListener('before-quit', beforeQuit);
}

module.exports = {
  installMacOSQuitVisibilityGate,
  settleWindowHidden,
};
