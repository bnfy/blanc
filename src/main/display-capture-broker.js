'use strict';

const { CHROME_DISPLAY_CAPTURE_HELPER_URL } = require('./chrome-protocol');

const HELPER_PARTITION = 'blanc-display-capture-helper';

function createHelperAuthority() {
  const tokens = new WeakSet();

  function authorize(wc) {
    if (wc) tokens.add(wc);
  }

  function revoke(wc) {
    if (wc) tokens.delete(wc);
  }

  function isAuthorizedHelperSender(wc, url) {
    if (!wc || typeof wc.isDestroyed !== 'function' || wc.isDestroyed() === true) return false;
    if (url !== CHROME_DISPLAY_CAPTURE_HELPER_URL) return false;
    let current;
    try { current = wc.getURL(); } catch { return false; }
    if (current !== CHROME_DISPLAY_CAPTURE_HELPER_URL) return false;
    return tokens.has(wc);
  }

  return { authorize, revoke, isAuthorizedHelperSender };
}

function createHelperSession({ sessionFactory, setupChromeProtocol, net }) {
  const ses = sessionFactory.fromPartition(HELPER_PARTITION);
  setupChromeProtocol({ session: ses, net });
  return ses;
}

function attachHelperWindow({
  BrowserWindow,
  session: helperSession,
  preloadPath,
  lockPrivilegedNavigation,
  authority,
}) {
  const win = new BrowserWindow({
    show: false,
    width: 100,
    height: 100,
    webPreferences: {
      session: helperSession,
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  lockPrivilegedNavigation(win.webContents, CHROME_DISPLAY_CAPTURE_HELPER_URL);
  authority.authorize(win.webContents);
  win.webContents.on('destroyed', () => authority.revoke(win.webContents));
  win.loadURL(CHROME_DISPLAY_CAPTURE_HELPER_URL);
  return win;
}

module.exports = {
  HELPER_PARTITION,
  createHelperAuthority,
  createHelperSession,
  attachHelperWindow,
  isAuthorizedHelperSender: (wc, url, authority) => authority.isAuthorizedHelperSender(wc, url),
};
