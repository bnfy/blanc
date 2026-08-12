const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { isTrustedAuthEvent } = require('./auth-dialog-trust');

// Serialized so overlapping 401s (page + subresources) don't stack dialogs.
let chain = Promise.resolve();
let counter = 0;

/**
 * Modal credentials prompt for HTTP basic/digest auth.
 * Resolves {username, password}, or null if dismissed.
 */
function promptForCredentials(parent, authInfo) {
  const run = () =>
    new Promise((resolve) => {
      const id = ++counter;
      const dialogWin = new BrowserWindow({
        parent: parent ?? undefined,
        modal: !!parent,
        width: 400,
        height: 250,
        resizable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
          preload: path.join(__dirname, 'auth-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      dialogWin.setMenuBarVisibility(false);
      const dialogContents = dialogWin.webContents;
      const channel = `auth:submit:${id}`;

      let settled = false;
      const done = (creds) => {
        if (settled) return;
        settled = true;
        ipcMain.removeListener(channel, onSubmit);
        if (!dialogWin.isDestroyed()) dialogWin.close();
        resolve(creds);
      };

      const onSubmit = (event, creds) => {
        if (!isTrustedAuthEvent(event, dialogContents, id)) return;
        if (creds && typeof creds.username === 'string' && typeof creds.password === 'string') {
          done({ username: creds.username, password: creds.password });
        } else {
          done(null);
        }
      };
      ipcMain.on(channel, onSubmit);
      dialogWin.on('closed', () => done(null));

      const q = new URLSearchParams({ id: String(id), host: authInfo.host ?? '', realm: authInfo.realm ?? '' });
      const dialogUrl = `blanc://auth/?${q}`;
      dialogContents.on('will-navigate', (event, target) => {
        if (target !== dialogUrl) event.preventDefault();
      });
      dialogContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      dialogWin.loadURL(dialogUrl);
    });

  chain = chain.then(run, run);
  return chain;
}

module.exports = { promptForCredentials };
