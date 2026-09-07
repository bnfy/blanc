'use strict';
const { contextBridge, ipcRenderer } = require('electron');
if (window.location.href === 'blanc-chrome://display/') {
  contextBridge.exposeInMainWorld('displayPicker', {
    state: () => ipcRenderer.invoke('display-picker:state'),
    reply: (reply) => ipcRenderer.send('display-picker:reply', reply),
  });
}
