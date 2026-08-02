const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  WINDOWS_FORCE_EXIT_DELAY_MS,
  createUpdateRestarter,
} = require('../../src/main/update-restart');

function harness(platform = 'win32') {
  const app = new EventEmitter();
  const calls = [];
  app.exit = (code) => calls.push(['exit', code]);

  const ownedContents = { isDestroyed: () => false };
  const closedContents = {
    isDestroyed: () => false,
    close: (options) => calls.push(['close-contents', options]),
  };
  const alreadyDestroyedContents = {
    isDestroyed: () => true,
    close: () => calls.push(['close-destroyed-contents']),
  };
  const window = {
    isDestroyed: () => false,
    destroy: () => calls.push(['destroy-window']),
  };
  const alreadyDestroyedWindow = {
    isDestroyed: () => true,
    destroy: () => calls.push(['destroy-destroyed-window']),
  };

  const BrowserWindow = {
    fromWebContents: (contents) => contents === ownedContents ? window : null,
    getAllWindows: () => [window, alreadyDestroyedWindow],
  };
  const webContents = {
    getAllWebContents: () => [ownedContents, closedContents, alreadyDestroyedContents],
  };
  const autoUpdater = {
    quitAndInstall: () => calls.push(['quit-and-install']),
  };
  const scheduled = [];
  const schedule = (callback, delay) => {
    scheduled.push({ callback, delay });
  };

  const restart = createUpdateRestarter({
    app,
    autoUpdater,
    BrowserWindow,
    webContents,
    platform,
    schedule,
  });

  return { app, autoUpdater, calls, restart, scheduled };
}

test('Windows update closes every old surface after quit begins and forces a bounded exit', () => {
  const { app, calls, restart, scheduled } = harness();
  app.on('before-quit', () => calls.push(['existing-before-quit-listener']));

  restart();
  assert.deepEqual(calls, [['quit-and-install']]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, WINDOWS_FORCE_EXIT_DELAY_MS);

  app.emit('before-quit');
  assert.deepEqual(calls, [
    ['quit-and-install'],
    ['existing-before-quit-listener'],
    ['close-contents', { waitForBeforeUnload: false }],
    ['destroy-window'],
  ]);

  scheduled[0].callback();
  assert.deepEqual(calls.at(-1), ['exit', 0]);

  restart();
  assert.equal(calls.filter(([name]) => name === 'quit-and-install').length, 1);
});

test('non-Windows updates retain electron-updater native restart behavior', () => {
  const { app, calls, restart, scheduled } = harness('darwin');

  restart();
  app.emit('before-quit');

  assert.deepEqual(calls, [['quit-and-install']]);
  assert.deepEqual(scheduled, []);
});

test('a synchronous updater failure disarms cleanup and permits retry', () => {
  const { app, autoUpdater, calls, restart, scheduled } = harness();
  let attempts = 0;
  autoUpdater.quitAndInstall = () => {
    attempts += 1;
    if (attempts === 1) throw new Error('installer spawn failed');
    calls.push(['quit-and-install']);
  };

  assert.throws(restart, /installer spawn failed/);
  assert.equal(app.listenerCount('before-quit'), 0);
  assert.deepEqual(scheduled, []);

  restart();
  assert.equal(attempts, 2);
  assert.equal(app.listenerCount('before-quit'), 1);
  assert.equal(scheduled.length, 1);
});
