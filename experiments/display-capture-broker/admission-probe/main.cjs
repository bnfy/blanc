'use strict';

const { app, BrowserWindow, ipcMain, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateAdmission,
  evaluateDocumentVisible,
} = require('../../../src/main/display-capture-admission');

const RESULT = path.join(__dirname, 'result.md');
const PROFILE = path.join(__dirname, '.probe-profile');

function page(body, extraHeaders = {}) {
  return {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders,
    },
    body: `<!doctype html><html><body>${body}
<script>
document.getElementById('go')?.addEventListener('click', () => {
  window.admissionProbe.send('click');
});
</script></body></html>`,
  };
}

const routes = {
  '/ok': page('<button id="go">share</button><p>ok</p>'),
  '/deny': page('<button id="go">share</button><p>deny</p>', {
    'Permissions-Policy': 'display-capture=()',
  }),
  '/iframe-host': page(`
    <button id="go">share</button>
    <iframe id="noallow" src="/iframe-child"></iframe>
    <iframe id="inherit" src="/iframe-child"></iframe>
  `),
  '/iframe-child': page('<button id="go">child</button><p>child</p>'),
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url] || { headers: { 'Content-Type': 'text/plain' }, body: 'no', status: 404 };
      res.writeHead(route.status || 200, route.headers);
      res.end(route.body);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function policyAllowed(facts) {
  if (facts.displayCaptureAllowed === true || facts.displayCaptureAllowed === false) {
    return facts.displayCaptureAllowed;
  }
  if (facts.mainWorldPolicy === true || facts.mainWorldPolicy === false) {
    return facts.mainWorldPolicy;
  }
  return null;
}

function admitFrom(facts, trusted, extras = {}) {
  return evaluateAdmission({
    userActivationActive: facts.userActivationActive,
    displayCaptureAllowed: policyAllowed(facts),
    documentFocused: trusted.webContentsFocused,
    documentVisible: trusted.documentVisible,
    frameAlive: true,
    ...extras,
  });
}

function trustedFacts(wc, win, { attached = true, frameVisible } = {}) {
  let frameVis = frameVisible;
  if (frameVis === undefined) {
    try {
      const frame = wc.mainFrame;
      frameVis = typeof frame?.visibilityState === 'string'
        ? frame.visibilityState === 'visible'
        : null;
    } catch {
      frameVis = null;
    }
  }
  return {
    webContentsFocused: wc.isFocused() === true,
    windowVisible: win.isVisible() === true,
    windowMinimized: win.isMinimized() === true,
    tabAttached: attached === true,
    frameVisible: frameVis,
    documentVisible: evaluateDocumentVisible({
      windowVisible: win.isVisible() === true,
      windowMinimized: win.isMinimized() === true,
      tabAttached: attached === true,
      frameVisible: frameVis === true,
    }),
  };
}

