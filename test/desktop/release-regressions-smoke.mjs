import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
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
