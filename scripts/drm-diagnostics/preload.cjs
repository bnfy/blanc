'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('drmDiagnostics', {
  inspect: () => ipcRenderer.invoke('drm-diagnostics:inspect'),
  prepare: () => ipcRenderer.invoke('drm-diagnostics:prepare'),
});
