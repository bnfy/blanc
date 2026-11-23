'use strict';

// Every application-menu accelerator that isn't a browser command
// (browser-shortcuts.js) or an Electron role, per platform, in one table, so
// test/unit/menu-accelerators.test.js can prove no two menu items share a key
// on any platform and no before-input-event handler takes another item's key.
// buildMenuForRuntime in main.js reads its accelerators from here.

const { onePasswordAccelerator } = require('./onepassword-availability');

const mac = (platform) => platform === 'darwin';

const ACCELERATORS = Object.freeze({
  print: () => 'CmdOrCtrl+P',
  // Electron's close role would take ⌘W, which is Close Tab's; Close Window
  // takes ⇧⌘W, as in Safari and Chrome.
  'close-window': (platform) => (mac(platform) ? 'Cmd+Shift+W' : null),
  // macOS-only: Ctrl+Alt+Shift+C is AltGr+Shift+C on international layouts,
  // which types a character (Ć on Polish keyboards).
  'copy-clean-link': (platform) => (mac(platform) ? 'Cmd+Alt+Shift+C' : null),
  'fill-onepassword': (platform) => onePasswordAccelerator(platform),
  'zoom-in': () => 'CmdOrCtrl+Plus',
  // Plus needs Shift on most keyboards; Cmd/Ctrl+= is a hidden alternate.
  'zoom-in-alternate': () => 'CmdOrCtrl+=',
  'zoom-out': () => 'CmdOrCtrl+-',
  'zoom-reset': () => 'CmdOrCtrl+0',
  'toggle-vertical-tabs': () => 'CmdOrCtrl+Alt+V',
  // ⌥⌘B is Favorites on the Mac (as in Safari and Chrome), so Auto-hide takes
  // ⇧⌘B there; Windows and Linux keep Ctrl+Alt+B (owner, November 23, 2026).
  'toggle-island-autohide': (platform) => (mac(platform) ? 'Cmd+Shift+B' : 'Ctrl+Alt+B'),
  'toggle-glance': () => 'CmdOrCtrl+Shift+G',
  // macOS-only: Ctrl+Alt is AltGr on international Windows/Linux layouts,
  // where Ctrl+Alt+Z may be ordinary text input.
  'switch-last-active-tab': (platform) => (mac(platform) ? 'Cmd+Alt+Z' : null),
  'next-tab-in-group': () => 'Alt+CmdOrCtrl+Right',
  'previous-tab-in-group': () => 'Alt+CmdOrCtrl+Left',
  'next-group': () => 'Alt+CmdOrCtrl+Down',
  'previous-group': () => 'Alt+CmdOrCtrl+Up',
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`tab-${i + 1}`, () => `CmdOrCtrl+${i + 1}`])),
  'favorites-add': () => 'CmdOrCtrl+D',
  'favorites-show': (platform) => (mac(platform) ? 'Cmd+Alt+B' : 'Ctrl+Shift+O'),
  'show-shortcuts': () => 'CmdOrCtrl+/',
});

// Items bound silently to the same action as another item.
const ALTERNATES = Object.freeze({ 'zoom-in-alternate': 'zoom-in' });

const MENU_ACCELERATOR_IDS = Object.freeze(Object.keys(ACCELERATORS));

function menuAccelerator(id, platform = process.platform) {
  const accelerator = ACCELERATORS[id];
  if (!accelerator) throw new Error(`unknown menu accelerator: ${id}`);
  return accelerator(platform);
}

// Electron's own accelerators for the roles buildMenuForRuntime uses, by
// platform (lib/browser/api/menu-item-roles.ts). A role without one is left out.
function roleAccelerators(platform = process.platform) {
  if (mac(platform)) {
    return {
      hide: 'Command+H',
      hideOthers: 'Command+Alt+H',
      quit: 'CommandOrControl+Q',
      undo: 'CommandOrControl+Z',
      redo: 'Shift+CommandOrControl+Z',
      cut: 'CommandOrControl+X',
      copy: 'CommandOrControl+C',
      paste: 'CommandOrControl+V',
      pasteAndMatchStyle: 'Shift+Option+CommandOrControl+V',
      selectAll: 'CommandOrControl+A',
      toggleDevTools: 'Alt+Command+I',
    };
  }
  return {
    ...(platform === 'win32' ? {} : { quit: 'CommandOrControl+Q' }),
    undo: 'CommandOrControl+Z',
    redo: platform === 'win32' ? 'Control+Y' : 'Shift+CommandOrControl+Z',
    cut: 'CommandOrControl+X',
    copy: 'CommandOrControl+C',
    paste: 'CommandOrControl+V',
    selectAll: 'CommandOrControl+A',
    toggleDevTools: 'Ctrl+Shift+I',
  };
}

/** Normalized chord ("meta+shift+b") for comparing accelerators. */
function acceleratorChord(accelerator, platform = process.platform) {
  const parts = String(accelerator).toLowerCase().split('+');
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => {
    if (part === 'cmdorctrl' || part === 'commandorcontrol') return mac(platform) ? 'meta' : 'ctrl';
    if (part === 'cmd' || part === 'command') return 'meta';
    if (part === 'ctrl' || part === 'control') return 'ctrl';
    if (part === 'alt' || part === 'option') return 'alt';
    if (part === 'shift') return 'shift';
    throw new Error(`unknown modifier in ${accelerator}`);
  }));
  return [...['meta', 'ctrl', 'alt', 'shift'].filter((m) => modifiers.has(m)), key].join('+');
}

/**
 * Whether a before-input-event `input` is this accelerator's chord. On macOS
 * Option changes the key value (⌥B is ∫), so with Option the physical key
 * counts too; on Windows and Linux Ctrl+Alt is AltGr, so only the letter
 * counts there.
 */
function inputMatchesAccelerator(input, accelerator, platform = process.platform) {
  if (!accelerator || input?.type !== 'keyDown') return false;
  const chord = acceleratorChord(accelerator, platform).split('+');
  const key = chord.pop();
  const modifiers = new Set(chord);
  const keyMatches = String(input.key).toLowerCase() === key ||
    (mac(platform) && modifiers.has('alt') && /^[a-z]$/.test(key) && input.code === `Key${key.toUpperCase()}`);
  return keyMatches &&
    !!input.meta === modifiers.has('meta') &&
    !!input.control === modifiers.has('ctrl') &&
    !!input.alt === modifiers.has('alt') &&
    !!input.shift === modifiers.has('shift');
}

module.exports = {
  ALTERNATES,
  MENU_ACCELERATOR_IDS,
  acceleratorChord,
  inputMatchesAccelerator,
  menuAccelerator,
  roleAccelerators,
};
