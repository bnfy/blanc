const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { createWindowsUpdateTrustGate } = require('../../src/main/windows-update-trust');

test('Windows cached completion cannot show Restart Now or install before asynchronous trust; failure retries', { timeout: 5000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-windows-runtime-'));
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  const interval = global.setInterval;
  const ids = ['electron', 'electron-updater', '../../src/main/windows-update-trust', '../../src/main/updater'].map((id) => require.resolve(id));
  const cached = ids.map((id) => require.cache[id]);
  t.after(() => {
    Object.defineProperty(process, 'platform', descriptor); global.setInterval = interval;
    ids.forEach((id, i) => { if (cached[i]) require.cache[id] = cached[i]; else delete require.cache[id]; });
    fs.rmSync(root, { recursive: true, force: true });
  });
  Object.defineProperty(process, 'platform', { value: 'win32' });
  global.setInterval = () => 1;
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: true, getVersion: () => '1.25.0', getPath: () => root });
  const dialogs = [];
  const autoUpdater = new EventEmitter();
  const file = path.join(root, 'cache.exe'); fs.writeFileSync(file, 'synthetic signed bytes');
  let installs = 0;
  let finish;
  let checks = 0;
  Object.assign(autoUpdater, {
    installerPath: file, configOnDisk: { value: Promise.resolve({ publisherName: ['Bananify Creative'] }) },
    checkForUpdates: async () => ({ updateInfo: { version: '1.26.0' } }),
    addQuitHandler: () => {}, install: () => { installs++; return true; },
    quitAndInstall: () => autoUpdater.install(),
  });
  const put = (id, exports) => { require.cache[id] = { id, filename: id, loaded: true, exports }; };
  put(ids[0], { app, BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }, dialog: { showMessageBox: (...args) => { dialogs.push(args.at(-1)); return Promise.resolve({ response: 1 }); } } });
  put(ids[1], { autoUpdater });
  put(ids[2], { createWindowsUpdateTrustGate: (options) => createWindowsUpdateTrustGate({ ...options, verify: () => { checks++; return new Promise((resolve) => { finish = resolve; }); } }) });
  delete require.cache[ids[3]];
  const subject = require(ids[3]); subject.setupAutoUpdater();
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  const info = { version: '1.26.0', downloadedFile: file };
  autoUpdater.emit('update-available', info);
  autoUpdater.emit('update-downloaded', info); // cached path never calls callback
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 0);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  const failed = new Promise((resolve) => autoUpdater.once('error', resolve));
  finish('timeout');
  await failed;
  assert.equal(dialogs.length, 0);
  finish = null;
  autoUpdater.emit('update-available', info); autoUpdater.emit('update-downloaded', info);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  finish(null);
  while (!dialogs.length) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs[0].message, 'Update 1.26.0 downloaded');
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  autoUpdater.emit('update-available', info); autoUpdater.emit('update-downloaded', info);
  while (!autoUpdater.autoInstallOnAppQuit) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 1, 'same ready version does not prompt twice on focus checks');
  assert.equal(checks, 2);
  autoUpdater.quitAndInstall();
  assert.equal(installs, 1);
});
