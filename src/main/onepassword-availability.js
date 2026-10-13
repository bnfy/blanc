'use strict';

// 1Password login fill runs on every desktop platform the pinned SDK can reach
// through the installed 1Password app: macOS, Windows and Linux. Anything else
// fails closed, so a new platform needs an explicit code and test change
// instead of accidentally surfacing dormant UI.
const SUPPORTED_PLATFORMS = Object.freeze(['darwin', 'win32', 'linux']);

function isOnePasswordAvailable(platform = process.platform) {
  return SUPPORTED_PLATFORMS.includes(platform);
}

// Blanc ships x64 only on Windows. On Windows on Arm it runs translated, and
// the Arm version of 1Password installs an Arm64 SDK library that an x64
// process can't load, so fill there says so instead of trying. macOS
// translation (Rosetta) loads 1Password's universal library and stays
// supported. Pass Electron's app.runningUnderARM64Translation.
function isOnePasswordDeviceSupported({ platform = process.platform, runningUnderARM64Translation } = {}) {
  return !(platform === 'win32' && runningUnderARM64Translation === true);
}

// ⌥⌘P on macOS. Windows and Linux use Ctrl+Shift+P rather than Ctrl+Alt+P
// because Ctrl+Alt is AltGr on international layouts, where it types text.
function onePasswordAccelerator(platform = process.platform) {
  if (!isOnePasswordAvailable(platform)) return null;
  return platform === 'darwin' ? 'Cmd+Alt+P' : 'Ctrl+Shift+P';
}

// Windows and Linux dispatch browser shortcuts from before-input-event, since
// a menu accelerator is not reliable while a page's WebContentsView has focus
// (see browser-shortcuts.js). macOS keeps its native menu key equivalent.
function matchesOnePasswordShortcut(input, platform = process.platform) {
  if (platform !== 'win32' && platform !== 'linux') return false;
  if (input?.type !== 'keyDown' || input.isComposing) return false;
  if (input.modifiers?.some((modifier) => String(modifier).toLowerCase() === 'altgraph')) return false;
  return String(input.key).toLowerCase() === 'p'
    && !!input.control && !!input.shift && !input.alt && !input.meta;
}

module.exports = {
  SUPPORTED_PLATFORMS,
  isOnePasswordAvailable,
  isOnePasswordDeviceSupported,
  matchesOnePasswordShortcut,
  onePasswordAccelerator,
};
