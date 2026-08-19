const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdateCheckCoordinator } = require('./update-checks');
const { createUpdateRestarter } = require('./update-restart');
const { createUpdaterLog } = require('./updater-log');
const { createWindowsSignatureVerifier } = require('./updater-signature');
const {
  createDownloadProgressLogger,
  createDownloadStallWatchdog,
  DOWNLOAD_STALL_MS,
} = require('./updater-download');

// Attach update dialogs to the browser window so they can't appear behind
// it; fall back to an unparented dialog if no window exists.
function showDialog(options) {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

// Mirror download progress on the OS taskbar/Dock button so a long download
// reads as "working", not "hung". A static "downloading…" dialog with no
// feedback for a slow delta download was what made Windows updates look broken.
// A negative fraction clears the indicator.
function setDownloadProgress(fraction) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) win.setProgressBar(fraction);
  }
}

// Replace electron-updater's default Windows signature check with one that uses
// a generous timeout instead of the built-in 20-second cliff. That cliff was
// silently aborting updates after a fully successful download: on a slow/loaded
// machine `Get-AuthenticodeSignature` (or even spawning cmd.exe) exceeds 20s,
// electron-updater rejects, `update-downloaded` never fires, and no restart
// prompt appears. See updater-signature.js for the verifier and its fail-open-on-
// infrastructure-failure / fail-closed-on-bad-result policy. Windows-only.
function installWindowsSignatureVerifier({
  platform = process.platform,
  logger,
  createVerifier = createWindowsSignatureVerifier,
} = {}) {
  if (platform !== 'win32') return false;
  autoUpdater.verifyUpdateCodeSignature = createVerifier({ logger });
  return true;
}

// Auto-update = replacing the whole app (Chromium included) — same model
// Chrome itself uses. electron-updater reads the `build.publish` config
// (GitHub Releases) from the app-update.yml that electron-builder embeds
// at package time, so none of this runs in dev.
let updateDownloaded = false;
let downloadedUpdateInfo = null;
// Set only when the user explicitly picked "Check for Updates…" and a download
// started as a result. It gates the failure dialog so background download
// failures (transient blips the next scheduled check recovers, aborts during
// quit) stay silent and only ever reach the log — the old behavior — while a
// user who asked still gets told if their download fails.
let manualDownloadPending = false;
// Held while electron-updater is fetching an update so a stall watchdog can
// cancel the in-flight transfer (CancellationError is swallowed upstream).
let activeDownloadCancellation = null;
let downloadProgressLogger = null;
let downloadStallWatchdog = null;

function updaterLogger() {
  return autoUpdater.logger || console;
}

function clearDownloadTracking() {
  activeDownloadCancellation = null;
  downloadStallWatchdog?.disarm();
  downloadProgressLogger?.reset();
}

function handleDownloadStall() {
  const logger = updaterLogger();
  logger.error(
    `[updater] download stalled: no progress for ${Math.round(DOWNLOAD_STALL_MS / 1000)}s; cancelling so the next check can retry`,
  );
  try {
    activeDownloadCancellation?.cancel();
  } catch (_) {
    /* best effort */
  }
  clearDownloadTracking();
  setDownloadProgress(-1);

  const detail = `The update download stopped making progress. You can retry with “Check for Updates…”, or reinstall from blancbrowser.com.`;
  if (manualDownloadPending) {
    manualDownloadPending = false;
    showDialog({
      type: 'warning',
      message: 'Update download stalled',
      detail,
    });
  }
}

const restartToInstallUpdate = createUpdateRestarter({ autoUpdater });
const updateChecks = createUpdateCheckCoordinator({
  checkForUpdates: async () => {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable && result.cancellationToken && !activeDownloadCancellation) {
      activeDownloadCancellation = result.cancellationToken;
      downloadProgressLogger?.reset();
      downloadStallWatchdog?.arm();
    }
    return result;
  },
  isUpdateDownloaded: () => updateDownloaded,
});

