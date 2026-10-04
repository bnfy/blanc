'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('blancUboPopup', {
  layout: height => {
    if (Number.isFinite(height) && height >= 0 && height <= 20000) ipcRenderer.send('ublock:popup', { action: 'layout', height });
  },
  close: () => ipcRenderer.send('ublock:popup', { action: 'close' }),
  back: () => ipcRenderer.send('ublock:popup', { action: 'back' }),
  listen: callback => {
    if (typeof callback === 'function') ipcRenderer.on('ublock:popup-state', (_event, value) => callback(value));
  },
});
