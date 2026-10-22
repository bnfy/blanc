'use strict';

// Which contents holds the keyboard in a window. On macOS a tab view detached
// while it had focus (an inactive tab) can keep reporting isFocused(), and
// Electron's getFocusedWebContents() returns the first contents that does, so
// it can name a hidden tab. Only contents on screen in the window, its own
// document and its visible child views, can hold the keyboard: they are asked
// first, and `fallback` (Electron's answer) is used when none of them is
// focused.

/**
 * @param {Electron.BaseWindow|null} window
 * @param {Electron.WebContents|null} fallback
 */
function onScreenFocusedContents(window, fallback) {
  if (!window || window.isDestroyed()) return fallback;
  const onScreen = [window.webContents, ...(window.contentView?.children ?? [])
    .filter((view) => view.getVisible?.() !== false)
    .map((view) => view.webContents)];
  return onScreen.find((contents) => contents && !contents.isDestroyed() && contents.isFocused()) ?? fallback;
}

module.exports = { onScreenFocusedContents };
