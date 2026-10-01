import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-solar-city-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
  newtabDynamicWallpaper: true,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({ args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1' } });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    const NativeDate = Date;
    window.solarTestInstant = '2026-10-01T23:09:00Z';
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [window.solarTestInstant])); }
      getHours() { return 19; } // Deterministic clock fallback on every runner.
      static now() { return new NativeDate(window.solarTestInstant).getTime(); }
    };
    wallpaper.refresh();
  });
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'dusk');
  await callTestHook(app, 'openSettings');
  const sheet = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://settings/'), Boolean, 'settings sheet');
  await sheet.waitForFunction(() => document.getElementById('wallpaperCityStatus').textContent.includes('No city selected'));
  const input = sheet.getByLabel('Wallpaper city', { exact: true });
  await input.fill('New York');
  const city = sheet.getByRole('button', { name: 'New York City, New York, United States', exact: true });
  await city.waitFor({ state: 'visible' });
  await input.press('ArrowDown');
  assert.equal(await city.evaluate((button) => button === document.activeElement), true);
  await city.press('Enter');
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night');
  assert.equal((await page.evaluate(() => window.bowserPages.start.data())).wallpaperLocation.id, '5128581');
  await sheet.waitForFunction(() => document.getElementById('wallpaperCityStatus').textContent.includes('Night begins at sunset'));
  for (const value of [null, {}, 'a', 'x'.repeat(81)]) assert.deepEqual(await sheet.evaluate((query) => window.bowserPages.settings.searchWallpaperCities(query), value), []);
  const saved = await sheet.evaluate(() => window.bowserPages.settings.set({ newtabWallpaperCity: { id: '5128581', latitude: 0 } }));
  assert.equal(saved.newtabWallpaperCity, '5128581');
  for (const width of [640, 1200]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 820), width);
    await input.fill('San');
    await sheet.waitForFunction(() => document.querySelectorAll('.wallpaper-city-result').length > 0);
    assert.equal(await sheet.evaluate(() => [...document.querySelectorAll('.wallpaper-city-result')].every((button) => {
      const r = button.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    })), true, 'city results fit the sheet width');
    if (process.env.BLANC_SOLAR_REVIEW_DIR) {
      fs.mkdirSync(process.env.BLANC_SOLAR_REVIEW_DIR, { recursive: true });
      await sheet.screenshot({ path: path.join(process.env.BLANC_SOLAR_REVIEW_DIR, `settings-city-${width}.png`) });
    }
  }
  await input.fill('Rochester NY');
  await sheet.getByRole('button', { name: 'Rochester, New York, United States', exact: true }).click();
  await page.waitForFunction(async () => (await window.bowserPages.start.data()).wallpaperLocation?.id === '5134086');
  await sheet.getByRole('button', { name: 'Use clock times', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'dusk');
  await input.fill('New York');
  await city.click();
  await callTestHook(app, 'closeUtilitySurface');
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'night');
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally']) {
    await callTestHook(app, 'setNewtabLayout', [layout]);
    await page.waitForFunction((layout) => document.body.dataset.layout === layout, layout);
    assert.equal(await page.evaluate(() => document.body.dataset.wallpaperPhase), 'night');
  }
  await callTestHook(app, 'setNewtabLayout', ['billboard']);
  await page.waitForFunction(() => document.body.dataset.layout === 'billboard');
  if (process.env.BLANC_SOLAR_REVIEW_DIR) await page.screenshot({ path: path.join(process.env.BLANC_SOLAR_REVIEW_DIR, 'new-york-1909-night.png') });
  const privateId = await callTestHook(app, 'openTab', ['blanc://newtab/?private=1', { private: true }]);
  const privatePage = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/?private=1'), Boolean, 'private start page');
  await privatePage.waitForFunction(async () => (await window.bowserPages.start.data()).wallpaperLocation?.id === '5128581');
  await callTestHook(app, 'activateTab', [privateId, true]);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(JSON.parse(fs.readFileSync(path.join(`${profile}-Dev`, 'settings.json'))).newtabWallpaperCity, '5128581');
  console.log('wallpaper-city-smoke PASS: offline search, keyboard choice, reported 7:09 PM NY night, live city change and clear, narrow writes, responsive results, four layouts, private tabs and persistence');
} finally {
  if (app) await app.close();
  fs.rmSync(root, { recursive: true, force: true });
}
