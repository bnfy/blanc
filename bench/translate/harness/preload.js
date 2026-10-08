// bench/translate/harness/preload.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('benchAPI', {
  hello: () => ipcRenderer.send('bench:hello'),
  getInputs: () => ipcRenderer.invoke('bench:inputs'),
  mark: (phase) => ipcRenderer.send('bench:mark', String(phase)),
  report: (cycle) => ipcRenderer.send('bench:report', cycle),
  onTerminate: (cb) => ipcRenderer.on('bench:terminate', () => cb()),
  terminated: () => ipcRenderer.send('bench:terminated'),
  fail: (message) => ipcRenderer.send('bench:fail', String(message)),
});
