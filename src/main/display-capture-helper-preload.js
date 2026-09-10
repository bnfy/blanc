'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blancDisplayCaptureHelper', {
  ready: () => ipcRenderer.send('display-capture-helper:ready'),
  onAuthorize: (fn) => ipcRenderer.on('display-capture-helper:authorize', (_e, payload) => fn(payload)),
  onSignal: (fn) => ipcRenderer.on('display-capture-helper:signal', (_e, payload) => fn(payload)),
  signal: (payload) => ipcRenderer.send('display-capture-helper:signal', payload),
  stopped: (payload) => ipcRenderer.send('display-capture-helper:stopped', payload),
});
