'use strict';

// No two application-menu items share a key on any platform, and no
// before-input-event handler takes a key that belongs to another menu item.
// v1.39 to v1.52 shipped ⌘⌥B on both Favorites and Auto-hide the Island, and
// Auto-hide's handler won, so Favorites never opened from the keyboard on a Mac.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { BROWSER_COMMAND_IDS, browserCommandDefinition, matchBrowserShortcut } = require('../../src/main/browser-shortcuts');
const {
  ALTERNATES, MENU_ACCELERATOR_IDS, acceleratorChord, inputMatchesAccelerator, menuAccelerator, roleAccelerators,
} = require('../../src/main/menu-accelerators');
const { matchesOnePasswordShortcut } = require('../../src/main/onepassword-availability');
const { isPlatformMainMenuShortcut } = require('../../src/main/platform-main-menu');

const ROOT = path.join(__dirname, '..', '..');
const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const menuSource = main.slice(main.indexOf('function buildMenuForRuntime(runtime)'), main.indexOf('\nfunction ', main.indexOf('function buildMenuForRuntime(runtime)') + 1));
const PLATFORMS = ['darwin', 'win32', 'linux'];

// Roles Electron gives no accelerator, and close, whose ⌘W main.js replaces.
const KEYLESS_ROLES = new Set([
  'services', 'unhide', 'delete', 'help', 'close', 'showSubstitutions', 'toggleSmartQuotes',
  'toggleSmartDashes', 'toggleTextReplacement', 'startSpeaking', 'stopSpeaking',
]);

test('every menu accelerator comes from the shared tables', () => {
  const values = [...menuSource.matchAll(/accelerator: ([^,\n}]+)/g)].map((match) => match[1].trim());
  for (const value of values) {
    assert.match(value, /^(menuAccelerator\(|definition\.primary$|LAST_ACTIVE_TAB_ACCELERATOR$|COPY_CLEAN_LINK_ACCELERATOR$)/,
      `buildMenuForRuntime sets accelerator ${value}; add it to src/main/menu-accelerators.js instead`);
  }
  const used = new Set([
    ...[...menuSource.matchAll(/menuAccelerator\('([^']+)'\)/g)].map((match) => match[1]),
    ...(/menuAccelerator\(`tab-\$\{i \+ 1\}`\)/.test(menuSource) ? Array.from({ length: 9 }, (_, i) => `tab-${i + 1}`) : []),
    ...(menuSource.includes('LAST_ACTIVE_TAB_ACCELERATOR') ? ['switch-last-active-tab'] : []),
    ...(menuSource.includes('COPY_CLEAN_LINK_ACCELERATOR') ? ['copy-clean-link'] : []),
  ]);
  assert.deepEqual([...used].sort(), [...MENU_ACCELERATOR_IDS].sort(), 'the table and the menu list the same items');
  const roles = new Set([...menuSource.matchAll(/role: '([^']+)'/g)].map((match) => match[1]));
  for (const role of roles) {
    const keyed = PLATFORMS.some((platform) => role in roleAccelerators(platform));
    assert.ok(keyed || KEYLESS_ROLES.has(role), `role ${role} is in the menu; add its Electron accelerator to roleAccelerators()`);
  }
  assert.match(menuSource, /role: 'close', label: t\('menu\.closeWindow'\), accelerator: menuAccelerator\('close-window'\)/);
});

// [owner, accelerator] for every key the menu registers on a platform.
function menuBindings(platform) {
  const commands = [...menuSource.matchAll(/command\('([^']+)'\)/g)].map((match) => match[1]);
  return [
    ...commands.map((id) => [`browser-${id}`, browserCommandDefinition(id, platform).primary]),
    ...MENU_ACCELERATOR_IDS.map((id) => [ALTERNATES[id] ?? id, menuAccelerator(id, platform)]),
    ...Object.entries(roleAccelerators(platform)).map(([role, accelerator]) => [`role-${role}`, accelerator]),
  ].filter(([, accelerator]) => accelerator);
}

for (const platform of PLATFORMS) {
  test(`no two menu items share a key on ${platform}`, () => {
    const owners = new Map();
    for (const [owner, accelerator] of menuBindings(platform)) {
      const chord = acceleratorChord(accelerator, platform);
      const previous = owners.get(chord);
      assert.ok(!previous || previous === owner, `${chord} is both ${previous} and ${owner} on ${platform}`);
      owners.set(chord, owner);
    }
  });

  test(`no before-input-event handler takes another menu item's key on ${platform}`, () => {
    // The handlers that consume a key before the menu sees it, each with the
    // menu item it acts for (browser commands act for their own item).
    const handlers = [
      ['browser', (input) => {
        const id = matchBrowserShortcut(input, platform);
        return id && `browser-${id}`;
      }],
      ['toggle-vertical-tabs', (input) => inputMatchesAccelerator(input, menuAccelerator('toggle-vertical-tabs', platform), platform) && 'toggle-vertical-tabs'],
      ['toggle-glance', (input) => inputMatchesAccelerator(input, menuAccelerator('toggle-glance', platform), platform) && 'toggle-glance'],
      ['toggle-island-autohide', (input) => inputMatchesAccelerator(input, menuAccelerator('toggle-island-autohide', platform), platform) && 'toggle-island-autohide'],
      ['fill-onepassword', (input) => matchesOnePasswordShortcut(input, platform) && 'fill-onepassword'],
      // Alt+F opens the whole menu on Windows and Linux.
      ['platform-main-menu', (input) => isPlatformMainMenuShortcut(input, platform) && 'platform-main-menu'],
    ];
    for (const [owner, accelerator] of menuBindings(platform)) {
      const chord = acceleratorChord(accelerator, platform).split('+');
      const raw = chord.pop();
      const key = { plus: '+', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[raw] ?? raw;
      const input = {
        type: 'keyDown',
        key,
        code: /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : undefined,
        meta: chord.includes('meta'),
        control: chord.includes('ctrl'),
        alt: chord.includes('alt'),
        shift: chord.includes('shift'),
      };
      for (const [name, matches] of handlers) {
        const takes = matches(input);
        assert.ok(!takes || takes === owner, `the ${name} handler takes ${accelerator} (${owner}) on ${platform}`);
      }
    }
  });
}

test('Favorites keeps ⌥⌘B on the Mac and Auto-hide moved to ⇧⌘B', () => {
  assert.equal(menuAccelerator('favorites-show', 'darwin'), 'Cmd+Alt+B');
  assert.equal(menuAccelerator('favorites-show', 'win32'), 'Ctrl+Shift+O');
  assert.equal(menuAccelerator('toggle-island-autohide', 'darwin'), 'Cmd+Shift+B');
  assert.equal(menuAccelerator('close-window', 'darwin'), 'Cmd+Shift+W');
  assert.equal(menuAccelerator('close-window', 'linux'), null);
  assert.ok(BROWSER_COMMAND_IDS.includes('close-tab'));
});
