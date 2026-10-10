const { englishT: t } = require('../support/english-t');
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const electronId = require.resolve('electron');
const electronUpdaterId = require.resolve('electron-updater');
const policyId = require.resolve('../../src/main/updater-policy');
const updaterId = require.resolve('../../src/main/updater');
const originals = [electronId, electronUpdaterId, policyId].map((id) => [id, require.cache[id]]);

const app = new EventEmitter();
app.isPackaged = true;
app.getVersion = () => '1.27.0';
app.getPath = () => { throw new Error('a Flatpak launch must not create an updater log'); };

const dialogs = [];
const autoUpdater = new EventEmitter();
let checkCount = 0;
autoUpdater.checkForUpdates = async () => { checkCount += 1; return null; };

const stub = (id, exports) => { require.cache[id] = { id, filename: id, loaded: true, exports }; };
stub(electronId, {
  app,
  dialog: { showMessageBox: (...args) => { dialogs.push(args.at(-1)); return Promise.resolve({ response: 0 }); } },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
});
stub(electronUpdaterId, { autoUpdater });
// Resolve through the real policy, pinned to a Linux Flatpak sandbox.
const realPolicy = (() => { delete require.cache[policyId]; return require(policyId); })();
stub(policyId, {
  ...realPolicy,
  resolveUpdaterPolicy: (options) => realPolicy.resolveUpdaterPolicy({
    ...options, env: { BLANC_UPDATE_CHANNEL: 'flatpak' }, platform: 'linux', isFlatpak: () => true,
  }),
});
delete require.cache[updaterId];
const updater = require(updaterId);

test.after(() => {
  delete require.cache[updaterId];
  for (const [id, original] of originals) {
    if (original) require.cache[id] = original;
    else delete require.cache[id];
  }
});

test('a Flatpak launch never checks, and a manual check points to Flatpak', async () => {
  updater.setupAutoUpdater({ t });
  await updater.checkForUpdatesManually();

  assert.equal(checkCount, 0);
  assert.equal(app.listenerCount('browser-window-focus'), 0);
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].type, 'info');
  assert.equal(dialogs[0].message, 'Flatpak keeps Blanc up to date');
  assert.match(dialogs[0].detail, /flatpak update/);
});
