'use strict';

/** Bring the target browser window in front for an explicit OS handoff.
 *
 * BrowserWindow.focus() makes a window key only after its application is
 * active. On macOS, another app opening an HTTP(S) URL can leave Blanc behind
 * that app unless the application itself is activated with `steal: true`.
 * Keep that stronger behavior confined to default-browser/second-instance
 * handoffs; ordinary background tab work must never pull Blanc forward. */
function bringExternalWindowToFront(application, window, { platform = process.platform } = {}) {
  if (!window || window.isDestroyed?.()) return false;
  if (window.isMinimized?.()) window.restore();
  window.show?.();
  window.moveTop?.();
  if (platform === 'darwin') application?.focus?.({ steal: true });
  window.focus?.();
  return true;
}

module.exports = { bringExternalWindowToFront };
