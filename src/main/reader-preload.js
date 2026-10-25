'use strict';
const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame && /^blanc-reader:\/\/[a-f0-9-]+\/$/.test(window.location.href)) {
  contextBridge.exposeInMainWorld('readerAPI', {
    initialize: () => ipcRenderer.invoke('reader:initialize'),
    exit: () => ipcRenderer.invoke('reader:exit'),
    appearance: value => ipcRenderer.invoke('reader:appearance', value),
    openLink: (url, disposition) => ipcRenderer.invoke('reader:open-link', url,
      ['current-tab', 'background-tab', 'foreground-tab', 'new-window'].includes(disposition) ? disposition : null),
  });
}
