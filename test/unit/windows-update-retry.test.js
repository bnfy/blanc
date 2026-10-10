const { englishT } = require('../support/english-t');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { BaseUpdater } = require('electron-updater/out/BaseUpdater');
const { DownloadedUpdateHelper } = require('electron-updater/out/DownloadedUpdateHelper');
const { createWindowsUpdateTrustGate } = require('../../src/main/windows-update-trust');

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'updater transition timed out');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Real locked cache selection, download completion, synchronous installation,
// quit handler and restart action; only the network, signature and NSIS are fake.
async function fixture(t, { corrupt = false, firstRejection = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-update-retry-'));
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const interval = global.setInterval;
  const ids = ['electron', 'electron-updater', '../../src/main/windows-update-trust', '../../src/main/updater'].map(require.resolve);
  const cached = ids.map((id) => require.cache[id]);
  t.after(() => {
    Object.defineProperty(process, 'platform', platform);
    global.setInterval = interval;
    ids.forEach((id, i) => { if (cached[i]) require.cache[id] = cached[i]; else delete require.cache[id]; });
    fs.rmSync(root, { recursive: true, force: true });
  });
  Object.defineProperty(process, 'platform', { value: 'win32' });
  global.setInterval = () => 1;
  const helper = new DownloadedUpdateHelper(path.join(root, 'cache'));
  fs.mkdirSync(helper.cacheDirForPendingUpdate, { recursive: true });
  const file = path.join(helper.cacheDirForPendingUpdate, 'installer.exe');
  const bytes = 'synthetic valid signed installer';
  fs.writeFileSync(file, bytes);
  const info = { version: '1.26.0' };
  const fileInfo = { url: new URL('https://updates.example.test/installer.exe'), info: {
    url: 'installer.exe', sha512: crypto.createHash('sha512').update(bytes).digest('base64'),
  } };
  await helper.setDownloadedFile(file, null, info, fileInfo, 'installer.exe', true);
  if (corrupt) fs.writeFileSync(file, 'corrupted cached bytes');
  const app = new EventEmitter();
  let quits = 0;
  Object.assign(app, { isPackaged: true, getVersion: () => '1.25.0', getPath: () => root,
    onQuit: (handler) => app.on('quit', handler), quit: () => { quits++; app.emit('quit', 0); } });
  const updater = new EventEmitter();
  const errors = [];
  const installs = [];
  const dialogs = [];
  let downloads = 0;
  let checks = 0;
  let signatureChecks = 0;
  let choice = 1;
  let gate;
  Object.assign(updater, {
    app, _logger: { info() {}, warn() {}, debug() {} }, quitAndInstallCalled: false,
    downloadedUpdateHelper: helper, configOnDisk: { value: Promise.resolve({ publisherName: ['Bananify Creative'] }) },
    getOrCreateDownloadHelper: async () => helper,
    install: BaseUpdater.prototype.install, addQuitHandler: BaseUpdater.prototype.addQuitHandler,
    quitAndInstall: BaseUpdater.prototype.quitAndInstall,
    dispatchUpdateDownloaded: (event) => updater.emit('update-downloaded', event),
    dispatchError: (error) => updater.emit('error', error),
    doInstall: (options) => { installs.push(options); return true; },
    checkForUpdates: async () => {
      checks++;
      updater.emit('update-available', info);
      const downloadPromise = BaseUpdater.prototype.executeDownload.call(updater, {
        fileExtension: 'exe', fileInfo,
        downloadUpdateOptions: { requestHeaders: {}, updateInfoAndProvider: { info } },
        task: async (destination) => {
          downloads++; fs.writeFileSync(destination, bytes);
          const rejection = await updater.verifyUpdateCodeSignature(['Bananify Creative'], destination);
          if (rejection !== null) throw new Error(rejection);
        },
      }).catch((error) => updater.emit('error', error));
      return { updateInfo: info, downloadPromise };
    },
  });
  Object.defineProperty(updater, 'installerPath', Object.getOwnPropertyDescriptor(BaseUpdater.prototype, 'installerPath'));
  updater.on('error', (error) => errors.push(error.message));
  const put = (id, exports) => { require.cache[id] = { id, filename: id, loaded: true, exports }; };
  put(ids[0], { app, autoUpdater: new EventEmitter(), BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    dialog: { showMessageBox: (...args) => { dialogs.push(args.at(-1)); return Promise.resolve({ response: choice }); } } });
  put(ids[1], { autoUpdater: updater });
  put(ids[2], { createWindowsUpdateTrustGate: (options) => {
    gate = createWindowsUpdateTrustGate({ ...options, verify: async (_publishers, installer) => {
      signatureChecks++;
      if (signatureChecks === 1 && firstRejection) return firstRejection;
      return fs.readFileSync(installer, 'utf8') === bytes ? null : 'installer signature is not valid (status 3)';
    } });
    return gate;
  } });
  delete require.cache[ids[3]];
  const subject = require(ids[3]);
  subject.setupAutoUpdater({ t: englishT });
  return { subject, updater, helper, file, bytes, errors, installs, dialogs, gate,
    chooseRestart: () => { choice = 0; }, downloads: () => downloads,
    checks: () => checks, quits: () => quits, signatureChecks: () => signatureChecks };
}

test('Restart Now recovers after changed bytes, waits for cleanup, redownloads and preserves NSIS handoff', async (t) => {
  const f = await fixture(t);
  await until(() => f.gate.isReady() && f.dialogs.length);
  assert.equal(f.downloads(), 0, 'first completion uses the in-process cache');
  let release;
  const clear = f.helper.clear.bind(f.helper);
  f.helper.clear = async () => { await new Promise((resolve) => { release = resolve; }); await clear(); };
  fs.writeFileSync(f.file, 'corrupted after readiness');
  f.chooseRestart();
  await f.subject.checkForUpdatesManually();
  await until(() => release && f.errors.length);
  assert.equal(f.installs.length, 0);
  assert.equal(f.gate.isReady(), false);
  const retry = f.subject.checkForUpdatesManually();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.checks(), 1, 'metadata/download cannot race cache deletion');
  release();
  await retry;
  await until(() => f.quits() === 1);
  assert.equal(f.downloads(), 1);
  assert.equal(f.installs.length, 1, 'the retry reaches the previously latched restart action');
  assert.equal(f.installs[0].isSilent, true);
  assert.equal(f.installs[0].isForceRunAfter, true);
  await f.subject.checkForUpdatesManually();
  assert.equal(f.installs.length, 1, 'successful handoff stays idempotent');
});

