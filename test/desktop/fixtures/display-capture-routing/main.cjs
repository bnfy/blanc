'use strict';

// Standalone prerequisite probe. Patched-policy mode permits only standard
// display authorization, then denies at source selection. No desktop sources
// are enumerated and no screen/audio data is recorded in either mode.
const { app, BrowserWindow, session, webFrameMain, webContents } = require('electron');
const http = require('node:http');

globalThis.__displayRouting = { requests: [], checks: [], selections: [], prompts: [], grants: [] };
let server;
app.whenReady().then(async () => {
  const ses = session.fromPartition('display-routing-probe');
  const installedPolicy = {};
  const patched = process.env.BLANC_PROBE_POLICY === 'patched';
  let controller;
  if (patched) {
    controller = require('../../../../src/main/display-capture').createDisplayCaptureController({
      resolveContext(wc, details) {
        const frame = webFrameMain.fromId(details.requestingProcessId, details.requestingFrameId);
        if (!frame || webContents.fromFrame(frame) !== wc || frame !== wc.mainFrame) return null;
        const origin = new URL(frame.url).origin;
        if (origin !== new URL(details.securityOrigin).origin) return null;
        return { wc, frame, origin, ownerKey: wc.id,
          valid: () => !wc.isDestroyed() && wc.mainFrame === frame && new URL(frame.url).origin === origin };
      },
      choose: async () => ({ video: { id: 'synthetic:never-captured' }, audio: false }),
      onGrant: (_context, scopes) => globalThis.__displayRouting.grants.push(scopes),
    });
  }
  if (process.env.BLANC_PROBE_POLICY === 'blanc' || patched) {
    const policy = require('../../../../src/main/permissions');
    policy.setPermissionPrompter(async ({ permission, mediaTypes }) => {
      globalThis.__displayRouting.prompts.push({ permission, mediaTypes });
      return false;
    });
    // Register against the real native session so policy's session-identity
    // check is exercised. Capture its handlers before adding observations.
    const registrations = ['setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDisplayMediaRequestHandler'];
    const originals = registrations.map((key) => ses[key]);
    try {
      ses.setPermissionRequestHandler = (fn) => { installedPolicy.request = fn; };
      ses.setPermissionCheckHandler = (fn) => { installedPolicy.check = fn; };
      ses.setDisplayMediaRequestHandler = (fn) => { installedPolicy.select = fn; };
      policy.setupPermissionPolicy(ses, { persistDecisions: false, displayCapture: controller });
    } finally {
      registrations.forEach((key, i) => { ses[key] = originals[i]; });
    }
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
    const observation = {
      audioRequested: request.audioRequested,
      videoRequested: request.videoRequested,
      userGesture: request.userGesture,
    };
    globalThis.__displayRouting.selections.push(observation);
    if (patched) {
      installedPolicy.select(request, (selected) => {
        observation.controllerAuthorized = selected.video?.id === 'synthetic:never-captured';
        observation.audioIncluded = !!selected.audio;
        callback({}); // Never pass the synthetic source to Chromium.
        controller.settle(webContents.fromFrame(request.frame), request.frame, 'rejected');
      });
    } else callback({});
  }, { useSystemPicker: process.env.BLANC_PROBE_SYSTEM_PICKER === '1' });
  server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><meta charset="utf-8">
      <title>Blanc display-capture permission probe</title>
      <h1>Permission routing check</h1>
      <p>Every capture is denied before source delivery. Nothing is recorded or uploaded.</p>
      <button id="display">Screen request</button>
      <button id="legacy">Legacy desktop request</button>
      <button id="mixed">Mixed microphone and legacy desktop request</button>
      <button id="camera">Camera request</button>
      <output id="result">idle</output>
      <script>
        for (const mode of ['display', 'legacy', 'mixed', 'camera']) {
          document.getElementById(mode).onclick = async () => {
            document.getElementById('result').textContent = 'pending';
            try {
              const stream = mode === 'display'
                ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                : await navigator.mediaDevices.getUserMedia(mode === 'camera'
                  ? { video: true }
                  : { ...(mode === 'mixed' ? { audio: true } : {}), video: { mandatory: { chromeMediaSource: 'desktop' } } });
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
