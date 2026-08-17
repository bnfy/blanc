const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdateCheckCoordinator } = require('./update-checks');
const { createUpdateRestarter } = require('./update-restart');

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
let updateDownloaded = false;
let downloadedUpdateInfo = null;
const restartToInstallUpdate = createUpdateRestarter({ autoUpdater });
const updateChecks = createUpdateCheckCoordinator({
  checkForUpdates: () => autoUpdater.checkForUpdates(),
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

  // Pin the behavior this release depends on instead of silently inheriting
  // electron-updater defaults that can change between dependency upgrades.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = false;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('update-downloaded', (info) => {
    if (updateDownloaded) return;
    updateDownloaded = true;
    downloadedUpdateInfo = info;
    promptRestart(info);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err.message);
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
    await showDialog({
      type: 'info',
      message: `Downloading Blanc ${result.updateInfo.version}`,
      detail: 'The update is downloading in the background. Blanc will prompt you as soon as it is ready to restart.',
    });
  } catch (err) {
    showDialog({ type: 'warning', message: 'Update check failed', detail: err.message });
  }
}

module.exports = { setupAutoUpdater, checkForUpdatesManually };
