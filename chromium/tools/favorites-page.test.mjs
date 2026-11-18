// The Favorites page in its own tab (F63, V30; owner, 2026-11-18): shipping's
// page at its own pin, answered by the browser through favorites-adapter.js
// and FavoritesHandler (blanc/browser/ui/favorites_page.inc).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {PAGE_FILES, EDITS, pageFiles, withManagerRules, sharedProblems, pinned} from './favorites-page.mjs';
import {served} from './assets.mjs';

const chromium = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(chromium, '..');
const read = file => fs.readFileSync(path.join(chromium, file), 'utf8');
const show = (ref, file) => execFileSync('git', ['-C', root, 'show', `${ref}:${file}`], {encoding: 'utf8', maxBuffer: 1e8});
const ancestor = (older, newer) => {
  try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', older, newer], {stdio: 'ignore'}); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
};
const {commit} = pinned();
const pages = 'blanc/island/pages';

test('the committed page files are shipping\'s at the pin with the declared edits', () => {
  const files = pageFiles(commit);
  for (const file of PAGE_FILES) assert.equal(read(`${pages}/${file}`), files[file], file);
  assert.equal(read(`${pages}/pages.css`), withManagerRules(read(`${pages}/pages.css`), commit), 'pages.css manager rules');
  assert.deepEqual(sharedProblems(commit), []);
  for (const [file, edits] of Object.entries(EDITS)) assert.ok(PAGE_FILES.includes(file) && edits.length > 0, file);
});

test('the pin has the Favorites page in a tab (#1614) and never trails the renderer pin', () => {
  const renderer = JSON.parse(read('blanc/island-renderer.json')).commit;
  try { execFileSync('git', ['-C', root, 'cat-file', '-e', `${commit}^{commit}`], {stdio: 'ignore'}); }
  catch { assert.fail(`${commit} is missing: fetch main`); }
  assert.ok(ancestor('3f9a3aff0a74d0cc2c304d0def03116a1aeb0275', commit), 'bnfy/blanc#1614 is in the pin');
  assert.ok(ancestor(renderer, commit), 'the renderer release is in the pin');
});

test('the page loads the adapter first and gets every script it loads served', () => {
  const html = read(`${pages}/bookmarks.html`);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.equal(scripts[0], 'favorites-adapter.js');
  assert.ok(scripts.indexOf('../ui-language.js') < scripts.indexOf('strings.js'));
  const list = served();
  for (const script of scripts.filter(s => !s.startsWith('../'))) assert.ok(list.includes(`pages/${script}`), script);
  assert.ok(!html.includes('sheet-adapter.js'), 'Favorites is no longer a sheet page');
  // Never navigates to a blanc:// address itself.
  assert.ok(!/location\.href\s*=\s*'blanc:/.test(read(`${pages}/bookmarks.js`)));
});

test('every message the page names is in each language of the pages catalog', () => {
  const sandbox = {navigator: {languages: ['en'], language: 'en'}};
  sandbox.self = sandbox;
  const keys = new Set();
  for (const file of PAGE_FILES) {
    for (const match of read(`${pages}/${file}`).matchAll(/['"`](favorites\.[A-Za-z0-9_.]+)['"`]/g)) keys.add(match[1]);
  }
  assert.ok(keys.size > 50, `${keys.size} keys`);
  for (const language of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
    const context = {navigator: {languages: [language], language}, __blancUiLanguage: language};
    context.self = context;
    vm.runInNewContext(read(`${pages}/strings.js`), context);
    const missing = [...keys].filter(key => typeof context.blancStrings.messages[key] !== 'string');
    assert.deepEqual(missing, [], language);
  }
});

test('the adapter offers every call shipping\'s Favorites page bridge has', () => {
  const bridges = JSON.parse(show(commit, 'browser-api/bridges.json')).bowserPages.members
    .filter(m => m.hosts.includes('bookmarks') && /^(bookmarks|pins)\./.test(m.name)).map(m => m.name);
  const context = {location: {origin: 'chrome://blanc-prototype', pathname: '/pages/bookmarks.html'},
    chrome: {send() {}}, addEventListener() {}, console};
  context.window = context;
  vm.runInNewContext(read(`${pages}/favorites-adapter.js`), context);
  for (const name of bridges) {
    const [group, member] = name.split('.');
    assert.equal(typeof context.bowserPages[group]?.[member], 'function', name);
  }
  assert.ok(bridges.includes('bookmarks.edit') && bridges.includes('bookmarks.tree'));
});

test('the adapter answers nothing outside the Favorites page', () => {
  for (const location of [{origin: 'chrome://blanc-prototype', pathname: '/pages/newtab.html'},
    {origin: 'https://example.com', pathname: '/pages/bookmarks.html'}]) {
    const context = {location, chrome: {send() {}}, addEventListener() {}};
    context.window = context;
    vm.runInNewContext(read(`${pages}/favorites-adapter.js`), context);
    assert.equal(context.bowserPages, undefined, location.origin + location.pathname);
  }
});

test('every call the adapter sends has a handler, and the handler answers only its page', () => {
  const adapter = read(`${pages}/favorites-adapter.js`);
  const handler = read('blanc/browser/ui/favorites_page.inc');
  const sent = new Set([...adapter.matchAll(/request\('([A-Za-z]+)'/g)].map(m => m[1]));
  assert.ok(sent.size >= 18, [...sent].join());
  for (const method of sent) assert.match(handler, new RegExp(`method == "${method}"`), method);
  // The gate: the exact page, the main frame, a regular profile.
  const gate = /Profile\* PageProfile\(\) \{([\s\S]*?)\n  \}/.exec(handler)[1];
  for (const part of ['IsOffTheRecord()', 'GetPrimaryMainFrame()', 'IsFavoritesPage(frame->GetLastCommittedURL())'])
    assert.ok(gate.includes(part), part);
  const gateAt = handler.search(/if \(!CanEditFavorites\(profile\)\) \{ Reply\(id, false/);
  assert.ok(gateAt > 0, 'the editing policy gate');
  // Imports write favorites, so they sit behind the same gate.
  for (const method of ['browserSources', 'importBrowser', 'importEntries', 'createFolder', 'edit'])
    assert.ok(handler.indexOf(`method == "${method}"`) > gateAt, method);
  assert.match(read('blanc/browser/ui/blanc_prototype_ui.cc'),
    /constexpr char kFavoritesPageUrl\[\] = "chrome:\/\/blanc-prototype\/pages\/bookmarks\.html";/);
});

test('Favorites left the sheet: every way to it opens its tab', () => {
  const host = read('blanc/island/host.js');
  assert.match(host, /const SHEET_PAGES = \['history', 'downloads', 'tab-import', 'tab-handoff'\];/);
  assert.match(host, /if \(name === 'bookmarks'\) return openFavorites\(\);/);
  assert.ok(!/if \(page === 'bookmarks'\) return \{ surface/.test(host), 'no sheet bridge for Favorites');
  const ui = read('blanc/browser/ui/blanc_prototype_ui.cc');
  assert.match(ui, /if \(page == "bookmarks"\) return IsIslandWindow\(browser\) && OpenFavoritesTab\(browser\);/);
  assert.match(ui, /params\.disposition = WindowOpenDisposition::kSingletonTab;/);
  for (const op of ['sheetFavoriteRemove', 'sheetFolderRename', 'sheetPins', 'sheetImportEntries'])
    assert.ok(!ui.includes(`"${op}"`), op);
});
