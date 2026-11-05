#!/usr/bin/env node
// The Island's shipping renderer files, generated from a shipping release
// (S1.2): each file is shipping's own, with Trusted Types for its HTML sinks
// (chrome:// pages require it; trusted-markup.mjs) and the fork's few
// declared edits, each anchored to text that must occur exactly once.
//   node chromium/tools/island-renderer.mjs --write [--ref vX.Y.Z]
//   node chromium/tools/island-renderer.mjs --check
// The release is recorded in blanc/island-renderer.json; --check regenerates
// from it and fails if a committed file differs. The Start Page files belong
// to S1.8 and are not generated here.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hardenMarkup} from './trusted-markup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const island = path.join(root, 'blanc/island');
const record = path.join(root, 'blanc/island-renderer.json');

// The utility sheet's pages (S1.5): Favorites, History and Downloads, shown
// in a frame of the Island host over Chromium's own models.
export const SHEET_FILES = ['sheet.js', 'row-icon.js', 'history-groups.js', 'downloads-row-model.js',
  'bookmarks.html', 'bookmarks.js', 'history.html', 'history.js', 'downloads.html', 'downloads.js'].map(file => `pages/${file}`);
export const FILES = ['index.html', 'overlay.html', 'overlay.js', 'renderer.js', 'styles.css', 'tab-drag.js',
  'tab-sections.js', 'vertical-tabs.js', 'workspace-ui.js', 'glance-card-drag.js', 'hover-panel-leave.js',
  'permission.html', 'permission.js', ...SHEET_FILES];
// The sheet pages' bridge, the fork's own file, loads before their strings,
// and so does the launch's interface language (F44), as in index.html.
const SHEET_BRIDGE = ['  <script src="strings.js"></script>\n', '  <script src="sheet-adapter.js"></script>\n  <script src="../ui-language.js"></script>\n  <script src="strings.js"></script>\n'];
// Shipping's pure main-process modules the Island host runs as they are,
// wrapped so a document can load them: the host holds the state shipping's
// main process holds (hover-open's dwell and auto-hide's floating pill, S1.2),
// runs the pure rules behind /copy clean and /invite, and derives each tab's
// siteInfo as shipping's tab projection does (S1.6). Each exposes its
// exports on window under the given name.
export const MAIN_FILES = {'island-hover-open.js': 'BlancIslandHoverOpen', 'island-autohide.js': 'BlancIslandAutoHide',
  'whats-new.js': 'BlancWhatsNew', 'clean-link.js': 'BlancCleanLink', 'invite-friend.js': 'BlancInviteFriend', 'site-security.js': 'BlancSiteSecurity'};
// Trusted Types policy names, per hardened script.
const HARDEN = {'overlay.js': 'overlay', 'renderer.js': 'renderer', 'vertical-tabs.js': 'vertical-tabs'};
const PREVIEW_META = fs.readFileSync(path.join(root, 'tools/preview-build-meta.html'), 'utf8').trimEnd();

