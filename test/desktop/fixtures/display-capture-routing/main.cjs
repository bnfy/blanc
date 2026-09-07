'use strict';

// Standalone Electron prerequisite probe. Every permission request is denied;
// no desktop sources are enumerated and no screen/audio data is recorded.
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');

globalThis.__displayRouting = { requests: [], checks: [], selections: [], prompts: [] };
let server;
app.whenReady().then(async () => {
  const ses = session.fromPartition('display-routing-probe');
  const installedPolicy = {};
  if (process.env.BLANC_PROBE_POLICY === 'blanc') {
    const policy = require('../../../../src/main/permissions');
    policy.setPermissionPrompter(async ({ permission, mediaTypes }) => {
      globalThis.__displayRouting.prompts.push({ permission, mediaTypes });
      return false;
    });
    policy.setupPermissionPolicy({
      setPermissionRequestHandler(fn) { installedPolicy.request = fn; },
      setPermissionCheckHandler(fn) { installedPolicy.check = fn; },
      setDisplayMediaRequestHandler() {},
    }, { persistDecisions: false });
  }
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    globalThis.__displayRouting.requests.push({ permission, details });
    if (installedPolicy.request) installedPolicy.request(wc, permission, callback, details);
    else callback(false);
  });
  ses.setPermissionCheckHandler((wc, permission, origin, details) => {
    globalThis.__displayRouting.checks.push({ permission, origin, details });
    return installedPolicy.check ? installedPolicy.check(wc, permission, origin, details) : false;
  });
  ses.setDisplayMediaRequestHandler((request, callback) => {
    globalThis.__displayRouting.selections.push({
      audioRequested: request.audioRequested,
      videoRequested: request.videoRequested,
      userGesture: request.userGesture,
    });
    callback({});
  }, { useSystemPicker: process.env.BLANC_PROBE_SYSTEM_PICKER === '1' });
  server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><meta charset="utf-8">
      <title>Blanc display-capture permission probe</title>
      <h1>Permission routing check</h1>
      <p>All permissions are denied. Nothing is recorded or uploaded.</p>
      <button id="display">Screen request</button>
      <button id="legacy">Legacy desktop request</button>
      <button id="camera">Camera request</button>
      <output id="result">idle</output>
      <script>
        for (const mode of ['display', 'legacy', 'camera']) {
          document.getElementById(mode).onclick = async () => {
            document.getElementById('result').textContent = 'pending';
            try {
              const stream = mode === 'display'
                ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                : await navigator.mediaDevices.getUserMedia(mode === 'camera'
                  ? { video: true }
                  : { video: { mandatory: { chromeMediaSource: 'desktop' } } });
              stream.getTracks().forEach((track) => track.stop());
              document.getElementById('result').textContent = 'unexpected-grant';
            } catch (error) {
              document.getElementById('result').textContent = error.name;
            }
          };
        }
      </script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({
    width: 700, height: 330,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => server?.close());
