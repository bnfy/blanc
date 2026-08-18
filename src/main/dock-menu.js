// macOS Dock icon right-click menu. Electron adds these ABOVE the AppKit
// defaults (window list, Options ▸, Show All Windows, Hide, Quit), which macOS
// supplies for free — so the app authors only these two lines.

function buildDockMenu() {
  return [
    { id: 'new-window', label: 'New Window' },
    { id: 'new-private-window', label: 'New Private Window' },
  ];
}

function installDockMenu({ app, Menu, actions, platform = process.platform }) {
  if (platform !== 'darwin' || !app.dock) return;
  const clicks = {
    'new-window': actions.newWindow,
    'new-private-window': actions.newPrivateWindow,
  };
  const menu = Menu.buildFromTemplate(
    buildDockMenu().map((item) => ({ label: item.label, click: () => clicks[item.id]?.() })),
  );
  app.dock.setMenu(menu);
}

module.exports = { buildDockMenu, installDockMenu };
