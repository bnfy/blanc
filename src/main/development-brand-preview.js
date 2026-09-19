'use strict';

const APP_ICON_ASSET_PATTERN = /^icon-[a-z0-9-]+\.png$/;

/**
 * Redirect only Blanc-owned brand assets during an explicit unpackaged
 * preview. Main is responsible for passing null paths in packaged builds.
 */
function developmentBrandAssetPath({
  name,
  defaultPath,
  brandMarkPath = null,
  dockIconPath = null,
  darkDockIconPath = null,
}) {
  if (name === 'icon.svg' && brandMarkPath) return brandMarkPath;
  if (name === 'icon-sunrise-dark.png' && darkDockIconPath) return darkDockIconPath;
  if (APP_ICON_ASSET_PATTERN.test(name) && dockIconPath) return dockIconPath;
  return defaultPath;
}

module.exports = {
  APP_ICON_ASSET_PATTERN,
  developmentBrandAssetPath,
};
