// Preload for the basic-auth dialog window only. Exposed solely on the
// blanc://auth page; the main-process listener re-checks the sender URL.
const { contextBridge, ipcRenderer } = require('electron');

if (window.location.protocol === 'blanc:' && window.location.host === 'auth') {
  contextBridge.exposeInMainWorld('bowserAuth', {
    submit: (id, username, password) => ipcRenderer.send(`auth:submit:${id}`, { username, password }),
    cancel: (id) => ipcRenderer.send(`auth:submit:${id}`, null),
  });
}