async function clickShare(wc) {
  const box = await wc.executeJavaScript(`(() => {
    const r = document.getElementById('go').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`, false);
  wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

async function waitFacts(kind, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${kind}`)), timeoutMs);
    const onFacts = (_e, payload) => {
      if (payload.kind !== kind) return;
      clearTimeout(timer);
      ipcMain.removeListener('admission-probe:facts', onFacts);
      resolve(payload);
    };
    ipcMain.on('admission-probe:facts', onFacts);
  });
}

async function run() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  app.setPath('userData', PROFILE);
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const cases = [];

  const ses = session.fromPartition('admission-probe');
  ses.registerPreloadScript({
    type: 'frame',
    filePath: path.join(__dirname, 'preload.cjs'),
  });

  const win = new BrowserWindow({
    width: 640,
    height: 480,
    show: true,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadURL(`${origin}/ok`);
  await new Promise((r) => setTimeout(r, 200));
  win.focus();
  await clickShare(win.webContents);
  const clickFacts = await waitFacts('click');
  const clickTrusted = trustedFacts(win.webContents, win);
  const clickAdmission = admitFrom(clickFacts, clickTrusted);
  cases.push({
    name: 'click-on-focused-visible-window',
    isolated: clickFacts,
    trusted: clickTrusted,
    policySource: clickFacts.displayCaptureAllowed === true || clickFacts.displayCaptureAllowed === false
      ? 'isolated'
      : (clickFacts.mainWorldPolicy === true || clickFacts.mainWorldPolicy === false ? 'main-world' : 'unavailable'),
    admission: clickAdmission,
  });

  await win.loadURL(`${origin}/ok`);
  await new Promise((r) => setTimeout(r, 6200));
  win.webContents.send('admission-probe:ping', 'no-gesture');
  const noGesture = await waitFacts('no-gesture');
  const noGestureTrusted = trustedFacts(win.webContents, win);
  cases.push({
    name: 'no-gesture-ipc',
    isolated: noGesture,
    trusted: noGestureTrusted,
    admission: admitFrom(noGesture, noGestureTrusted),
  });

  const hidden = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await hidden.loadURL(`${origin}/ok`);
  hidden.webContents.send('admission-probe:ping', 'hidden');
  const hiddenFacts = await waitFacts('hidden');
  const hiddenTrusted = trustedFacts(hidden.webContents, hidden);
  cases.push({
    name: 'hidden-window',
    isolated: hiddenFacts,
    trusted: hiddenTrusted,
    admission: admitFrom(hiddenFacts, hiddenTrusted),
  });

  const minimized = new BrowserWindow({
    width: 400,
    height: 300,
    show: true,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await minimized.loadURL(`${origin}/ok`);
  minimized.minimize();
  await new Promise((r) => setTimeout(r, 200));
  minimized.webContents.send('admission-probe:ping', 'minimized');
  const minimizedFacts = await waitFacts('minimized');
  const minimizedTrusted = trustedFacts(minimized.webContents, minimized);
  cases.push({
    name: 'minimized-window',
    isolated: minimizedFacts,
    trusted: minimizedTrusted,
    admission: admitFrom(minimizedFacts, minimizedTrusted),
  });

  const detachedTrusted = trustedFacts(win.webContents, win, { attached: false, frameVisible: true });
  cases.push({
    name: 'unattached-view',
    trusted: detachedTrusted,
    admission: evaluateAdmission({
      userActivationActive: true,
      displayCaptureAllowed: true,
      documentFocused: detachedTrusted.webContentsFocused,
      documentVisible: detachedTrusted.documentVisible,
      frameAlive: true,
    }),
  });

  const picker = new BrowserWindow({
    width: 320,
    height: 240,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await picker.loadURL('data:text/html,<title>picker</title><p>picker</p>');
  picker.focus();
  await new Promise((r) => setTimeout(r, 200));
  const afterPickerTrusted = trustedFacts(win.webContents, win);
  win.webContents.send('admission-probe:ping', 'after-picker');
  const afterPickerFacts = await waitFacts('after-picker');
  const newRequestAfterPicker = admitFrom(afterPickerFacts, afterPickerTrusted);
  cases.push({
    name: 'picker-focus-transfer',
    inFlightRemainsAdmitted: clickAdmission.ok === true,
    pageFocusedAfterPicker: afterPickerTrusted.webContentsFocused,
    newRequest: newRequestAfterPicker,
  });

  await win.loadURL(`${origin}/deny`);
  await clickShare(win.webContents);
  const denyFacts = await waitFacts('click');
  cases.push({
    name: 'permissions-policy-header-deny',
    isolated: denyFacts,
    policySource: denyFacts.displayCaptureAllowed === true || denyFacts.displayCaptureAllowed === false
      ? 'isolated'
      : (denyFacts.mainWorldPolicy === true || denyFacts.mainWorldPolicy === false ? 'main-world' : 'unavailable'),
    admission: evaluateAdmission({
      userActivationActive: denyFacts.userActivationActive,
      displayCaptureAllowed: policyAllowed(denyFacts),
      documentFocused: true,
      documentVisible: true,
      frameAlive: true,
    }),
  });

  await win.loadURL(`${origin}/iframe-host`);
  await new Promise((r) => setTimeout(r, 300));
  const frames = [];
  const walk = (frame) => {
    if (!frame) return;
    frames.push(frame.url);
    for (const child of frame.frames || []) walk(child);
  };
  walk(win.webContents.mainFrame);
  win.webContents.mainFrame.frames.forEach((frame, i) => {
    try {
      frame.send('admission-probe:ping', `iframe-${i}`);
    } catch {}
  });
  const iframeFacts = [];
  for (let i = 0; i < win.webContents.mainFrame.frames.length; i += 1) {
    try {
      iframeFacts.push(await waitFacts(`iframe-${i}`, 1500));
    } catch (err) {
      iframeFacts.push({ kind: `iframe-${i}`, error: String(err.message) });
    }
  }
  cases.push({
    name: 'iframe-preload-reach',
    childFrameCount: win.webContents.mainFrame.frames.length,
    iframeFacts,
    frames,
  });

  const findings = [
    '## Findings',
    '',
    `- Isolated ` + '`document.permissionsPolicy`/`featurePolicy`' + ` on this Electron: ${
      clickFacts.displayCaptureAllowed === true || clickFacts.displayCaptureAllowed === false
        ? 'available'
        : 'unavailable (null) — fail closed if used alone'
    }.`,
    `- Main-world policy via isolated preload ` + '`webFrame.executeJavaScript(..., false)`' + `: ${
      clickFacts.mainWorldPolicy === true || clickFacts.mainWorldPolicy === false
        ? `available (${clickFacts.mainWorldPolicy})`
        : 'unavailable'
    }. Product must use this trusted preload read, not a page-posted boolean.`,
    `- Click admission: ${clickAdmission.ok ? 'PASS' : `FAIL (${clickAdmission.reason})`}.`,
    `- No-gesture after fresh load + 6.2s: activation=${noGesture.userActivationActive} admission=${JSON.stringify(admitFrom(noGesture, noGestureTrusted))}.`,
    `- Hidden window: windowVisible=${hiddenTrusted.windowVisible} admission=${hiddenTrusted.documentVisible === false ? 'denied visible/activation as recorded' : 'unexpected'}.`,
    `- Minimized window: windowMinimized=${minimizedTrusted.windowMinimized} documentVisible=${minimizedTrusted.documentVisible}.`,
    `- Unattached view: admission reason ${evaluateAdmission({
      userActivationActive: true,
      displayCaptureAllowed: true,
      documentFocused: detachedTrusted.webContentsFocused,
      documentVisible: detachedTrusted.documentVisible,
      frameAlive: true,
    }).reason}.`,
    `- Picker took page focus: pageFocusedAfterPicker=${afterPickerTrusted.webContentsFocused}. In-flight remains admitted only if the click case passed (${clickAdmission.ok}). New request after picker: ${JSON.stringify(newRequestAfterPicker)}.`,
    `- Permissions-Policy header deny: ${JSON.stringify(denyFacts.mainWorldPolicy)} / isolated ${JSON.stringify(denyFacts.displayCaptureAllowed)}.`,
    `- Iframe preload reach: ${iframeFacts.every((f) => !f.error) ? 'preload answered' : 'preload did not answer child frames — do not claim iframe sharing'}.`,
    `- Launch: unset ELECTRON_RUN_AS_NODE before invoking the Electron binary; the npm wrapper inherits that env and resolves require('electron') to a string.`,
    '',
  ];

  const lines = [
    '# Admission probe results',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- Electron: ${process.versions.electron}`,
    `- Chromium: ${process.versions.chrome}`,
    `- Platform: ${process.platform} ${process.arch}`,
    '',
    'WebContents has `isFocused()` and no `isVisible()`. Visibility used owning',
    'window `isVisible()`/`isMinimized()` plus tab attachment. Frame visibility',
    'was read from `webFrameMain.visibilityState` when present, else recorded null.',
    '',
    ...findings,
    '```json',
    JSON.stringify(cases, null, 2),
    '```',
    '',
  ];
  fs.writeFileSync(RESULT, `${lines.join('\n')}\n`);

  picker.close();
  hidden.close();
  minimized.close();
  win.close();
  server.close();
  app.quit();
}

app.whenReady().then(run).catch((err) => {
  fs.writeFileSync(RESULT, `# Admission probe failed\n\n${err.stack}\n`);
  app.exit(1);
});

app.on('quit', () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
});
