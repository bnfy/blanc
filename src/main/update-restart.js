const WINDOWS_FORCE_EXIT_DELAY_MS = 1000;

/** Force-close every Electron surface after app.quit has begun.
 *
 * Blanc intentionally keeps tab WebContentsViews alive when its one
 * BrowserWindow closes so macOS can recreate the window from the Dock. During
 * a Windows update that same lifetime is harmful: NSIS cannot replace the
 * executable while even one old Blanc process survives. This runs from the
 * app's `before-quit` event, after main's session-persistence guard and store
 * flush listeners have observed the quit, and bypasses page beforeunload
 * handlers because the installer must win this shutdown.
 */
function closeAllSurfaces({ BrowserWindow, webContents }) {
  for (const contents of webContents.getAllWebContents()) {
    if (contents.isDestroyed() || BrowserWindow.fromWebContents(contents)) continue;
    try {
      contents.close({ waitForBeforeUnload: false });
    } catch {
      // The owning window may have destroyed it between the snapshot and close.
    }
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    try {
      window.destroy();
    } catch {
      // Shutdown continues to the forced-exit backstop below.
    }
  }
}

/**
 * Build the single restart action used by the downloaded-update prompt.
 * Dependencies are explicit so the Windows-only shutdown contract stays
 * unit-testable on the macOS release host.
 */
function createUpdateRestarter({
  app,
  autoUpdater,
  BrowserWindow,
  webContents,
  platform = process.platform,
  schedule = setTimeout,
}) {
  let restartRequested = false;

  return function restartToInstallUpdate() {
    if (restartRequested) return;
    restartRequested = true;

    const isWindows = platform === 'win32';
    const closeForUpdate = () => closeAllSurfaces({ BrowserWindow, webContents });
    if (isWindows) app.once('before-quit', closeForUpdate);

    try {
      // electron-updater spawns NSIS before it schedules app.quit(). Arm the
      // before-quit cleanup first so there is no event-ordering race.
      autoUpdater.quitAndInstall();
    } catch (err) {
      restartRequested = false;
      if (isWindows) app.removeListener('before-quit', closeForUpdate);
      throw err;
    }

    if (!isWindows) return;

    // Browser/GPU processes should disappear through the normal quit path.
    // If Chromium or a page wedges teardown, exit before NSIS gives up and
    // shows its "Blanc cannot be closed" retry loop. The installer is a
    // detached process, so app.exit() does not terminate it.
    schedule(() => app.exit(0), WINDOWS_FORCE_EXIT_DELAY_MS);
  };
}

module.exports = {
  WINDOWS_FORCE_EXIT_DELAY_MS,
  closeAllSurfaces,
  createUpdateRestarter,
};
