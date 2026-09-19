import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';

if (process.platform !== 'darwin') {
  throw new Error('The native media smoke test is macOS-only.');
}

const mediaArgument = process.argv.find((value) => value.startsWith('--media='));
const mediaKind = mediaArgument?.slice('--media='.length) || 'microphone';
if (!['microphone', 'camera'].includes(mediaKind)) {
  throw new Error('Native media smoke --media must be microphone or camera.');
}
const isCamera = mediaKind === 'camera';

const defaultExecutable = path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
if (!fs.existsSync(executablePath)) {
  throw new Error(
    'Packaged Blanc executable not found. Set BLANC_PACKAGED_EXECUTABLE or build dist/mac-arm64 first.'
  );
}

const poll = async (read, predicate, message, timeoutMs = 120_000) => {
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
    <title>Blanc native ${mediaKind} release check</title>
    <button id="ask" type="button">Test ${mediaKind}</button>
    <video id="preview" autoplay muted playsinline></video>
    <script>
      const mediaKind = ${JSON.stringify(mediaKind)};
      globalThis.__result = { state: 'idle', peak: 0, width: 0, height: 0, liveTracks: 0 };
      document.getElementById('ask').addEventListener('click', async () => {
        globalThis.__result.state = 'pending';
        try {
          const stream = await navigator.mediaDevices.getUserMedia(
            mediaKind === 'camera' ? { video: true } : { audio: true }
          );
          globalThis.__stream = stream;
          globalThis.__result.state = 'granted';
          if (mediaKind === 'camera') {
            const preview = document.getElementById('preview');
            preview.srcObject = stream;
            await preview.play();
            globalThis.__meter = setInterval(() => {
              const track = stream.getVideoTracks().find((candidate) => candidate.readyState === 'live');
              const settings = track?.getSettings() || {};
              globalThis.__result.liveTracks = track ? 1 : 0;
              globalThis.__result.width = preview.videoWidth || settings.width || 0;
              globalThis.__result.height = preview.videoHeight || settings.height || 0;
            }, 50);
          } else {
            const context = new AudioContext();
            await context.resume();
            const source = context.createMediaStreamSource(stream);
            const analyser = context.createAnalyser();
            const samples = new Uint8Array(analyser.fftSize);
            source.connect(analyser);
            globalThis.__audioContext = context;
            globalThis.__meter = setInterval(() => {
              globalThis.__result.liveTracks = stream.getAudioTracks()
                .filter((track) => track.readyState === 'live').length;
              analyser.getByteTimeDomainData(samples);
              for (const sample of samples) {
                globalThis.__result.peak = Math.max(
                  globalThis.__result.peak,
                  Math.abs(sample - 128) / 128
                );
              }
            }, 50);
          }
        } catch (error) {
          globalThis.__result.state = 'rejected:' + error.name;
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
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-native-media-'));
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
    args: [`--user-data-dir=${userDataDir}`, probeUrl],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
  });
  const page = await poll(
    () => Promise.resolve(app.pages().find((candidate) => candidate.url() === probeUrl) ?? null),
    Boolean,
    `signed candidate did not open the local ${mediaKind} probe`,
  );
  const initial = await page.evaluate(async (kind) =>
    (await navigator.permissions.query({ name: kind })).state, mediaKind);
  assert.equal(initial, 'prompt');

  await page.locator('#ask').click();
  const permissionPage = await poll(
    () => Promise.resolve(
      app.pages().find((candidate) => candidate.url() === 'blanc-chrome://permission/') ?? null
    ),
    Boolean,
    `Blanc did not show its site ${mediaKind} permission prompt`,
  );
  await permissionPage.locator('#permAllowBtn').click();
  console.log(
    isCamera
      ? 'Waiting for the macOS camera decision. Click Allow; no frames are recorded or uploaded.'
      : 'Waiting for the macOS microphone decision. Click Allow, then speak briefly.'
  );

  const result = await poll(
    () => page.evaluate(() => globalThis.__result),
    ({ state, peak, width, height, liveTracks }) => state.startsWith('rejected:')
      || (state === 'granted' && liveTracks > 0 && (isCamera
        ? width > 0 && height > 0
        : peak >= 0.005)),
    isCamera
      ? 'Blanc did not receive a live frame from the real camera'
      : 'Blanc did not receive a measurable signal from the real microphone',
  );
  assert.equal(result.state, 'granted', `native ${mediaKind} request failed: ${result.state}`);
  if (isCamera) {
    assert.ok(result.liveTracks > 0, 'real camera track was not live');
    assert.ok(result.width > 0 && result.height > 0, 'real camera frame had no dimensions');
    console.log(
      `packaged-native-media-smoke OK: live camera frame ${result.width}x${result.height}`
    );
  } else {
    assert.ok(result.peak >= 0.005, `real microphone signal was too quiet: ${result.peak}`);
    console.log(`packaged-native-media-smoke OK: live microphone peak ${result.peak.toFixed(3)}`);
  }
} finally {
  if (app) {
    for (const page of app.pages()) {
      if (page.url() === probeUrl) {
        await page.evaluate(async () => {
          clearInterval(globalThis.__meter);
          globalThis.__stream?.getTracks().forEach((track) => track.stop());
          const preview = document.getElementById('preview');
          if (preview) preview.srcObject = null;
          await globalThis.__audioContext?.close();
        }).catch(() => {});
      }
    }
    await app.close();
  }
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
