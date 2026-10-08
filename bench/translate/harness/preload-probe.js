// bench/translate/harness/preload-probe.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probe', {
  report: (kind, data) => ipcRenderer.send('probe', location.pathname.replace(/^\//, ''), String(kind), data),
});
