const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdateCheckCoordinator } = require('./update-checks');
const { createUpdateRestarter } = require('./update-restart');
const { createUpdaterLog } = require('./updater-log');
const { createWindowsSignatureVerifier } = require('./updater-signature');
const { createWindowsUpdateTrustGate } = require('./windows-update-trust');
const { FLATPAK_CHANNEL, resolveUpdaterPolicy } = require('./updater-policy');
const { buildStagingStatus, writeStagingStatus } = require('./updater-staging-status');
const {
  createDownloadProgressLogger,
  createDownloadStallWatchdog,
  shouldArmDownloadStallWatchdog,
  DOWNLOAD_STALL_MS,
} = require('./updater-download');

// Attach update dialogs to the browser window so they can't appear behind
// it; fall back to an unparented dialog if no window exists.
// The interface translator, supplied by setupAutoUpdater() at startup.
let t = null;

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
// prompt appears. Verification failures defer installation and permit a retry.
// Windows-only.
function installWindowsSignatureVerifier({
  platform = process.platform,
  logger,
  createVerifier = createWindowsSignatureVerifier,
  onVerifyStart,
} = {}) {
  if (platform !== 'win32') return false;
  const verify = createVerifier({ logger });
  autoUpdater.verifyUpdateCodeSignature = (publisherNames, filePath) => {
    // Reaching verification means the download's bytes are finished; it's a
    // separate phase with its own timeout. Let the caller stop the download stall
    // watchdog so a slow (up to 120s) verification isn't mistaken for a stall.
    onVerifyStart?.();
    return verify(publisherNames, filePath);
  };
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
// True from the first Authenticode verifier call until update-downloaded/error.
// A repeated check during this phase can still return a cancellation token, but
// there are no download-progress events left to feed the stall watchdog.
let downloadVerificationInProgress = false;
let activePolicy = null;
let windowsTrustGate = null;

function noteStagingStatus(phase, detail = {}) {
  if (!activePolicy?.statusFile) return;
  try {
    writeStagingStatus(activePolicy.statusFile, buildStagingStatus(phase, {
      currentVersion: app.getVersion(),
      ...detail,
    }));
  } catch (error) {
    updaterLogger().warn(`[updater] could not write staging status: ${error.message}`);
  }
}

function updaterLogger() {
  return autoUpdater.logger || console;
}

function clearDownloadTracking() {
  activeDownloadCancellation = null;
  downloadVerificationInProgress = false;
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

  if (manualDownloadPending) {
    manualDownloadPending = false;
    showDialog({
      type: 'warning',
      message: t('update.stalled.message'),
      detail: t('update.stalled.detail', { command: t('menu.checkForUpdates') }),
    });
  }
}

const restartToInstallUpdate = createUpdateRestarter({ autoUpdater });
const updateChecks = createUpdateCheckCoordinator({
  checkForUpdates: async () => {
    await windowsTrustGate?.waitForCacheMaintenance();
    const result = await autoUpdater.checkForUpdates();
    if (shouldArmDownloadStallWatchdog(result, {
      alreadyDownloading: Boolean(activeDownloadCancellation),
      alreadyDownloaded: updateDownloaded,
      verificationInProgress: downloadVerificationInProgress,
    })) {
      activeDownloadCancellation = result.cancellationToken;
      downloadProgressLogger?.reset();
      downloadStallWatchdog?.arm();
    }
    return result;
  },
  isUpdateDownloaded: () => updateDownloaded,
});

function promptRestart(info) {
  if (windowsTrustGate && !windowsTrustGate.isReady()) return Promise.resolve();
  return showDialog({
    type: 'info',
    buttons: [t('update.ready.restart'), t('update.ready.later')],
    defaultId: 0,
    message: t('update.ready.message', { version: info.version }),
    detail: t('update.ready.detail'),
  }).then(({ response }) => {
    if (response === 0 && updateDownloaded && downloadedUpdateInfo === info
      && (!windowsTrustGate || windowsTrustGate.isReady())) restartToInstallUpdate();
  });
}

function setupAutoUpdater({ t: translate }) {
  t = translate;
  if (!app.isPackaged) return; // dev builds have nothing to update against

  activePolicy = resolveUpdaterPolicy({ isPackaged: app.isPackaged });
  if (activePolicy.mode === FLATPAK_CHANNEL) {
    console.info(`[updater] off: ${activePolicy.reason}`);
    return;
  }
  if (!activePolicy.enabled) {
    console.warn(`[updater] disabled for this launch: ${activePolicy.reason}`);
    return;
  }
  if (activePolicy.feed) {
    autoUpdater.setFeedURL(activePolicy.feed);
    autoUpdater.allowPrerelease = activePolicy.allowPrerelease;
    console.info('[updater] using the isolated staging channel');
  }

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
  // generous-timeout one on Windows (no-op elsewhere). See the function. When
  // verification begins the download is complete, so stop the stall watchdog —
  // otherwise a slow verify (its own 120s timeout) counts as a stalled download.
  if (process.platform === 'win32') {
    windowsTrustGate = createWindowsUpdateTrustGate({
      autoUpdater, logger: autoUpdater.logger, installOnQuit: !activePolicy.autoInstall,
    });
  }
  installWindowsSignatureVerifier({
    logger: autoUpdater.logger,
    createVerifier: windowsTrustGate ? () => windowsTrustGate.verifySignature : createWindowsSignatureVerifier,
    onVerifyStart: () => {
      if (windowsTrustGate) {
        updateDownloaded = false;
        downloadedUpdateInfo = null;
      }
      downloadVerificationInProgress = true;
      downloadStallWatchdog?.disarm();
      activeDownloadCancellation = null;
    },
  });

  // Pin the behavior this release depends on instead of silently inheriting
  // electron-updater defaults that can change between dependency upgrades.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = !windowsTrustGate;
  // Differential (delta) download over GitHub Releases is disabled outright.
  // Blanc bumps Chromium nearly every release, so almost every block changes
  // and the delta downloader refetches ~the whole installer anyway — but through
  // hundreds of serial HTTP range requests against GitHub's asset CDN, far
  // slower than one streamed full download (worst on Windows, but the same
  // "completes, but takes forever" behavior on every platform's delta path).
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  if (activePolicy.autoInstall) {
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoRunAppAfterInstall = false;
  }

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
  autoUpdater.on('checking-for-update', () => noteStagingStatus('checking'));
  autoUpdater.on('update-available', (info) => {
    if (windowsTrustGate && (!updateDownloaded || downloadedUpdateInfo?.version !== info?.version)) {
      windowsTrustGate.invalidate();
      updateDownloaded = false;
      downloadedUpdateInfo = null;
    }
    noteStagingStatus('available', { updateVersion: info?.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    noteStagingStatus('not-available', { updateVersion: info?.version });
  });
  autoUpdater.on('update-downloaded', async (info) => {
    clearDownloadTracking();
    setDownloadProgress(-1);
    if (windowsTrustGate) {
      downloadVerificationInProgress = true;
      noteStagingStatus('verifying', { updateVersion: info?.version });
      const rejection = await windowsTrustGate.acceptDownloaded(info);
      downloadVerificationInProgress = false;
      if (rejection !== null) {
        autoUpdater.emit('error', new Error(rejection));
        return;
      }
    }
    manualDownloadPending = false;
    if (updateDownloaded) return;
    updateDownloaded = true;
    downloadedUpdateInfo = info;
    noteStagingStatus('downloaded', { updateVersion: info?.version });
    if (activePolicy.autoInstall) {
      noteStagingStatus('installing', { updateVersion: info?.version });
      // The automated replacement smoke currently targets Squirrel.Mac and
      // suppresses relaunch so it can inspect the replaced bundle first.
      // Other platforms keep the existing installer-owned restart path.
      if (process.platform === 'darwin') autoUpdater.quitAndInstall(false, false);
      else restartToInstallUpdate();
      return;
    }
    promptRestart(info);
  });
  autoUpdater.on('error', (err) => {
    if (windowsTrustGate) {
      windowsTrustGate.invalidate();
      updateDownloaded = false;
      downloadedUpdateInfo = null;
    }
    clearDownloadTracking();
    setDownloadProgress(-1);
    // logger is our file logger (which itself falls back to console when it
    // can't write) or, if getPath threw, electron-updater's default console.
    updaterLogger().error('[updater]', err?.stack ?? err?.message ?? err);
    noteStagingStatus('error', { error: err?.message ?? err });
    // Only interrupt the user when a download THEY started from the menu fails.
    // The `error` event also fires for background metadata checks (which run
    // concurrently with a download on the 30-min/on-focus timer) and for
    // aborts during quit, so a shared "is a download happening" flag would both
    // misfire and mask the real failure; a user-initiated flag can't.
    if (manualDownloadPending) {
      manualDownloadPending = false;
      showDialog({
        type: 'warning',
        message: t('update.failed.message'),
        detail: t('update.failed.detail', { error: err?.message ?? err, command: t('menu.checkForUpdates') }),
      });
    }
  });

  noteStagingStatus('configured', { updateVersion: null });
  updateChecks.start();
  app.on('browser-window-focus', updateChecks.checkOnFocus);
}

/** Menu-triggered check with visible feedback. */
async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    showDialog({ type: 'info', message: t('update.devOnly') });
    return;
  }
  if (activePolicy?.mode === FLATPAK_CHANNEL) {
    showDialog({
      type: 'info',
      message: t('update.flatpak.message'),
      detail: t('update.flatpak.detail'),
    });
    return;
  }
  if (activePolicy && !activePolicy.enabled) {
    showDialog({
      type: 'warning',
      message: t('update.disabled.message'),
      // A developer diagnostic for the staging channel's environment, not
      // interface text.
      detail: activePolicy.reason,
    });
    return;
  }
  if (windowsTrustGate && downloadVerificationInProgress) {
    manualDownloadPending = true;
    await showDialog({
      type: 'info',
      message: t('update.verifying.message'),
      detail: t('update.verifying.detail'),
    });
    return;
  }
  if (updateDownloaded && downloadedUpdateInfo && (!windowsTrustGate || windowsTrustGate.isReady())) {
    await promptRestart(downloadedUpdateInfo);
    return;
  }
  try {
    const result = await updateChecks.checkForUpdates();
    if (updateDownloaded) return; // the downloaded handler already prompted
    if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
      showDialog({
        type: 'info',
        message: t('update.current.message'),
        detail: t('update.current.detail', { version: app.getVersion() }),
      });
      return;
    }
    // A newer version is available and autoDownload has started fetching it.
    // Mark it user-initiated so that if this download fails, the error handler
    // tells the user (background downloads fail silently to the log).
    manualDownloadPending = true;
    await showDialog({
      type: 'info',
      message: t('update.downloading.message', { version: result.updateInfo.version }),
      detail: t('update.downloading.detail'),
    });
  } catch (err) {
    showDialog({ type: 'warning', message: t('update.checkFailed.message'), detail: err.message });
  }
}

module.exports = {
  setupAutoUpdater,
  checkForUpdatesManually,
  installWindowsSignatureVerifier,
  DOWNLOAD_STALL_MS,
};
