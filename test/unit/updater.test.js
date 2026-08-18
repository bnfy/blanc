const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const electronId = require.resolve('electron');
const electronUpdaterId = require.resolve('electron-updater');
const updaterId = require.resolve('../../src/main/updater');
const originalElectron = require.cache[electronId];
const originalElectronUpdater = require.cache[electronUpdaterId];
const originalSetInterval = global.setInterval;

const app = new EventEmitter();
app.isPackaged = true;
app.getVersion = () => '1.5.0';

const dialogs = [];
const dialog = {
  showMessageBox: (...args) => {
    dialogs.push(args.at(-1));
    return Promise.resolve({ response: 1 });
  },
};
const autoUpdater = new EventEmitter();
let checkResult = { updateInfo: { version: '1.5.0' } };
let checkCount = 0;
autoUpdater.checkForUpdates = async () => {
  checkCount += 1;
  return checkResult;
};
autoUpdater.quitAndInstall = () => {};

require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app,
    dialog,
    BrowserWindow: {
      getFocusedWindow: () => null,
      getAllWindows: () => [],
    },
  },
};
require.cache[electronUpdaterId] = {
  id: electronUpdaterId,
  filename: electronUpdaterId,
  loaded: true,
  exports: { autoUpdater },
};

const intervals = [];
global.setInterval = (callback, delay) => {
  intervals.push({ callback, delay });
  return intervals.length;
};
delete require.cache[updaterId];
const updater = require('../../src/main/updater');

test.after(() => {
  global.setInterval = originalSetInterval;
  delete require.cache[updaterId];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  if (originalElectronUpdater) require.cache[electronUpdaterId] = originalElectronUpdater;
  else delete require.cache[electronUpdaterId];
});

test('packaged setup pins efficient downloads and a thirty-minute schedule', async () => {
  updater.setupAutoUpdater();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(autoUpdater.disableDifferentialDownload, false);
  assert.equal(autoUpdater.disableWebInstaller, true);
  assert.equal(checkCount, 1, 'launch checks immediately');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 30 * 60 * 1000);
  assert.equal(app.listenerCount('browser-window-focus'), 1);
});

test('manual update checks immediately explain that a newer build is downloading', async () => {
  checkResult = { updateInfo: { version: '1.5.1' } };
  await updater.checkForUpdatesManually();

  assert.equal(dialogs.at(-1).message, 'Downloading Blanc 1.5.1');
  assert.match(dialogs.at(-1).detail, /downloading in the background/);
});

test('manual checks still confirm when the installed build is current', async () => {
  checkResult = { updateInfo: { version: '1.5.0' } };
  await updater.checkForUpdatesManually();

  assert.equal(dialogs.at(-1).message, 'You’re up to date');
  assert.match(dialogs.at(-1).detail, /Blanc 1\.5\.0/);
});

test('a downloaded update prompts only once even if the event repeats', async () => {
  const info = { version: '1.5.1' };
  const before = dialogs.length;
  autoUpdater.emit('update-downloaded', info);
  autoUpdater.emit('update-downloaded', info);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dialogs.length, before + 1);
  assert.equal(dialogs.at(-1).message, 'Update 1.5.1 downloaded');
  assert.match(dialogs.at(-1).detail, /reopen when installation completes/);
});
