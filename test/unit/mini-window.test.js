'use strict';

// Mini Window (#1138, F61).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mini = require('../../src/main/mini-window');
const { savesSessionEntry, windowCloseSessionEffect } = require('../../src/main/window-state-persistence');
const { externalWindowRuntime } = require('../../src/main/window-activation');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the shortcut is off by default, device-local, and each platform offers its own chords', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /\n  miniWindowShortcut: 'off',\n/);
  assert.match(settings, /if \(!MINI_WINDOW_SHORTCUT_IDS\.includes\(data\.miniWindowShortcut\)\) data\.miniWindowShortcut = DEFAULTS\.miniWindowShortcut;/);
  assert.match(settings, /if \(MINI_WINDOW_SHORTCUT_IDS\.includes\(partial\.miniWindowShortcut\)\) clean\.miniWindowShortcut = partial\.miniWindowShortcut;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /miniWindowShortcut/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('miniWindowShortcut'));

  assert.deepEqual(mini.MINI_WINDOW_SHORTCUT_IDS, ['off', 'alt-cmd-n', 'ctrl-alt-space', 'ctrl-shift-space']);
  assert.deepEqual(mini.miniWindowShortcutChoices('darwin'), ['alt-cmd-n', 'ctrl-alt-space']);
  assert.deepEqual(mini.miniWindowShortcutChoices('win32'), ['ctrl-alt-space', 'ctrl-shift-space']);
  assert.deepEqual(mini.miniWindowShortcutChoices('linux'), ['ctrl-alt-space', 'ctrl-shift-space']);
  assert.equal(mini.miniWindowAccelerator('alt-cmd-n', 'darwin'), 'Alt+Command+N');
  assert.equal(mini.miniWindowAccelerator('alt-cmd-n', 'win32'), null, 'a choice from another platform registers nothing');
  assert.equal(mini.miniWindowAccelerator('off', 'darwin'), null);
  assert.equal(mini.miniWindowAccelerator('toString', 'darwin'), null);
  assert.equal(mini.miniWindowAccelerator('ctrl-shift-space', 'linux'), 'Control+Shift+Space');
});

test('no shortcut is one of Blanc\'s own or an AltGr letter', () => {
  const own = read('src/main/browser-shortcuts.js') + read('src/main/main.js');
  for (const { accelerator } of Object.values(mini.MINI_WINDOW_SHORTCUTS)) {
    const [key] = accelerator.split('+').slice(-1);
    assert.ok(!/Alt\+(Command|Control)\+[A-Z]$/.test(accelerator) || accelerator.startsWith('Alt+Command'),
      `${accelerator}: Ctrl+Alt+letter types a character with AltGr`);
    // Blanc's own accelerators use CmdOrCtrl; none ends in Space or is Alt+Cmd+N.
    if (key === 'N') assert.doesNotMatch(own, /accelerator: '(Alt\+CmdOrCtrl|CmdOrCtrl\+Alt|Cmd\+Alt|Alt\+Cmd)\+N'/);
    else assert.doesNotMatch(own, new RegExp(`'[^']*\\+${key}'`));
  }
});

test('it opens small, on the display under the pointer, and Open in Blanc gives it a full size', () => {
  const area = { x: 1440, y: 25, width: 1920, height: 1055 };
  const bounds = mini.miniWindowBounds(area);
  assert.equal(bounds.width, 760);
  assert.equal(bounds.height, 600);
  assert.equal(bounds.x, 1440 + (1920 - 760) / 2);
  assert.ok(bounds.y >= area.y && bounds.y + bounds.height <= area.y + area.height);
  assert.ok(bounds.y < area.y + (area.height - bounds.height) / 2, 'a little above centre');
  // A small display: clamped, never below the ordinary window's minimum.
  const small = mini.miniWindowBounds({ x: 0, y: 0, width: 700, height: 500 });
  assert.deepEqual([small.width, small.height], [668, 480]);
  const tiny = mini.miniWindowBounds({ x: 0, y: 0, width: 600, height: 400 });
  assert.deepEqual([tiny.width, tiny.height], [640, 480]);
  assert.deepEqual(mini.ordinaryWindowBounds(area), { x: 1440 + 320, y: 25 + Math.round((1055 - 800) * 0.4), width: 1280, height: 800 });
  assert.deepEqual(mini.miniWindowBounds(null), { x: 16, y: 13, width: 760, height: 600 });
});

