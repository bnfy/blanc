'use strict';

const path = require('node:path');
const PICKER_URL = 'blanc-chrome://display/';

function createDisplayPicker({ BrowserWindow, ipcMain, desktopCapturer, screen, partition }) {
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
      const area = screen.getDisplayMatching(context.window.getBounds()).workArea;
      const width = Math.min(740, area.width);
      const height = Math.min(context.nativePicker ? 340 : 580, area.height);
      const centered = { x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2), width, height };
      // macOS modal children become title-bar sheets whose placement the OS
      // owns. Use a positioned child and explicitly disable its owner there.
      const centeredMacDialog = process.platform === 'darwin';
      const ownerWasEnabled = context.window.isEnabled();
      const win = new BrowserWindow({
        parent: context.window, modal: !centeredMacDialog, show: false, ...centered,
        minWidth: Math.min(480, width), minHeight: Math.min(300, height), title: 'Share your screen', autoHideMenuBar: true,
        webPreferences: { partition, preload: path.join(__dirname, 'display-picker-preload.js'),
          sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      if (centeredMacDialog && ownerWasEnabled) context.window.setEnabled(false);
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
        if (centeredMacDialog && ownerWasEnabled && !context.window.isDestroyed()) context.window.setEnabled(true);
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
      win.once('ready-to-show', () => {
        if (settled) return;
        win.show();
        win.setBounds(centered);
        win.focus();
      });
      wc.loadURL(PICKER_URL).catch(cancel);
    });
  };
}

module.exports = { createDisplayPicker, PICKER_URL };
