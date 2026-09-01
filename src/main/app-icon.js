const path = require('node:path');
const APP_ICON_ASSETS = require('./app-icon-assets');
const { APP_ID } = require('./app-identity');

const NATIVE_ICON_MIN_MACOS = 26;

function macOSMajorVersion(version) {
  const major = Number.parseInt(String(version ?? '').split('.')[0], 10);
  return Number.isFinite(major) ? major : 0;
}

function nativeIconNameFor(appIcon) {
  return (APP_ICON_ASSETS[appIcon] ?? APP_ICON_ASSETS.sunrise).nativeName;
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
  developmentPreviewPath = null,
  developmentDarkPreviewPath = null,
  darkAppearance = false,
  platform = process.platform,
  systemVersion = typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : '',
  iconsDirectory = path.join(__dirname, '../renderer/pages'),
}) {
  if (platform !== 'darwin' || !app.dock) return null;

  // A deliberately explicit, unpackaged-only seam for reviewing candidate
  // artwork in the real Dock. It never changes Settings or packaged assets.
  if (!app.isPackaged && developmentPreviewPath) {
    const previewPath = darkAppearance && developmentDarkPreviewPath
      ? developmentDarkPreviewPath
      : developmentPreviewPath;
    const previewIcon = nativeImage.createFromPath(previewPath);
    if (!previewIcon.isEmpty()) {
      app.dock.setIcon(previewIcon);
      return { source: 'development-preview', path: previewPath };
    }
  }

  if (app.isPackaged && macOSMajorVersion(systemVersion) >= NATIVE_ICON_MIN_MACOS) {
    const nativeName = nativeIconNameFor(appIcon);
    const adaptiveIcon = nativeImage.createFromNamedImage(nativeName);
    if (!adaptiveIcon.isEmpty()) {
      app.dock.setIcon(adaptiveIcon);
      return { source: 'native', nativeName };
    }
  }

  const safeId = APP_ICON_ASSETS[appIcon] ? appIcon : 'sunrise';
  const renderedId = safeId === 'sunrise' && darkAppearance ? 'sunrise-dark' : safeId;
  const flatIcon = nativeImage.createFromPath(path.join(iconsDirectory, `icon-${renderedId}.png`));
  if (flatIcon.isEmpty()) return null;
  app.dock.setIcon(flatIcon);
  return { source: 'png', appIcon: renderedId };
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
