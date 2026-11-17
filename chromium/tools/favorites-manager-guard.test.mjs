// Shipping's Favorites manager (F63, bnfy/blanc#1590 at b76337fcd) draws nested folders as a
// tree. The fork's Favorites pages are still the flat list (D40 in spec/divergence-register.md),
// so until the fork adopts the tree every pin that reaches past #1590 must keep the fork flat:
//  - the Sync bundle turns the manager's two behaviors off (bookmarks.setManagerLive(false)),
//    so emptied folders and import's full paths never make entries a flat page can't show;
//  - a sheet page that loads the manager's scripts gets them served (SHEET_FILES, pages.json);
//  - a host reports `tree: true` exactly when its Favorites page is the manager's.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {bundle, MANAGER_OFF} from './build-sync-bundle.mjs';
import {SHEET_FILES} from './island-renderer.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const chromium = path.resolve(here, '..');
const root = path.resolve(chromium, '..');
const {peer} = require('../tests/android/support/sync-peer.cjs');

const MANAGER = 'b76337fcd';
const MANAGER_FILES = ['favorites-manager-model.js', 'favorites-manager.js'];
const read = file => fs.readFileSync(path.join(chromium, file), 'utf8');
const show = (ref, file) => execFileSync('git', ['-C', root, 'show', `${ref}:${file}`], {encoding: 'utf8', maxBuffer: 1e8});
const tracker = JSON.parse(read('tracker.json'));
const bundleTag = tracker.bundleTag ?? tracker.shippingTag;

// Whether `ref` includes #1590. Fails rather than answering no when the commit isn't here.
function hasManager(ref) {
  try { execFileSync('git', ['-C', root, 'cat-file', '-e', `${MANAGER}^{commit}`], {stdio: 'ignore'}); }
  catch { assert.fail(`${MANAGER} (bnfy/blanc#1590) is missing: fetch main`); }
  try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', MANAGER, ref], {stdio: 'ignore'}); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}
const loads = (html, file) => new RegExp(`<script src="${file.replace(/\./g, '\\.')}"`).test(html);

test('a Sync bundle with the Favorites manager turns it off before Sync starts', () => {
  const text = bundle(MANAGER);
  const off = text.indexOf(MANAGER_OFF);
  assert.ok(off > 0, 'the call is in the bundle');
  assert.equal(text.indexOf(MANAGER_OFF, off + 1), -1, 'once');
  assert.ok(off < text.indexOf("__require('src/main/sync.js').init();"), 'before Sync starts');
});

test('in that bundle a folder that loses its last favorite goes, as the flat page expects', () => {
  const source = bundle(MANAGER);
  const folders = live => {
    const device = peer('guard', 'http://127.0.0.1:1', {source});
    const bookmarks = device.module('bookmarks');
    if (live) bookmarks.setManagerLive(true);
    assert.deepEqual({...bookmarks.saveFavorite('https://example.org/a', 'A', undefined, 'Work › Reading')}, {ok: true});
    bookmarks.removeBookmark([...bookmarks.listBookmarks()][0].id);
    return bookmarks.getTree().children.length;
  };
  assert.equal(folders(true), 1, 'positive control: the manager keeps the emptied folder');
  assert.equal(folders(false), 0);
});

test('the pinned Sync bundle turns the manager off whenever its tag has it', () => {
  const has = /\bsetManagerLive\b/.test(show(bundleTag, 'src/main/bookmarks.js'));
  if (hasManager(bundleTag)) assert.ok(has, `${bundleTag} includes #1590 but its bookmarks.js has no setManagerLive: update the call in build-sync-bundle.mjs`);
  const text = read('blanc/services/sync_runner/generated/sync-bundle.js');
  assert.equal(text.includes(MANAGER_OFF), has, bundleTag);
});

test('shipping\'s Favorites page loads the manager\'s scripts from #1590 on', () => {
  const html = show(MANAGER, 'src/renderer/pages/bookmarks.html');
  for (const file of MANAGER_FILES) assert.ok(loads(html, file), file);
});

test('a fork Favorites page that loads the manager\'s scripts has them served', () => {
  const island = read('blanc/island/pages/bookmarks.html');
  const android = read('blanc/android/pages/bookmarks.html');
  const androidFiles = JSON.parse(read('blanc/android/pages.json')).files;
  for (const file of MANAGER_FILES) {
    assert.equal(SHEET_FILES.includes(`pages/${file}`), loads(island, file), `desktop sheet: ${file}`);
    assert.equal(androidFiles.includes(file), loads(android, file), `Android: ${file}`);
  }
});

test('a fork host reports the tree exactly when its Favorites page is the manager\'s', () => {
  const manager = page => /capabilities\.tree === true/.test(page);
  const desktopPage = read('blanc/island/pages/bookmarks.js');
  const androidPage = read('blanc/android/pages/bookmarks.js');
  for (const page of [desktopPage, androidPage]) assert.match(page, /bowserPages\.bookmarks\.capabilities\(\)/);
  // The desktop sheet's bridge (island/host.js) and Android's native page handler.
  const desktop = /if \(page === 'bookmarks'\)[\s\S]*?capabilities: async \(\) => \(\{([^}]*)\}\)/.exec(read('blanc/island/host.js'));
  const android = /method == "bookmarks\.capabilities"\)([^;]*);/.exec(read('blanc/android/browser/blanc_pages_ui.cc'));
  assert.ok(desktop && android, 'both answers found');
  assert.equal(/\btree\s*:\s*true\b/.test(desktop[1]), manager(desktopPage), `desktop: ${desktop[1]}`);
  assert.equal(/"tree", true/.test(android[1]), manager(androidPage), `Android: ${android[1]}`);
});
