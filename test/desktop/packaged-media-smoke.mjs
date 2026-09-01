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
    <title>Blanc packaged microphone and camera check</title>
    <button id="ask" type="button">Test microphone and camera</button>
    <script>
      globalThis.__requestState = 'idle';
      document.getElementById('ask').addEventListener('click', async () => {
        globalThis.__requestState = 'pending';
        try {
          globalThis.__stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
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
    const microphone = await navigator.permissions.query({ name: 'microphone' });
    const camera = await navigator.permissions.query({ name: 'camera' });
    globalThis.__heldPermissionStatus = { microphone, camera };
    globalThis.__permissionChanges = { microphone: [], camera: [] };
    microphone.addEventListener('change', () => {
      globalThis.__permissionChanges.microphone.push(microphone.state);
    });
    camera.addEventListener('change', () => {
      globalThis.__permissionChanges.camera.push(camera.state);
    });
    return { microphone: microphone.state, camera: camera.state };
  });
  assert.deepEqual(initial, { microphone: 'prompt', camera: 'prompt' });

  await page.locator('#ask').click();
  const permissionPage = await poll(
    () => Promise.resolve(
      app.pages().find((candidate) => candidate.url() === 'blanc-chrome://permission/') ?? null
    ),
    Boolean,
    'Blanc did not show its site microphone and camera prompt',
  );
  await permissionPage.locator('#permAllowBtn').click();

  const granted = await poll(
    () => page.evaluate(async () => ({
      requestState: globalThis.__requestState,
      heldMicrophoneState: globalThis.__heldPermissionStatus?.microphone?.state,
      heldCameraState: globalThis.__heldPermissionStatus?.camera?.state,
      changes: globalThis.__permissionChanges,
      canonicalMicrophone: await navigator.permissions.query({ name: 'microphone' })
        === globalThis.__heldPermissionStatus?.microphone,
      canonicalCamera: await navigator.permissions.query({ name: 'camera' })
        === globalThis.__heldPermissionStatus?.camera,
      liveAudioTracks: globalThis.__stream?.getAudioTracks()
        .filter((track) => track.readyState === 'live').length ?? 0,
      liveVideoTracks: globalThis.__stream?.getVideoTracks()
        .filter((track) => track.readyState === 'live').length ?? 0,
    })),
    (state) => state.requestState === 'granted'
      && state.heldMicrophoneState === 'granted'
      && state.heldCameraState === 'granted'
      && state.changes.microphone.includes('granted')
      && state.changes.camera.includes('granted')
      && state.canonicalMicrophone
      && state.canonicalCamera
      && state.liveAudioTracks > 0
      && state.liveVideoTracks > 0,
    'packaged media permission did not produce live audio and video tracks',
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
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
