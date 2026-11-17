'use strict';

// #1591: with "Ask where to save each file" off, a new download is saved
// straight into the Downloads folder under a free name, without the dialog.

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-downloads-auto-save-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} }, shell: {} },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/downloads')];
const downloads = require('../../src/main/downloads');

test.after(() => {
  downloads.setDownloadSavePolicy(null);
  delete require.cache[require.resolve('../../src/main/downloads')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

class FakeItem extends EventEmitter {
  constructor(url, filename, { gesture = true } = {}) {
    super();
    this.url = url;
    this.filename = filename;
    this.gesture = gesture;
    this.savePath = '';
    this.cancelled = 0;
  }
  getURL() { return this.url; }
  getURLChain() { return [this.url]; }
  hasUserGesture() { return this.gesture; }
  getFilename() { return this.filename; }
  getTotalBytes() { return 0; }
  getReceivedBytes() { return 0; }
  getSavePath() { return this.savePath; }
  setSavePath(p) { this.savePath = p; }
  canResume() { return false; }
  resume() {}
  cancel() { this.cancelled += 1; this.emit('done', {}, 'cancelled'); }
}

class FakeSession extends EventEmitter {
  constructor() { super(); this.requested = []; }
  downloadURL(url) { this.requested.push(url); }
  start(item) { this.emit('will-download', { preventDefault() {} }, item, null); return item; }
}

const ses = new FakeSession();
downloads.setupDownloads(ses, () => {}, { private: false });
const privateSes = new FakeSession();
downloads.setupDownloads(privateSes, () => {}, { private: true });

let dir;
test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(userData, 'Downloads-'));
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => dir });
});

const start = (name, session = ses, opts) => session.start(new FakeItem(`https://a.example/${name}`, name, opts));
const rowFor = (item) => downloads.listDownloads().find((d) => d.url === item.url);

test("without a policy no save path is set (today's dialog)", () => {
  downloads.setDownloadSavePolicy(null);
  const item = start('plain.zip');
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('asking on: no save path is set', () => {
  downloads.setDownloadSavePolicy({ askWhereToSave: () => true, folder: () => dir });
  const item = start('asked.zip');
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('asking off: saves into the folder under the suggested name', () => {
  const item = start('one.zip');
  assert.equal(item.savePath, path.join(dir, 'one.zip'));
  item.emit('done', {}, 'completed');
});

test('an existing file is never overwritten', () => {
  fs.writeFileSync(path.join(dir, 'one.zip'), 'mine');
  const item = start('one.zip');
  assert.equal(item.savePath, path.join(dir, 'one (1).zip'));
  item.emit('done', {}, 'completed');
});

test('two downloads of the same name at once get different names', () => {
  const first = start('two.zip');
  const second = start('two.zip');
  assert.equal(first.savePath, path.join(dir, 'two.zip'));
  assert.equal(second.savePath, path.join(dir, 'two (1).zip'));
  first.emit('done', {}, 'completed');
  second.emit('done', {}, 'completed');
});

test('a finished or cancelled download releases its name', () => {
  start('three.zip').cancel();
  const again = start('three.zip');
  assert.equal(again.savePath, path.join(dir, 'three.zip'));
  again.emit('done', {}, 'completed');
});

test('a missing folder falls back to the dialog', () => {
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => path.join(dir, 'gone') });
  const item = start('four.zip');
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('a throwing policy falls back to the dialog', () => {
  downloads.setDownloadSavePolicy({ askWhereToSave: () => { throw new Error('boom'); }, folder: () => dir });
  const item = start('five.zip');
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('a retry keeps its remembered file', () => {
  const item = start('six.zip');
  const original = item.savePath;
  item.emit('updated', {}, 'interrupted');
  const [row] = downloads.listDownloads().filter((d) => d.url === item.url);
  downloads.retryDownload(row.id);
  assert.deepEqual(ses.requested, [item.url]);
  const again = start('six.zip');
  assert.equal(again.savePath, original);
  again.emit('done', {}, 'completed');
  ses.requested.length = 0;
});

test('private downloads follow the same policy', () => {
  const item = start('seven.zip', privateSes);
  assert.equal(item.savePath, path.join(dir, 'seven.zip'));
  item.emit('done', {}, 'completed');
});

test('a download a page starts without a click still asks', () => {
  const item = start('noclick.zip', ses, { gesture: false });
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('Save Image As always asks, once', () => {
  downloads.requestSaveDialog('https://a.example/photo.png');
  const asked = start('photo.png');
  assert.equal(asked.savePath, '');
  asked.emit('done', {}, 'cancelled');
  const next = start('photo.png');
  assert.equal(next.savePath, path.join(dir, 'photo.png'));
  next.emit('done', {}, 'completed');
});

test('a retry keeps its name reserved while it restarts', () => {
  const item = start('eight.zip');
  item.emit('updated', {}, 'interrupted');
  downloads.retryDownload(rowFor(item).id);
  const other = ses.start(new FakeItem('https://b.example/eight.zip', 'eight.zip'));
  assert.equal(other.savePath, path.join(dir, 'eight (1).zip'));
  const again = start('eight.zip');
  assert.equal(again.savePath, path.join(dir, 'eight.zip'));
  other.emit('done', {}, 'completed');
  again.emit('done', {}, 'completed');
  ses.requested.length = 0;
});

test('a retry from the list never overwrites a file now on disk', () => {
  const item = start('nine.zip');
  item.emit('done', {}, 'interrupted');
  fs.writeFileSync(path.join(dir, 'nine.zip'), 'someone else');
  downloads.retryDownload(rowFor(item).id);
  const again = start('nine.zip');
  assert.equal(again.savePath, path.join(dir, 'nine (1).zip'));
  assert.equal(fs.readFileSync(path.join(dir, 'nine.zip'), 'utf8'), 'someone else');
  again.emit('done', {}, 'completed');
  ses.requested.length = 0;
});

test('the downloads list shows the numbered name', () => {
  const first = ses.start(new FakeItem('https://a.example/ten-1', 'ten.zip'));
  const second = ses.start(new FakeItem('https://a.example/ten-2', 'ten.zip'));
  assert.equal(rowFor(first).filename, 'ten.zip');
  assert.equal(rowFor(second).filename, 'ten (1).zip');
  first.emit('done', {}, 'completed');
  second.emit('done', {}, 'completed');
});
