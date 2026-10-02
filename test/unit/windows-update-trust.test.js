const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BaseUpdater } = require('electron-updater/out/BaseUpdater');
const { createWindowsUpdateTrustGate, installerDigest, installerDigestSync } = require('../../src/main/windows-update-trust');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installer-trust-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'installer.exe');
  fs.writeFileSync(file, 'synthetic installer bytes');
  const app = new EventEmitter();
  app.onQuit = (handler) => app.on('quit', handler);
  const updater = new EventEmitter();
  const installs = [];
  const errors = [];
  updater.on('error', (error) => errors.push(error.message));
  Object.assign(updater, {
    app, _logger: { info() {}, warn() {} }, quitAndInstallCalled: false,
    installerPath: file, configOnDisk: { value: Promise.resolve({ publisherName: ['Bananify Creative'] }) },
    downloadedUpdateHelper: { file, downloadedFileInfo: { isAdminRightsRequired: false } },
    install: BaseUpdater.prototype.install,
    addQuitHandler: BaseUpdater.prototype.addQuitHandler,
    doInstall: (args) => { installs.push(args); return true; },
    dispatchError: (error) => updater.emit('error', error),
  });
  let checks = 0;
  const gate = createWindowsUpdateTrustGate({ autoUpdater: updater, verify: async () => { checks++; return null; }, ...options });
  return { updater, app, installs, errors, gate, file, info: { downloadedFile: file }, checks: () => checks };
}

test('cached bytes receive a new publisher check before upstream quit installation is armed', async (t) => {
  const f = fixture(t);
  f.updater.addQuitHandler(); // upstream cached-download completion does this immediately
  assert.equal(f.app.listenerCount('quit'), 0);
  assert.equal(await f.gate.acceptDownloaded(f.info), null);
  assert.equal(f.checks(), 1);
  assert.equal(f.updater.autoInstallOnAppQuit, true);
  f.app.emit('quit', 0);
  assert.equal(f.installs.length, 1);
  assert.equal(f.installs[0].isSilent, true);
});

test('quit during pending verification cannot install; failure remains retryable', async (t) => {
  let finish;
  const f = fixture(t, { verify: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = f.gate.acceptDownloaded(f.info);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  f.updater.addQuitHandler();
  f.app.emit('quit', 0);
  assert.equal(f.installs.length, 0);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  finish('verifier unavailable');
  assert.equal(await pending, 'verifier unavailable');
  assert.equal(f.updater.install(false, true), false);
  finish = null;
  const retry = f.gate.acceptDownloaded(f.info);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  finish(null);
  assert.equal(await retry, null);
  assert.equal(f.updater.install(false, true), true);
  assert.equal(f.installs.length, 1);
});

test('fresh verification binds bytes and configured publishers; changed bytes cannot install', async (t) => {
  const f = fixture(t);
  assert.equal(await f.gate.verifySignature(['Bananify Creative'], f.file), null);
  assert.equal(await f.gate.acceptDownloaded(f.info), null);
  assert.equal(f.checks(), 1, 'fresh callback proof survives the upstream rename');
  assert.equal(await installerDigest(f.file), installerDigestSync(f.file));
  fs.appendFileSync(f.file, 'changed');
  assert.equal(f.updater.install(false, true), false);
  assert.equal(f.installs.length, 0);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
});

test('missing publisher configuration and changed/missing installer paths never arm installation', async (t) => {
  const f = fixture(t, { readPublishers: async () => undefined });
  assert.match(await f.gate.acceptDownloaded(f.info), /configuration/);
  assert.notEqual(await f.gate.acceptDownloaded({ downloadedFile: 'another.exe' }), null);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.install(false, true), false);
  assert.equal(f.installs.length, 0);
});

test('superseded checks and files changed while PowerShell runs are rejected', async (t) => {
  let finish;
  const f = fixture(t, { verify: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = f.gate.acceptDownloaded(f.info);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  f.gate.invalidate();
  finish(null);
  assert.notEqual(await pending, null);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  const g = fixture(t, { verify: async () => { fs.appendFileSync(g.file, 'race'); return null; } });
  assert.match(await g.gate.acceptDownloaded(g.info), /changed/);
  assert.equal(g.updater.autoInstallOnAppQuit, false);
});

test('staged explicit installation remains available after verification without install-on-quit', async (t) => {
  const f = fixture(t, { installOnQuit: false });
  assert.equal(await f.gate.acceptDownloaded(f.info), null);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.install(true, true), true);
  assert.equal(f.installs[0].isSilent, true);
  assert.equal(f.installs[0].isForceRunAfter, true);
});

test('fresh verification disarms a previously ready installer until downloaded acceptance succeeds', async (t) => {
  let pending = false;
  let finish;
  const f = fixture(t, { verify: async () => pending ? new Promise((resolve) => { finish = resolve; }) : null });
  assert.equal(await f.gate.acceptDownloaded(f.info), null);
  assert.equal(f.updater.autoInstallOnAppQuit, true);
  pending = true;
  const checking = f.gate.verifySignature(['Bananify Creative'], f.file);
  assert.equal(f.updater.autoInstallOnAppQuit, false, 'disarmed synchronously before file reads or PowerShell');
  f.app.emit('quit', 0);
  assert.equal(f.installs.length, 0);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  finish(null);
  assert.equal(await checking, null);
  assert.equal(f.updater.autoInstallOnAppQuit, false, 'verification alone never arms installation');
  assert.equal(await f.gate.acceptDownloaded(f.info), null);
  f.app.emit('quit', 0);
  assert.equal(f.installs.length, 1);
});
