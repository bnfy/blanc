'use strict';
const { app, BrowserWindow, ipcMain, nativeImage, protocol, session, net, screen } = require('electron');
const { createDisplayPicker } = require('../../../../src/main/display-picker');
const { setupChromeProtocol } = require('../../../../src/main/chrome-protocol');
protocol.registerSchemesAsPrivileged([{ scheme: 'blanc-chrome', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.whenReady().then(async () => {
  const partition = 'display-picker-test';
  setupChromeProtocol({ session: session.fromPartition(partition), net });
  const area = screen.getPrimaryDisplay().workArea;
  const parent = new BrowserWindow({ x: area.x + 24, y: area.y + 24, width: 500, height: 300, webPreferences: { sandbox: true } });
  await parent.loadURL('data:text/html,<h1>Blanc picker test</h1><p>Only synthetic sources are used.</p>');
  const choose = createDisplayPicker({ BrowserWindow, ipcMain, partition, screen,
    desktopCapturer: { getSources: async () => [{ id: 'screen:fixture', name: 'Test screen', thumbnail: nativeImage.createEmpty() },
      { id: 'window:fixture', name: 'Test window', thumbnail: nativeImage.createEmpty() },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `window:${i}`, name: `Synthetic window ${i}`, thumbnail: nativeImage.createEmpty() }))] } });
  globalThis.__pickerTest = {
    open(nativePicker = false) {
      const abort = new AbortController();
      this.abort = abort;
      this.result = undefined;
      choose({ window: parent, signal: abort.signal, id: 1, origin: 'https://meeting.example',
        nativePicker, audioRequested: true }).then((result) => { this.result = result ? { video: result.video?.id, audio: result.audio, native: result.native } : null; });
    },
  };
  await parent.webContents.executeJavaScript('window.fixtureReady = true');
});
app.on('window-all-closed', () => app.quit());
