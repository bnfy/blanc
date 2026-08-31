const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function loadUpdater(fakeUpdater, logsDir) {
  const electronId = require.resolve('electron');
  const electronUpdaterId = require.resolve('electron-updater');
  const subjectId = require.resolve('../../src/main/updater');
  const app = new EventEmitter();
  app.isPackaged = true;
  app.getVersion = () => '1.10.0';
  app.getPath = () => logsDir;
  require.cache[electronId] = {
    id: electronId, filename: electronId, loaded: true,
    exports: {
      app,
      dialog: { showMessageBox: () => Promise.resolve({ response: 1 }) },
      BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    },
  };
  require.cache[electronUpdaterId] = {
    id: electronUpdaterId, filename: electronUpdaterId, loaded: true,
    exports: { autoUpdater: fakeUpdater },
  };
  delete require.cache[subjectId];
  return require(subjectId);
}

test('staging runtime selects the generic feed and records an automated install handoff', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const statusFile = path.join(root, 'status.json');
  const fake = new EventEmitter();
  fake.feed = null;
  fake.installs = [];
  fake.setFeedURL = (feed) => { fake.feed = feed; };
  fake.checkForUpdates = () => Promise.resolve(null);
  fake.quitAndInstall = (...args) => { fake.installs.push(args); };

  const names = [
    'BLANC_UPDATE_CHANNEL', 'BLANC_UPDATE_STAGING_URL', 'BLANC_UPDATE_STAGING_ALLOW_HTTP',
    'BLANC_UPDATE_STAGING_AUTO_INSTALL', 'BLANC_UPDATE_STAGING_STATUS_FILE',
  ];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalSetInterval = global.setInterval;
  t.after(() => {
    global.setInterval = originalSetInterval;
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });
  Object.assign(process.env, {
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:4321/feed',
    BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
    BLANC_UPDATE_STAGING_AUTO_INSTALL: '1',
    BLANC_UPDATE_STAGING_STATUS_FILE: statusFile,
  });
  global.setInterval = () => 1;

  loadUpdater(fake, root).setupAutoUpdater();
  assert.deepEqual(fake.feed, {
    provider: 'generic', url: 'http://127.0.0.1:4321/feed/',
    channel: 'staging', useMultipleRangeRequest: false,
  });
  assert.equal(fake.allowPrerelease, true);
  assert.equal(fake.autoInstallOnAppQuit, false);
  assert.equal(fake.autoRunAppAfterInstall, false);
  fake.emit('update-downloaded', { version: '1.11.0-staging.1' });
  assert.deepEqual(fake.installs, [process.platform === 'darwin' ? [false, false] : []]);
  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  assert.equal(status.phase, 'installing');
  assert.equal(status.updateVersion, '1.11.0-staging.1');
  assert.equal('feedUrl' in status, false);
});
