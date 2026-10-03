'use strict';

// One definition for menu accelerators, input dispatch, and the shortcut sheet.
const COMMANDS = Object.freeze({
  'new-window': { label: 'New Window', primary: 'CmdOrCtrl+N' },
  'new-tab': { label: 'New Tab', primary: 'CmdOrCtrl+T' },
  'new-private-tab': { label: 'New Private Tab', primary: 'CmdOrCtrl+Shift+N' },
  'close-tab': { label: 'Close Tab', primary: 'CmdOrCtrl+W' },
  'reopen-tab': { label: 'Reopen Closed Tab', primary: 'CmdOrCtrl+Shift+T' },
  address: { label: 'Search & Commands', primary: 'CmdOrCtrl+L', aliases: ['Alt+D'] },
  find: { label: 'Find…', primary: 'CmdOrCtrl+F' },
  reload: { label: 'Reload Tab', primary: 'CmdOrCtrl+R', aliases: ['F5'] },
  'hard-reload': { label: 'Hard Reload Tab (Bypass Cache)', primary: 'CmdOrCtrl+Shift+R' },
  history: { label: 'Show History', primary: 'CmdOrCtrl+Y', desktopPrimary: 'Ctrl+H', aliases: ['Ctrl+Y'] },
  downloads: { label: 'Downloads', primary: 'CmdOrCtrl+Shift+J', desktopPrimary: 'Ctrl+J', aliases: ['Ctrl+Shift+J'] },
  settings: { label: 'Settings', primary: 'CmdOrCtrl+,' },
  'next-tab': { label: 'Next Tab', primary: 'Ctrl+Tab', aliases: ['Ctrl+PageDown'] },
  'previous-tab': { label: 'Previous Tab', primary: 'Ctrl+Shift+Tab', aliases: ['Ctrl+PageUp'] },
});

function browserCommandDefinition(id, platform = process.platform) {
  const command = COMMANDS[id];
  if (!command) return null;
  return {
    label: command.label,
    primary: platform === 'darwin' ? command.primary : command.desktopPrimary ?? command.primary,
    aliases: platform === 'darwin' ? [] : [...(command.aliases ?? [])],
  };
}

function acceleratorMatches(input, accelerator, platform) {
  const parts = accelerator.toLowerCase().split('+');
  const key = parts.pop();
  const modifiers = new Set(parts.map(modifier => modifier === 'cmdorctrl'
    ? platform === 'darwin' ? 'meta' : 'ctrl'
    : modifier));
  return String(input.key).toLowerCase() === key &&
    !!input.control === modifiers.has('ctrl') &&
    !!input.meta === modifiers.has('meta') &&
    !!input.alt === modifiers.has('alt') &&
    !!input.shift === modifiers.has('shift');
}

function matchBrowserShortcut(input, platform = process.platform) {
  if (input?.type !== 'keyDown' || input.isComposing ||
      input.modifiers?.some(modifier => String(modifier).toLowerCase() === 'altgraph')) return null;
  for (const id of Object.keys(COMMANDS)) {
    const definition = browserCommandDefinition(id, platform);
    if ([definition.primary, ...definition.aliases].some(binding => acceleratorMatches(input, binding, platform))) return id;
  }
  return null;
}

function createBrowserCommandExecutor(actions, { platform = process.platform } = {}) {
  return (id, runtime) => {
    const action = Object.hasOwn(COMMANDS, id) ? actions[id] : null;
    if (!action || !runtime || runtime.closing || runtime.resident) return false;
    const detachedMacAction = platform === 'darwin' && !runtime.window &&
      ['new-window', 'new-tab', 'new-private-tab', 'reopen-tab'].includes(id);
    if (!detachedMacAction && (!runtime.window || runtime.window.isDestroyed())) return false;
    action(runtime);
    return true;
  };
}

function installBrowserShortcuts({ webContents, getRuntime, ownsSurface, execute, platform = process.platform, observe = () => {} }) {
  if (platform !== 'win32' && platform !== 'linux') return;
  webContents.on('before-input-event', (event, input) => {
    const id = matchBrowserShortcut(input, platform);
    if (!id || webContents.isDestroyed()) return;
    const runtime = getRuntime();
    if (!runtime || !ownsSurface(runtime, webContents)) return;
    // This suppresses both page input and Electron's menu accelerator. Repeats
    // are consumed too, so holding Ctrl+W cannot close an entire workspace.
    event.preventDefault();
    if (input.isAutoRepeat) return;
    const handled = execute(id, runtime);
    observe({ id, runtimeId: runtime.id, webContentsId: webContents.id, handled });
  });
}

module.exports = { browserCommandDefinition, matchBrowserShortcut, createBrowserCommandExecutor, installBrowserShortcuts };
