const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const electronId = require.resolve('electron');
const electronUpdaterId = require.resolve('electron-updater');
const updaterId = require.resolve('../../src/main/updater');
const originalElectron = require.cache[electronId];
const originalElectronUpdater = require.cache[electronUpdaterId];
const originalSetInterval = global.setInterval;

// A stable logs dir (created once) so we can assert diagnostics actually land on
// disk, not merely that some logger object exists.
const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-upd-logs-'));

const app = new EventEmitter();
app.isPackaged = true;
app.getVersion = () => '1.5.0';
app.getPath = () => logsDir;

const dialogs = [];
const dialog = {
  showMessageBox: (...args) => {
    dialogs.push(args.at(-1));
    return Promise.resolve({ response: 1 });
  },
};
// One persistent fake window so we can observe the taskbar/Dock progress
// indicator without cross-test accumulation.
const progress = [];
const windows = [{ isDestroyed: () => false, setProgressBar: (f) => progress.push(f) }];

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
      getAllWindows: () => windows,
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
  try {
    fs.rmSync(logsDir, { recursive: true, force: true });
  } catch (_) {
    /* best effort */
  }
});

test('packaged setup pins full downloads, a file logger, and a thirty-minute schedule', async () => {
  updater.setupAutoUpdater();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  // Differential download is disabled outright; asserting the concrete value
  // verifies the wiring on any host, not only on a Windows runner.
  assert.equal(autoUpdater.disableDifferentialDownload, true);
  assert.equal(autoUpdater.disableWebInstaller, true);

  // Must be a real FILE logger, not just any object with .info — Node's console
  // would satisfy a typeof check while writing nothing to disk.
  autoUpdater.logger.info('probe-line');
  const onDisk = fs.readFileSync(path.join(logsDir, 'updater.log'), 'utf8');
  assert.match(onDisk, /probe-line/, 'updater diagnostics are persisted to disk');

  assert.equal(checkCount, 1, 'launch checks immediately');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 30 * 60 * 1000);
  assert.equal(app.listenerCount('browser-window-focus'), 1);
});

test('a background download error stays silent (no manual check pending)', () => {
  // Fresh module state: no user-initiated check, so an error must not pop a
  // dialog — the old never-interrupt behavior for background failures.
  const before = dialogs.length;
  autoUpdater.emit('error', new Error('getaddrinfo ENOTFOUND github.com'));
  assert.equal(dialogs.length, before, 'background failure is logged, not shown');
});

test('download progress drives the OS indicator', () => {
  progress.length = 0;
  autoUpdater.emit('download-progress', { percent: 42 });
  assert.ok(progress.includes(0.42), 'progress fraction reaches the window');
});

test('download progress is logged to updater.log (throttled)', async () => {
  let cancelled = false;
  checkResult = {
    isUpdateAvailable: true,
    updateInfo: { version: '1.5.1' },
    cancellationToken: { cancel: () => { cancelled = true; } },
  };
  await updater.checkForUpdatesManually();

  const logPath = path.join(logsDir, 'updater.log');
  autoUpdater.emit('download-progress', {
    percent: 12.5,
    transferred: 12.5 * 1024 * 1024,
    total: 100 * 1024 * 1024,
    bytesPerSecond: 800 * 1024,
  });

  const contents = fs.readFileSync(logPath, 'utf8');
  assert.match(contents, /download progress: 12\.5%/);
  assert.match(contents, /12\.5 MB \/ 100\.0 MB/);
  assert.match(contents, /800\.0 KB\/s/);
});

test('manual checks confirm when the installed build is current', async () => {
  checkResult = { updateInfo: { version: '1.5.0' } };
  await updater.checkForUpdatesManually();

  assert.equal(dialogs.at(-1).message, 'You’re up to date');
  assert.match(dialogs.at(-1).detail, /Blanc 1\.5\.0/);
});

test('manual checks explain that a newer build is downloading', async () => {
  checkResult = { updateInfo: { version: '1.5.1' } };
  await updater.checkForUpdatesManually();

  assert.equal(dialogs.at(-1).message, 'Downloading Blanc 1.5.1');
  assert.match(dialogs.at(-1).detail, /downloading in the background/);
});

test('a user-started download that then fails surfaces a warning and clears the indicator', async () => {
  // Self-contained: start a user-initiated download, then fail it.
  checkResult = { updateInfo: { version: '1.5.1' } };
  await updater.checkForUpdatesManually();
  progress.length = 0;
  const before = dialogs.length;

  autoUpdater.emit('error', new Error('ECONNRESET while downloading'));

  assert.equal(dialogs.length, before + 1);
  assert.equal(dialogs.at(-1).message, 'Update download failed');
  assert.match(dialogs.at(-1).detail, /ECONNRESET/);
  assert.equal(progress.at(-1), -1, 'indicator cleared on failure');
});

test('the failure dialog is one-shot: a later background error is silent again', () => {
  // The failure above cleared the user-initiated flag, so we are back to
  // never-interrupt — proves the flag does not stay latched after firing.
  const before = dialogs.length;
  autoUpdater.emit('error', new Error('socket hang up'));
  assert.equal(dialogs.length, before, 'flag is not latched');
});

test('a downloaded update clears the indicator and prompts exactly once', async () => {
  const info = { version: '1.5.1' };
  const beforeDialogs = dialogs.length;

  autoUpdater.emit('update-downloaded', info); // fresh: prompt + clear
  await new Promise((resolve) => setImmediate(resolve));

  // Re-emit once the update is already recorded: the indicator must STILL clear,
  // proving setDownloadProgress(-1) runs before the once-only early return, and
  // no second restart prompt appears. (This test creates the already-downloaded
  // state itself, so the ordering guarantee isn't inherited from another test.)
  progress.length = 0;
  autoUpdater.emit('update-downloaded', info);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dialogs.length, beforeDialogs + 1, 'prompts once even if the event repeats');
  assert.equal(dialogs.at(-1).message, 'Update 1.5.1 downloaded');
  assert.match(dialogs.at(-1).detail, /reopen when installation completes/);
  assert.equal(progress.at(-1), -1, 'indicator cleared before the once-only early return');
});

test('the signature verifier is wired on Windows only', () => {
  autoUpdater.verifyUpdateCodeSignature = undefined;
  const off = updater.installWindowsSignatureVerifier({
    platform: 'darwin',
    createVerifier: () => {
      throw new Error('should not be called off Windows');
    },
  });
  assert.equal(off, false);
  assert.equal(autoUpdater.verifyUpdateCodeSignature, undefined, 'no verifier wired off Windows');

  const stub = async () => null;
  const on = updater.installWindowsSignatureVerifier({
    platform: 'win32',
    createVerifier: () => stub,
  });
  assert.equal(on, true);
  assert.equal(autoUpdater.verifyUpdateCodeSignature, stub, 'the module verifier is wired on Windows');
});
