'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Deliberately minimal: the capsule renderer gets show/hide and one reply
// call. No tab data, no window controls, no island API (spec: dedicated
// narrow preload; the rich browserAPI bridge must never attach here).
contextBridge.exposeInMainWorld('blancFillStatus', {
  onShow: (fn) => ipcRenderer.on('fill:show', (_e, payload) => fn(payload)),
  onHide: (fn) => ipcRenderer.on('fill:hide', (_e, payload) => fn(payload)),
  reply: (payload) => ipcRenderer.send('fill:reply', payload),
});
