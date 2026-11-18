// The Start Page's wallpaper continues behind the Island's band (ported from
// the fork's native-island-backdrop.mjs): on Sunrise and over a photo the
// band's last row and the page's first row meet without a seam; a website tab
// drops it; with vertical tabs the band paints only above the page, and the
// rail keeps its own surface. (Each reason the band stands aside is in
// test/unit/start-backdrop.test.js.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron } from 'playwright';
import poll from './support/poll.js';

const require = createRequire(import.meta.url);
const { callTestHook } = require('./support/test-hook-call.js');
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-start-backdrop-'));
const profile = path.join(root, 'profile');
const userData = `${profile}-Dev`;
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

// Mean absolute difference per channel between the band's last row and the
// page's first row, captured from the real views.
const seam = (app) => app.evaluate(async ({ BrowserWindow, webContents }) => {
  const window = BrowserWindow.getAllWindows()[0];
  const page = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith('blanc://newtab/'));
  const view = window.contentView.children.find((child) => child.webContents === page);
  const bounds = view.getBounds();
  const width = Math.min(bounds.width, 900);
  const band = await window.webContents.capturePage({ x: bounds.x, y: bounds.y - 1, width, height: 1 });
  const top = await page.capturePage({ x: 0, y: 0, width, height: 1 });
  const a = band.resize({ width, height: 1 }).toBitmap();
  const b = top.resize({ width, height: 1 }).toBitmap();
  let total = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c += 1) total += Math.abs(a[i + c] - b[i + c]);
  return { mean: total / ((a.length / 4) * 3), x: bounds.x, y: bounds.y };
});
const strip = async (app) => {
  const chrome = (await app.windows()).find((p) => p.url().startsWith('blanc-chrome://') && !p.url().includes('float'));
  return chrome.evaluate(() => {
    const backdrop = document.getElementById('bandBackdrop');
    const r = backdrop.getBoundingClientRect();
    return { shown: !backdrop.hidden, left: r.left, transparent: getComputedStyle(document.getElementById('strip')).backgroundColor };
  });
};

let app;
try {
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') },
  });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForLoadState('domcontentloaded');
  await waitForValue(() => app.evaluate(() => typeof globalThis.__blancCall === 'function'), Boolean, 'the test hook');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));

  // Sunrise: the band continues the page.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-island-band'));
  await waitForValue(() => strip(app), (s) => s.shown, 'the band backdrop on Sunrise');
  const sunrise = await waitForValue(() => seam(app), (s) => s.mean < 6, 'no seam on Sunrise');
  console.log('sunrise seam', sunrise.mean.toFixed(2));

  // Over a photo with bands across the top edge (made by Electron itself).
  const photo = await app.evaluate(({ nativeImage }, dir) => {
    const fs = process.mainModule.require('fs');
    const path = process.mainModule.require('path');
    const w = 400, h = 300, pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      pixels[i] = (x * 7) % 256; pixels[i + 1] = (x * 3 + 60) % 256; pixels[i + 2] = 180; pixels[i + 3] = 255;
    }
    const file = path.join(dir, 'stripes.jpg');
    fs.writeFileSync(file, nativeImage.createFromBitmap(pixels, { width: w, height: h }).toJPEG(95));
    return file;
  }, root);
  await callTestHook(app, 'chooseWallpaperFile', [photo]);
  await page.evaluate(() => window.bowserPages.start.chooseWallpaper());
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'custom');
  const overPhoto = await waitForValue(() => seam(app), (s) => s.mean < 6, 'no seam over the photo');
  console.log('photo seam', overPhoto.mean.toFixed(2));

  // Vertical tabs: the band paints above the page only, beside the rail.
  await callTestHook(app, 'setTabLayout', ['vertical']);
  const vertical = await waitForValue(() => strip(app), (s) => s.shown && s.left > 100, 'the band beside the rail');
  const verticalSeam = await waitForValue(() => seam(app), (s) => s.x > 100 && s.mean < 6, 'no seam with vertical tabs');
  assert.equal(Math.round(vertical.left), verticalSeam.x, 'the band starts where the page does');
  await callTestHook(app, 'setTabLayout', ['island']);

  // A website tab drops it; coming back brings it back.
  const site = await callTestHook(app, 'openTab', ['https://example.test/']);
  await waitForValue(() => strip(app), (s) => !s.shown, 'no band backdrop over a website');
  await callTestHook(app, 'closeTab', [site]);
  await waitForValue(() => strip(app), (s) => s.shown, 'the band backdrop back on the Start Page');

  console.log('start-backdrop smoke: passed');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
