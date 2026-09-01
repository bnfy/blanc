import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

const defaults = {
  darwin: 'dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc',
  win32: 'dist/win-unpacked/Blanc.exe',
  linux: 'dist/linux-unpacked/blanc',
};
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE
  || (defaults[process.platform] && path.resolve(defaults[process.platform]));
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE to the platform binary.'
  );
}

const poll = async (read, predicate, message, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${message}; last value: ${JSON.stringify(value)}`);
};

const server = http.createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html>
    <title>Blanc packaged microphone check</title>
    <button id="ask" type="button">Test microphone</button>
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
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const probeUrl = `http://127.0.0.1:${address.port}/`;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-media-'));
let app;

try {
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    adblockEnabled: false,
    onboardingVersion: 1,
    searchSuggestions: false,
    usagePing: false,
  }, null, 2));
  app = await launchPackagedOverCdp({
    executablePath,
    args: [
      '--use-fake-device-for-media-stream',
      `--user-data-dir=${userDataDir}`,
      probeUrl,
    ],
    env: { ...process.env, BLANC_TEST: '0' },
  });
  const page = await poll(
    () => Promise.resolve(app.pages().find((candidate) => candidate.url() === probeUrl) ?? null),
    Boolean,
    'packaged Blanc did not open the local media probe',
  );
  const initial = await page.evaluate(async () => {
    const status = await navigator.permissions.query({ name: 'microphone' });
    globalThis.__heldPermissionStatus = status;
    globalThis.__permissionChanges = [];
    status.addEventListener('change', () => {
      globalThis.__permissionChanges.push(status.state);
    });
    return status.state;
  });
  assert.equal(initial, 'prompt');

  await page.locator('#ask').click();
  const permissionPage = await poll(
    () => Promise.resolve(
      app.pages().find((candidate) => candidate.url() === 'blanc-chrome://permission/') ?? null
    ),
    Boolean,
    'Blanc did not show its site microphone prompt',
  );
  await permissionPage.locator('#permAllowBtn').click();

  const granted = await poll(
    () => page.evaluate(async () => ({
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
      && state.changes.includes('granted')
      && state.canonical
      && state.liveTracks > 0,
    'packaged microphone permission did not produce a live audio track',
  );
  assert.equal(granted.requestState, 'granted');
  console.log(`packaged-media-smoke OK: ${process.platform} ${executablePath}`);
} finally {
  if (app) {
    for (const page of app.pages()) {
      if (page.url() === probeUrl) {
        await page.evaluate(() => {
          globalThis.__stream?.getTracks().forEach((track) => track.stop());
        }).catch(() => {});
      }
    }
    await app.close();
  }
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
