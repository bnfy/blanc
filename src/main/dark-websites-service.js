'use strict';

// Dark websites: main-process wiring. Policy lives in dark-websites.js and the
// stylesheet fetch in dark-websites-fetch.js; this module owns the IPC, the
// live updates to open tabs, and the "/dark-site" command. Electron objects
// are injected so the unit tests can drive it without a window.

const {
  GET_CHANNEL,
  UPDATE_CHANNEL,
  FETCH_CHANNEL,
  shouldDarken,
  resolveDarkSiteCommand,
} = require('./dark-websites');
const { createStylesheetFetcher } = require('./dark-websites-fetch');

// The preload runs only in http(s) main frames; anything else gets "off".
function mainFrameWebUrl(event) {
  const frame = event?.senderFrame;
  if (!frame || frame.parent) return null;
  const url = typeof frame.url === 'string' ? frame.url : '';
  return /^https?:/i.test(url) ? url : null;
}

function isPrivateContents(wc) {
  try {
    return wc?.session?.isPersistent?.() === false;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   ipcMain: Electron.IpcMain,
 *   nativeTheme: Electron.NativeTheme,
 *   settings: { getSettings(): object, setSettings(partial: object): object },
 *   getFetchSession: () => Electron.Session,
 *   forEachTabContents: (fn: (wc: Electron.WebContents) => void) => void,
 *   allowStylesheet: (wc: Electron.WebContents, url: string) => Promise<boolean>,
 * }} deps
 */
function createDarkWebsitesService({ ipcMain, nativeTheme, settings, getFetchSession, forEachTabContents, allowStylesheet }) {
  // This run's /dark-site choices from private tabs, by hostname. Memory only.
  const privateOverrides = new Map();
  const fetchStylesheet = createStylesheetFetcher({ getSession: getFetchSession });
  const watched = new WeakSet();

  function stateFor(url, isPrivate) {
    const s = settings.getSettings();
    return {
      on: shouldDarken({
        url,
        enabled: s.darkWebsites,
        exceptions: s.darkWebsitesExceptions,
        systemDark: nativeTheme.shouldUseDarkColors === true,
        isPrivate,
        privateOverrides,
      }),
    };
  }

  function broadcast() {
    forEachTabContents((wc) => {
      if (!wc || wc.isDestroyed()) return;
      let url = '';
      try { url = wc.getURL(); } catch { return; }
      if (!/^https?:/i.test(url)) return;
      try { wc.send(UPDATE_CHANNEL, stateFor(url, isPrivateContents(wc))); } catch {}
    });
  }

  function install() {
    ipcMain.on(GET_CHANNEL, (event) => {
      const url = mainFrameWebUrl(event);
      event.returnValue = url ? stateFor(url, isPrivateContents(event.sender)) : { on: false };
    });
    ipcMain.handle(FETCH_CHANNEL, async (event, rawUrl) => {
      if (!mainFrameWebUrl(event)) return null;
      const wc = event.sender;
      // Only pages currently being darkened may use the fetch.
      if (!stateFor(wc.getURL(), isPrivateContents(wc)).on) return null;
      if (!watched.has(wc)) {
        watched.add(wc);
        wc.once('destroyed', () => fetchStylesheet.forget(wc.id));
      }
      return fetchStylesheet(wc.id, rawUrl, (url) => allowStylesheet(wc, url));
    });
    nativeTheme.on('updated', broadcast);
  }

  /**
   * "/dark-site" for a tab. Resolves to null when the tab has no website, or
   * to the hostname and whether it is now darkened when Blanc is dark.
   */
  function runDarkSiteCommand(tab) {
    if (!tab) return null;
    const s = settings.getSettings();
    const result = resolveDarkSiteCommand({
      url: tab.url,
      enabled: s.darkWebsites,
      exceptions: s.darkWebsitesExceptions,
      isPrivate: tab.private === true,
      privateOverrides,
    });
    if (!result) return null;
    if (result.privateOverride !== null) privateOverrides.set(result.hostname, result.privateOverride);
    // A settings write broadcasts through onSettingsChanged; an override-only
    // change has to broadcast itself.
    if (result.settings) settings.setSettings(result.settings);
    else broadcast();
    return { hostname: result.hostname, darkened: result.darkened };
  }

  return { install, broadcast, runDarkSiteCommand, stateFor };
}

module.exports = { createDarkWebsitesService, mainFrameWebUrl, isPrivateContents };
