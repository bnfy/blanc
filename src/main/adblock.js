const { app } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fs = require('fs');
const path = require('path');

// Cache the compiled filter engine on disk so we don't re-fetch and
// re-parse EasyList/EasyPrivacy on every launch. The engine validates the
// cache against its own format version and rebuilds automatically when the
// library updates; delete the file to force a refresh of the block lists.
const CACHE_VERSION = 2;
const cachePath = () =>
  path.join(app.getPath('userData'), `adblock-engine.v${CACHE_VERSION}.bin`);

/** @type {ElectronBlocker | null} */
let blocker = null;
/** @type {Electron.Session | null} */
let attachedSession = null;

/**
 * Loads (or builds + caches) the blocking engine, then attaches it to a
 * session so every request made through that session — from any tab —
 * is filtered. Because this runs at the network layer instead of through
 * Chrome's extension APIs, it isn't subject to Manifest V3's
 * declarativeNetRequest rule caps or the loss of the webRequest API.
 *
 * Cosmetic filtering (hiding leftover ad *elements*, not just blocking
 * requests) is handled by the library: `enableBlockingInSession` registers
 * a session preload script that reports DOM state, and the engine responds
 * by calling `insertCSS`/`executeJavaScript` on the page's webContents.
 *
 * @param {Electron.Session} session - typically session.defaultSession
 * @param {{ enabled?: boolean }} [options]
 * @returns {Promise<ElectronBlocker>}
 */
async function setupAdBlocker(session, { enabled = true } = {}) {
  blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
    path: cachePath(),
    read: fs.promises.readFile,
    write: fs.promises.writeFile,
  });

  attachedSession = session;
  if (enabled) blocker.enableBlockingInSession(session);
  return blocker;
}

/** Toggle blocking at runtime (used by the settings page). */
function setAdBlockEnabled(enabled) {
  if (!blocker || !attachedSession) return;
  const isEnabled = blocker.isBlockingEnabled(attachedSession);
  if (enabled && !isEnabled) blocker.enableBlockingInSession(attachedSession);
  if (!enabled && isEnabled) blocker.disableBlockingInSession(attachedSession);
}

function getBlocker() {
  return blocker;
}

module.exports = { setupAdBlocker, setAdBlockEnabled, getBlocker };
