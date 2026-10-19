const path = require('node:path');
const APP_ICON_ASSETS = require('./app-icon-assets');
const { APP_ID } = require('./app-identity');

const NATIVE_ICON_MIN_MACOS = 26;
// The app icon compiled into the bundle's Assets.car (`--app-icon` in
// scripts/after-pack-app-icons.js): the default Sunrise colorway's stack.
const BUNDLE_APP_ICON_NAME = APP_ICON_ASSETS.sunrise.nativeName;

function macOSMajorVersion(version) {
  const major = Number.parseInt(String(version ?? '').split('.')[0], 10);
  return Number.isFinite(major) ? major : 0;
}

function nativeIconNameFor(appIcon) {
  return (APP_ICON_ASSETS[appIcon] ?? APP_ICON_ASSETS.sunrise).nativeName;
}

// The flat PNG (icon-<id>.png) for an icon in the given appearance; icons
// that follow the appearance name their Dark PNG as darkFlatIcon.
function flatIconIdFor(appIcon, darkAppearance) {
  const safeId = APP_ICON_ASSETS[appIcon] ? appIcon : 'sunrise';
  return (darkAppearance && APP_ICON_ASSETS[safeId].darkFlatIcon) || safeId;
}

/** Set the process identity before Windows creates its taskbar button. */
function setWindowsAppUserModelId({ app, platform = process.platform }) {
  if (platform !== 'win32' || !app?.isPackaged) return false;
  app.setAppUserModelId(APP_ID);
  return true;
}

/** Use Blanc's fixed Sunrise ICO for unpackaged Windows development. */
function windowsDevelopmentIconPath({
  app,
  platform = process.platform,
  projectRoot = path.join(__dirname, '../..'),
}) {
  if (platform !== 'win32' || app.isPackaged) return null;
  return path.join(projectRoot, 'build/windows-icons/icon-sunrise.ico');
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

  const renderedId = flatIconIdFor(appIcon, darkAppearance);
  const flatIcon = nativeImage.createFromPath(path.join(iconsDirectory, `icon-${renderedId}.png`));
  if (flatIcon.isEmpty()) return null;
  app.dock.setIcon(flatIcon);
  return { source: 'png', appIcon: renderedId };
}

/**
 * Wrap applyDockAppIcon so it reloads only when the image the Dock would show
 * changes. Decoding the 1024 px PNG and setting it blocks the main process for
 * hundreds of milliseconds (about 2 s on hosted Intel Macs), and Settings
 * reapplies the icon after every write and appearance change. A main-process
 * stall that long can trip uBlock Origin's 2 s network-decision deadline,
 * which fails closed. Returns null when nothing was reloaded; `force` reloads
 * anyway, for when something else replaced the Dock tile.
 *
 * Until something replaces it, a packaged macOS 26+ Dock already shows the
 * bundle's own adaptive app icon. When that is the selected icon, the first
 * apply only records it: rendering the same stack into a bitmap and handing it
 * back cost 9-11 MB in the browser process
 * (docs/benchmarks/idle-memory-attribution-2026-10-15.md).
 */
function createDockIconApplier({
  app,
  nativeImage,
  platform = process.platform,
  systemVersion = typeof process.getSystemVersion === 'function'
    ? process.getSystemVersion()
    : '',
  iconsDirectory,
}) {
  let shown = null;
  // Whether this process has handed the Dock any image yet. Tracked apart from
  // `shown`, which resets when an apply fails without changing the Dock.
  let replaced = false;
  const targetFor = ({ appIcon, developmentPreviewPath = null, developmentDarkPreviewPath = null, darkAppearance = false }) => {
    return {
      preview: !app.isPackaged && developmentPreviewPath
        ? (darkAppearance && developmentDarkPreviewPath ? developmentDarkPreviewPath : developmentPreviewPath)
        : null,
      native: app.isPackaged && macOSMajorVersion(systemVersion) >= NATIVE_ICON_MIN_MACOS
        ? nativeIconNameFor(appIcon)
        : null,
      png: flatIconIdFor(appIcon, darkAppearance),
    };
  };
  // A source earlier in applyDockAppIcon's order that failed before fails
  // again for the same target, so only the source that was shown is compared.
  const unchanged = (target) => {
    if (!shown) return false;
    const { result, target: previous } = shown;
    if (result.source === 'bundle') return target.native === result.nativeName;
    if (result.source === 'development-preview') return target.preview === result.path;
    if (result.source === 'native') return target.native === result.nativeName;
    return target.png === result.appIcon
      && target.preview === previous.preview && target.native === previous.native;
  };
  return function applyDockIcon(inputs, { force = false } = {}) {
    const target = targetFor(inputs);
    if (!force && unchanged(target)) return null;
    if (!force && !replaced && target.native === BUNDLE_APP_ICON_NAME) {
      shown = { result: { source: 'bundle', nativeName: BUNDLE_APP_ICON_NAME }, target };
      return shown.result;
    }
    const result = applyDockAppIcon({
      app, nativeImage, platform, systemVersion, iconsDirectory, ...inputs,
    });
    shown = result ? { result, target } : null;
    if (result) replaced = true;
    return result;
  };
}

module.exports = {
  APP_ICON_ASSETS,
  APP_ID,
  BUNDLE_APP_ICON_NAME,
  NATIVE_ICON_MIN_MACOS,
  applyDockAppIcon,
  createDockIconApplier,
  macOSMajorVersion,
  nativeIconNameFor,
  setWindowsAppUserModelId,
  windowsDevelopmentIconPath,
};
