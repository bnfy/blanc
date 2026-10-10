// macOS Dock icon right-click menu. AppKit's automatic window list does not
// appear for Blanc's frameless, profile-titled windows, so the app draws the
// frontmost window's active tab itself as the top line (matching Chrome and
// Safari), above the app-authored New Window / New Private Window. macOS still
// supplies Options ▸ / Show All Windows / Hide / Quit below.

function buildDockMenu({ activeTab, t }) {
  const items = [];
  if (activeTab && activeTab.label) {
    items.push({ id: 'active-tab', label: activeTab.label });
    items.push({ type: 'separator' });
  }
  items.push({ id: 'new-window', label: t('menu.newWindow') });
  items.push({ id: 'new-private-window', label: t('menu.newPrivateWindow') });
  return items;
}

/**
 * Install the Dock menu and return an `{ update(activeTab) }` handle. The Dock
 * menu is only read when the icon is right-clicked, but Electron exposes no
 * "about to open" hook, so we keep it current proactively. Keep one Menu
 * instance installed for the lifetime of the app and mutate its dynamic items
 * in place. Replacing the Dock menu while AppKit is traversing it can leave
 * AppKit holding a stale native submenu pointer (observed with Electron 44).
 *
 * `activeTab` is `{ label, iconDataUrl }` or null. `actions` supplies
 * `focusActiveWindow` / `newWindow` / `newPrivateWindow`; `t` is the
 * interface translator.
 */
function installDockMenu({ app, Menu, nativeImage, actions, t, platform = process.platform }) {
  if (platform !== 'darwin' || !app.dock) return { update() {} };
  const clicks = {
    'active-tab': actions.focusActiveWindow,
    'new-window': actions.newWindow,
    'new-private-window': actions.newPrivateWindow,
  };
  const menu = Menu.buildFromTemplate([
    {
      id: 'active-tab',
      label: t('dock.activeTab'),
      visible: false,
      click: () => clicks['active-tab'] && clicks['active-tab'](),
    },
    { id: 'active-tab-separator', type: 'separator', visible: false },
    {
      id: 'new-window',
      label: t('menu.newWindow'),
      click: () => clicks['new-window'] && clicks['new-window'](),
    },
    {
      id: 'new-private-window',
      label: t('menu.newPrivateWindow'),
      click: () => clicks['new-private-window'] && clicks['new-private-window'](),
    },
  ]);
  const activeItem = menu.getMenuItemById('active-tab');
  const separator = menu.getMenuItemById('active-tab-separator');
  app.dock.setMenu(menu);

  let lastKey = '';
  const update = (activeTab = null) => {
    const key = activeTab && activeTab.label
      ? JSON.stringify([activeTab.label, activeTab.iconDataUrl || ''])
      : '';
    if (key === lastKey) return;
    lastKey = key;
    const visible = Boolean(activeTab && activeTab.label);
    activeItem.visible = visible;
    separator.visible = visible;
    activeItem.label = visible ? activeTab.label : t('dock.activeTab');
    activeItem.icon = undefined;
    if (visible && activeTab.iconDataUrl && nativeImage) {
      try {
        const img = nativeImage.createFromDataURL(activeTab.iconDataUrl);
        if (!img.isEmpty()) activeItem.icon = img.resize({ width: 16, height: 16 });
      } catch { /* malformed data URL — fall back to a text-only line */ }
    }
  };
  return { update };
}

module.exports = { buildDockMenu, installDockMenu };
