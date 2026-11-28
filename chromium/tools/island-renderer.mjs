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
// The Spaces menu across profiles (#1642) has a pin of its own, ahead of the
// release: the files it lists come from its commit (blanc/spaces-menu.json).
// Delete the record, and the styles.css edits for #1642 below, once the
// release carries #1642 (spaces-menu-pin.test.mjs says when).
const spacesMenuRecord = path.join(root, 'blanc/spaces-menu.json');
export const spacesMenuPin = () => {
  try { return JSON.parse(fs.readFileSync(spacesMenuRecord, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

// The utility sheet's pages (S1.5): History and Downloads, shown in a frame
// of the Island host over Chromium's own models. Favorites is a page in a tab
// of its own with a pin of its own (tools/favorites-page.mjs).
export const SHEET_FILES = ['sheet.js', 'row-icon.js', 'history-groups.js', 'downloads-row-model.js',
  'history.html', 'history.js', 'downloads.html', 'downloads.js', 'tab-import.html', 'tab-import-open-tabs.js', 'tab-import-arc.js', 'tab-handoff.html', 'tab-handoff.js', 'tab-handoff.css'].map(file => `pages/${file}`);
export const FILES = ['index.html', 'overlay.html', 'overlay.js', 'renderer.js', 'styles.css', 'tab-drag.js',
  'tab-sections.js', 'vertical-tabs.js', 'workspace-ui.js', 'glance-card-drag.js', 'hover-panel-leave.js',
  'permission.html', 'permission.js', 'pages/onboarding.js', ...SHEET_FILES];
// The sheet pages' bridge, the fork's own file, loads before their strings,
// and so does the launch's interface language (F44), as in index.html.
const SHEET_BRIDGE = ['  <script src="strings.js"></script>\n', '  <script src="sheet-adapter.js"></script>\n  <script src="../ui-language.js"></script>\n  <script src="strings.js"></script>\n'];
// Shipping's pure main-process modules the Island host runs as they are,
// wrapped so a document can load them: the host holds the state shipping's
// main process holds (hover-open's dwell, the approach swell's closeness and
// auto-hide's floating pill, S1.2),
// runs the pure rules behind /copy clean and /invite, and derives each tab's
// siteInfo as shipping's tab projection does (S1.6). Each exposes its
// exports on window under the given name.
export const MAIN_FILES = {'island-hover-open.js': 'BlancIslandHoverOpen', 'island-proximity.js': 'BlancIslandProximity', 'island-autohide.js': 'BlancIslandAutoHide',
  'whats-new.js': 'BlancWhatsNew', 'glance-card.js': 'BlancGlanceCard', 'clean-link.js': 'BlancCleanLink', 'invite-friend.js': 'BlancInviteFriend', 'site-security.js': 'BlancSiteSecurity', 'tab-switcher.js': 'BlancTabSwitcher'};
// Trusted Types policy names, per hardened script.
const HARDEN = {'overlay.js': 'overlay', 'renderer.js': 'renderer', 'vertical-tabs.js': 'vertical-tabs'};
// #1763's button, as shipping's index.html draws it.
const MINI_SPACES_BUTTON = `        <button id="pillMiniSpaces" class="mini-spaces" type="button" aria-haspopup="dialog" aria-expanded="false" data-tooltip="Move this mini window's tabs to a Space" aria-label="Move to Space — move this mini window's tabs to a Space" data-i18n-tooltip="mini.moveToSpace.title" data-i18n-aria-label="mini.moveToSpace.label" hidden>
          <!-- The Spaces planet (SpaceIdentity.SPACES_GLYPH), as on the ⌘L footer's Spaces button. -->
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M20.29 13.84A11.3 3.1 27 1 1 5.64 6.37"/></svg>
        </button>
`;
const PREVIEW_META = fs.readFileSync(path.join(root, 'tools/preview-build-meta.html'), 'utf8').trimEnd();

// The fork's edits to shipping's files. Each `find` must occur exactly once.
export const EDITS = {
  // The sheet's window.bowserPages answers from the Island host
  // (pages/sheet-adapter.js), not from Electron's tab preload.
  'pages/history.html': [SHEET_BRIDGE],
  'pages/downloads.html': [SHEET_BRIDGE],
  'pages/tab-import.html': [SHEET_BRIDGE],
  'pages/tab-handoff.html': [SHEET_BRIDGE],
  'pages/tab-import-open-tabs.js': [["'incomplete-session', 'missing-session-marker'", "'incomplete-session', 'missing-session-marker', 'invalid-session', 'invalid-session-header', 'invalid-session-command', 'unsupported-session-version', 'unreadable', 'permission'"]],
  'pages/onboarding.js': [["    window.location.href = 'blanc://tab-import/';", "    return window.bowserPages.start.openTabImport();"]],
  'index.html': [
    // The Island facade and the fork's own styles load around shipping's.
    // The launch's interface language (F44) is pinned before strings.js reads it.
    ['  <script src="strings.js"></script>\n', '  <script src="adapter.js"></script>\n  <script src="ui-language.js"></script>\n  <script src="strings.js"></script>\n'],
    ['  <link rel="stylesheet" href="styles.css" />\n', '  <link rel="stylesheet" href="styles.css" />\n  <link rel="stylesheet" href="prototype.css" />\n'],
    // Chromium's extension controls sit in the pill's action cluster.
    ['<div id="pillActions" class="pill-btns"></div>', '<div id="pillActions" class="pill-btns"><span id="nativeExtensions" aria-hidden="true"></span></div>'],
    // Move to Space (#1734, from #1763): a mini window's Spaces button beside
    // Open in Blanc; its menu files come from blanc/spaces-menu.json's commit.
    ['          <span data-i18n="mini.openInBlanc">Open in Blanc</span>\n        </button>\n',
     '          <span data-i18n="mini.openInBlanc">Open in Blanc</span>\n        </button>\n' + MINI_SPACES_BUTTON],
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
    // A recommended package update stays actionable across normal pill notices.
    ['  function showPillNotice(kind) {', `  function showPillNotice(kind) {
    if (platform === 'linux' && kind?.kind === 'update-ready') {
      if (frameElement?.id !== 'strip' && frameElement?.id !== 'floatPill') return;
      let button = document.getElementById('pillRestartToUpdate');
      if (!kind.version) {
        if (!button) return;
        button.remove();
      } else if (button) {
        button.dataset.version = kind.version;
        return;
      } else {
        button = document.createElement('button');
        button.id = 'pillRestartToUpdate';
        button.type = 'button';
        button.textContent = blancI18n.t('pill.restartToUpdate');
        button.dataset.version = kind.version;
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (event.isTrusted) location.assign('/restartToUpdate?' + encodeURIComponent(button.dataset.version));
        });
        pillDomain.after(button);
      }
      fitIslandDots();
      requestAnimationFrame(reportIslandRect);
      return;
    }`],
    // GTK button bounds arrive from the opaque frame through the strip host.
    ['  new ResizeObserver(reportIslandRect).observe(islandPill);',
`  if (platform === 'linux') {
    window.addEventListener('blanc-window-buttons', ({ detail: { leading, trailing, buttons, zoom } }) => {
      const style = document.documentElement.style;
      style.setProperty('--window-controls-leading-w', leading / zoom + 'px');
      style.setProperty('--window-controls-w', trailing / zoom + 'px');
      dragBand.style.height = 'calc(var(--drag-band-h) / ' + zoom + ')';
      // A narrow vertical rail puts its menu row below a left-hand cluster.
      const bottom = Math.max(0, ...buttons.filter(b => b.x < leading).map(b => b.y + b.height));
      style.setProperty('--window-controls-leading-h', bottom / zoom + 'px');
      dotFitKey = '';
      fitIslandDots();
      requestAnimationFrame(reportIslandRect);
    });
  }
  new ResizeObserver(reportIslandRect).observe(islandPill);`],
    // Real double-clicks on Linux go to WindowEventFilterLinux.
    ["if (e.target === stripEl && !floatSurface)", "if (platform !== 'linux' && e.target === stripEl && !floatSurface)"],
    ["  dragBand.addEventListener('dblclick'", "  if (platform !== 'linux') dragBand.addEventListener('dblclick'"],
    ["    pillSpace.hidden = spaceMarkOnIsland();", "    pillSpace.hidden = document.documentElement.hasAttribute('data-mini-window') || spaceMarkOnIsland();"],
    // Move to Space (#1734, #1763's renderer hunks): the mini window's Spaces
    // button opens the Spaces menu in its move mode.
    ["  const pillMiniOpen = document.getElementById('pillMiniOpen');\n",
     "  const pillMiniOpen = document.getElementById('pillMiniOpen');\n  const pillMiniSpaces = document.getElementById('pillMiniSpaces');\n"],
    ["    const anchor = pillSpace.hidden ? islandPill : pillSpace;",
     "    const anchor = !pillMiniSpaces.hidden ? pillMiniSpaces : pillSpace.hidden ? islandPill : pillSpace;"],
    ["    pillMiniOpen.hidden = !miniWindow;\n",
     "    pillMiniOpen.hidden = !miniWindow;\n    pillMiniSpaces.hidden = !miniWindow;\n    pillMiniSpaces.disabled = !state.miniWindowCanMove;\n"],
    ["    pillSpace.setAttribute('aria-expanded', String(mode === 'spaces'));\n",
     "    pillSpace.setAttribute('aria-expanded', String(mode === 'spaces'));\n    pillMiniSpaces.setAttribute('aria-expanded', String(mode === 'spaces'));\n"],
    ["    window.browserAPI.keepMiniWindow();\n  });\n",
     `    window.browserAPI.keepMiniWindow();
  });
  // Move to Space (#1734): the Spaces menu, in its move mode. A press while
  // the menu is open closes it, as the Space mark's does.
  let miniSpacesPressedWhileOpen = false;
  pillMiniSpaces.addEventListener('pointerdown', () => { miniSpacesPressedWhileOpen = pillMiniSpaces.getAttribute('aria-expanded') === 'true'; });
  pillMiniSpaces.addEventListener('mousedown', (e) => e.preventDefault());
  pillMiniSpaces.addEventListener('click', (e) => {
    e.stopPropagation();
    const closing = miniSpacesPressedWhileOpen; miniSpacesPressedWhileOpen = false;
    window.browserAPI.openSpacesMenu({ ...spacesAnchor(), closing });
  });
`],
    // An extension's page goes by the extension's name, not its 32-letter id.
    // An extension's page shows the extension's name, not its 32-letter id
    // (a blank new tab still shows nothing, as shipping's locationLabel).
    ["    return TabSections.locationLabel(tab?.url);\n",
     "    if (tab?.extensionName && tab.url && !tab.url.startsWith('blanc://newtab')) return tab.extensionName;\n    return TabSections.locationLabel(tab?.url);\n"],
    // The native extension menu anchors to the Favorite button.
    ["  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());\n",
      "  const favoriteBtn = pillButton('heart', blancI18n.t('pill.favorite'), () => window.browserAPI.toggleBookmark());\n  favoriteBtn.id = 'pillHeart';\n"],
    // Auto-hide's floating pill is a frame of the Island host, not a view at
    // blanc-chrome://float/, so the host names the surface in its address.
    ["  const floatSurface = window.location.hostname === 'float';\n",
      "  const floatSurface = window.location.hostname === 'float' || window.location.search === '?surface=float';\n"],
    // The floating Glance card's chrome is a frame of the host too.
    ["  const glanceSurface = window.location.hostname === 'glance';\n",
      "  const glanceSurface = window.location.hostname === 'glance' || window.location.search === '?surface=glance';\n"],
  ],
  // Rail hover previews (fork): rows leave their tooltip to the host's hover
  // card while it is on (host.js sets data-rail-previews on the strip's root).
  'vertical-tabs.js': [
    ["    primary.title = tab.pageTitle || title;", "    if (document.documentElement.dataset.railPreviews !== 'on') primary.title = tab.pageTitle || title;"],
    ["    if (primary && !primary.hasAttribute('title')) {", "    if (primary && !primary.hasAttribute('title') && document.documentElement.dataset.railPreviews !== 'on') {"],
  ],
  // #1642's three hunks, which its menu files (from blanc/spaces-menu.json's
  // commit) draw with; the rest of styles.css stays at the release, since
  // later shipping changes to it (#1622, #1624) aren't in the fork yet.
  'styles.css': [
    // Both text actions use the shipping pill's button dimensions.
    // (and the mini window's Spaces button, #1734, #1763's styles.css hunk)
    ['#pillMiniOpen {', '#pillMiniOpen,\n#pillMiniSpaces,\n:root[data-platform="linux"] #pillRestartToUpdate {'],
    ['#pillMiniOpen svg {', '#pillMiniOpen svg,\n#pillMiniSpaces svg {'],
    ['#pillMiniOpen:hover,\n#pillMiniOpen:focus-visible { background: var(--accent-dim); border-color: transparent; }\n#pillMiniOpen:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }\n#pillMiniOpen[hidden] { display: none; }\n',
     '#pillMiniOpen:hover,\n#pillMiniOpen:focus-visible,\n#pillMiniSpaces:enabled:hover,\n#pillMiniSpaces:focus-visible,\n#pillMiniSpaces[aria-expanded="true"] { background: var(--accent-dim); border-color: transparent; }\n' +
     '#pillMiniOpen:focus-visible,\n#pillMiniSpaces:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }\n#pillMiniOpen[hidden],\n#pillMiniSpaces[hidden] { display: none; }\n' +
     '#pillMiniSpaces { padding: 0; width: 22px; justify-content: center; }\n#pillMiniSpaces svg { width: 13px; height: 13px; stroke-width: 1.8; }\n#pillMiniSpaces:disabled { opacity: 0.45; cursor: default; }\n'],
    // Linux reserves the actual GTK cluster on each side. Other platforms
    // keep the measured shipping clearances for the horizontal and rail layouts.
    [' - 184px) / var(--pill-zoom)', ' - var(--pill-window-clearance, 184px)) / var(--pill-zoom)'],
    [' - 150px) / var(--pill-zoom)', ' - var(--pill-window-clearance, 150px)) / var(--pill-zoom)'],
    ['#mainMenuButton[hidden]', ':root[data-platform="linux"] #strip > #mainMenuButton { left: calc(8px + var(--window-controls-leading-w, 0px)); }\n#mainMenuButton[hidden]'],
    // Another profile's row has no ••• to make room for, so it keeps its count.
    ['.ws-row:hover .ws-row-count, .ws-row:focus-within .ws-row-count,\n',
     '/* Another profile\'s row has no ••• to make room for, so it keeps its count. */\n.ws-row:not(.ws-row-elsewhere):hover .ws-row-count, .ws-row:not(.ws-row-elsewhere):focus-within .ws-row-count,\n'],
    // The profile names over each group of rows.
    ['.ws-empty { margin: 8px 10px 4px; color: var(--text-dim); font: 12.5px/1.45 var(--font-text); }\n',
     '.ws-empty { margin: 8px 10px 4px; color: var(--text-dim); font: 12.5px/1.45 var(--font-text); }\n' +
     '/* Spaces across profiles: the profile names over each group of rows, in the\n   menu\'s quiet label style; never a button, so the arrow keys pass over it. */\n' +
     '.ws-profile-heading { margin: 12px 10px 6px; color: var(--text-dim); font: 550 11.5px/1 var(--font-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n' +
     '.ws-profile-heading:first-child { margin-top: 4px; }\n'],
    // The New Space editor's Profile choice.
    ['.ws-name:focus { outline: none; background: var(--surface-raised); border-color: var(--border); }\n',
     '.ws-name:focus { outline: none; background: var(--surface-raised); border-color: var(--border); }\n' +
     '/* The New Space editor\'s Profile choice (two or more profiles), drawn like the name field. */\n' +
     '.ws-select { width: 100%; height: 34px; padding: 0 10px; border: 1px solid transparent; border-radius: var(--radius-md); background: var(--surface); color: var(--text); font: 13px/1 var(--font-text); }\n' +
     '.ws-select:focus { outline: none; background: var(--surface-raised); border-color: var(--border); }\n'],
  ],
  'overlay.js': [
    // On Linux and Windows a wake publishes an awake, still-loading tab
    // before it finishes, so the chosen quiet tab is remembered by id.
    ['  let glancePickerBusy = false;', '  let glancePickerBusy = false;\n  let openingTabId = null;'],
    ['    glancePickerBusy = true;', "    if (platform !== 'darwin') openingTabId = tab.asleep ? tab.id : null;\n    glancePickerBusy = true;"],
    ['glancePickerBusy && tab.id === glancePickerSelectedId && !!tab.asleep',
     "glancePickerBusy && (platform !== 'darwin' ? tab.id === openingTabId : tab.id === glancePickerSelectedId && !!tab.asleep)"],
    // F3-3: a collapsed group's membership stays explicit in the panel.
    // Use shipping's translated plural string and existing empty-row style.
    ["          // Collapsed: header alone. Open: indent membership under the group.\n          if (!group.collapsed) bandNodes.push(...tabRowsFor(gtabs, { inGroup: true }));",
     "          if (group.collapsed) bandNodes.push(emptyRow(blancI18n.t('tabGroups.tucked', { count: gtabs.length })));\n          else bandNodes.push(...tabRowsFor(gtabs, { inGroup: true }));"],
    // The inbox heading has no SVG. Build its static spans as DOM nodes;
    // it is not an SVG skeleton accepted by the narrow Trusted Types policy.
    ['    row.innerHTML = \'<span class="ghead-name"></span><span class="ghead-n"></span>\';',
     '    for (const name of ["ghead-name", "ghead-n"]) {\n      const span = document.createElement("span");\n      span.className = name;\n      row.append(span);\n    }'],
    // An extension's page goes by the extension's name, not its 32-letter id.
    ["    return TabSections.locationLabel(tab?.url, { stripWww: true });\n",
     "    if (tab?.extensionName && tab.url && !tab.url.startsWith('blanc://newtab')) return tab.extensionName;\n    return TabSections.locationLabel(tab?.url, { stripWww: true });\n"],
    ["    if (tab.url.startsWith('blanc://newtab') || tab.url.startsWith('file://')) return '';\n",
     "    if (tab.url.startsWith('blanc://newtab') || tab.url.startsWith('file://')) return '';\n    // An extension's page shows the extension's name, not its 32-letter id.\n    if (tab.extensionName) return tab.extensionName;\n"],
    // An untouched extension name is a label, not something to search for.
    ["      const value = addressInput.value.trim();\n      if (value) window.browserAPI.navigate(state.activeTabId, value);",
     "      // An untouched extension name is a label, not something to search for.\n      const value = !inputTouched && activeTab()?.extensionName ? '' : addressInput.value.trim();\n      if (value) window.browserAPI.navigate(state.activeTabId, value);"],
    // Dark websites come from the Dark Reader extension in the Chromium
    // builds (owner, 2026-11-02), so /dark-site is offered only where the
    // host has the member, as /1password is.
    ["    { cmd: '/dark-site', hint: blancI18n.t('slash.darkSite.hint'), run: () => window.browserAPI.toggleDarkSiteOnActiveSite() },\n",
      "    { cmd: '/dark-site', hint: blancI18n.t('slash.darkSite.hint'),\n      available: typeof window.browserAPI.toggleDarkSiteOnActiveSite === 'function',\n      run: () => window.browserAPI.toggleDarkSiteOnActiveSite() },\n"],
    // F41-27: shipping's main drops the overlay view at RETRACT_MS, but the
    // fork's host can hold it longer, and the closing Spaces menu stays drawn
    // for its 340 ms display transition (styles.css). Its placement
    // (data-closing) lasts as long, or the faded menu jumps to the left edge
    // (Windows and Linux at 158, the Mac at 159).
    ['      overlayExitTimer = setTimeout(endOverlayExit, RETRACT_MS);',
     "      overlayExitTimer = setTimeout(endOverlayExit, leaving === 'spaces' ? SPACES_EXIT_MS : RETRACT_MS);"],
    ['  const RETRACT_MS = 200; // keep in step with OVERLAY_RETRACT_MS in main.js\n',
     "  const RETRACT_MS = 200; // keep in step with OVERLAY_RETRACT_MS in main.js\n  const SPACES_EXIT_MS = 340; // the Spaces menu's display transition in styles.css\n"],
  ],
};

// Edits to the files blanc/spaces-menu.json pins, applied only when they come
// from its commit (the release doesn't have their anchors). When the release
// carries them, move these into EDITS with the pin record's deletion.
export const MENU_EDITS = {
  'overlay.js': [
    // Move to Space (#1734): the New space… editor counts the tabs the host
    // moves; this payload has no tabOrder, and every start page but a private
    // one stays behind here.
    ["    return (payload.tabs ?? []).filter((tab) => (payload.tabOrder ?? []).includes(tab.id) && tab.url !== 'blanc://newtab/').length;",
     "    return (payload.tabs ?? []).filter((tab) => tab.private || tab.url !== 'blanc://newtab/').length;"],
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

export function generate(ref, files = FILES, menu = spacesMenuPin()) {
  const out = {};
  for (const [file, name] of Object.entries(MAIN_FILES))
    out[file] = wrapMain(execFileSync('git', ['show', `${ref}:src/main/${file}`], {cwd: root, encoding: 'utf8'}), name);
  for (const file of files) {
    const pinned = !!menu?.files.includes(file);
    let text = show(pinned ? menu.commit : ref, file).toString('utf8');
    for (const [find, replace] of [...(EDITS[file] ?? []), ...(pinned ? MENU_EDITS[file] ?? [] : [])]) {
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
