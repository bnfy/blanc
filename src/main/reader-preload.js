'use strict';
const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame && /^blanc-reader:\/\/[a-f0-9-]+\/$/.test(window.location.href)) {
  contextBridge.exposeInMainWorld('readerAPI', {
    initialize: () => ipcRenderer.invoke('reader:initialize'),
    exit: () => ipcRenderer.invoke('reader:exit'),
    appearance: value => ipcRenderer.invoke('reader:appearance', value),
    openLink: (url, background) => ipcRenderer.invoke('reader:open-link', url, background === true),
  });
}
