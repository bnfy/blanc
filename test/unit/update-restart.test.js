const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateRestarter } = require('../../src/main/update-restart');

function harness(platform = 'win32') {
  const calls = [];
  const autoUpdater = {
    quitAndInstall: (...args) => calls.push(['quit-and-install', ...args]),
  };

  const restart = createUpdateRestarter({
    autoUpdater,
    platform,
  });

  return { autoUpdater, calls, restart };
}

test('Windows delegates shutdown and relaunch to the silent NSIS updater', () => {
  const { calls, restart } = harness();
  restart();
  assert.deepEqual(calls, [['quit-and-install', true, true]]);

  restart();
  assert.equal(calls.filter(([name]) => name === 'quit-and-install').length, 1);
});

test('non-Windows updates retain electron-updater native restart behavior', () => {
  const { calls, restart } = harness('darwin');

  restart();
  assert.deepEqual(calls, [['quit-and-install']]);
});

test('a synchronous updater failure permits retry', () => {
  const { autoUpdater, calls, restart } = harness();
  let attempts = 0;
  autoUpdater.quitAndInstall = () => {
    attempts += 1;
    if (attempts === 1) throw new Error('installer spawn failed');
    calls.push(['quit-and-install', true, true]);
  };

  assert.throws(restart, /installer spawn failed/);

  restart();
  assert.equal(attempts, 2);
  assert.deepEqual(calls, [['quit-and-install', true, true]]);
});
