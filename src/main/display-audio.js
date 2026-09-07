'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const AUDIO_URL = 'blanc-chrome://display-audio/';

function createDisplayAudio({ app, WebContentsView, ipcMain, partition, onFailure }) {
  return async ({ signal }) => {
    if (process.platform !== 'linux') return { source: 'loopback', dispose() {} };
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'audio-monitor')
      : path.join(__dirname, '../../native/linux/audio-monitor');
    fs.accessSync(executable, fs.constants.X_OK);
    const view = new WebContentsView({ webPreferences: {
      partition, preload: path.join(__dirname, 'display-audio-preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    } });
    const wc = view.webContents;
    // Muting the output group does not mute Chromium's loopback tap. Keep
    // the bridge permanently muted, including before capture connects and
    // after a site stops its audio track, so monitor PCM cannot feed back.
    wc.setAudioMuted(true);
    let child = null;
    let disposed = false;
    let timer = null;
    let deliveryTimer = null;
    let sequence = 0;
    let awaiting = null;
    let started = false;
    const acknowledge = (event, id) => {
      if (disposed || event.sender !== wc || event.senderFrame !== wc.mainFrame
          || wc.getURL() !== AUDIO_URL || id !== awaiting) return;
      awaiting = null;
      clearTimeout(deliveryTimer);
      child?.stdout.resume();
    };
    ipcMain.on('display-audio:ack', acknowledge);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      clearTimeout(deliveryTimer);
      ipcMain.removeListener('display-audio:ack', acknowledge);
      signal.removeEventListener('abort', dispose);
      child?.kill();
      if (!wc.isDestroyed()) wc.close();
    };
    signal.addEventListener('abort', dispose, { once: true });
    wc.once('destroyed', dispose);
    wc.once('render-process-gone', dispose);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (event) => event.preventDefault());
    wc.on('will-redirect', (event) => event.preventDefault());
    try {
      await wc.loadURL(AUDIO_URL);
      await wc.executeJavaScript('window.prepareAudio()', true);
      if (disposed || signal.aborted) throw new Error('Computer audio cancelled');
    } catch (error) { dispose(); throw error; }
    return { source: wc.mainFrame, dispose, start() {
      if (disposed || started) return;
      started = true;
      const deadline = Date.now() + 5000;
      // Wait for a native audio capturer before starting the monitor. The
      // independent permanent output mute also covers connection/stop races.
      timer = setInterval(() => {
        if (disposed) return;
        if (wc.isBeingCaptured()) {
          clearInterval(timer);
          child = spawn(executable, [], { stdio: ['ignore', 'pipe', 'pipe'] });
          const fail = () => {
            if (!disposed) { dispose(); onFailure?.('Computer audio stopped. Check your output device and share again.'); }
          };
          let ready = false;
          deliveryTimer = setTimeout(fail, 5000);
          child.stderr.on('data', (bytes) => {
            if (!ready && bytes.toString().includes('READY')) {
              ready = true;
              if (awaiting === null) clearTimeout(deliveryTimer);
            }
          });
          child.stdout.on('data', (bytes) => {
            if (disposed) return;
            // One bounded IPC chunk in flight, acknowledged only after the
            // worklet consumes it. Backpressure remains in the OS pipe.
            child.stdout.pause();
            if (bytes.byteLength > 65536 || awaiting !== null) { fail(); return; }
            awaiting = ++sequence;
            clearTimeout(deliveryTimer);
            deliveryTimer = setTimeout(fail, 2000);
            wc.send('display-audio:pcm', { id: awaiting, bytes });
          });
          child.once('error', fail);
          child.once('exit', fail);
        } else if (Date.now() > deadline) {
          dispose(); onFailure?.('Computer audio could not connect. Share again without audio.');
        }
      }, 25);
    } };
  };
}
module.exports = { createDisplayAudio };
