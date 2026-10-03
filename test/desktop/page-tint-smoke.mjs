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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-page-tint-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, theme: 'light',
  usagePing: false, searchSuggestions: false, newtabDynamicWallpaper: true,
  newtabLayout: 'billboard',
}));
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Tint fixture</title><style>html,body{margin:0;background:#abcdef}header{height:160px;background:#123456;transition:background-color .6s linear}body{height:2000px}header.changed{background:#654321}</style><header></header><p>Local disposable tint fixture</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaught = path.join(root, 'uncaught.log');
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught } });
  await waitForValue(() => app.evaluate(() => globalThis.__blanc?.startupReady()), Boolean, 'startup ready', 30000);
  const chrome = await waitForValue(async () => (await app.windows()).find(p => p.url() === 'blanc-chrome://index/'), Boolean, 'chrome');
  const start = await waitForValue(async () => (await app.windows()).find(p => p.url() === 'blanc://newtab/'), Boolean, 'start page');
  // Test-only: a macOS automation host can occlude the fixture window.
  // Keep renderer-frame observations running while the test owns its view.
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().forEach(wc => wc.setBackgroundThrottling(false)));
  const firstWindowId = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1200, 820); return w.id; });
  const tint = (page = chrome) => page.evaluate(() => document.getElementById('strip').style.getPropertyValue('--page-bg'));
  const closeColor = (actual, expected) => /^#[0-9a-f]{6}$/i.test(actual) && [1,3,5].every(i => Math.abs(parseInt(actual.slice(i,i+2),16) - parseInt(expected.slice(i,i+2),16)) <= 2);
  const waitTint = (color, page = chrome) => waitForValue(() => tint(page), value => closeColor(value, color), `strip tint ${color}`, 6000);
  const tabInfo = async id => (await callTestHook(app, 'state')).tabs.find(tab => tab.id === id);
  const publicId = (await callTestHook(app, 'state')).activeTabId;
  const watchCaptures = async id => {
    const { webContentsId } = await tabInfo(id);
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id);
      const original = wc.capturePage.bind(wc);
      wc.tintFixture = { calls: 0, concurrent: 0, maxConcurrent: 0, delay: 0, lastRect: null };
      wc.capturePage = async rect => {
        const fixture = wc.tintFixture;
        fixture.calls++; fixture.concurrent++; fixture.maxConcurrent = Math.max(fixture.maxConcurrent, fixture.concurrent); fixture.lastRect = rect;
        try {
          const image = await original(rect);
          if (fixture.delay) await new Promise(resolve => setTimeout(resolve, fixture.delay));
          return image;
        } finally { fixture.concurrent--; }
      };
    }, webContentsId);
    return () => app.evaluate(({ webContents }, id) => webContents.fromId(id)?.tintFixture, webContentsId);
  };
  const expectedTopEdge = async id => {
    const tab = await tabInfo(id);
    return app.evaluate(async ({ webContents }, tab) => {
      const image = await webContents.fromId(tab.webContentsId).capturePage({ x: 0, y: 0, width: tab.bounds.width, height: 2 });
      const bytes = image.toBitmap(); const counts = new Map();
      for (let i = 0; i + 3 < bytes.length; i += 16) {
        const rgb = (bytes[i + 2] << 16) | (bytes[i + 1] << 8) | bytes[i];
        counts.set(rgb, (counts.get(rgb) || 0) + 1);
      }
      const rgb = [...counts].sort((a,b) => b[1] - a[1])[0][0];
      return `#${rgb.toString(16).padStart(6, '0')}`;
    }, tab);
  };
  await start.waitForFunction(() => typeof wallpaper === 'object' && !document.getElementById('dynamicWallpaperToggle').disabled);
  await start.emulateMedia({ reducedMotion: 'reduce' });
  for (const [phase, hour] of [['dawn',6],['day',12],['dusk',18],['night',23]]) {
    await start.evaluate(hour => { Date.prototype.getHours = () => hour; wallpaper.refresh(); }, hour);
    await start.waitForFunction(phase => document.body.dataset.wallpaperPhase === phase && !document.querySelector('.start-wallpaper-layer.is-fading'), phase);
    await start.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const expected = await waitForValue(() => expectedTopEdge(publicId), color => [1,3,5].every(i => Math.abs(parseInt(color.slice(i,i+2),16) - parseInt(({ dawn: '#f8f1e7', day: '#e3e8e9', dusk: '#f0e7df', night: '#e9e4db' }[phase]).slice(i,i+2),16)) <= 2), `composited ${phase} edge`);
    await waitTint(expected);
  }
  await start.evaluate(() => { Date.prototype.getHours = () => 6; wallpaper.refresh(); });
  await start.waitForFunction(() => document.body.dataset.wallpaperPhase === 'dawn');
  const dawn = await expectedTopEdge(publicId); await waitTint(dawn);
  await start.emulateMedia({ reducedMotion: 'no-preference' });
  await start.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const fadeCounts = await watchCaptures(publicId);
  await chrome.evaluate(() => {
    window.tintFrames = [];
    const until = performance.now() + 2300;
    const frame = () => { tintFrames.push(document.getElementById('strip').style.getPropertyValue('--page-bg')); if (performance.now() < until) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await start.evaluate(() => { Date.prototype.getHours = () => 12; wallpaper.refresh(); });
  await start.waitForFunction(() => document.body.dataset.wallpaperPhase === 'day' && [...document.querySelectorAll('.start-wallpaper-layer.is-visible')].some(layer => { const opacity = Number(getComputedStyle(layer).opacity); return opacity > 0.05 && opacity < 0.95; }));
  await start.waitForFunction(() => document.body.dataset.wallpaperPhase === 'day' && !document.querySelector('.start-wallpaper-layer.is-fading') && getComputedStyle(document.querySelector('.start-wallpaper-layer.is-visible')).opacity === '1');
  const day = await expectedTopEdge(publicId); await waitTint(day);
  const colors = await chrome.evaluate(() => [...new Set(tintFrames)]);
  assert.ok(colors.filter(color => color && color !== dawn && color !== day).length >= 5, `Island follows actual intermediate wallpaper colors: ${colors}`);
  const webId = await callTestHook(app, 'openTab', [origin]);
  const web = await waitForValue(async () => (await app.windows()).find(p => p.url() === origin + '/'), Boolean, 'local website');
  await waitTint('#123456');
  assert.deepEqual(await web.evaluate(() => [typeof window.browserAPI, typeof window.bowserPages]), ['undefined', 'undefined'], 'ordinary websites receive no privileged bridge');
  const counts = await watchCaptures(webId);
  await web.evaluate(() => document.querySelector('header').classList.add('changed'));
  await waitTint('#654321');
  await web.evaluate(() => { document.querySelector('header').style.transition = 'none'; document.styleSheets[0].cssRules[3].style.background = '#246810'; });
  await waitTint('#246810'); // CSSOM edits produce no mutation notification.
  await web.evaluate(() => window.scrollTo(0, 300));
  await waitTint('#abcdef');
  await web.evaluate(() => window.scrollTo(0, 0)); await waitTint('#246810');
  await new Promise(resolve => setTimeout(resolve, 3200));
  const stableStart = (await counts()).calls;
  await new Promise(resolve => setTimeout(resolve, 2200));
  assert.ok((await counts()).calls - stableStart <= 4, 'stable active pages back off');
  assert.equal((await counts()).maxConcurrent, 1, 'no overlapping captures');
  assert.equal((await counts()).lastRect.height, 2, 'only the two-pixel edge is sampled');
  await callTestHook(app, 'activateTab', [publicId]);
  await waitTint(day);
  const stopped = (await counts()).calls;
  await web.evaluate(() => document.querySelector('header').style.background = '#fedcba');
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal((await counts()).calls, stopped, 'background pages are not sampled');
  assert.equal(await tint(), day, 'background changes cannot tint active page');
  await callTestHook(app, 'activateTab', [webId]); await waitTint('#fedcba');
  const privateId = await callTestHook(app, 'openTab', [origin + '/private', { private: true }]);
  const privatePage = await waitForValue(async () => (await app.windows()).find(p => p.url() === origin + '/private'), Boolean, 'private website');
  const privateCounts = await watchCaptures(privateId);
  await privatePage.evaluate(() => document.querySelector('header').style.background = '#112233');
  await new Promise(resolve => setTimeout(resolve, 1300));
  assert.equal((await privateCounts()).calls, 0, 'private pages remain untinted and uncaptured');
  assert.notEqual(await tint(), '#112233');
  await callTestHook(app, 'activateTab', [webId]); await waitTint('#fedcba');
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).hide(), firstWindowId);
  await new Promise(resolve => setTimeout(resolve, 200)); const hiddenCalls = (await counts()).calls;
  await web.evaluate(() => document.querySelector('header').style.background = '#aa55bb');
  await new Promise(resolve => setTimeout(resolve, 1200)); assert.equal((await counts()).calls, hiddenCalls, 'hidden windows stop sampling');
  await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).show(), firstWindowId); await waitTint('#aa55bb');
  const secondRuntime = await callTestHook(app, 'openNewWindow');
  const secondId = await callTestHook(app, 'openTabInWindow', [secondRuntime, origin + '/second']);
  const secondPage = await waitForValue(async () => (await app.windows()).find(p => p.url() === origin + '/second'), Boolean, 'second window fixture');
  const secondWindowId = await app.evaluate(({ BrowserWindow, webContents }, id) => BrowserWindow.fromWebContents(webContents.fromId(id)).id, (await tabInfo(secondId)).webContentsId);
  const secondChrome = await waitForValue(async () => {
    for (const p of await app.windows()) if (p.url() === 'blanc-chrome://index/') {
      const handle = await app.browserWindow(p);
      if (await handle.evaluate(w => w.id) === secondWindowId) return p;
    }
  }, Boolean, 'second chrome');
  await waitTint('#123456', secondChrome);
  await secondPage.evaluate(() => document.querySelector('header').style.background = '#998877');
  await waitTint('#998877', secondChrome); assert.ok(closeColor(await tint(), '#aa55bb'), 'windows keep their own tint');
  await callTestHook(app, 'closeWindowRuntime', [secondRuntime]);
  // Delay a completed old-document capture; switching tabs must invalidate it.
  const webInfo = await tabInfo(webId);
  await app.evaluate(({ webContents }, id) => { webContents.fromId(id).tintFixture.delay = 500; }, webInfo.webContentsId);
  await web.evaluate(() => document.querySelector('header').style.background = '#dd2211');
  await waitForValue(counts, x => x.concurrent === 1, 'delayed capture');
  await callTestHook(app, 'activateTab', [publicId]); await waitTint(day);
  await new Promise(resolve => setTimeout(resolve, 800)); assert.equal(await tint(), day, 'stale capture cannot repaint a different tab');
  await callTestHook(app, 'activateTab', [webId]); await waitTint('#dd2211');
  await web.evaluate(() => document.querySelector('header').style.background = '#2299ee');
  await waitForValue(counts, x => x.concurrent === 1, 'capture before navigation');
  await web.goto(origin + '/navigated'); await waitTint('#123456');
  await web.evaluate(() => document.querySelector('header').style.background = '#116622');
  await waitForValue(counts, x => x.concurrent === 1, 'capture before close');
  await callTestHook(app, 'closeTab', [webId]);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '', '', 'no uncaught lifecycle errors');
  console.log('Page tint smoke passed: four wallpaper phases and intermediate fade colors, live DOM/CSSOM/scroll, stable backoff, background/private/hidden exclusions, per-window routing, stale navigation/switch/close guards, and no website bridge.');
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