// The fork's edits to shipping's files. Each `find` must occur exactly once.
export const EDITS = {
  // The sheet's window.bowserPages answers from the Island host
  // (pages/sheet-adapter.js), not from Electron's tab preload.
  'pages/bookmarks.html': [SHEET_BRIDGE],
  'pages/history.html': [SHEET_BRIDGE],
  'pages/downloads.html': [SHEET_BRIDGE],
  'index.html': [
    // The Island facade and the fork's own styles load around shipping's.
    // The launch's interface language (F44) is pinned before strings.js reads it.
    ['  <script src="strings.js"></script>\n', '  <script src="adapter.js"></script>\n  <script src="ui-language.js"></script>\n  <script src="strings.js"></script>\n'],
    ['  <link rel="stylesheet" href="styles.css" />\n', '  <link rel="stylesheet" href="styles.css" />\n  <link rel="stylesheet" href="prototype.css" />\n'],
    // Chromium's extension controls sit in the pill's action cluster.
    ['<div id="pillActions" class="pill-btns"></div>', '<div id="pillActions" class="pill-btns"><span id="nativeExtensions" aria-hidden="true"></span></div>'],
  ],
  // The permission prompt (F13) is a frame of the Island host, like the overlay.
  'permission.html': [
    ['  <script src="strings.js"></script>\n', '  <script src="adapter.js"></script>\n  <script src="ui-language.js"></script>\n  <script src="strings.js"></script>\n'],
  ],
  'overlay.html': [
    ['  <script src="strings.js"></script>\n', '  <script src="adapter.js"></script>\n  <script src="ui-language.js"></script>\n  <script src="strings.js"></script>\n'],
    ['  <link rel="stylesheet" href="styles.css" />\n', '  <link rel="stylesheet" href="styles.css" />\n  <link rel="stylesheet" href="prototype.css" />\n' + PREVIEW_META + '\n'],
    // The preview build's security and update notice (not a release).
    ['      <div id="islandHint"></div>\n', '      <button id="previewStatusLink" class="preview-notice-button" type="button" hidden>Security &amp; updates</button>\n<div id="islandHint"></div>\n'],
  ],
  'renderer.js': [
    // The native extension menu anchors to the Favorite button.
    ["  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());\n",
      "  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());\n  favoriteBtn.id = 'pillHeart';\n"],
    // Auto-hide's floating pill is a frame of the Island host, not a view at
    // blanc-chrome://float/, so the host names the surface in its address.
    ["  const floatSurface = window.location.hostname === 'float';\n",
      "  const floatSurface = window.location.hostname === 'float' || window.location.search === '?surface=float';\n"],
  ],
  'overlay.js': [
    // Dark websites come from the Dark Reader extension in the Chromium
    // builds (owner, 2026-11-02), so /dark-site is offered only where the
    // host has the member, as /1password is.
    ["    { cmd: '/dark-site', hint: blancI18n.t('slash.darkSite.hint'), run: () => window.browserAPI.toggleDarkSiteOnActiveSite() },\n",
      "    { cmd: '/dark-site', hint: blancI18n.t('slash.darkSite.hint'),\n      available: typeof window.browserAPI.toggleDarkSiteOnActiveSite === 'function',\n      run: () => window.browserAPI.toggleDarkSiteOnActiveSite() },\n"],
  ],
};

const show = (ref, file) => execFileSync('git', ['show', `${ref}:src/renderer/${file}`], {cwd: root, maxBuffer: 64 * 1024 * 1024});

const wrapMain = (source, name) => `// Generated by tools/island-renderer.mjs from shipping's src/main; do not edit.
(() => {
const module = { exports: {} };
${source}
window.${name} = Object.freeze(module.exports);
})();
`;

export function generate(ref, files = FILES) {
  const out = {};
  for (const [file, name] of Object.entries(MAIN_FILES))
    out[file] = wrapMain(execFileSync('git', ['show', `${ref}:src/main/${file}`], {cwd: root, encoding: 'utf8'}), name);
  for (const file of files) {
    let text = show(ref, file).toString('utf8');
    for (const [find, replace] of EDITS[file] ?? []) {
      const count = text.split(find).length - 1;
      if (count !== 1) throw Error(`${file}: expected the anchor once, found ${count}: ${JSON.stringify(find.slice(0, 80))}`);
      text = text.replace(find, () => replace);
    }
    if (HARDEN[file]) text = hardenMarkup(text, HARDEN[file]);
    out[file] = text;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const refArg = args.indexOf('--ref');
  const ref = refArg >= 0 ? args[refArg + 1] : JSON.parse(fs.readFileSync(record, 'utf8')).ref;
  const files = generate(ref);
  if (args.includes('--write')) {
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(island, file), text);
    fs.writeFileSync(record, JSON.stringify({ref, commit: execFileSync('git', ['rev-parse', `${ref}^{commit}`], {cwd: root, encoding: 'utf8'}).trim(), files: FILES, mainFiles: Object.keys(MAIN_FILES)}, null, 2) + '\n');
    console.log(`Wrote ${Object.keys(files).length} Island files from ${ref}`);
  } else if (args.includes('--check')) {
    const stale = Object.entries(files).filter(([file, text]) => {
      const current = path.join(island, file);
      return !fs.existsSync(current) || fs.readFileSync(current, 'utf8') !== text;
    }).map(([file]) => file);
    if (stale.length) throw Error(`Island renderer files differ from ${ref}: ${stale.join(', ')}; run --write`);
    console.log(`Island renderer files match ${ref}`);
  } else {
    throw Error('Usage: island-renderer.mjs --write [--ref vX.Y.Z] | --check');
  }
}
