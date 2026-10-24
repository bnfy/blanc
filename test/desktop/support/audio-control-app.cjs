'use strict';
// Same minimal, sandboxed shell for both unmodified runtime controls.
const { app, BrowserWindow } = require('electron');
const target = process.argv.find(value => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(value));
if (!target) throw Error('A loopback audio fixture is required');
let window;
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 800, height: 600,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.loadURL(target);
});
app.on('window-all-closed', () => app.quit());
