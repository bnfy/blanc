const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-download-events-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: { getPath: () => userData, on: () => {} },
    shell: { openPath: () => {}, showItemInFolder: () => {} },
  },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/downloads')];
const { setupDownloads } = require('../../src/main/downloads');

test.after(() => {
  delete require.cache[require.resolve('../../src/main/downloads')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

class DownloadItem extends EventEmitter {
  getURL() { return 'https://download.example/file.zip'; }
  getFilename() { return 'file.zip'; }
  getSavePath() { return ''; }
  getReceivedBytes() { return 0; }
  getTotalBytes() { return 100; }
}

test('download change notices coalesce affected local profiles', async () => {
  const notices = [];
  const personal = new EventEmitter();
  const work = new EventEmitter();
  const notify = (profileIds) => notices.push(profileIds);
  setupDownloads(personal, notify, { profileId: 'default' });
  setupDownloads(work, notify, { profileId: 'work' });

  personal.emit('will-download', {}, new DownloadItem());
  work.emit('will-download', {}, new DownloadItem());
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(notices.length, 1);
  assert.deepEqual(new Set(notices[0]), new Set(['default', 'work']));
});

test('Downloads uses its profile-targeted event bridge instead of polling', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

  const main = read('src/main/main.js');
  const preload = read('src/main/tab-preload.js');
  const page = read('src/renderer/pages/downloads.js');

  assert.match(main, /affectedProfiles/);
  assert.match(main, /pages:downloads:changed/);
  assert.match(preload, /onChanged: \(callback\)/);
  assert.match(preload, /pages:downloads:changed/);
  assert.match(page, /downloads\.onChanged\(refresh\)/);
  assert.doesNotMatch(page, /setInterval\(/);
});
