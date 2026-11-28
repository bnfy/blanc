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
  setSaveDialogOptions(options) { this.dialogOptions = options; }
  canResume() { return false; }
  resume() {}
  cancel() { this.cancelled += 1; this.emit('done', {}, 'cancelled'); }
}

class FakeSession extends EventEmitter {
  constructor() { super(); this.requested = []; }
  downloadURL(url) { this.requested.push(url); }
  start(item, requester = page) { this.emit('will-download', { preventDefault() {} }, item, requester); return item; }
}

// The tab the downloads come from. A real click or key press on it allows one
// download to skip Save As; tests click before each download unless they say not to.
const page = new EventEmitter();
downloads.trackDownloadGestures(page);
const press = (type = 'mouseDown', target = page) => target.emit('input-event', {}, { type });

const ses = new FakeSession();
downloads.setupDownloads(ses, () => {}, { private: false });
const privateSes = new FakeSession();
downloads.setupDownloads(privateSes, () => {}, { private: true });

let dir;
test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(userData, 'Downloads-'));
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => dir });
});

const start = (name, session = ses, opts = {}) => {
  if (opts.click !== false) press();
  return session.start(new FakeItem(`https://a.example/${name}`, name, opts));
};
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
  press();
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
  press();
  const first = ses.start(new FakeItem('https://a.example/ten-1', 'ten.zip'));
  press();
  const second = ses.start(new FakeItem('https://a.example/ten-2', 'ten.zip'));
  assert.equal(rowFor(first).filename, 'ten.zip');
  assert.equal(rowFor(second).filename, 'ten (1).zip');
  first.emit('done', {}, 'completed');
  second.emit('done', {}, 'completed');
});

test('the name is held on disk from the moment the download starts', () => {
  const item = start('held.zip');
  assert.equal(fs.existsSync(path.join(dir, 'held.zip')), true);
  item.emit('done', {}, 'completed');
});

test('a cancelled download leaves no empty file behind', () => {
  start('gone.zip').cancel();
  assert.equal(fs.existsSync(path.join(dir, 'gone.zip')), false);
});

test('a finished download keeps its file, even an empty one', () => {
  const item = start('empty.txt');
  item.emit('done', {}, 'completed');
  assert.equal(fs.existsSync(path.join(dir, 'empty.txt')), true);
});

test('a cancelled download never removes a file with something in it', () => {
  const item = start('kept.zip');
  fs.writeFileSync(path.join(dir, 'kept.zip'), 'partial bytes');
  item.cancel();
  assert.equal(fs.readFileSync(path.join(dir, 'kept.zip'), 'utf8'), 'partial bytes');
});

test('a folder Blanc cannot write to falls back to the dialog', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  fs.chmodSync(dir, 0o555);
  try {
    const item = start('locked.zip');
    assert.equal(item.savePath, '');
    item.emit('done', {}, 'cancelled');
  } finally {
    fs.chmodSync(dir, 0o755);
  }
});

test('a retry from the list with no free name asks instead of overwriting', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const item = start('eleven.zip');
  item.emit('done', {}, 'interrupted');
  fs.writeFileSync(path.join(dir, 'eleven.zip'), 'someone else');
  downloads.retryDownload(rowFor(item).id);
  fs.chmodSync(dir, 0o555);
  try {
    // Settings names another folder; Save As still opens where the file was going.
    const elsewhere = fs.mkdtempSync(path.join(userData, 'Elsewhere-'));
    downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => dir, dialogFolder: () => elsewhere });
    const again = start('eleven.zip');
    assert.equal(again.savePath, '');
    assert.deepEqual(again.dialogOptions, { defaultPath: path.join(dir, 'eleven.zip') });
    assert.equal(fs.readFileSync(path.join(dir, 'eleven.zip'), 'utf8'), 'someone else');
    again.emit('done', {}, 'cancelled');
  } finally {
    fs.chmodSync(dir, 0o755);
    ses.requested.length = 0;
  }
});

test('one click allows one download without asking; the next one asks', () => {
  press();
  const first = ses.start(new FakeItem('https://a.example/burst-1', 'burst.zip'));
  const second = ses.start(new FakeItem('https://a.example/burst-2', 'burst.zip'));
  assert.equal(first.savePath, path.join(dir, 'burst.zip'));
  assert.equal(second.savePath, '');
  first.emit('done', {}, 'completed');
  second.emit('done', {}, 'cancelled');
});

test('a key press counts like a click', () => {
  press('rawKeyDown');
  const item = ses.start(new FakeItem('https://a.example/key', 'key.zip'));
  assert.equal(item.savePath, path.join(dir, 'key.zip'));
  item.emit('done', {}, 'completed');
});

