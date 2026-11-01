'use strict';
// Packaged test harness only. Refuse implicit persistent profiles.
const { app, BrowserWindow, Menu, components, dialog, protocol, session } = require('electron');
const { createDrmRuntime } = require('./drm-runtime');
const { registerLocalHtmlScheme, openIsolatedLocalHtml } = require('./ecs-local-html.cjs');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.BLANC_DRM_DIAGNOSTIC_PROFILE;
if (!profile || !path.isAbsolute(profile) || !fs.statSync(profile).isDirectory()) {
  app.exit(1);
} else {
  app.setPath('userData', profile);
  registerLocalHtmlScheme(protocol);
  app.userAgentFallback = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
  app.whenReady().then(async () => {
    const state = await createDrmRuntime({ app, components }).prepare();
    if (state.state !== 'ready') {
      dialog.showErrorBox('Widevine is not ready', JSON.stringify(state));
      app.quit(); return;
    }
    const win = new BrowserWindow({ width: 1200, height: 850,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.webContents.setUserAgent(app.userAgentFallback);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const webOnly = (event, url) => { if (!/^https?:\/\//i.test(url || event.url)) event.preventDefault(); };
    win.webContents.on('will-navigate', webOnly);
    win.webContents.on('will-frame-navigate', event => webOnly(event));
    win.webContents.on('will-redirect', event => webOnly(event));
    win.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Candidate', submenu: [{ role: 'quit' }] },
      { label: 'Test', submenu: [
        { label: 'Open isolated local HTML…', click: async () => {
          const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm', 'xhtml', 'xht', 'xhtm'] }] });
          if (!result.canceled && result.filePaths[0]) {
            try { await openIsolatedLocalHtml({ BrowserWindow, session }, result.filePaths[0]); }
            catch (error) { dialog.showErrorBox('Local preview could not open', error.message); }
          }
        } },
        { label: 'VMP Lab', click: () => win.loadURL('https://castlabs.github.io/wv-vmp-lab/') },
        { label: 'Spotify', click: () => win.loadURL('https://open.spotify.com/') },
      ] }, { role: 'editMenu' },
    ]));
    // Explicit candidate-only fixture entrypoint; never used by production.
    if (process.env.BLANC_ECS_LOCAL_HTML) {
      await openIsolatedLocalHtml({ BrowserWindow, session }, process.env.BLANC_ECS_LOCAL_HTML);
    }
    await win.loadURL('https://castlabs.github.io/wv-vmp-lab/');
  });
  app.on('window-all-closed', () => app.quit());
}
