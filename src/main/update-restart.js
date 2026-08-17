/**
 * Build the single restart action used by the downloaded-update prompt.
 *
 * electron-updater launches the signed NSIS installer before asking Electron
 * to quit. The installer then owns old-process shutdown through Blanc's
 * bounded retry loop in build/installer.nsh. Destroying BrowserWindows and
 * WebContents ourselves races that native handoff and caused the v1.4.0 ->
 * v1.5.0 Windows crash. Keep the restart path deliberately small.
 */
function createUpdateRestarter({
  autoUpdater,
  platform = process.platform,
}) {
  let restartRequested = false;

  return function restartToInstallUpdate() {
    if (restartRequested) return;
    restartRequested = true;

    try {
      if (platform === 'win32') {
        // /S keeps the installer-owned handoff non-interactive; --force-run
        // guarantees Blanc relaunches after that silent install completes.
        autoUpdater.quitAndInstall(true, true);
      } else {
        autoUpdater.quitAndInstall();
      }
    } catch (err) {
      restartRequested = false;
      throw err;
    }
  };
}

module.exports = { createUpdateRestarter };
