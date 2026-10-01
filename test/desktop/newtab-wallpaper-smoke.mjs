import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-wallpaper-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
  newtabDynamicWallpaper: true,
}));
const output = process.env.BLANC_WALLPAPER_REVIEW_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaught = path.join(root, 'uncaught.log');
let app;
try {
  app = await _electron.launch({ args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught } });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase);
  const data = await page.evaluate(() => window.bowserPages.start.data());
  assert.equal(data.patronActive, false);
  assert.equal(data.dynamicWallpaperEnabled, true, 'wallpaper is available without Patron');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 820));
  const privateId = await callTestHook(app, 'openTab', ['blanc://newtab/?private=1', { private: true }]);
  const privatePage = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/?private=1'), Boolean, 'private start page');
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase);
  await page.waitForFunction(() => document.body.dataset.wallpaperVisible === 'false');
  const publicId = (await callTestHook(app, 'state')).tabs.find((tab) => tab.url === 'blanc://newtab/').id;
  for (const style of ['light', 'dark', 'private']) {
    const current = style === 'private' ? privatePage : page;
    await callTestHook(app, 'activateTab', [style === 'private' ? privateId : publicId, true]);
    await callTestHook(app, 'setAppearance', [style === 'private' ? 'dark' : style]);
    await current.emulateMedia({ reducedMotion: 'reduce', colorScheme: style === 'light' ? 'light' : 'dark' });
    assert.equal(await current.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), style !== 'light');
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
      await callTestHook(app, 'setNewtabLayout', [layout]);
      await current.waitForFunction((layout) => document.body.dataset.layout === layout, layout);
      for (const [phase, hour] of [['dawn',6],['day',12],['dusk',18],['night',23]]) {
        await current.evaluate((hour) => {
          Date.prototype.getHours = () => hour;
          // Global lexical binding belongs to the shipped start-page script.
          wallpaper.refresh();
        }, hour);
        await current.waitForFunction((phase) => document.body.dataset.wallpaperPhase === phase, phase);
        const check = await current.evaluate(() => ({
          visible: [...document.querySelectorAll('.start-wallpaper-layer')].filter((el) => el.classList.contains('is-visible')).length,
          images: [...document.querySelectorAll('img')].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src),
          private: document.documentElement.dataset.theme === 'private',
        }));
        assert.equal(check.visible, 1); assert.deepEqual(check.images, []);
        assert.equal(check.private, style === 'private');
        if (output) await current.screenshot({ path: path.join(output, `${phase}-${layout}-${style}.png`) });
      }
    }
  }
  await callTestHook(app, 'openSettings');
  const sheet = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://settings/'), Boolean, 'settings sheet');
  const toggle = sheet.locator('#newtabDynamicWallpaper');
  await toggle.waitFor({ state: 'visible' });
  assert.equal(await toggle.isEnabled(), true, 'free setting is enabled without Patron');
  await sheet.waitForFunction(() => document.getElementById('newtabDynamicWallpaper').checked);
  assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck();
  await privatePage.waitForFunction(() => !document.body.dataset.wallpaperPhase);
  assert.equal(await privatePage.locator('.start-wallpaper-layer.is-visible').count(), 0);
  await toggle.check();
  await callTestHook(app, 'closeUtilitySurface');
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperVisible === 'false');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await privatePage.waitForFunction(() => document.body.dataset.wallpaperVisible === 'true');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  assert.equal((await privatePage.evaluate(() => window.bowserPages.start.data())).dynamicWallpaperEnabled, true);
  console.log('newtab-wallpaper-smoke PASS: free entitlement, 48 rendered combinations, main-owned hidden-tab visibility, live opt-in/out and resume status');
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
