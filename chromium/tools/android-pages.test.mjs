// Blanc for Android serves shipping's page files unchanged (A1 Task 6):
// tools/android-pages.mjs copies exactly the files listed in
// blanc/android/pages.json from its pinned shipping commit, and the desktop
// fork's Start Page from this tree (A5b), and --check fails on any difference
// or any file that isn't listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PAGES, PAGES_DIR, START_DIR, pinned} from './android-pages.mjs';

test('the six pages and the iPhone phone layout are listed', () => {
  const {files, start} = pinned();
  for (const page of ['bookmarks.html', 'history.html', 'shortcuts.html', 'error.html', 'mahjong.html', 'ios-pages.css'])
    assert.ok(files.includes(page), page);
  // The Start Page is the fork's, not shipping's.
  assert.equal(start.from, 'blanc/island/pages');
  for (const file of ['newtab.html', 'newtab.js', 'newtab-adapter.js', 'newtab-prototype.css', 'pages.css', 'strings.js'])
    assert.ok(start.files.includes(file), file);
  for (const file of ['newtab.html', 'newtab.js', 'ios-start-page.css', 'ios-start-page.js', 'ios-start-rules.js'])
    assert.ok(!files.includes(file), `shipping's ${file} is gone`);
  for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) assert.ok(files.includes(`strings.${locale}.js`), locale);
  assert.deepEqual(PAGES, ['newtab', 'bookmarks', 'history', 'shortcuts', 'error', 'mahjong']);
});

test('the pin is the current public release, v1.47.1', () => {
  assert.equal(pinned().commit, 'cfd3daa03ad50e6d0d77c402599d94e771d937be');
});

test('the lists are flat and sorted, like shipping\'s pages folder', () => {
  const {files, start} = pinned();
  for (const list of [files, start.files]) {
    assert.deepEqual([...list].sort(), list);
    for (const f of list) assert.match(f, /^[\w.-]+$/, f);
  }
});

test('nothing outside the lists sits in the folders', () => {
  const {files, start} = pinned();
  assert.deepEqual(fs.readdirSync(PAGES_DIR).sort(), [...files, ...start.alongside.map(a => a.file), 'start'].sort());
  assert.deepEqual(fs.readdirSync(START_DIR).sort(), start.files);
});

// Every file the fork's Start Page names (scripts, stylesheets, images, fonts), in its own folder,
// is served from start/; a file it names that this list leaves out would fail to load.
test('the Start Page list holds every file the fork\'s page names', () => {
  const {start} = pinned();
  const from = path.join(path.dirname(PAGES_DIR), '../..', start.from);
  const named = new Set();
  for (const file of start.files.filter(f => /\.(html|js|css)$/.test(f)))
    for (const [ref] of fs.readFileSync(path.join(START_DIR, file), 'utf8').matchAll(/[\w.-]+\.(png|woff2|webp|svg|jpg|js|css)\b/g))
      if (fs.existsSync(path.join(from, ref))) named.add(ref);
  // Named in comments or by desktop code paths Android never takes.
  for (const unused of ['mahjong.css', 'pages-neutral.css', 'sheet.js']) named.delete(unused);
  assert.deepEqual([...named].filter(f => !start.files.includes(f)), []);
});

test('every file is the pinned shipping bytes', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./android-pages.mjs', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});
