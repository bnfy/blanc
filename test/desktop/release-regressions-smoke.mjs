import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const defaultExecutable = process.platform === 'darwin'
  ? path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc')
  : null;
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build dist/mac-arm64 first.'
  );
}

// A real 32-bit DIB-framed ICO, matching App Store Connect's production
// container shape rather than taking the newer PNG-in-ICO decoder branch.
const GENERIC_ICO_DIB = Buffer.alloc(40 + (32 * 32 * 4) + (32 * 4));
GENERIC_ICO_DIB.writeUInt32LE(40, 0);
GENERIC_ICO_DIB.writeInt32LE(32, 4);
GENERIC_ICO_DIB.writeInt32LE(64, 8); // XOR bitmap + AND mask
GENERIC_ICO_DIB.writeUInt16LE(1, 12);
GENERIC_ICO_DIB.writeUInt16LE(32, 14);
GENERIC_ICO_DIB.writeUInt32LE(32 * 32 * 4, 20);
for (let pixel = 0; pixel < 32 * 32; pixel++) {
  const offset = 40 + pixel * 4;
  GENERIC_ICO_DIB[offset] = 0x20;
  GENERIC_ICO_DIB[offset + 1] = 0x78;
  GENERIC_ICO_DIB[offset + 2] = 0xd8;
  GENERIC_ICO_DIB[offset + 3] = 0xff;
}
const GENERIC_ICO = Buffer.alloc(22 + GENERIC_ICO_DIB.length);
GENERIC_ICO.writeUInt16LE(1, 2);
GENERIC_ICO.writeUInt16LE(1, 4);
GENERIC_ICO[6] = 32;
GENERIC_ICO[7] = 32;
GENERIC_ICO.writeUInt16LE(1, 10);
GENERIC_ICO.writeUInt16LE(32, 12);
GENERIC_ICO.writeUInt32LE(GENERIC_ICO_DIB.length, 14);
GENERIC_ICO.writeUInt32LE(22, 18);
GENERIC_ICO_DIB.copy(GENERIC_ICO, 22);

// NFL currently uses compressed 2000x2000 app artwork as its sole ordinary
// favicon. Generate that shape locally so this compatibility case remains a
// deterministic release gate even when the public site or CDN changes.
const LARGE_FAVICON = await sharp({
  create: {
    width: 2000,
    height: 2000,
    channels: 4,
    background: { r: 214, g: 36, b: 54, alpha: 1 },
  },
}).png().toBuffer();
assert.ok(LARGE_FAVICON.length < 256 * 1024, 'large favicon fixture must remain byte-bounded');

const poll = async (read, predicate, message, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.url === '/favicon.ico') {
    // App Store Connect serves this exact combination: valid ICO bytes under
    // a generic binary label. Blanc must sniff only after the bounded
    // container validates, then rasterize it for local and synced surfaces.
    response.setHeader('Content-Type', 'application/octet-stream');
    setTimeout(() => response.end(GENERIC_ICO), 300);
    return;
  }
  if (request.url === '/oversized-touch.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(Buffer.alloc(256 * 1024 + 1));
    return;
  }
  if (request.url === '/large-favicon.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(LARGE_FAVICON);
    return;
  }
  if (request.url === '/large-favicon') {
    response.end(`<!doctype html>
      <title>Large favicon probe</title>
      <link rel="icon" type="image/png" href="/large-favicon.png">
      <main>large favicon probe</main>`);
    return;
  }
  if (request.url === '/generic-ico') {
    response.end(`<!doctype html>
      <title>Generic ICO probe</title>
      <link rel="apple-touch-icon" href="/oversized-touch.png">
      <script>location.replace('/generic-ico/login')</script>
      <main>generic ICO probe</main>`);
    return;
  }
  if (request.url === '/generic-ico/login') {
    response.end(`<!doctype html>
      <title>Generic ICO redirect target</title>
      <main>generic ICO redirect target</main>`);
    return;
  }
  if (request.url === '/favicon') {
    response.end(`<!doctype html>
      <title>Favicon probe</title>
      <link rel="icon" type="image/png" href="https://blancbrowser.com/favicon-32x32.png">
      <link rel="apple-touch-icon" sizes="192x192" href="https://blancbrowser.com/this-icon-does-not-exist-v1.2.3.png">
      <main>favicon probe</main>`);
    return;
  }
  if (request.url === '/mic') {
    response.end(`<!doctype html>
      <title>Microphone probe</title>
      <button id="ask" type="button">Ask for microphone</button>
      <script>
        globalThis.__requestState = 'idle';
        document.getElementById('ask').addEventListener('click', async () => {
          globalThis.__requestState = 'pending';
          try {
            globalThis.__stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            globalThis.__requestState = 'granted';
          } catch (error) {
            globalThis.__requestState = 'rejected:' + error.name;
          }
        });
      </script>`);
    return;
  }
  response.statusCode = 404;
  response.end('not found');
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

const baseSettings = {
  adblockEnabled: false,
  onboardingVersion: 1,
  searchSuggestions: false,
  usagePing: false,
};

