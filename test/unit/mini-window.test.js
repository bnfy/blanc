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
