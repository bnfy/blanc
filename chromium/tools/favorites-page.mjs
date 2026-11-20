#!/usr/bin/env node
// The Favorites page (F63), a page in a tab of its own (owner, November 18,
// 2026), pinned apart from the Island renderer: shipping's page files at the
// commit blanc/favorites-page.json records, each with the fork's declared
// edits anchored to text that must occur exactly once, and shipping's
// Favorites manager rules from pages.css between two markers in the fork's
// pages/pages.css. The page's strings come from the same commit through
// interface-strings.mjs.
//   node chromium/tools/favorites-page.mjs --write [--ref <commit>]
//   node chromium/tools/favorites-page.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = path.join(root, 'blanc/island/pages');
export const RECORD = path.join(root, 'blanc/favorites-page.json');

// The page's own files, written here.
export const PAGE_FILES = ['bookmarks.html', 'bookmarks.js', 'favorites-manager.js', 'favorites-manager-model.js'];
// Files the page loads that other pages share and other pins write; at the
// pinned commit they must still be byte for byte what the fork serves.
export const SHARED_FILES = ['row-icon.js', 'start-pins.js', 'i18n.js'];

export const EDITS = {
  // window.bowserPages comes from the browser (favorites-adapter.js), and
  // the launch's interface language is pinned before strings.js reads it.
  'bookmarks.html': [
    ['  <script src="strings.js"></script>\n',
     '  <script src="favorites-adapter.js"></script>\n  <script src="../ui-language.js"></script>\n  <script src="strings.js"></script>\n'],
    // The bookmarks-file picker the adapter's import uses.
    ['  <script src="row-icon.js"></script>\n', '  <script src="bookmark-file.js"></script>\n  <script src="row-icon.js"></script>\n'],
    // The import button exists before the page's script has run and attached
    // its handler (after two calls to the browser); a click before then did
    // nothing (W2, run 44403868270). It starts disabled; bookmarks.js enables it.
    ['<button id="importMenuBtn" type="button" ', '<button id="importMenuBtn" type="button" disabled '],
  ],
  // "Open tabs" opens the tab import in the Island's sheet; a blanc://
  // address never loads in a tab here.
  'bookmarks.js': [
    ["const bringTabs = () => { window.location.href = 'blanc://tab-import/'; };",
     "const bringTabs = () => { window.BlancFavoritesTab.openSheet('tab-import'); };"],
    // The import button is disabled in the markup until its handler is
    // attached (W2); this is where it starts to work.
    ["  importMenuBtn.addEventListener('click', () => {\n",
     "  importMenuBtn.disabled = false;\n  importMenuBtn.addEventListener('click', () => {\n"],
  ],
};

// Shipping's Favorites manager block in pages.css, and where it goes in the
// fork's copy.
const CSS_START = '/* ---------- Favorites manager (F63) ----------';
const CSS_END = '/* ---------- Utility sheet presentation (body.sheet) ----------';
const CSS_AFTER = 'body.sheet .shortcut-row:last-child { border-bottom: 0; }\n';
const BEGIN = '/* Begin shipping\'s Favorites manager rules (tools/favorites-page.mjs). */\n';
const END = '/* End shipping\'s Favorites manager rules. */\n';

// A file's text, or null when it isn't there: one read, never a check and
// then a read the file could change between.
const readIfPresent = file => {
  try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

const show = (ref, file) => execFileSync('git', ['show', `${ref}:src/renderer/pages/${file}`],
  {cwd: root, maxBuffer: 64 * 1024 * 1024}).toString('utf8');
const once = (text, find, label) => {
  const count = text.split(find).length - 1;
  if (count !== 1) throw Error(`${label}: expected the anchor once, found ${count}: ${JSON.stringify(find.slice(0, 80))}`);
};

export function pageFiles(ref) {
  const out = {};
  for (const file of PAGE_FILES) {
    let text = show(ref, file);
    for (const [find, replace] of EDITS[file] ?? []) {
      once(text, find, file);
      text = text.replace(find, () => replace);
    }
    out[file] = text;
  }
  return out;
}

export function managerRules(ref) {
  const css = show(ref, 'pages.css');
  once(css, CSS_START, 'pages.css');
  once(css, CSS_END, 'pages.css');
  const start = css.indexOf(CSS_START);
  return css.slice(start, css.indexOf(CSS_END, start));
}

// The fork's pages.css with the block at `ref` in its place.
export function withManagerRules(forkCss, ref) {
  const block = BEGIN + managerRules(ref) + END;
  if (forkCss.includes(BEGIN)) {
    once(forkCss, BEGIN, 'fork pages.css');
    once(forkCss, END, 'fork pages.css');
    const start = forkCss.indexOf(BEGIN);
    return forkCss.slice(0, start) + block + forkCss.slice(forkCss.indexOf(END, start) + END.length);
  }
  once(forkCss, CSS_AFTER, 'fork pages.css');
  return forkCss.replace(CSS_AFTER, () => CSS_AFTER + '\n' + block);
}

export function sharedProblems(ref) {
  return SHARED_FILES.filter(file => fs.readFileSync(path.join(pages, file), 'utf8') !== show(ref, file))
    .map(file => `pages/${file} at ${ref} differs from the fork's copy`);
}

export const pinned = () => JSON.parse(fs.readFileSync(RECORD, 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const refArg = args.indexOf('--ref');
  const ref = refArg >= 0 ? args[refArg + 1] : pinned().commit;
  const files = pageFiles(ref);
  const cssFile = path.join(pages, 'pages.css');
  const css = withManagerRules(fs.readFileSync(cssFile, 'utf8'), ref);
  const shared = sharedProblems(ref);
  if (shared.length) throw Error(shared.join('\n'));
  if (args.includes('--write')) {
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(pages, file), text);
    fs.writeFileSync(cssFile, css);
    const commit = execFileSync('git', ['rev-parse', `${ref}^{commit}`], {cwd: root, encoding: 'utf8'}).trim();
    const record = readIfPresent(RECORD);
    const previous = record === null ? {} : JSON.parse(record);
    fs.writeFileSync(RECORD, JSON.stringify({
      note: previous.note ?? 'The Favorites page (F63), pinned apart from the Island renderer (owner, 2026-11-18). tools/favorites-page.mjs writes and checks it; it never trails blanc/island-renderer.json.',
      commit, files: PAGE_FILES, shared: SHARED_FILES}, null, 2) + '\n');
    console.log(`Wrote the Favorites page from ${commit}`);
  } else if (args.includes('--check')) {
    const stale = Object.entries(files).filter(([file, text]) => readIfPresent(path.join(pages, file)) !== text)
      .map(([file]) => `pages/${file}`);
    if (fs.readFileSync(cssFile, 'utf8') !== css) stale.push('pages/pages.css (Favorites manager rules)');
    if (stale.length) throw Error(`Favorites page files differ from ${ref}: ${stale.join(', ')}; run --write`);
    console.log(`Favorites page files match ${ref}`);
  } else {
    throw Error('Usage: favorites-page.mjs --write [--ref <commit>] | --check');
  }
}
