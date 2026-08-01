#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'output', 'playwright');
const screenshotPath = path.join(outputDir, 'display-share-smoke.png');
const resultPath = path.join(outputDir, 'display-share-smoke.json');
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-display-share-smoke-'));

const page = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Blanc display-sharing smoke</title></head>
  <body>
    <button id="share" type="button">Share a display</button>
    <output id="status">idle</output>
    <video id="preview" autoplay muted playsinline></video>
    <script>
      window.__captureSmoke = { status: 'idle' };
      document.getElementById('share').addEventListener('click', async () => {
        const status = document.getElementById('status');
        window.__captureSmoke = { status: 'requesting' };
        status.textContent = 'requesting';
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
          const track = stream.getVideoTracks()[0];
          window.__captureSmokeStream = stream;
          window.__captureSmoke = {
            status: 'granted',
            track: {
              kind: track.kind,
              label: track.label,
              readyState: track.readyState,
              settings: track.getSettings(),
            },
          };
          document.getElementById('preview').srcObject = stream;
          status.textContent = 'granted';
        } catch (error) {
          window.__captureSmoke = {
            status: 'denied',
            error: { name: error?.name || '', message: error?.message || String(error) },
          };
          status.textContent = 'denied';
        }
      });
    </script>
  </body>
</html>`;

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(page);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function waitFor(read, accept, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} timed out; last value: ${JSON.stringify(last)}`);
}

let server;
let app;
let tabId;

try {
  await fs.mkdir(outputDir, { recursive: true });
  server = await startServer();
  app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '1' },
  });

  await waitFor(
    () => app.evaluate(() => !!globalThis.__blanc),
    Boolean,
    'Blanc test hook'
  );
  const chromePage = await app.firstWindow();
  await chromePage.waitForLoadState('load');
  // The hook can be installed before the chrome document's did-finish-load
  // reattachment callback settles. Reset only after that boundary so startup
  // cannot switch the just-opened smoke tab back to its initial new tab.
  await app.evaluate(() => globalThis.__blanc.reset());

  tabId = await app.evaluate(
    (_electron, url) => globalThis.__blanc.openTab(url),
    server.url
  );
  await app.evaluate(
    (_electron, id) => globalThis.__blanc.activateTab(id, true),
    tabId
  );
  await waitFor(
    () => app.evaluate(
      (_electron, id) => {
        const tab = globalThis.__blanc.state().tabs.find((candidate) => candidate.id === id);
        return tab
          ? {
              loadedUrl: tab.loadedUrl,
              loading: tab.loading,
              active: globalThis.__blanc.state().activeTabId === id,
            }
          : null;
      },
      tabId
    ),
    (state) => state?.loadedUrl === server.url
      && state.loading === false
      && state.active === true,
    'smoke page navigation'
  );

  // `executeJavaScript(..., true)` supplies a real transient user activation to
  // the page's click handler, matching the browser requirement enforced by
  // permissions.js before it will show a chooser.
  await app.evaluate(
    async (electronModule, id) => {
      const tab = globalThis.__blanc.state().tabs.find((candidate) => candidate.id === id);
      const wc = tab ? electronModule.webContents.fromId(tab.webContentsId) : null;
      if (!wc) throw new Error('smoke tab WebContents disappeared');
      wc.focus();
      await wc.executeJavaScript(
        `document.getElementById('share').click(); true`,
        true
      );
    },
    tabId
  );

  const chooser = await waitFor(
    async () => {
      const permission = await chromePage.locator('#permissionBar:not([hidden]) #permissionText')
        .textContent()
        .catch(() => null);
      if (permission) {
        throw new Error(`unexpected generic permission prompt: ${permission}`);
      }
      const pageState = await app.evaluate(
        async (electronModule, id) => {
          const state = globalThis.__blanc.state();
          const tab = state.tabs.find((candidate) => candidate.id === id);
          const wc = tab ? electronModule.webContents.fromId(tab.webContentsId) : null;
          if (!wc) return { status: 'missing-tab', active: false };
          return {
            capture: await wc.executeJavaScript(`structuredClone(window.__captureSmoke)`),
            active: state.activeTabId === id,
          };
        },
        tabId
      );
      if (pageState.capture?.status === 'denied') {
        throw new Error(
          `display capture denied before chooser: `
          + `${pageState.capture.error?.name}: ${pageState.capture.error?.message}`
        );
      }
      if (!pageState.active) throw new Error('display-sharing tab lost active ownership');
      return {
        mode: await app.evaluate(() => globalThis.__blanc.overlayRendererMode()),
        dom: await app.evaluate(() => globalThis.__blanc.readDisplayShareDom()),
      };
    },
    (state) => state.mode === 'display-share-picker'
      && Array.isArray(state.dom?.names)
      && state.dom.names.length > 0,
    'real display-source chooser',
    45_000
  );

  const screenshotBase64 = await app.evaluate(async (electronModule) => {
    const overlay = electronModule.webContents.getAllWebContents().find(
      (wc) => wc.getURL().endsWith('/src/renderer/overlay.html')
    );
    if (!overlay) throw new Error('overlay WebContents not found');
    return (await overlay.capturePage()).toPNG().toString('base64');
  });
  await fs.writeFile(screenshotPath, Buffer.from(screenshotBase64, 'base64'));

  await app.evaluate(() => globalThis.__blanc.chooseDisplayShareSource(0));

  const capture = await waitFor(
    () => app.evaluate(
      async (electronModule, id) => {
        const tab = globalThis.__blanc.state().tabs.find((candidate) => candidate.id === id);
        const wc = tab ? electronModule.webContents.fromId(tab.webContentsId) : null;
        if (!wc) return { status: 'missing-tab' };
        return wc.executeJavaScript(`structuredClone(window.__captureSmoke)`);
      },
      tabId
    ),
    (state) => state?.status === 'granted' || state?.status === 'denied',
    'display capture result',
    30_000
  );

  if (capture.status !== 'granted') {
    throw new Error(`display capture was denied: ${capture.error?.name}: ${capture.error?.message}`);
  }
  if (capture.track?.kind !== 'video' || capture.track?.readyState !== 'live') {
    throw new Error(`display capture returned an invalid track: ${JSON.stringify(capture.track)}`);
  }

  await app.evaluate(
    async (electronModule, id) => {
      const tab = globalThis.__blanc.state().tabs.find((candidate) => candidate.id === id);
      const wc = tab ? electronModule.webContents.fromId(tab.webContentsId) : null;
      if (!wc) return;
      await wc.executeJavaScript(`
        window.__captureSmokeStream?.getTracks().forEach((track) => track.stop());
        window.__captureSmoke.track.readyState =
          window.__captureSmokeStream?.getVideoTracks()[0]?.readyState || 'ended';
        window.__captureSmoke.status = 'stopped';
      `);
    },
    tabId
  );

  const result = {
    passed: true,
    origin: new URL(server.url).origin,
    chooser: {
      sourceCount: chooser.dom.names.length,
      firstSource: chooser.dom.names[0],
      audioOffered: chooser.dom.audioOffered,
      panelFitsViewport: chooser.dom.panelFitsViewport,
    },
    track: capture.track,
    screenshot: path.relative(repoRoot, screenshotPath),
  };
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
  if (server) await server.close().catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(`${userDataDir}-Dev`, { recursive: true, force: true }).catch(() => {});
}
