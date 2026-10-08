// bench/translate/harness/preload-cmd.js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('benchAPI', {
  hello: () => ipcRenderer.send('cmd:hello'),
  getInputs: () => ipcRenderer.invoke('bench:inputs'),
  onCommand: (cb) => ipcRenderer.on('cmd:run', (_e, c) => cb(c)),
  reply: (id, data) => ipcRenderer.send('cmd:reply', id, data),
  probe: (kind, data) => ipcRenderer.send('probe', 'engine', String(kind), data),
  fail: (message) => ipcRenderer.send('bench:fail', String(message)),
});