test('moving the pointer does not count', () => {
  press('mouseMove');
  const item = ses.start(new FakeItem('https://a.example/move', 'move.zip'));
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('a click on another tab does not count', () => {
  const other = new EventEmitter();
  downloads.trackDownloadGestures(other);
  press('mouseDown', other);
  const item = ses.start(new FakeItem('https://a.example/elsewhere', 'elsewhere.zip'));
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('a download from a tab Blanc does not watch asks', () => {
  const unknown = new EventEmitter();
  press('mouseDown', unknown);
  const item = ses.start(new FakeItem('https://a.example/unknown', 'unknown.zip'), unknown);
  assert.equal(item.savePath, '');
  item.emit('done', {}, 'cancelled');
});

test('a download left to Save As does not use up the click', () => {
  downloads.setDownloadSavePolicy({ askWhereToSave: () => true, folder: () => dir });
  press();
  const asked = ses.start(new FakeItem('https://a.example/kept-1', 'kept-click.zip'));
  assert.equal(asked.savePath, '');
  asked.emit('done', {}, 'cancelled');
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => dir });
  const saved = ses.start(new FakeItem('https://a.example/kept-2', 'kept-click.zip'));
  assert.equal(saved.savePath, path.join(dir, 'kept-click.zip'));
  saved.emit('done', {}, 'completed');
});

test('main hears once that a download is under way, and when it completes', () => {
  const heard = [];
  downloads.setDownloadActivityObserver((event, requester) => heard.push([event, requester === page]));
  try {
    // Saved without asking: under way at once, and a progress update says nothing new.
    const saved = start('peek.zip');
    saved.emit('updated', {}, 'progressing');
    saved.emit('done', {}, 'completed');
    assert.deepEqual(heard, [['started', true], ['completed', true]]);

    // Save As: nothing until it has a file, then once.
    heard.length = 0;
    const asked = start('asked-peek.zip', ses, { click: false });
    assert.equal(asked.savePath, '');
    asked.emit('updated', {}, 'progressing');
    assert.deepEqual(heard, []);
    asked.savePath = path.join(dir, 'chosen.zip');
    asked.emit('updated', {}, 'progressing');
    asked.emit('updated', {}, 'progressing');
    assert.deepEqual(heard, [['started', true]]);
    asked.emit('done', {}, 'cancelled');
    assert.deepEqual(heard, [['started', true]], 'a cancelled download never reports completion');

    // A small file can finish before any update: still started, then completed.
    heard.length = 0;
    const dialogged = start('quick.zip', ses, { click: false });
    dialogged.savePath = path.join(dir, 'quick.zip');
    dialogged.emit('done', {}, 'completed');
    assert.deepEqual(heard, [['started', true], ['completed', true]]);

    // What the observer returned for the start comes back with the completion.
    const contexts = [];
    downloads.setDownloadActivityObserver((event, _requester, context) => {
      contexts.push([event, context]);
      return event === 'started' ? 'window-1' : 'ignored';
    });
    const remembered = start('remembered.zip');
    remembered.emit('done', {}, 'completed');
    assert.deepEqual(contexts, [['started', undefined], ['completed', 'window-1']]);

    // A throwing observer never breaks the download.
    downloads.setDownloadActivityObserver(() => { throw new Error('boom'); });
    const sturdy = start('sturdy.zip');
    sturdy.emit('done', {}, 'completed');
    assert.equal(rowFor(sturdy).state, 'completed');
  } finally {
    downloads.setDownloadActivityObserver(null);
  }
});

// #1780: Save As opens in the folder chosen in Settings.
test('asking on: Save As opens in the chosen folder', () => {
  const chosen = fs.mkdtempSync(path.join(userData, 'Chosen-'));
  downloads.setDownloadSavePolicy({ askWhereToSave: () => true, folder: () => chosen, dialogFolder: () => chosen });
  const item = start('report.pdf');
  assert.equal(item.savePath, '');
  assert.deepEqual(item.dialogOptions, { defaultPath: path.join(chosen, 'report.pdf') });
  item.emit('done', {}, 'cancelled');
});

test('a chosen folder that is gone: Save As keeps its own default', () => {
  const gone = path.join(userData, 'unplugged-drive');
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => gone, dialogFolder: () => gone });
  const item = start('report.pdf');
  // Never another folder unasked: the dialog, with no default of ours.
  assert.equal(item.savePath, '');
  assert.equal(item.dialogOptions, undefined);
  assert.equal(fs.existsSync(gone), false);
  item.emit('done', {}, 'cancelled');
});

test('saved without asking: no dialog options', () => {
  downloads.setDownloadSavePolicy({ askWhereToSave: () => false, folder: () => dir, dialogFolder: () => dir });
  const item = start('quiet.zip');
  assert.equal(item.savePath, path.join(dir, 'quiet.zip'));
  assert.equal(item.dialogOptions, undefined);
  item.emit('done', {}, 'completed');
});
