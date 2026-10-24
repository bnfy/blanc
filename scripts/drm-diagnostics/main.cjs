'use strict';

// Run with node scripts/drm-diagnostics.cjs
// Uses a disposable profile and no production preload, permissions or session.
const { app, BrowserWindow, ipcMain, components } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createDrmRuntime } = require('../drm-runtime');

const profile = process.env.BLANC_DRM_DIAGNOSTIC_PROFILE;
if (!profile) throw new Error('Launch with node scripts/drm-diagnostics.cjs');
app.setPath('userData', profile);
const page = path.join(__dirname, 'index.html');
const pageURL = pathToFileURL(page).href;
const runtime = createDrmRuntime({ app, components });
let window;
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 850, height: 650, webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true, sandbox: true, nodeIntegration: false,
  } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  for (const operation of ['inspect', 'prepare']) {
    ipcMain.handle(`drm-diagnostics:${operation}`, event => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== pageURL) throw new Error('Untrusted diagnostic caller');
      return runtime[operation]();
    });
  }
  window.loadFile(page);
});
app.on('window-all-closed', () => app.quit());
