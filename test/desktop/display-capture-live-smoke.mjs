import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { _electron } from 'playwright';
import hook from './support/test-hook-call.js';
import polling from './support/poll.js';

// Real OS window/screen capture, actual output audio, and separate WebRTC
// endpoints. No fake-media flags, canvas.captureStream, or saved captured PCM.
if (process.platform !== 'linux') throw new Error('This automated demonstration currently targets Linux/X11.');
if (!process.env.BLANC_PROBE_EXECUTABLE) throw new Error('An explicitly staged patched runtime is required.');
const { callTestHook } = hook;
const { waitForValue } = polling;
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/display-live/', import.meta.url));
const output = path.join(root, 'output/playwright/display-live');
fs.mkdirSync(output, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-live-sharing-'));
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!['source.html', 'sender.html', 'receiver.html'].includes(name)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(fs.readFileSync(path.join(fixtures, name)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let app;
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  platform: process.platform, arch: process.arch, osRelease: os.release(), packaged: false,
  generatedContentOnly: true, cases: [], passed: false };
try {
  app = await _electron.launch({ executablePath: process.env.BLANC_PROBE_EXECUTABLE,
    args: [root, `--user-data-dir=${userData}`], env: { ...process.env, BLANC_TEST: '1' } });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'Blanc startup', 30_000);
  report.runtime = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
  assert.equal(report.runtime.electron, '44.2.0');
  await app.evaluate(({ BrowserWindow }, base) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 720, y: 20, width: 1180, height: 1040 });
    for (const [name, bounds] of [['source', { x: 30, y: 30, width: 640, height: 480 }],
      ['receiver', { x: 30, y: 550, width: 640, height: 480 }]]) {
      const window = new BrowserWindow({ ...bounds, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      window.loadURL(`${base}/${name}.html`);
    }
  }, base);
  const pageFor = (name) => waitForValue(() => app.context().pages().find((page) => page.url() === `${base}/${name}.html`), Boolean, `${name} page`, 15_000);
  const source = await pageFor('source');
  const receiver = await pageFor('receiver');
  await source.locator('#tone').click();
  await source.waitForFunction(() => window.toneContext?.state === 'running');
  const tabId = await callTestHook(app, 'openTab', [`${base}/sender.html`]);
  const sender = await pageFor('sender');
  const bridges = () => app.evaluate(({ webContents }) => webContents.getAllWebContents()
    .filter((wc) => !wc.isDestroyed() && wc.getURL() === 'blanc-chrome://display-audio/').length);

  for (const kind of ['window', 'screen']) {
    console.log(`LIVE: Share real ${kind} pixels and output audio through Blanc`);
    await receiver.reload();
    await receiver.locator('#ready').click();
    if (kind === 'screen') {
      const point = await app.evaluate(({ BrowserWindow, screen }, sourceURL) => {
        const source = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL() === sourceURL);
        const bounds = source.getContentBounds();
        const display = screen.getDisplayMatching(bounds).bounds;
        return { x: (bounds.x + bounds.width * 0.25 - display.x) / display.width,
          y: (bounds.y + bounds.height * 0.75 - display.y) / display.height };
      }, `${base}/source.html`);
      await receiver.evaluate((point) => { window.probePoint = point; }, point);
    }
    await sender.locator('#share').click();
    const picker = await waitForValue(() => app.context().pages().find((page) => page.url() === 'blanc-chrome://display/'), Boolean, 'real source picker', 15_000);
    const pickerData = await picker.evaluate(() => window.displayPicker.state());
    assert.equal(pickerData.nativePicker, false);
    const index = pickerData.sources.findIndex((source) => kind === 'screen' ? source.type === 'screen'
      : source.type === 'window' && source.name.includes('Blanc generated capture source'));
    assert.ok(index >= 0, `${kind} source must be enumerated by desktopCapturer`);
    await picker.locator('.source').nth(index).click();
    await picker.locator('#audio').check();
    await picker.locator('#share').click();
    await sender.waitForFunction(() => window.captureState !== 'pending');
    assert.equal(await sender.evaluate(() => window.captureState), 'shared');
    assert.deepEqual(await sender.evaluate(() => sharedStream.getTracks().map((track) => track.kind).sort()), ['audio', 'video']);
    const offer = await sender.evaluate(() => window.makeOffer());
    const answer = await receiver.evaluate((offer) => window.acceptOffer(offer), offer);
    await sender.evaluate((answer) => peer.setRemoteDescription(answer), answer);
    const metrics = await waitForValue(() => receiver.evaluate(() => ({ ...window.measurements, connection: peer.connectionState })),
      (m) => m.connection === 'connected' && m.redFrames >= 3 && m.blueFrames >= 3 && m.rms > 0.005
        && m.peakHz > 850 && m.peakHz < 910 && m.width > 100 && m.height > 100,
      `decoded ${kind} video and 880 Hz audio at the separate receiver`, 30_000);
    const stats = await receiver.evaluate(async () => [...(await peer.getStats()).values()]
      .filter((row) => row.type === 'inbound-rtp').map(({ kind, packetsReceived, framesDecoded, bytesReceived }) => ({ kind, packetsReceived, framesDecoded, bytesReceived })));
    assert.ok(stats.some((row) => row.kind === 'video' && row.framesDecoded > 5));
    assert.ok(stats.some((row) => row.kind === 'audio' && row.packetsReceived > 5));
    await receiver.screenshot({ path: path.join(output, `${kind}-receiver.png`) });
    await sender.locator('#stop-audio').click();
    await waitForValue(bridges, (count) => count === 0, 'Linux monitor bridge to close after the last audio track ends', 10_000);
    const silent = await waitForValue(() => receiver.evaluate(() => ({ ...measurements })),
      (m) => m.rms < 0.002 && m.redFrames > metrics.redFrames + 2 && m.blueFrames > metrics.blueFrames + 2,
      'audio stopped while decoded screen video continues', 15_000);
    assert.equal(await sender.evaluate(() => sharedStream.getVideoTracks()[0].readyState), 'live');
    await sender.locator('#stop').click();
    await waitForValue(() => callTestHook(app, 'state'), (state) => {
      const capture = state.tabs.find((tab) => tab.id === tabId)?.capture;
      return capture && !capture.display && !capture.systemAudio;
    }, 'display indicator to clear', 10_000);
    await sender.evaluate(() => peer.close()); await receiver.evaluate(() => peer.close());
    report.cases.push({ kind, metrics, inboundRtp: stats, audioStoppedRms: silent.rms, videoPreserved: true, monitorClosed: true });
    console.log(`PASS: ${kind}, ${metrics.width}x${metrics.height}, ${metrics.peakHz.toFixed(1)} Hz, RMS ${metrics.rms.toFixed(4)}`);
  }
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack ?? error);
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  if (app) await app.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(`${userData}-Dev`, { recursive: true, force: true });
}
