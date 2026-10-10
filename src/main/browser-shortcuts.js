'use strict';

// One definition for menu accelerators, input dispatch, and the shortcut sheet.
// labelKey names each command's menu label in the interface catalog.
const COMMANDS = Object.freeze({
  'new-window': { labelKey: 'menu.newWindow', primary: 'CmdOrCtrl+N' },
  'new-tab': { labelKey: 'menu.newTab', primary: 'CmdOrCtrl+T' },
  'new-private-tab': { labelKey: 'menu.newPrivateTab', primary: 'CmdOrCtrl+Shift+N' },
  'close-tab': { labelKey: 'menu.closeTab', primary: 'CmdOrCtrl+W' },
  'reopen-tab': { labelKey: 'menu.reopenClosedTab', primary: 'CmdOrCtrl+Shift+T' },
  address: { labelKey: 'menu.searchCommands', primary: 'CmdOrCtrl+L', aliases: ['Alt+D'] },
  find: { labelKey: 'menu.find', primary: 'CmdOrCtrl+F' },
  reload: { labelKey: 'menu.reloadTab', primary: 'CmdOrCtrl+R', aliases: ['F5'] },
  'hard-reload': { labelKey: 'menu.hardReloadTab', primary: 'CmdOrCtrl+Shift+R' },
  history: { labelKey: 'menu.showHistory', primary: 'CmdOrCtrl+Y', desktopPrimary: 'Ctrl+H', aliases: ['Ctrl+Y'] },
  downloads: { labelKey: 'menu.downloads', primary: 'CmdOrCtrl+Shift+J', desktopPrimary: 'Ctrl+J', aliases: ['Ctrl+Shift+J'] },
  settings: { labelKey: 'menu.settings', primary: 'CmdOrCtrl+,' },
  'next-tab': { labelKey: 'menu.nextTab', primary: 'Ctrl+Tab', aliases: ['Ctrl+PageDown'] },
  'previous-tab': { labelKey: 'menu.previousTab', primary: 'Ctrl+Shift+Tab', aliases: ['Ctrl+PageUp'] },
});

function browserCommandDefinition(id, platform = process.platform) {
  const command = COMMANDS[id];
  if (!command) return null;
  return {
    labelKey: command.labelKey,
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

module.exports = { BROWSER_COMMAND_IDS: Object.keys(COMMANDS), browserCommandDefinition, matchBrowserShortcut, createBrowserCommandExecutor, installBrowserShortcuts };
