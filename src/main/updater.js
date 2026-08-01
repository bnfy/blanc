const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const { resolveUpdaterPolicy } = require('./updater-policy');

// Attach update dialogs to the browser window so they can't appear behind
// it; fall back to an unparented dialog if no window exists.
function showDialog(options) {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

// Auto-update = replacing the whole app (Chromium included) — same model
// Chrome itself uses. electron-updater reads the `build.publish` config
// (GitHub Releases) from the app-update.yml that electron-builder embeds
// at package time, so none of this runs in dev.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let updateDownloaded = false;
let activePolicy = null;

function writeStagingStatus(phase, detail = {}) {
  const statusFile = activePolicy?.statusFile;
  if (!statusFile) return;
  const next = `${statusFile}.next`;
  try {
    fs.writeFileSync(next, JSON.stringify({
      phase,
      currentVersion: app.getVersion(),
      at: new Date().toISOString(),
      ...detail,
    }, null, 2));
    fs.renameSync(next, statusFile);
  } catch (err) {
    console.warn('[updater] could not write staging status:', err.message);
  }
}

function promptRestart(info) {
  showDialog({
    type: 'info',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    message: `Update ${info.version} downloaded`,
    detail: 'Restart to apply it. The update includes the latest Chromium engine.',
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return; // dev builds have nothing to update against

  activePolicy = resolveUpdaterPolicy({ isPackaged: app.isPackaged });
  if (!activePolicy.enabled) {
    console.warn(`[updater] disabled: ${activePolicy.reason}`);
    return;
  }
  if (activePolicy.feed) {
    autoUpdater.setFeedURL(activePolicy.feed);
    autoUpdater.allowPrerelease = activePolicy.allowPrerelease;
    if (activePolicy.autoInstall) {
      autoUpdater.autoRunAppAfterInstall = false;
      autoUpdater.autoInstallOnAppQuit = false;
    }
    console.info(`[updater] using isolated staging channel at ${activePolicy.feed.url}`);
  }

  autoUpdater.on('checking-for-update', () => writeStagingStatus('checking'));
  autoUpdater.on('update-available', (info) => {
    writeStagingStatus('available', { updateVersion: info.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    writeStagingStatus('not-available', { updateVersion: info.version });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    writeStagingStatus('downloaded', { updateVersion: info.version });
    if (activePolicy.autoInstall) {
      writeStagingStatus('installing', { updateVersion: info.version });
      autoUpdater.quitAndInstall(false, false);
      return;
    }
    promptRestart(info);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err.message);
    writeStagingStatus('error', { error: err.message });
  });

  writeStagingStatus('configured', {
    feedUrl: activePolicy.feed?.url ?? null,
    channel: activePolicy.mode,
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    if (!updateDownloaded) autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

/** Menu-triggered check with visible feedback. */
async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    showDialog({ type: 'info', message: 'Updates are only available in packaged builds.' });
    return;
  }
  if (activePolicy && !activePolicy.enabled) {
    showDialog({
      type: 'warning',
      message: 'Updates are disabled for this launch',
      detail: activePolicy.reason,
    });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
      showDialog({
        type: 'info',
        message: 'You’re up to date',
        detail: `Blanc ${app.getVersion()} is the latest version.`,
      });
    }
    // If newer, the download starts automatically and the
    // update-downloaded handler prompts for restart.
  } catch (err) {
    showDialog({ type: 'warning', message: 'Update check failed', detail: err.message });
  }
}

module.exports = { setupAutoUpdater, checkForUpdatesManually };
