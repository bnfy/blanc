'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-downloads-resume-'));
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
  delete require.cache[require.resolve('../../src/main/downloads')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

class FakeItem extends EventEmitter {
  constructor(url, { resumable = true } = {}) {
    super();
    this.url = url;
    this.resumable = resumable;
    this.savePath = '';
    this.received = 0;
    this.resumed = 0;
    this.cancelled = 0;
  }
  getURL() { return this.url; }
  getFilename() { return 'Branding.zip'; }
  getTotalBytes() { return 0; }
  getReceivedBytes() { return this.received; }
  getSavePath() { return this.savePath; }
  setSavePath(p) { this.savePath = p; }
  canResume() { return this.resumable; }
  resume() { this.resumed += 1; this.emit('updated', {}, 'progressing'); }
  cancel() { this.cancelled += 1; this.emit('done', {}, 'cancelled'); }
}

class FakeSession extends EventEmitter {
  constructor() { super(); this.requested = []; }
  downloadURL(url) { this.requested.push(url); }
  start(item) { this.emit('will-download', { preventDefault() {} }, item, null); return item; }
}

const ses = new FakeSession();
downloads.setupDownloads(ses, () => {}, { private: false });
const byUrl = (url) => downloads.listDownloads().filter((d) => d.url === url);

test('a resumable interruption offers Resume and continues the same item', () => {
  const item = ses.start(new FakeItem('https://a.example/one.zip'));
  item.savePath = '/tmp/one.zip';
  item.emit('updated', {}, 'interrupted');

  const [row] = byUrl(item.url);
  assert.equal(row.state, 'interrupted');
  assert.equal(row.canResume, true);

  downloads.resumeDownload(row.id);
  assert.equal(item.resumed, 1);
  assert.equal(byUrl(item.url)[0].state, 'progressing');
  assert.deepEqual(ses.requested, []);
  item.emit('done', {}, 'completed');
});

test('an interruption that cannot resume is retried as a fresh download to the same file', () => {
  const item = ses.start(new FakeItem('https://b.example/two.zip', { resumable: false }));
  item.savePath = '/tmp/two.zip';
  item.emit('updated', {}, 'interrupted');
  const [row] = byUrl(item.url);
  assert.equal(row.canResume, false);

  downloads.retryDownload(row.id);
  assert.equal(item.cancelled, 1);
  assert.deepEqual(ses.requested, [item.url]);
  // The stale row is replaced, not left behind as a cancelled entry.
  assert.deepEqual(byUrl(item.url), []);

  const again = ses.start(new FakeItem(item.url));
  assert.equal(again.savePath, '/tmp/two.zip');
  assert.equal(byUrl(item.url).length, 1);
  again.emit('done', {}, 'completed');
  ses.requested.length = 0;
});

test('a finished interrupted download is retried from the list and its old row removed', () => {
  const item = ses.start(new FakeItem('https://c.example/three.zip'));
  item.savePath = '/tmp/three.zip';
  item.emit('done', {}, 'interrupted');
  const [row] = byUrl(item.url);
  assert.equal(row.state, 'interrupted');
  assert.equal(row.canResume, false);

  downloads.retryDownload(row.id);
  assert.deepEqual(ses.requested, [item.url]);
  assert.deepEqual(byUrl(item.url), []);
  ses.requested.length = 0;
});

test('resume and retry ignore unknown ids and non-interrupted rows', () => {
  const item = ses.start(new FakeItem('https://d.example/four.zip'));
  const [row] = byUrl(item.url);
  downloads.resumeDownload(row.id);
  downloads.retryDownload(row.id);
  downloads.retryDownload('nope');
  assert.equal(item.resumed, 0);
  assert.equal(item.cancelled, 0);
  assert.deepEqual(ses.requested, []);
  item.emit('done', {}, 'completed');
});
