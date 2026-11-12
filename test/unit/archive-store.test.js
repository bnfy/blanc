'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { waitForJson } = require('./support/wait-for-json');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-archive-store-'));
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => userData, on: () => {} } },
};

delete require.cache[require.resolve('../../src/main/store')];
delete require.cache[require.resolve('../../src/main/archive')];
const archive = require('../../src/main/archive');
const { withLocalProfile } = require('../../src/main/local-profile-context');
const { ARCHIVE_TTL_MS } = require('../../src/main/tab-archive');

const NOW = 1_800_000_000_000;
const entry = (id, url, archivedAt, extra = {}) => ({
  id, url, title: `Title ${id}`, favicon: null, archivedAt, lastViewedAt: archivedAt - 1, ...extra,
});

test.after(() => {
  archive.flushArchive();
  delete require.cache[require.resolve('../../src/main/archive')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
  fs.rmSync(userData, { recursive: true, force: true });
});

test('adds and lists newest first', () => {
  archive.clearArchive();
  archive.addEntries([entry('a', 'https://a.test/', NOW - 2)], NOW);
  archive.addEntries([entry('b', 'https://b.test/', NOW - 1)], NOW);
  assert.deepEqual(archive.listArchive({ now: NOW }).map((e) => e.id), ['b', 'a']);
});

test('lists only projected fields and can be searched', () => {
  archive.clearArchive();
  archive.addEntries([
    entry('a', 'https://news.test/', NOW, { customTitle: 'Morning' }),
    entry('b', 'https://maps.test/', NOW),
  ], NOW);
  const [row] = archive.listArchive({ query: 'morning', now: NOW });
  assert.deepEqual(Object.keys(row).sort(), ['archivedAt', 'favicon', 'id', 'spaceName', 'title', 'url']);
  assert.equal(row.title, 'Morning');
});

test('keeps two entries for the same URL', () => {
  archive.clearArchive();
  archive.addEntries([entry('a', 'https://same.test/', NOW), entry('b', 'https://same.test/', NOW - 1)], NOW);
  assert.equal(archive.listArchive({ now: NOW }).length, 2);
});

test('takeEntry returns the entry once and null the second time', () => {
  archive.clearArchive();
  archive.addEntries([entry('a', 'https://a.test/', NOW, { customTitle: 'Mine' })], NOW);
  const taken = archive.takeEntry('a');
  assert.equal(taken.url, 'https://a.test/');
  assert.equal(taken.customTitle, 'Mine');
  assert.equal(archive.takeEntry('a'), null);
  assert.equal(archive.takeEntry(42), null);
  assert.deepEqual(archive.listArchive({ now: NOW }), []);
});

test('forgetEntry removes one entry and reports whether it existed', () => {
  archive.clearArchive();
  archive.addEntries([entry('a', 'https://a.test/', NOW), entry('b', 'https://b.test/', NOW)], NOW);
  assert.equal(archive.forgetEntry('a'), true);
  assert.equal(archive.forgetEntry('a'), false);
  assert.deepEqual(archive.listArchive({ now: NOW }).map((e) => e.id), ['b']);
});

test('listArchive drops entries past 30 days', () => {
  archive.clearArchive();
  archive.addEntries([entry('old', 'https://a.test/', NOW - ARCHIVE_TTL_MS - 1), entry('new', 'https://b.test/', NOW)], NOW);
  assert.deepEqual(archive.listArchive({ now: NOW }).map((e) => e.id), ['new']);
});

test('clearArchive empties the file', async () => {
  archive.addEntries([entry('a', 'https://a.test/', NOW)], NOW);
  archive.clearArchive();
  const file = path.join(userData, 'archive.json');
  const saved = await waitForJson(file, (d) => Array.isArray(d.entries) && d.entries.length === 0);
  assert.equal(saved.version, 1);
});

test('a named profile writes under profiles/<id>/archive.json', async () => {
  const id = 'profile_archive';
  await withLocalProfile(id, async () => {
    archive.clearArchive();
    archive.addEntries([entry('p', 'https://profile.test/', NOW)], NOW);
    archive.flushArchive();
  });
  const file = path.join(userData, 'profiles', id, 'archive.json');
  const saved = await waitForJson(file, (d) => d.entries?.length === 1);
  assert.equal(saved.entries[0].url, 'https://profile.test/');
  assert.equal(archive.listArchive({ now: NOW }).some((e) => e.id === 'p'), false, 'Personal does not see it');
});

// Spec §2.7 / invariant 4: every user path that clears history also empties
// the Archive. main.js owns both paths: the ⌘L /clear handler and the History
// page's onHistoryCleared hook.
test('every history-clear path in main.js also clears the Archive', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const clearHandler = src.match(/chromeHandle\('chrome:history-clear', \(\) => \{[\s\S]*?\n {2}\}\);/)?.[0];
  assert.ok(clearHandler, 'chrome:history-clear handler not found');
  assert.match(clearHandler, /archive\.clearArchive\(\)/);
  const pageHook = src.match(/onHistoryCleared: \(\) => \{[\s\S]*?\n {4}\},/)?.[0];
  assert.ok(pageHook, 'onHistoryCleared hook not found');
  assert.match(pageHook, /archive\.clearArchive\(\)/);
});

// Spec D6: the one-time first-archive notice lives beside the entries, so it
// is per local profile and, like the Archive, never synced.
test('the first-archive notice is recorded once and gone for good once finished', () => {
  archive.clearArchive();
  archive.resetNoticeForTest();
  assert.equal(archive.pendingNotice(), null);
  archive.noteArchived(0);
  assert.equal(archive.pendingNotice(), null, 'a sweep that archived nothing records nothing');
  archive.noteArchived(2);
  archive.noteArchived(1);
  assert.deepEqual(archive.pendingNotice(), { count: 3 });
  assert.equal(archive.finishNotice(), true);
  assert.equal(archive.pendingNotice(), null);
  archive.noteArchived(4);
  assert.equal(archive.pendingNotice(), null, 'never shown again');
  assert.equal(archive.finishNotice(), false);
});

test('clearing the Archive drops an unseen notice but keeps a finished one', () => {
  archive.resetNoticeForTest();
  archive.noteArchived(2);
  archive.clearArchive();
  assert.equal(archive.pendingNotice(), null, 'nothing left to view');
  archive.noteArchived(1);
  assert.deepEqual(archive.pendingNotice(), { count: 1 }, 'the next archive is still a first');
  archive.finishNotice();
  archive.clearArchive();
  archive.noteArchived(1);
  assert.equal(archive.pendingNotice(), null);
});

test("a named profile's notice is its own", async () => {
  archive.resetNoticeForTest();
  const id = 'profile_notice';
  await withLocalProfile(id, async () => {
    archive.resetNoticeForTest();
    archive.noteArchived(2);
    assert.deepEqual(archive.pendingNotice(), { count: 2 });
    archive.flushArchive();
  });
  assert.equal(archive.pendingNotice(), null, 'Personal has none');
  const saved = await waitForJson(path.join(userData, 'profiles', id, 'archive.json'),
    (d) => d.notice?.state === 'pending');
  assert.deepEqual(saved.notice, { state: 'pending', count: 2 });
});
