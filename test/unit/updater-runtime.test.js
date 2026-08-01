const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checks = 0;
    this.feed = null;
    this.installs = [];
    this.allowPrerelease = false;
    this.autoInstallOnAppQuit = true;
    this.autoRunAppAfterInstall = true;
  }

  setFeedURL(feed) { this.feed = feed; }
  checkForUpdates() { this.checks += 1; return Promise.resolve(null); }
  quitAndInstall(...args) { this.installs.push(args); }
}

function loadUpdater(fakeUpdater) {
  const electronId = require.resolve('electron');
  const electronUpdaterId = require.resolve('electron-updater');
  const subjectId = require.resolve('../../src/main/updater');
  require.cache[electronId] = {
    id: electronId,
    filename: electronId,
    loaded: true,
    exports: {
      app: { isPackaged: true, getVersion: () => '1.0.0' },
      dialog: { showMessageBox: () => Promise.resolve({ response: 1 }) },
      BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    },
  };
  require.cache[electronUpdaterId] = {
    id: electronUpdaterId,
    filename: electronUpdaterId,
    loaded: true,
    exports: { autoUpdater: fakeUpdater },
  };
  delete require.cache[subjectId];
  return require(subjectId);
}

function withUpdaterEnv(values, fn) {
  const names = [
    'BLANC_UPDATE_CHANNEL',
    'BLANC_UPDATE_STAGING_URL',
    'BLANC_UPDATE_STAGING_ALLOW_HTTP',
    'BLANC_UPDATE_STAGING_AUTO_INSTALL',
    'BLANC_UPDATE_STAGING_STATUS_FILE',
  ];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalSetInterval = global.setInterval;
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);
    global.setInterval = () => ({ unref() {} });
    return fn();
  } finally {
    global.setInterval = originalSetInterval;
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
}

test('ordinary runtime checks the embedded production feed without overriding it', () => {
  const fake = new FakeUpdater();
  withUpdaterEnv({}, () => loadUpdater(fake).setupAutoUpdater());
  assert.equal(fake.checks, 1);
  assert.equal(fake.feed, null);
  assert.equal(fake.allowPrerelease, false);
});

test('invalid staging configuration disables checks instead of touching production', () => {
  const fake = new FakeUpdater();
  withUpdaterEnv({ BLANC_UPDATE_CHANNEL: 'staging' }, () => {
    loadUpdater(fake).setupAutoUpdater();
  });
  assert.equal(fake.checks, 0);
  assert.equal(fake.feed, null);
});

test('staging automation selects the generic channel and records install handoff', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-updater-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const statusFile = path.join(root, 'status.json');
  const fake = new FakeUpdater();

  withUpdaterEnv({
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: 'http://127.0.0.1:4321/feed',
    BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
    BLANC_UPDATE_STAGING_AUTO_INSTALL: '1',
    BLANC_UPDATE_STAGING_STATUS_FILE: statusFile,
  }, () => {
    loadUpdater(fake).setupAutoUpdater();
    assert.deepEqual(fake.feed, {
      provider: 'generic',
      url: 'http://127.0.0.1:4321/feed/',
      channel: 'staging',
      useMultipleRangeRequest: false,
    });
    assert.equal(fake.allowPrerelease, true);
    assert.equal(fake.autoInstallOnAppQuit, false);
    assert.equal(fake.autoRunAppAfterInstall, false);

    fake.emit('update-downloaded', { version: '1.0.1-staging.1' });
  });

  assert.deepEqual(fake.installs, [[false, false]]);
  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  assert.equal(status.phase, 'installing');
  assert.equal(status.currentVersion, '1.0.0');
  assert.equal(status.updateVersion, '1.0.1-staging.1');
  assert.equal(Number.isNaN(Date.parse(status.at)), false);
});
