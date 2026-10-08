// Settings → General → Match site colors: off keeps the Island strip on the
// theme background; on again resamples the active page (issue #511).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-colors-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, theme: 'dark',
  usagePing: false, searchSuggestions: false,
}));
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Site colors fixture</title><style>html,body{margin:0;background:#fff}header{height:160px;background:#d23c1e}</style><header></header>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1' } });
  await waitForValue(() => app.evaluate(() => globalThis.__blanc?.startupReady()), Boolean, 'startup ready', 30000);
  const chrome = await waitForValue(async () => (await app.windows()).find(p => p.url() === 'blanc-chrome://index/'), Boolean, 'chrome');
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().forEach(wc => wc.setBackgroundThrottling(false)));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 760));
  const tint = () => chrome.evaluate(() => document.getElementById('strip').style.getPropertyValue('--page-bg'));
  const near = (actual, expected) => /^#[0-9a-f]{6}$/i.test(actual) && [1, 3, 5].every(i => Math.abs(parseInt(actual.slice(i, i + 2), 16) - parseInt(expected.slice(i, i + 2), 16)) <= 2);

  const tabId = await callTestHook(app, 'openTab', [origin]);
  await callTestHook(app, 'activateTab', [tabId]);
  await waitForValue(tint, value => near(value, '#d23c1e'), 'site tint while on', 8000);

  const clickToggle = async () => {
    await callTestHook(app, 'openSettings');
    const sheet = await waitForValue(async () => (await app.windows()).find(p => p.url().startsWith('blanc://settings')), Boolean, 'settings sheet');
    await sheet.waitForSelector('#islandSiteColors', { state: 'attached' });
    const before = await sheet.$eval('#islandSiteColors', el => el.checked);
    await sheet.click('#islandSiteColorsSetting .toggle');
    await waitForValue(() => sheet.$eval('#islandSiteColors', el => el.checked), v => v === !before, 'toggle flipped');
    await sheet.keyboard.press('Escape');
    return !before;
  };

  assert.equal(await clickToggle(), false);
  await waitForValue(tint, value => !near(value, '#d23c1e'), 'tint cleared when off', 6000);
  const state = await callTestHook(app, 'state');
  assert.equal(state.tabs.find(tab => tab.id === tabId)?.pageBg ?? null, null);
  // No resample may repaint the strip while off.
  await callTestHook(app, 'activateTab', [tabId]);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.ok(!near(await tint(), '#d23c1e'), 'stayed untinted after reactivation');
  // Let the strip's color transition settle before capturing proof.
  const settle = () => new Promise(resolve => setTimeout(resolve, 1200));
  const offShot = path.join(root, 'strip-off.png');
  await chrome.screenshot({ path: offShot, clip: { x: 0, y: 0, width: 1100, height: 80 } });

  assert.equal(await clickToggle(), true);
  await waitForValue(tint, value => near(value, '#d23c1e'), 'tint restored when on', 8000);
  await settle();
  const onShot = path.join(root, 'strip-on.png');
  await chrome.screenshot({ path: onShot, clip: { x: 0, y: 0, width: 1100, height: 80 } });
  console.log(JSON.stringify({ ok: true, offShot, onShot }));
} finally {
  await app?.close().catch(() => {});
  server.close();
}
