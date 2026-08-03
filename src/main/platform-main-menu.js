function supportsPlatformMainMenu(platform = process.platform) {
  return platform === 'win32' || platform === 'linux';
}

function clampCoordinate(value, maximum) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), Math.max(0, maximum - 1));
}

function popupPoint(point, contentBounds) {
  return {
    x: clampCoordinate(point?.x, contentBounds?.width ?? 0),
    y: clampCoordinate(point?.y, contentBounds?.height ?? 0),
  };
}

function isPlatformMainMenuShortcut(input, platform = process.platform) {
  return supportsPlatformMainMenu(platform) &&
    input?.type === 'keyDown' &&
    !input.isAutoRepeat &&
    String(input.key).toLowerCase() === 'f' &&
    input.alt &&
    !input.control &&
    !input.meta &&
    !input.shift;
}

/**
 * Open the live application Menu as a context menu beside the custom chrome.
 * This deliberately reuses Menu.getApplicationMenu(): File/Edit/View/Tabs/
 * Favorites/Help and their dynamic state must have exactly one definition.
 */
function popupPlatformMainMenu({ Menu, window, point, platform = process.platform }) {
  if (!supportsPlatformMainMenu(platform) || !window || window.isDestroyed()) {
    return Promise.resolve(false);
  }

  const menu = Menu.getApplicationMenu();
  if (!menu?.items?.length) return Promise.resolve(false);

  const { x, y } = popupPoint(point, window.getContentBounds());
  return new Promise((resolve, reject) => {
    try {
      menu.popup({
        window,
        x,
        y,
        callback: () => resolve(true),
      });
    } catch (error) {
      reject(error);
    }
  });
}

function installPlatformMainMenuShortcut({
  webContents,
  Menu,
  getWindow,
  point = { x: 8, y: 38 },
  platform = process.platform,
}) {
  if (!supportsPlatformMainMenu(platform)) return;
  webContents.on('before-input-event', (event, input) => {
    if (!isPlatformMainMenuShortcut(input, platform)) return;
    event.preventDefault();
    popupPlatformMainMenu({ Menu, window: getWindow(), point, platform }).catch(() => {});
  });
}

module.exports = {
  installPlatformMainMenuShortcut,
  isPlatformMainMenuShortcut,
  popupPlatformMainMenu,
  popupPoint,
  supportsPlatformMainMenu,
};
