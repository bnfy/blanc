'use strict';

function httpOrigin(value) {
  try {
    const origin = new URL(value).origin;
    return origin.startsWith('http') ? origin : null;
  } catch {
    return null;
  }
}

function captureRequestStillValid(
  { frame, wc, origin, tabId, navEpoch },
  { webContentsFromFrame, getTab, getActiveTabId, isUtilitySheetVisible }
) {
  if (!frame || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) return false;
  if (!wc || wc.isDestroyed()) return false;

  let owner;
  try {
    owner = webContentsFromFrame(frame);
  } catch {
    return false;
  }
  if (owner !== wc) return false;
  if (httpOrigin(frame.origin || frame.url) !== origin) return false;

  const tab = getTab(tabId);
  return !!tab
    && tab.view.webContents === wc
    && tab.navEpoch === navEpoch
    && getActiveTabId() === tabId
    && !isUtilitySheetVisible();
}

module.exports = { httpOrigin, captureRequestStillValid };