const withPackagedApp = async ({ label, launchArgs = [], prepare }, run) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-${label}-`));
  let app;
  try {
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify(baseSettings, null, 2)
    );
    await prepare?.(userDataDir);
    app = await launchPackagedOverCdp({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`, ...launchArgs],
      env: { ...process.env, BLANC_TEST: '0' },
    });
    await run(app);
  } finally {
    if (app) await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const readTabState = async (app) => {
  const chrome = app.pages().find((page) => page.url() === 'blanc-chrome://index/');
  if (!chrome) return null;
  return chrome.evaluate(() => window.browserAPI.getAllTabs());
};

try {
  await withPackagedApp({
    label: 'release-regressions-restore-favicon',
    prepare: async (userDataDir) => {
      fs.writeFileSync(
        path.join(userDataDir, 'session.json'),
        JSON.stringify({
          urls: ['https://example.com/', `${origin}/favicon`],
          activeIndex: 1,
        }, null, 2)
      );
    },
  }, async (app) => {
    const restored = await poll(
      () => readTabState(app),
      (state) => state?.tabs?.some((tab) => tab.url === 'https://example.com/')
        && state.tabs.some((tab) => tab.url === `${origin}/favicon`),
      'packaged candidate did not restore the legacy session'
    );
    const quiet = restored.tabs.find((tab) => tab.url === 'https://example.com/');
    assert.equal(quiet.asleep, true, 'inactive legacy tab should restore quiet');
    assert.equal(quiet.title, 'example.com', 'missing legacy title should derive from the host');
    assert.notEqual(quiet.title, 'New Tab');

    const faviconTab = await poll(
      () => readTabState(app).then((state) =>
        state?.tabs?.find((tab) => tab.url === `${origin}/favicon`) ?? null),
      (tab) => tab?.favicon?.startsWith('data:image/png;base64,'),
      'packaged candidate discarded the working favicon after its sharper candidate failed',
      45_000
    );
    const faviconBytes = Buffer.from(faviconTab.favicon.split(',')[1], 'base64');
    assert.equal(faviconBytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.ok(faviconBytes.length > 100, 'sanitized favicon should contain real image bytes');
  });

  await withPackagedApp({
    label: 'release-regressions-large-favicon',
    launchArgs: [`${origin}/large-favicon`],
  }, async (app) => {
    const faviconTab = await poll(
      () => readTabState(app).then((state) =>
        state?.tabs?.find((tab) => tab.url === `${origin}/large-favicon`) ?? null),
      (tab) => tab?.favicon?.startsWith('data:image/png;base64,'),
      'packaged candidate did not rasterize bounded 2000x2000 favicon artwork',
      45_000,
    );
    const faviconBytes = Buffer.from(faviconTab.favicon.split(',')[1], 'base64');
    const { data, info } = await sharp(faviconBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 32);
    assert.equal(info.height, 32);
    assert.deepEqual([...data.subarray(0, 4)], [214, 36, 54, 255],
      'large declared artwork must win over the unrelated conventional ICO fallback');
  });

  await withPackagedApp({
    label: 'release-regressions-generic-ico',
    launchArgs: [`${origin}/generic-ico`],
  }, async (app) => {
    const faviconTab = await poll(
      () => readTabState(app).then((state) =>
        state?.tabs?.find((tab) => tab.url === `${origin}/generic-ico/login`) ?? null),
      (tab) => tab?.favicon?.startsWith('data:image/png;base64,'),
      'packaged candidate did not rasterize the bounded generic-MIME ICO fallback',
      45_000,
    );
    const faviconBytes = Buffer.from(faviconTab.favicon.split(',')[1], 'base64');
    assert.equal(faviconBytes.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(faviconBytes.readUInt32BE(16), 32);
    assert.equal(faviconBytes.readUInt32BE(20), 32);
    assert.ok(faviconBytes.length > 100, 'generic-MIME ICO should contain real pixels');
  });

  await withPackagedApp({
    label: 'release-regressions-microphone',
    launchArgs: ['--use-fake-device-for-media-stream', `${origin}/mic`],
  }, async (app) => {
    const micPage = await poll(
      () => Promise.resolve(app.pages().find((page) => page.url() === `${origin}/mic`) ?? null),
      Boolean,
      'packaged candidate did not open the microphone probe'
    );

    const initial = await micPage.evaluate(async () => {
      const status = await navigator.permissions.query({ name: 'microphone' });
      globalThis.__heldPermissionStatus = status;
      globalThis.__permissionChanges = [];
      status.addEventListener('change', (event) => {
        globalThis.__permissionChanges.push({
          state: status.state,
          eventIsEvent: event instanceof Event,
          targetIsStatus: event.target === status,
        });
      });
      const stateDescriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(status),
        'state'
      );
      return {
        state: status.state,
        isEventTarget: status instanceof EventTarget,
        stateHasSetter: typeof stateDescriptor?.set === 'function',
      };
    });
    assert.deepEqual(initial, {
      state: 'prompt',
      isEventTarget: true,
      stateHasSetter: false,
    });

    await micPage.locator('#ask').click();
    const permissionPage = await poll(
      () => Promise.resolve(
        app.pages().find((page) => page.url() === 'blanc-chrome://permission/') ?? null
      ),
      Boolean,
      'Blanc did not show its microphone permission prompt'
    );
    await permissionPage.locator('#permAllowBtn').click();

    const granted = await poll(
      () => micPage.evaluate(async () => ({
        requestState: globalThis.__requestState,
        heldState: globalThis.__heldPermissionStatus?.state,
        changes: globalThis.__permissionChanges,
        canonical: await navigator.permissions.query({ name: 'microphone' })
          === globalThis.__heldPermissionStatus,
        liveTracks: globalThis.__stream?.getAudioTracks()
          .filter((track) => track.readyState === 'live').length ?? 0,
      })),
      (state) => state.requestState === 'granted'
        && state.heldState === 'granted'
        && state.changes?.some((change) => change.state === 'granted')
        && state.canonical === true
        && state.liveTracks > 0,
      'microphone permission did not become a live granted status and stream',
      45_000
    );
    assert.deepEqual(granted.changes.at(-1), {
      state: 'granted',
      eventIsEvent: true,
      targetIsStatus: true,
    });
    await micPage.evaluate(() => {
      globalThis.__stream?.getTracks().forEach((track) => track.stop());
    });
  });

  console.log(`release-regressions-smoke OK: ${executablePath}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