test('corrupted in-process cache is evicted and the next check downloads a verified replacement', async (t) => {
  const f = await fixture(t, { corrupt: true });
  await until(() => f.errors.length);
  assert.match(f.errors[0], /checksum changed/);
  assert.equal(f.helper.file, null);
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(f.downloads(), 0);
  await f.subject.checkForUpdatesManually();
  await until(() => f.gate.isReady());
  assert.equal(f.downloads(), 1);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.bytes);
});

test('definitively untrusted cached signatures force a download on retry', async (t) => {
  const f = await fixture(t, { firstRejection: 'installer signed by an unexpected publisher' });
  await until(() => f.errors.length);
  assert.equal(f.helper.file, null);
  await f.subject.checkForUpdatesManually();
  await until(() => f.gate.isReady());
  assert.equal(f.downloads(), 1);
});

test('temporary verifier failure retains valid cached bytes and rechecks them on retry', async (t) => {
  const f = await fixture(t, { firstRejection: 'installer publisher could not be verified; retry Check for Updates' });
  await until(() => f.errors.length);
  assert.equal(f.helper.file, f.file);
  assert.equal(fs.readFileSync(f.file, 'utf8'), f.bytes);
  await f.subject.checkForUpdatesManually();
  await until(() => f.gate.isReady());
  assert.equal(f.downloads(), 0);
  assert.equal(f.signatureChecks(), 2);
});
