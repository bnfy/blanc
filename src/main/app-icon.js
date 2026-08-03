const path = require('node:path');
const APP_ICON_ASSETS = require('./app-icon-assets');
const { APP_ID } = require('./app-identity');

const NATIVE_ICON_MIN_MACOS = 26;

function macOSMajorVersion(version) {
  const major = Number.parseInt(String(version ?? '').split('.')[0], 10);
  return Number.isFinite(major) ? major : 0;
}

function nativeIconNameFor(appIcon) {
  return (APP_ICON_ASSETS[appIcon] ?? APP_ICON_ASSETS.paper).nativeName;
}

/** Set the process identity before Windows creates its taskbar button. */
function setWindowsAppUserModelId({ app, platform = process.platform }) {
  if (platform !== 'win32' || !app?.isPackaged) return false;
  app.setAppUserModelId(APP_ID);
  return true;
}

/** Use Blanc's fixed Paper ICO for unpackaged Windows development. */
function windowsDevelopmentIconPath({
  app,
  platform = process.platform,
  projectRoot = path.join(__dirname, '../..'),
}) {
  if (platform !== 'win32' || app.isPackaged) return null;
  return path.join(projectRoot, 'build/windows-icons/icon-paper.ico');
}

/**
 * Apply the selected Dock icon without taking macOS's appearance choice away.
 * Packaged macOS 26+ builds load a named Icon Composer stack from Assets.car;
 * AppKit then renders Default, Dark, Clear, or Tinted itself. Dev builds and
 * older macOS releases retain the existing flat-PNG fallback.
 */
function applyDockAppIcon({
  app,
  nativeImage,
  appIcon,
  platform = process.platform,
  systemVersion = typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : '',
  iconsDirectory = path.join(__dirname, '../renderer/pages'),
}) {
  if (platform !== 'darwin' || !app.dock) return null;

  if (app.isPackaged && macOSMajorVersion(systemVersion) >= NATIVE_ICON_MIN_MACOS) {
    const nativeName = nativeIconNameFor(appIcon);
    const adaptiveIcon = nativeImage.createFromNamedImage(nativeName);
    if (!adaptiveIcon.isEmpty()) {
      app.dock.setIcon(adaptiveIcon);
      return { source: 'native', nativeName };
    }
  }

  const safeId = APP_ICON_ASSETS[appIcon] ? appIcon : 'paper';
  const flatIcon = nativeImage.createFromPath(path.join(iconsDirectory, `icon-${safeId}.png`));
  if (flatIcon.isEmpty()) return null;
  app.dock.setIcon(flatIcon);
  return { source: 'png', appIcon: safeId };
}

module.exports = {
  APP_ICON_ASSETS,
  APP_ID,
  NATIVE_ICON_MIN_MACOS,
  applyDockAppIcon,
  macOSMajorVersion,
  nativeIconNameFor,
  setWindowsAppUserModelId,
  windowsDevelopmentIconPath,
};