test('it closes by itself only when nothing in it is in use', () => {
  const idle = { capturing: false, audible: false, isLoading: false };
  assert.equal(mini.MINI_WINDOW_IDLE_MS, 60 * 60 * 1000);
  assert.equal(mini.miniWindowMayExpire([idle]), true);
  for (const busy of [{ capturing: true }, { displayShareBlocking: true }, { audible: true }, { isLoading: true },
    { sleeping: true }, { waking: true }, { popupChildren: 1 }]) {
    assert.equal(mini.miniWindowMayExpire([idle, { ...idle, ...busy }]), false, JSON.stringify(busy));
  }
  assert.equal(mini.miniWindowMayExpire([null]), false);
  const main = read('src/main/main.js');
  // Main also asks each awake page for unsaved work, and waits another hour.
  assert.match(main, /if \(wc && \(await probeTabDirty\(tab, wc\)\)\.unsaved\) \{ unsaved = true; break; \}/);
  assert.match(main, /if \(inUse \|\| unsaved\) \{ armMiniWindowIdle\(runtime\); return inUse \? 'in-use' : 'unsaved'; \}\s*runtime\.window\.close\(\);\s*return 'closed';/);
  // Unfocusing starts the hour and focusing ends it.
  assert.match(main, /rt\(\)\.window\.on\('focus', bindWindowRuntime\(runtime, \(\) => \{\s*clearMiniWindowIdle\(runtime\);/);
  assert.match(main, /rt\(\)\.window\.on\('blur', bindWindowRuntime\(runtime, \(\) => \{\s*stopIslandRevealWatch\(runtime\);\s*armMiniWindowIdle\(runtime\);/);
});

test('a mini window is never saved, never a link\'s window, and its close writes nothing', () => {
  assert.equal(savesSessionEntry({ mini: true, window: {}, tabOrder: ['a'] }), false);
  assert.equal(savesSessionEntry({ mini: false, window: {}, tabOrder: ['a'] }), true);

  const window = { isDestroyed: () => false };
  const ordinary = { id: 'o', window };
  const miniRuntime = { id: 'm', window, mini: true };
  assert.equal(externalWindowRuntime([ordinary, miniRuntime], miniRuntime, ordinary, miniRuntime), ordinary);
  const primary = { id: 'primary', window: null };
  assert.equal(externalWindowRuntime([primary, miniRuntime], miniRuntime, primary), primary, 'only a mini window open: the primary reopens');

  assert.equal(windowCloseSessionEffect({ platform: 'win32', isPrimaryWindow: false, otherOpenWindows: 0, isMiniWindow: true }), 'mini');
  assert.equal(windowCloseSessionEffect({ platform: 'darwin', isPrimaryWindow: false, otherOpenWindows: 2, isMiniWindow: true }), 'mini');
  const main = read('src/main/main.js');
  assert.match(main, /if \(sessionReadOnly \|\| effect === 'dock' \|\| effect === 'mini'\) return \{ ok: true \};/);
  // Mini windows don't keep the last ordinary Windows/Linux window from quitting.
  assert.match(main, /otherOpenWindows: windowRuntimes\.all\(\)\.filter\(\(candidate\) => candidate !== runtime && !candidate\.mini/);
  assert.match(main, /if \(dockReopenLifecycle\.closeSessionEffect\(\) === 'quit'\) closeMiniWindows\(\);/);
  // Link routing and tab handoff skip them too.
  assert.match(main, /const isLiveBrowserRuntime = \(runtime\) => windowRuntimes\.all\(\)\.includes\(runtime\)\s*&& !runtime\.closing && !runtime\.resident && !runtime\.mini/);
  assert.match(main, /if \(preferred\?\.window && !preferred\.window\.isDestroyed\(\) && !preferred\.mini\) return preferred;/);
  // It keeps no native placement.
  assert.match(main, /\.\.\.\(runtime\.mini \? miniWindowPlacement\(\) : windowStatePersistenceOptions\(runtime\.id\)\),/);
});

test('a mini window holds no Space', () => {
  const main = read('src/main/main.js');
  for (const fn of ['saveCurrentWindowAsWorkspace', 'switchWindowToWorkspace', 'createBlankWorkspaceAndSwitch']) {
    const body = main.match(new RegExp(`function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
    assert.match(body, /if \(runtime\.mini\) return \{ ok: false, error: 'busy' \};/, fn);
  }
  const css = read('src/renderer/styles.css');
  assert.match(css, /:root\[data-mini-window\] #pillSpace,\n:root\[data-mini-window\] #footerWorkspace \{ display: none !important; \}/);
  assert.match(read('src/renderer/overlay.js'), /document\.documentElement\.toggleAttribute\('data-mini-window', payload\.miniWindow === true\);/);
});

test('Open in Blanc keeps it as an ordinary window', () => {
  const main = read('src/main/main.js');
  const keep = main.match(/function keepMiniWindow\(runtime = rt\(\)\) \{[\s\S]*?\n\}/)[0];
  assert.match(keep, /runtime\.mini = false;\s*clearMiniWindowIdle\(runtime\);/);
  assert.match(keep, /runtime\.window\.setBounds\(miniWindow\.ordinaryWindowBounds\(workArea\)\);/);
  assert.match(keep, /broadcastTabs\(\); \/\/ persists the session, now with this window/);
  assert.match(main, /chromeHandle\('chrome:mini-keep', \(\) => keepMiniWindow\(rt\(\)\)\);/);
  assert.equal(main.match(/\n    miniWindow: rt\(\)\.mini === true,\n/g)?.length, 2, 'both tab payloads say so');
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /pillMiniOpen\.hidden = !miniWindow;/);
  assert.match(renderer, /pillMiniOpen\.addEventListener\('click', \(e\) => \{\s*e\.stopPropagation\(\);\s*window\.browserAPI\.keepMiniWindow\(\);/);
  assert.match(read('src/renderer/index.html'), /<button id="pillMiniOpen" class="mini-open" type="button"[^>]*hidden>/);
});

test('the shortcut is registered only while chosen, and Settings says when it can\'t be used', () => {
  const main = read('src/main/main.js');
  const sync = main.match(/function syncMiniWindowShortcut\(choice = settings\.getSettings\(\)\.miniWindowShortcut\) \{[\s\S]*?\n\}/)[0];
  assert.match(sync, /globalShortcut\.unregister\(miniWindowShortcutRegistered\)/);
  assert.match(sync, /registered = globalShortcut\.register\(accelerator, bindWindowRuntime\(primaryRuntime, \(\) => openMiniWindow\(\)\)\);/);
  assert.match(sync, /miniWindowShortcutStatus = registered \? 'on' : 'unavailable';/);
  assert.match(main, /app\.on\('will-quit', \(\) => \{\s*if \(!miniWindowShortcutRegistered\) return;\s*try \{ globalShortcut\.unregister\(miniWindowShortcutRegistered\); \}/);
  assert.match(read('src/main/pages.js'), /miniWindow: hooks\.miniWindow\?\.status\?\.\(\) \?\? \{ choices: \[\], status: 'off' \},/);
  const page = read('src/renderer/pages/settings.js');
  assert.match(page, /status\.hidden = state !== 'unavailable';/);
  assert.match(page, /await window\.bowserPages\.settings\.set\(\{ miniWindowShortcut: select\.value \}\);/);
  assert.match(read('src/renderer/pages/settings.html'), /<select id="miniWindowShortcut"[^>]*aria-describedby="miniWindowHint miniWindowStatus"/);
  // The File menu and the macOS Dock menu open one too.
  assert.match(main, /\{ label: t\('menu\.newMiniWindow'\), click: bound\(\(\) => openMiniWindow\(\)\) \},/);
  assert.match(main, /newMiniWindow: \(\) => openMiniWindow\(\),/);
});

test('preview windows close with the last Windows or Linux window (#1630)', () => {
  const main = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.match(main, /if \(dockReopenLifecycle\.closeSessionEffect\(\) === 'quit'\) drmSupport\.closeLocalFiles\?\.\(\);/);
  const drm = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/main/drm-support.js'), 'utf8');
  assert.match(drm, /closeLocalFiles\(\) \{\s*closeAllLocalHtmlPreviews\(\);/);
});

test('a mini window moves every tab but an unused start page (#1734)', () => {
  assert.deepEqual(mini.miniWindowMoveIds([{ id: 1, blank: true }, { id: 2, blank: false }, { id: 3, blank: false }]), [2, 3]);
  assert.deepEqual(mini.miniWindowMoveIds([{ id: 1, blank: true }]), []);
  assert.deepEqual(mini.miniWindowMoveIds([]), []);
});

test('a mini window moves to a Space of its own profile, then closes (#1734)', () => {
  const main = read('src/main/main.js');
  const candidates = main.match(/function miniWindowMoveCandidates\(runtime\) \{[\s\S]*?\n\}/)[0];
  assert.match(candidates, /miniWindow\.miniWindowMoveIds\(/);
  assert.match(candidates, /tab\.url === NEW_TAB_URL && !newTabPageUsed\(tab\)/);
  assert.match(main, /function miniWindowMoveCandidates\(runtime\) \{/);
  const move = main.match(/function moveMiniWindowToSpace\(runtime, workspaceId, creation = null, \{ showError = true \} = \{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(move, /const candidates = miniWindowMoveCandidates\(runtime\);/);
  assert.match(move, /const ids = candidates\?\.every\(\(id\) => canMoveTabToSpace\(tabs\.get\(id\), runtime, true\)\) \? candidates : null;/);
  assert.match(move, /error: candidates \? 'unmovable' : 'busy'/);
  assert.match(move, /if \(showError\) withWindowRuntime\(runtime, \(\) => showOverlay\('spaces'/);
  assert.match(move, /withWindowRuntime\(runtime, \(\) => moveTabsToSpace\(ids, workspaceId, creation, \{ keepGroups: true \}\)\)/);
  assert.match(move, /runtime\.window\.close\(\);\s*openSpaceInProfile\(\{ profileId, spaceId \}\);/);
  assert.match(move, /showOverlay\('spaces', \{ purpose: \{ spaceMoveError:/);
  assert.match(main, /if \(opts\?\.move === true\) return otherProfileTarget\(opts\) \? \{ ok: false, error: 'busy' \} : \{ \.\.\.moveMiniWindowToSpace\(rt\(\), id, null, \{ showError: false \}\), \.\.\.workspacesProjection\(\) \};/);
  assert.match(main, /if \(rt\(\)\.mini\) \{\s*if \(opts\?\.move !== true \|\| otherProfileTarget\(opts\)\) return \{ ok: false, error: 'busy' \};\s*return \{ \.\.\.moveMiniWindowToSpace\(rt\(\), null, \{ name,/);
  assert.equal(main.match(/\n    miniWindowCanMove: !!miniWindowMoveCandidates\(rt\(\)\),\n/g)?.length, 2, 'both tab payloads say so');
  assert.match(main, /label: t\('mini\.moveToSpace\.menu'\), submenu: miniWindowSpaceMenu\(runtime\)/);
});

test('a mini window\'s Island offers Move to Space beside Open in Blanc (#1734)', () => {
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /pillMiniSpaces\.hidden = !miniWindow;/);
  assert.match(renderer, /pillMiniSpaces\.disabled = !state\.miniWindowCanMove;/);
  assert.match(renderer, /pillMiniSpaces\.addEventListener\('click', \(e\) => \{\s*e\.stopPropagation\(\);[\s\S]*?window\.browserAPI\.openSpacesMenu\(\{ \.\.\.spacesAnchor\(\), closing \}\);/);
  assert.match(renderer, /const anchor = !pillMiniSpaces\.hidden \? pillMiniSpaces : pillSpace\.hidden \? islandPill : pillSpace;/);
  assert.match(renderer, /pillMiniSpaces\.setAttribute\('aria-expanded', String\(mode === 'spaces'\)\);/);
  assert.match(read('src/renderer/index.html'), /<button id="pillMiniSpaces" class="mini-spaces" type="button" aria-haspopup="dialog" aria-expanded="false"[^>]*data-i18n-tooltip="mini\.moveToSpace\.title" data-i18n-aria-label="mini\.moveToSpace\.label" hidden>/);
  const css = read('src/renderer/styles.css');
  assert.match(css, /#pillMiniOpen,\n#pillMiniSpaces \{/);
  assert.match(css, /#pillMiniSpaces:disabled \{[^}]*opacity:[^}]*cursor: default;/);
});

test('a mini window lists tabs elsewhere and goes to them, a tab or a Space by name (#1734 part 2)', () => {
  const main = read('src/main/main.js');
  const body = (name) => main.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  assert.match(main, /chromeHandle\('chrome:mini-switch-tabs', \(\) => \{\s*const runtime = rt\(\);\s*if \(!runtime\.mini \|\| tabs\.get\(runtime\.activeTabId\)\?\.private\) return \[\];\s*return miniSwitch\.miniSwitchRows\(miniSwitchInputs\(runtime\)\);/);
  assert.match(main, /chromeHandle\('chrome:mini-switch-go', \(_e, key\) => goToMiniSwitchTab\(rt\(\), key\)\);/);
  const inputs = body('miniSwitchInputs');

  assert.match(inputs, /self: r === runtime, mini: r\.mini === true, spaceId: r\.workspaceId \?\? null,/);
  assert.match(inputs, /namedWorkspaces\.list\(\)\.filter\(\(w\) => !shown\.has\(w\.id\)\)/);
  const go = body('goToMiniSwitchTab');
  assert.match(go, /miniSwitch\.parseMiniSwitchKey\(key\)/);
  // A tab gone since the list was built still shows its Space when it had one.
  assert.match(go, /if \(!parsed\.spaceId \|\| !namedWorkspaces\.get\(parsed\.spaceId\) \|\| live\(workspaceOwner\(runtime, parsed\.spaceId\)\)\) return gone;/);
  // A window closed to the Dock (macOS) is listed and comes back for its tab.
  assert.match(inputs, /r\.profileId === runtime\.profileId && \(!r\.closing \|\| r\.dockClosed\)/);
  assert.match(go, /if \(owner\.dockClosed && !owner\.workspaceId\) \{ createMainWindow\(owner, \{ ensureStartTab: false \}\); target = owner; \}/);
  assert.match(go, /if \(tab\.private \|\| owner === runtime \|\| owner\.mini \|\| owner\.profileId !== profileId\) return gone;/);
  // A held Space, or a window closed to the Dock (closing, no live window),
  // opens through the Spaces controller, which brings a window back.
  assert.match(go, /const live = \(r\) => !!r && !r\.resident && !r\.closing && !!r\.window && !r\.window\.isDestroyed\(\);/);
  assert.match(go, /target = live\(owner\) \? owner : open\(owner\.workspaceId\);/);
  assert.match(go, /target = live\(owner\) \? owner : open\(parsed\.spaceId\);/);
  assert.match(go, /if \(!target\) return \{ ok: false, error: 'busy' \};/);
  assert.match(go, /miniSwitch\.nearestTabByUrl\(target\.tabOrder\.map\(\(id\) => \(\{ id, url: tabs\.get\(id\)\?\.url \}\)\), url, parsed\.index\)/);
  // The mini window's panel closes without taking focus back (settleElsewhere's rule).
  assert.match(go, /withWindowRuntime\(runtime, \(\) => hideOverlay\(\{ refocusContent: false \}\)\);[\s\S]*withWindowRuntime\(target, \(\) => setActiveTab\(select\)\)/);
  assert.match(go, /focusMiniSwitchTarget\(target\);\s*closeMiniWindowIfUntouched\(runtime\);\s*return \{ ok: true \};/);
  assert.match(body('closeMiniWindowIfUntouched'), /if \(!runtime\?\.mini \|\| miniWindowMoveCandidates\(runtime\)\) return false;/);
  // A Space picked by name in a mini window goes there; nothing moves.
  assert.match(main, /const \{ result: went \} = openSpaceInProfile\(\{ profileId: otherProfileTarget\(opts\) \?\? mini\.profileId, spaceId: id \}\);\s*if \(went\.ok\) \{ hideOverlay\(\{ refocusContent: false \}\); closeMiniWindowIfUntouched\(mini\); \}/);
  const preload = read('src/main/preload.js');
  assert.match(preload, /listMiniSwitchTabs: \(\) => ipcRenderer\.invoke\('chrome:mini-switch-tabs'\)/);
  assert.match(preload, /goToMiniSwitchTab: \(key\) => ipcRenderer\.invoke\('chrome:mini-switch-go', key\)/);
});

test('links from other apps can open in a mini window: off by default and device-local (#1734 part 3)', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /\n  miniWindowForLinks: false,\n/);
  assert.match(settings, /if \(typeof data\.miniWindowForLinks !== 'boolean'\) data\.miniWindowForLinks = DEFAULTS\.miniWindowForLinks;/);
  assert.match(settings, /if \(typeof partial\.miniWindowForLinks === 'boolean'\) clean\.miniWindowForLinks = partial\.miniWindowForLinks;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /miniWindowForLinks/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('miniWindowForLinks'));
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<input id="miniWindowForLinks" type="checkbox"[^>]*data-i18n-aria-label="settings\.general\.miniWindowLinks\.label"/);
  assert.match(html, /data-i18n="settings\.general\.miniWindowLinks\.hint">Links that match a rule still go where the rule says\.</);
  assert.match(read('src/renderer/pages/settings.js'), /window\.bowserPages\.settings\.set\(\{ miniWindowForLinks: miniWindowForLinks\.checked \}\)/);
});

test('a link joins the most recently focused live mini window of its profile (#1734 part 3)', () => {
  const live = { isDestroyed: () => false }, gone = { isDestroyed: () => true };
  const a = { id: 'a', mini: true, profileId: 'p', window: live }, b = { id: 'b', mini: true, profileId: 'p', window: live };
  const other = { id: 'o', mini: true, profileId: 'q', window: live }, ordinary = { id: 'n', mini: false, profileId: 'p', window: live };
  const serial = new Map([[a, 2], [b, 5], [other, 9], [ordinary, 10]]);
  assert.equal(mini.miniWindowForLink([a, b, other, ordinary], 'p', (r) => serial.get(r)), b);
  assert.equal(mini.miniWindowForLink([{ ...a, closing: true }, { ...b, window: gone }], 'p', () => 0), null);
  assert.equal(mini.miniWindowForLink([other], 'p', () => 0), null, 'another profile\'s mini window never takes it');
});

test('the link handoff falls back to a mini window when the setting is on (#1734 part 3)', () => {
  const main = read('src/main/main.js');
  assert.match(main, /getRuntime: \(preferred, destination, placement\) => destination\s*\? routedExternalRuntime\(destination, preferred, placement\) : externalFallbackRuntime\(preferred, placement\),/);
  const fallback = main.match(/function externalFallbackRuntime\(preferred, placement\) \{[\s\S]*?\n\}/)[0];
  // Only at the routed step (with a placement) is a new mini window made, so
  // a link a rule claims never leaves an empty one behind.
  assert.match(fallback, /if \(settings\.getSettings\(\)\.miniWindowForLinks\) \{[\s\S]*return miniLinkRuntime\(\{ create: !!placement \}\) \?\? resolveExternalRuntime\(preferred\);/);
  assert.match(fallback, /return resolveExternalRuntime\(preferred\);/);
  // Local HTML files never go to a mini window (they're not web links).
  assert.match(fallback, /if \(placement\?\.localFile\) return resolveExternalRuntime\(preferred\);/);
  // A re-queued link keeps the mini window it started with.
  assert.match(fallback, /if \(preferred\?\.mini && !preferred\.closing && windowRuntimes\.all\(\)\.includes\(preferred\)\) return preferred;/);
  assert.match(read('src/main/external-url-handoff.js'), /const placement = \{ background: entry\.background === true, localFile: entry\.localFile === true \};/);
  // A link added to a mini window that isn't in front restarts its hour.
  assert.match(main, /createTab: \(url, \{ destination, \.\.\.options \} = \{\}\) => \{\s*const id = createRoutedTab\(url, destination, options\);[\s\S]*?const runtime = rt\(\);\s*if \(runtime\.mini && !runtime\.window\?\.isFocused\(\)\) armMiniWindowIdle\(runtime\);\s*return id;/);
  // A Dock-closed primary (macOS) still names the profile a mini window opens in.
  assert.match(main, /const candidates = windowRuntimes\.all\(\)\.filter\(\(runtime\) => !runtime\.mini && !runtime\.resident && \(!runtime\.closing \|\| runtime\.dockClosed\)\);/);
  const link = main.match(/function miniLinkRuntime\(\{ create = false \} = \{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(link, /miniWindow\.miniWindowForLink\(windowRuntimes\.all\(\), profileId, \(r\) => runtimeFocusSerials\.get\(r\) \?\? 0\)/);
  assert.match(link, /runtime\.mini = true;\s*runtime\.miniForLink = true;/);
  assert.match(main, /ensureWindow: \(runtime, \{ background = false \} = \{\}\) => \{\s*const fresh = runtime\.miniForLink === true;\s*runtime\.miniForLink = false;\s*createMainWindow\(runtime, \{ ensureStartTab: !fresh, inactive: background \}\);/);
});
