'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioProbe', {
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  on: (channel, fn) => {
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
