// Blanc for Android serves shipping's page files unchanged (A1 Task 6):
// tools/android-pages.mjs copies exactly the files listed in
// blanc/android/pages.json from its pinned shipping commit, and --check fails
// on any difference or any file that isn't listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PAGES, PAGES_DIR, pinned} from './android-pages.mjs';

test('the six pages and the iPhone phone layout are listed', () => {
  const {files} = pinned();
  for (const page of ['newtab.html', 'bookmarks.html', 'history.html', 'shortcuts.html', 'error.html', 'mahjong.html',
    'ios-pages.css', 'ios-start-page.css', 'ios-start-page.js', 'ios-start-rules.js'])
    assert.ok(files.includes(page), page);
  for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) assert.ok(files.includes(`strings.${locale}.js`), locale);
  assert.deepEqual(PAGES, ['newtab', 'bookmarks', 'history', 'shortcuts', 'error', 'mahjong']);
});

test('the pin is the current public release, v1.47.1', () => {
  assert.equal(pinned().commit, 'cfd3daa03ad50e6d0d77c402599d94e771d937be');
});

test('the list is flat and sorted, like shipping\'s pages folder', () => {
  const {files} = pinned();
  assert.deepEqual([...files].sort(), files);
  for (const f of files) assert.match(f, /^[\w.-]+$/, f);
});

test('nothing outside the list sits in the folder', () => {
  const {files} = pinned();
  assert.deepEqual(fs.readdirSync(PAGES_DIR).sort(), files);
});

test('every file is the pinned shipping bytes', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./android-pages.mjs', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});
