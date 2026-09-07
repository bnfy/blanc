'use strict';
const { ipcRenderer } = require('electron');
if (window.location.href === 'blanc-chrome://display-audio/') {
  ipcRenderer.on('display-audio:pcm', (_event, { id, bytes }) => {
    if (!Number.isSafeInteger(id) || !(bytes instanceof Uint8Array) || bytes.byteLength > 65536) return;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    window.postMessage({ type: 'pcm', id, buffer }, '*', [buffer]);
  });
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.type === 'pcm-ack' && Number.isSafeInteger(event.data.id)) {
      ipcRenderer.send('display-audio:ack', event.data.id);
    }
  });
}
