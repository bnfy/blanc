'use strict';

const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
} = require('../../../src/main/display-capture-flags');
const { filterSignaling } = require('../../../src/main/display-capture-ice');

const RESULT = path.join(__dirname, 'result.md');
const PROFILE = path.join(__dirname, '.probe-profile');
const AUDIO = path.join(__dirname, '../audio-probe');

const prior = app.commandLine.getSwitchValue('disable-features');
app.commandLine.appendSwitch(
  'disable-features',
  mergeDisabledFeatures(prior, process.platform === 'darwin' ? [MAC_CATAP_LOOPBACK_FEATURE] : [])
);

function startServer() {
  const files = {
    '/helper': path.join(AUDIO, 'helper.html'),
    '/receiver': path.join(AUDIO, 'receiver.html'),
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = files[req.url];
      if (!file) {
        res.writeHead(404);
        res.end('no');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitIpc(channel, timeoutMs, pred = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener(channel, onMsg);
      reject(new Error(`timeout waiting for ${channel}`));
    }, timeoutMs);
    const onMsg = (_e, payload) => {
      if (!pred(payload)) return;
      clearTimeout(timer);
      ipcMain.removeListener(channel, onMsg);
      resolve({ sender: _e.sender, payload });
    };
    ipcMain.on(channel, onMsg);
  });
}

async function click(wc, id) {
  const box = await wc.executeJavaScript(`(() => {
    const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`, false);
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

async function run() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.setPath('userData', PROFILE);
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const helperSes = session.fromPartition('relay-probe-helper');
  helperSes.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture');
  });
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const source = sources[0];
  helperSes.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: source, audio: 'loopback' });
  });

  const helper = new BrowserWindow({
    width: 320,
    height: 200,
    show: true,
    webPreferences: {
      session: helperSes,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(AUDIO, 'preload.cjs'),
    },
  });
  const receiver = new BrowserWindow({
    width: 320,
    height: 200,
    show: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(AUDIO, 'preload.cjs'),
    },
  });
  ipcMain.on('audio-probe:helper-offer', (_e, msg) => receiver.webContents.send('audio-probe:helper-offer', msg));
  ipcMain.on('audio-probe:page-answer', (_e, msg) => helper.webContents.send('audio-probe:page-answer', msg));

  await receiver.loadURL(`${origin}/receiver`);
  await helper.loadURL(`${origin}/helper`);
  await new Promise((r) => setTimeout(r, 200));
  receiver.focus();
  await click(receiver.webContents, 'arm');
  await waitIpc('audio-probe:armed', 4000);
  helper.focus();
  await click(helper.webContents, 'go');
  await waitIpc('audio-probe:clicked', 4000);
  const energyP = waitIpc('audio-probe:energy', 20000);
  helper.webContents.send('audio-probe:run', { name: 'relay-legit', api: 'getDisplayMedia' });
  const helperResult = (await waitIpc('audio-probe:helper-result', 15000, (p) => p.name === 'relay-legit')).payload;
  const energy = helperResult.ok ? (await energyP).payload : null;

  const local = new Set(['127.0.0.1', '::1', '192.168.1.20']);
  const publicLine = 'a=candidate:1 1 UDP 2122260223 8.8.8.8 59999 typ host';
  const publicSdp = [
    'v=0',
    'o=- 0 0 IN IP4 8.8.8.8',
    's=-',
    'c=IN IP4 8.8.8.8',
    't=0 0',
    publicLine,
    '',
  ].join('\n');
  const filteredCandidate = filterSignaling(publicLine, { localAddresses: local });
  const filteredSdp = filterSignaling(publicSdp, { localAddresses: local });
  const forwarded = [];
  if (filteredCandidate.ok) forwarded.push(filteredCandidate);
  if (filteredSdp.ok) forwarded.push(filteredSdp);

  const helperStats = await helper.webContents.executeJavaScript(`(async () => {
    const pcs = [];
    return { ice: null };
  })()`, false).catch((err) => ({ error: String(err.message) }));

  const lines = [
    '# Same-machine relay + tampered-destination probe',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- Electron: ${process.versions.electron}`,
    `- Chromium: ${process.versions.chrome}`,
    `- Platform: ${process.platform} ${process.arch}`,
    '',
    '## 1. Legitimate same-machine relay',
    '',
    `- Helper getDisplayMedia + handler audio loopback: ${helperResult.ok ? 'ok' : helperResult.error}`,
    `- Video: ${JSON.stringify(helperResult.tracks?.find((t) => t.kind === 'video') || null)}`,
    `- Receiver energy peak: ${energy?.peak}`,
    `- Receiver iceConnectionState: ${energy?.iceConnectionState}`,
    '',
    '## 2–3. Tampered destination (SDP-embedded and separate ICE)',
    '',
    `- Public candidate forwarded to helper: ${filteredCandidate.ok}`,
    `- Public SDP (c= + a=candidate 8.8.8.8) accepted: ${filteredSdp.ok} reason=${filteredSdp.reason || 'n/a'}`,
    `- Payloads that would have been sent to helper.addIceCandidate / setRemoteDescription: ${forwarded.length}`,
    '',
    'A dropped-candidate log is supporting only. Confinement is the filter refusing',
    'off-machine IPs before they reach the helper peer connection, plus the',
    'legitimate relay above staying connected on same-machine ICE.',
    '',
    '```json',
    JSON.stringify({ helperResult, energy, filteredCandidate, filteredSdp, helperStats }, null, 2),
    '```',
    '',
  ];
  fs.writeFileSync(RESULT, `${lines.join('\n')}\n`);
  helper.close();
  receiver.close();
  server.close();
  app.quit();
}

app.whenReady().then(run).catch((err) => {
  fs.writeFileSync(RESULT, `# Relay probe failed\n\n${err.stack}\n`);
  app.exit(1);
});

app.on('quit', () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
});
