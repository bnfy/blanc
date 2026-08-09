'use strict';

// Everything createTab does to a tab's WebContentsView: constructing it here,
// and (see wireTabView, added alongside) registering its listeners and setup
// calls. It lives outside main.js so the exact same construction and wiring can
// be replayed later on a tab whose renderer was discarded — the private-session
// ternary in particular must exist in exactly one place, or a rebuilt private
// tab silently joins the default session while the chrome still paints the
// dashed private pill.
const path = require('path');
const { WebContentsView, session } = require('electron');

const TAB_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Chromium's built-in PDF viewer is a plugin; without this flag
  // PDFs download instead of rendering inline.
  plugins: true,
  // Exposes a data API to our own blanc:// pages ONLY — see the guards in
  // tab-preload.js and pages.js. Ordinary web content gets only the
  // unprivileged, session-wide Chrome compatibility surface.
  preload: path.join(__dirname, 'tab-preload.js'),
};

/** Non-persistent session shared by all private tabs for this app run. */
let privateBrowsingSession = null;
const PRIVATE_PARTITION = 'private-browsing'; // no `persist:` prefix = memory only
const getPrivateBrowsingSession = () =>
  (privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));

/** After wc.close(), view.webContents reads back UNDEFINED, not destroyed —
 *  see main.js's reloadTabAfterSettingsFanout, where this exact dereference
 *  killed main once. Two steps, always: read, then test. */
const liveContents = (tab) => {
  const wc = tab?.view?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
};

/**
 * The ONLY place a tab's WebContentsView is constructed. Never returns null,
 * never navigates, never registers a listener.
 * @param {{private?: boolean}} tab a tab record, or any object with a boolean
 *   `private`. Safe to call before the record exists (createTab does).
 * @returns {import('electron').WebContentsView}
 */
function createTabView(tab) {
  return new WebContentsView({
    webPreferences: tab?.private
      ? { ...TAB_WEB_PREFERENCES, session: getPrivateBrowsingSession() }
      : TAB_WEB_PREFERENCES,
  });
}

module.exports = {
  createTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
  PRIVATE_PARTITION,
};
