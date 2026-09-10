// Unpackaged product smoke only; never evidence for the signed conference gate.
// Platforms: darwin/win32 use the Island source grid. Linux Wayland uses Island
// Continue → native portal (AT-SPI Share via BLANC_PRODUCT_SMOKE_PORTAL_CLICK).
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { _electron } = require(path.join(root, 'node_modules/playwright'));
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const os = require('node:os');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-picker-smoke-'));
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const portalMode = process.env.BLANC_PRODUCT_SMOKE_PORTAL === '1'
  || process.platform === 'linux';
const portalClick = process.env.BLANC_PRODUCT_SMOKE_PORTAL_CLICK
  || path.join(__dirname, '../audio-probe/click-share-portal.py');
const electronPath = process.env.BLANC_PRODUCT_SMOKE_ELECTRON
  || (process.platform === 'win32'
    ? path.join(os.homedir(), 'electron-44.1.1-win32-arm64', 'electron.exe')
    : process.platform === 'linux'
      ? path.join(os.homedir(), 'electron-44.1.1-linux-arm64', 'electron')
      : undefined);

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Blanc sharing smoke</title><style>body{font:24px system-ui;padding:50px;background:#fafafa}button{padding:20px}video{width:320px}</style><h1>Blanc sharing smoke</h1><button id="share">Share screen</button><p id="status">Ready</p><video id="preview" muted autoplay></video><script>
window.result=null;document.querySelector('#share').onclick=async()=>{window.result=null;try{window.stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});document.querySelector('#preview').srcObject=window.stream;window.result={ok:true,tracks:stream.getTracks().map(t=>({kind:t.kind,readyState:t.readyState,muted:t.muted}))};}catch(e){window.result={ok:false,name:e.name,message:e.message};}document.querySelector('#status').textContent=JSON.stringify(window.result);};</script>`);
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickPortalShare() {
  assert.ok(fs.existsSync(portalClick), `missing portal clicker: ${portalClick}`);
  await new Promise((resolve, reject) => {
    const child = spawn('python3', [portalClick, 'click', '25'], {
      env: {
        ...process.env,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/1000',
        WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
        DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS
          || 'unix:path=/run/user/1000/bus',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      console.log('PORTAL_CLICK', out.trim() || `(exit ${code})`);
      if (code === 0) resolve();
      else reject(new Error(`portal click failed: ${out || code}`));
    });
  });
}

async function focusUrl(app, url) {
  await app.evaluate(({ webContents, BrowserWindow }, target) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL() === target);
    const win = BrowserWindow.getAllWindows().find((w) => w.isVisible());
    win.show();
    win.focus();
    wc.focus();
  }, url);
}

async function waitPicker(overlay) {
  await overlay.locator('#displayShareCancel').waitFor({ state: 'visible', timeout: 15000 });
  if (portalMode) {
    await overlay.waitForFunction(() => {
      const allow = document.querySelector('#displayShareAllow');
      return allow && allow.textContent === 'Continue' && !allow.disabled;
    }, {}, { timeout: 10000 });
  } else {
    await overlay.waitForFunction(() => document.querySelectorAll('.display-share-source').length > 0);
  }
}

async function approveShare(overlay, { audio = false, preferBlanc = false } = {}) {
  if (portalMode) {
    if (audio) await overlay.locator('#displayShareAudio').check();
    // Start waiting for the portal before Continue, so AT-SPI can catch it.
    const portalWait = clickPortalShare();
    await overlay.locator('#displayShareAllow').click();
    await portalWait;
    return;
  }
  if (preferBlanc) {
    await overlay.locator('.display-share-source').filter({ hasText: 'Blanc' }).first().click();
  } else {
    await overlay.locator('.display-share-source').first().click();
  }
  if (audio) await overlay.locator('#displayShareAudio').check();
  await overlay.locator('#displayShareAllow').click();
}

let app;
(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const launchOpts = {
    args: [
      root,
      `--user-data-dir=${profile}`,
      ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=wayland'] : []),
    ],
    env: {
      ...env,
      BLANC_TEST: '1',
      BLANC_TEST_UNCAUGHT_LOG: `${profile}/uncaught.log`,
      ...(process.platform === 'linux' ? {
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '/run/user/1000',
        WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
        XDG_SESSION_TYPE: 'wayland',
        DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS
          || 'unix:path=/run/user/1000/bus',
      } : {}),
    },
    timeout: 60000,
  };
  if (electronPath && fs.existsSync(electronPath)) {
    launchOpts.executablePath = electronPath;
    console.log('ELECTRON', electronPath);
  } else if (electronPath) {
    throw new Error(`missing Electron at ${electronPath}`);
  }
  console.log('PORTAL_MODE', portalMode);
  app = await _electron.launch(launchOpts);
  await app.evaluate(() => new Promise((resolve) => {
    const t = setInterval(() => {
      if (globalThis.__blanc?.startupReady?.()) {
        clearInterval(t);
        resolve();
      }
    }, 50);
  }));
  await app.evaluate((_, u) => globalThis.__blanc.openTab(u), url);
  const page = await app.context().waitForEvent('page', {
    predicate: (p) => p.url().startsWith(url),
    timeout: 5000,
  }).catch(() => app.context().pages().find((p) => p.url().startsWith(url)));
  if (!page) throw new Error('no fixture page');
  await page.waitForSelector('#share');
  const overlay = app.context().pages().find((p) => p.url() === 'blanc-chrome://overlay/');
  await focusUrl(app, url);
  await page.locator('#share').click();
  await waitPicker(overlay).catch(async (e) => {
    console.log('PAGE_RESULT', await page.evaluate(() => window.result));
    throw e;
  });
  console.log('PICKER', await overlay.locator('#displaySharePicker').innerText());
  const geometry = await overlay.evaluate(() => {
    const r = document.querySelector('#displaySharePicker').getBoundingClientRect();
    return {
      dx: r.x + r.width / 2 - innerWidth / 2,
      dy: r.y + r.height / 2 - innerHeight / 2,
      underline: [...document.querySelectorAll('#displaySharePicker button')]
        .some((b) => getComputedStyle(b).textDecorationLine !== 'none'),
      allowLabel: document.querySelector('#displayShareAllow')?.textContent || null,
    };
  });
  assert.ok(Math.abs(geometry.dx) <= 1 && Math.abs(geometry.dy) <= 1, JSON.stringify(geometry));
  assert.equal(geometry.underline, false);
  console.log('GEOMETRY', geometry);

  if (process.argv.includes('--screenshot')) {
    fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
    await overlay.screenshot({
      path: path.join(root, 'output/playwright', `display-share-picker-${process.platform}.png`),
    });
  }

  await overlay.locator('#displayShareCancel').click();
  await page.waitForFunction(() => window.result !== null);
  assert.equal((await page.evaluate(() => window.result)).name, 'NotAllowedError');
  console.log('CANCEL PASS');

  await focusUrl(app, url);
  await page.locator('#share').click();
  await waitPicker(overlay);
  await approveShare(overlay, { audio: false, preferBlanc: process.platform === 'darwin' });
  await page.waitForFunction(() => window.result !== null, {}, { timeout: 45000 });
  console.log('SHARE', await page.evaluate(() => window.result));
  assert.equal((await page.evaluate(() => window.result)).ok, true);
  await page.waitForFunction(() => document.querySelector('video').videoWidth > 0);
  console.log('VIDEO', await page.evaluate(() => ({
    width: preview.videoWidth,
    height: preview.videoHeight,
    frames: preview.getVideoPlaybackQuality().totalVideoFrames,
  })));

  const url2 = `${url}second`;
  await app.evaluate((_, u) => globalThis.__blanc.openTab(u), url2);
  await sleep(500);
  const page2 = app.context().pages().find((p) => p.url() === url2);
  await page2.waitForSelector('#share');
  await focusUrl(app, url2);
  await page2.locator('#share').click();
  await waitPicker(overlay);
  await approveShare(overlay, { audio: true, preferBlanc: false });
  await page2.waitForFunction(() => window.result !== null, {}, { timeout: 45000 });
  console.log('AUDIO SHARE', await page2.evaluate(() => window.result));
  assert.equal((await page2.evaluate(() => window.result)).ok, true);
  assert.equal(await page2.evaluate(() => stream.getAudioTracks().length), 1);
  await page2.waitForFunction(() => preview.videoWidth > 0);

  const strip = app.context().pages().find((p) => p.url() === 'blanc-chrome://index/');
  await strip.evaluate(() => window.browserAPI.openCapturePopover(null));
  await overlay.locator('.display-share-stop').first().waitFor();
  assert.equal(await overlay.locator('.display-share-stop').count(), 2);
  console.log('TWO SHARES PASS');

  await overlay.locator('.display-share-stop').first().click();
  await page.waitForFunction(() => stream.getTracks().every((t) => t.readyState === 'ended'));
  assert.equal(await page2.evaluate(() => stream.getTracks().every((t) => t.readyState === 'live')), true);
  console.log('BACKGROUND STOP PRESERVES OTHER SHARE PASS');
  await overlay.waitForFunction(() => document.querySelectorAll('.display-share-stop').length === 1);
  console.log('LAST ROW', await overlay.locator('#capturePop').innerText());
  await overlay.locator('.display-share-stop').first().click();
  await page2.waitForFunction(() => stream.getTracks().every((t) => t.readyState === 'ended'), {}, { timeout: 10000 })
    .catch(async (e) => {
      console.log('LAST STOP FAILURE', await page2.evaluate(() => stream.getTracks().map((t) => ({
        kind: t.kind, state: t.readyState, muted: t.muted,
      }))));
      console.log('OVERLAY AFTER', await overlay.locator('#capturePop').innerText());
      throw e;
    });
  console.log('FINAL STOP PASS');
  if (fs.existsSync(`${profile}/uncaught.log`)) {
    throw new Error(fs.readFileSync(`${profile}/uncaught.log`, 'utf8'));
  }
  console.log('PRODUCT_SMOKE_OK', process.platform);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close().catch(() => {});
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(`${profile}-Dev`, { recursive: true, force: true });
});