function promptRestart(info) {
  return showDialog({
    type: 'info',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    message: `Update ${info.version} downloaded`,
    detail: 'Restart to apply it. Blanc will reopen when installation completes.',
  }).then(({ response }) => {
    if (response === 0) restartToInstallUpdate();
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return; // dev builds have nothing to update against

  // Persist electron-updater's own diagnostics (progress, the differential
  // fallback notice, errors). Unconfigured they go to the packaged app's
  // invisible console; on disk they become a trace we can read after a slow or
  // failed update. Best-effort — getPath can throw before app-ready or under
  // the unit-test harness, and logging must never stop updates from running.
  try {
    autoUpdater.logger = createUpdaterLog(app.getPath('logs'));
  } catch (_) {
    /* leave the default console logger in place */
  }

  // Replace electron-updater's 20s-timeout PowerShell signature check with a
  // generous-timeout one on Windows (no-op elsewhere). See the function.
  installWindowsSignatureVerifier({ logger: autoUpdater.logger });

  // Pin the behavior this release depends on instead of silently inheriting
  // electron-updater defaults that can change between dependency upgrades.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Differential (delta) download over GitHub Releases is disabled outright.
  // Blanc bumps Chromium nearly every release, so almost every block changes
  // and the delta downloader refetches ~the whole installer anyway — but through
  // hundreds of serial HTTP range requests against GitHub's asset CDN, far
  // slower than one streamed full download (worst on Windows, but the same
  // "completes, but takes forever" behavior on every platform's delta path).
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;

  downloadProgressLogger = createDownloadProgressLogger({
    log: (message) => updaterLogger().info(message),
  });
  downloadStallWatchdog = createDownloadStallWatchdog({ onStall: handleDownloadStall });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgressLogger.note(progress);
    downloadStallWatchdog.touch();
    const percent = Number(progress?.percent);
    if (Number.isFinite(percent)) setDownloadProgress(percent / 100);
  });
  autoUpdater.on('update-downloaded', (info) => {
    manualDownloadPending = false;
    clearDownloadTracking();
    setDownloadProgress(-1);
    if (updateDownloaded) return;
    updateDownloaded = true;
    downloadedUpdateInfo = info;
    promptRestart(info);
  });
  autoUpdater.on('error', (err) => {
    clearDownloadTracking();
    setDownloadProgress(-1);
    // logger is our file logger (which itself falls back to console when it
    // can't write) or, if getPath threw, electron-updater's default console.
    updaterLogger().error('[updater]', err?.stack ?? err?.message ?? err);
    // Only interrupt the user when a download THEY started from the menu fails.
    // The `error` event also fires for background metadata checks (which run
    // concurrently with a download on the 30-min/on-focus timer) and for
    // aborts during quit, so a shared "is a download happening" flag would both
    // misfire and mask the real failure; a user-initiated flag can't.
    if (manualDownloadPending) {
      manualDownloadPending = false;
      showDialog({
        type: 'warning',
        message: 'Update download failed',
        detail: `${err?.message ?? err}\n\nYou can retry with “Check for Updates…”, or reinstall from blancbrowser.com.`,
      });
    }
  });

  updateChecks.start();
  app.on('browser-window-focus', updateChecks.checkOnFocus);
}

/** Menu-triggered check with visible feedback. */
async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    showDialog({ type: 'info', message: 'Updates are only available in packaged builds.' });
    return;
  }
  if (updateDownloaded && downloadedUpdateInfo) {
    await promptRestart(downloadedUpdateInfo);
    return;
  }
  try {
    const result = await updateChecks.checkForUpdates();
    if (updateDownloaded) return; // the downloaded handler already prompted
    if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
      showDialog({
        type: 'info',
        message: 'You’re up to date',
        detail: `Blanc ${app.getVersion()} is the latest version.`,
      });
      return;
    }
    // A newer version is available and autoDownload has started fetching it.
    // Mark it user-initiated so that if this download fails, the error handler
    // tells the user (background downloads fail silently to the log).
    manualDownloadPending = true;
    await showDialog({
      type: 'info',
      message: `Downloading Blanc ${result.updateInfo.version}`,
      detail: 'The update is downloading in the background. Blanc will prompt you as soon as it is ready to restart.',
    });
  } catch (err) {
    showDialog({ type: 'warning', message: 'Update check failed', detail: err.message });
  }
}

module.exports = {
  setupAutoUpdater,
  checkForUpdatesManually,
  installWindowsSignatureVerifier,
  DOWNLOAD_STALL_MS,
};
