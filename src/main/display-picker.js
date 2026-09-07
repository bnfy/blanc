'use strict';

const path = require('node:path');
const PICKER_URL = 'blanc-chrome://display/';

function createDisplayPicker({ BrowserWindow, ipcMain, desktopCapturer, partition }) {
  const requests = new Map();
  ipcMain.handle('display-picker:state', (event) =>
    event.senderFrame === event.sender.mainFrame && event.sender.getURL() === PICKER_URL
      ? requests.get(event.sender.id)?.payload ?? null : null);
  ipcMain.on('display-picker:reply', (event, reply) => {
    const record = requests.get(event.sender.id);
    if (!record || event.senderFrame !== event.sender.mainFrame || event.sender.getURL() !== PICKER_URL) return;
    if (!reply || reply.id !== record.payload.id) return;
    if (reply.cancel === true) { record.finish(null); return; }
    if (record.payload.nativePicker) { record.finish({ native: true }); return; }
    const video = record.sources.get(reply.source);
    if (!video) return;
    record.finish({ video, audio: record.payload.audioRequested && reply.audio === true });
  });
  return async (context) => {
    if (context.signal.aborted || context.window.isDestroyed()) return null;
    const sources = context.nativePicker ? [] : await desktopCapturer.getSources({
      types: ['screen', 'window'], thumbnailSize: { width: 280, height: 170 }, fetchWindowIcons: false,
    });
    if (context.signal.aborted || context.window.isDestroyed()) return null;
    if (!context.nativePicker && sources.length === 0) {
      throw new Error('No screens or windows are available. Check screen-recording permissions and retry.');
    }
    return new Promise((resolve) => {
      const win = new BrowserWindow({
        parent: context.window, modal: true, show: false, width: 740, height: context.nativePicker ? 340 : 580,
        minWidth: 480, minHeight: 300, title: 'Share your screen', autoHideMenuBar: true,
        webPreferences: { partition, preload: path.join(__dirname, 'display-picker-preload.js'),
          sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      const wc = win.webContents;
      const id = wc.id;
      const choices = new Map(sources.map((source, index) => [String(index), source]));
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        requests.delete(id);
        context.signal.removeEventListener('abort', cancel);
        if (!win.isDestroyed()) win.destroy();
        resolve(result);
      };
      const cancel = () => finish(null);
      context.signal.addEventListener('abort', cancel, { once: true });
      requests.set(id, { finish, sources: choices, payload: {
        id: context.id, origin: context.origin, nativePicker: context.nativePicker,
        audioRequested: context.audioRequested,
        sources: [...choices].map(([key, source]) => ({ key, name: source.name,
          thumbnail: source.thumbnail?.toDataURL() ?? '', type: source.id.startsWith('screen:') ? 'screen' : 'window' })),
      } });
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (event) => event.preventDefault());
      wc.on('will-redirect', (event) => event.preventDefault());
      wc.on('will-attach-webview', (event) => event.preventDefault());
      wc.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') { event.preventDefault(); cancel(); }
      });
      win.once('closed', cancel);
      wc.once('render-process-gone', cancel);
      wc.once('did-fail-load', cancel);
      win.once('ready-to-show', () => { if (!settled) win.show(); });
      wc.loadURL(PICKER_URL).catch(cancel);
    });
  };
}

module.exports = { createDisplayPicker, PICKER_URL };
