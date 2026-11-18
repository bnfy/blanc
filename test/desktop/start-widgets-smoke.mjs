// The Start Page's widget cards end to end in the real app (ported from the
// fork's native-start-widgets.mjs and native-start-devices.mjs): the
// switches, On your other devices grouped by device with three tabs each and
// "N more tabs", a card resized by its bottom edge from the keyboard and kept
// after a reload, double-click fitting it again, and Favorites listing eight
// until it has a size, glass cards and image-aware ink over a photo, and
// refused writes leaving the saved choice alone.
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-start-widgets-'));
const profile = path.join(root, 'profile');
const userData = `${profile}-Dev`;
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const settingsFile = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
const tabs = (n, host) => Array.from({ length: n }, (_, i) => ({ url: `https://${host}/p${i}`, title: `Page ${i + 1} on ${host}` }));
const DEVICES = [
  { deviceId: 'a', name: 'MacBook Pro', platform: 'darwin', tabs: tabs(30, 'blanc.day') },
  { deviceId: 'b', name: 'iPhone Air', platform: 'ios', tabs: tabs(2, 'bnfy.me') },
];

let app;
try {
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') },
  });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForLoadState('domcontentloaded');
  // The test hook is installed once the first window is up.
  await waitForValue(() => app.evaluate(() => typeof globalThis.__blancCall === 'function'), Boolean, 'the test hook');
  for (let i = 0; i < 20; i += 1) await callTestHook(app, 'seedFavorite', [`https://fav-${i}.example/`, `Favorite ${i + 1}`]);
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('layout-ready'));

  // The switches: both widgets on, saved device-local.
  for (const name of ['favorites', 'devices']) await page.evaluate((n) => window.bowserPages.start.setWidget(n, true), name);
  await waitForValue(() => settingsFile().newtabWidgets, (w) => w?.favorites && w.devices, 'both widgets saved');
  assert.equal(await page.getAttribute('[data-widget-pick="favorites"]', 'aria-checked'), 'true');

  // Favorites lists eight until it has a size.
  await page.waitForFunction(() => document.querySelectorAll('#favoritesList [data-favorite-url]').length === 8);

  // On your other devices: grouped, three tabs a device, then "N more tabs".
  await page.evaluate((devices) => renderRemote(devices), DEVICES);
  const devices = await page.evaluate(() => [...document.querySelectorAll('#remoteList .remote-device')].map((group) => ({
    name: group.querySelector('.remote-device-name')?.textContent,
    count: group.querySelector('.remote-device-count')?.textContent,
    rows: [...group.querySelectorAll('.remote-tab')].map((row) => row.dataset.device),
    more: group.querySelector('.remote-device-more')?.textContent ?? null,
  })));
  assert.deepEqual(devices.map((d) => d.name), ['MacBook Pro', 'iPhone Air']);
  assert.equal(devices[0].count, '30 tabs');
  assert.deepEqual(devices[0].rows, ['MacBook Pro', 'MacBook Pro', 'MacBook Pro']);
  assert.equal(devices[0].more, '27 more tabs');
  assert.equal(devices[1].more, null, 'two tabs need no more button');
  await page.click('#remoteList .remote-device-more');
  assert.equal(await page.locator('#remoteList .remote-device:first-child .remote-tab').count(), 30);
  assert.equal(await page.textContent('#remoteList .remote-device-more'), 'Show fewer');

  // The devices card resizes by its bottom edge: a separator that steps
  // through the five sizes from the keyboard and is saved.
  const edge = page.locator('#remoteSection > .bb-widget-resize');
  assert.equal(await edge.getAttribute('role'), 'separator');
  assert.equal(await edge.getAttribute('aria-valuetext'), 'Fits the column');
  await edge.focus();
  await page.keyboard.press('Home');
  const saved = await waitForValue(() => settingsFile().newtabWidgets?.sizes?.devices, (size) => size === 240, 'the smallest size saved');
  assert.equal(saved, 240);
  assert.equal(await edge.getAttribute('aria-valuetext'), 'Size 1 of 5');
  await page.keyboard.press('ArrowDown');
  await waitForValue(() => settingsFile().newtabWidgets?.sizes?.devices, (size) => size === 360, 'one size larger saved');

  // Kept after a reload; double-click fits the column again.
  await page.reload();
  await page.waitForFunction(() => document.getElementById('remoteSection').dataset.size === '360');
  // This profile has no synced devices, so the reloaded page draws none: draw
  // the same three again so the card (and its edge) shows.
  await page.evaluate((devices) => renderRemote(devices), DEVICES);
  await page.locator('#remoteSection > .bb-widget-resize').dblclick();
  await waitForValue(() => settingsFile().newtabWidgets?.sizes, (sizes) => sizes && !('devices' in sizes), 'the size removed');

  // A sized Favorites card lists every favorite and scrolls inside.
  await page.locator('#favoritesWidget > .bb-widget-resize').focus();
  // End takes the largest size its column has room for (here, under the
  // devices card in the same column).
  await page.keyboard.press('End');
  await waitForValue(() => settingsFile().newtabWidgets?.sizes?.favorites, (size) => [240, 360, 480, 600, 720].includes(size),
    'Favorites sized');
  await page.waitForFunction(() => document.querySelectorAll('#favoritesList [data-favorite-url]').length === 20);

  // Over your image: the cards are glass, the footer sits in a fade, and
  // small text takes the ink that stands out against the image behind it
  // (newtab-ink.js). Fade at 0 so the image alone decides.
  const photos = await app.evaluate(({ nativeImage }, dir) => {
    const fs = process.mainModule.require('node:fs');
    const path = process.mainModule.require('node:path');
    const make = (value, name) => {
      const pixels = Buffer.alloc(400 * 300 * 4, value);
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
      const file = path.join(dir, name);
      fs.writeFileSync(file, nativeImage.createFromBitmap(pixels, { width: 400, height: 300 }).toJPEG(90));
      return file;
    };
    return { dark: make(8, 'dark.jpg'), light: make(248, 'light.jpg') };
  }, root);
  for (const [photo, ink] of [[photos.dark, 'light'], [photos.light, 'dark']]) {
    await callTestHook(app, 'chooseWallpaperFile', [photo]);
    await page.evaluate(() => window.bowserPages.start.chooseWallpaper());
    await page.evaluate(() => window.bowserPages.start.setWallpaperWash(0));
    await page.waitForFunction(() => document.body.dataset.wallpaperStyle);
    await page.waitForFunction((ink) => document.querySelector('.start-brand-date')?.dataset.ink === ink, ink);
  }
  const look = await page.evaluate(() => ({
    glass: getComputedStyle(document.getElementById('favoritesWidget')).backdropFilter,
    fade: getComputedStyle(document.getElementById('layoutFooter'), '::after').content,
  }));
  assert.match(look.glass, /blur\(28px\)/);
  assert.equal(look.fade, '""');

  // Customize on a short window, with your image's options showing (owner,
  // 2026-11-18): it never covers the clock or the line under it, it ends
  // above its button, and its columns scroll to the rest.
  for (const height of [620, 520]) {
    await page.setViewportSize({ width: 1280, height });
    await page.evaluate(() => {
      const popover = document.getElementById('customizePopover');
      if (!popover.matches(':popover-open')) document.getElementById('customizeButton').click();
    });
    const fit = await waitForValue(() => page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const clock = Math.max(r(document.querySelector('.bb-clock-row')).bottom, r(document.getElementById('bbBlocked')).bottom);
      const popover = r(document.getElementById('customizePopover'));
      const cols = document.getElementById('customizeCols');
      return { clock, top: popover.top, bottom: popover.bottom, button: r(document.getElementById('customizeButton')).top,
        scrolls: cols.scrollHeight > cols.clientHeight, fadeEnd: cols.dataset.fadeEnd };
    }), (value) => value.top >= value.clock, `Customize below the clock at 1280x${height}`);
    assert.ok(fit.bottom <= fit.button, `Customize ends above its button: ${JSON.stringify(fit)}`);
    assert.ok(fit.scrolls && fit.fadeEnd === 'true', `the columns scroll, with a fade: ${JSON.stringify(fit)}`);
    await page.evaluate(() => { const cols = document.getElementById('customizeCols'); cols.scrollTop = cols.scrollHeight; });
    await page.waitForFunction(() => document.getElementById('customizeCols').dataset.fadeEnd === 'false');
  }
  await page.evaluate(() => document.getElementById('customizePopover').hidePopover());
  await page.setViewportSize({ width: 1600, height: 960 });

  // A refused write leaves the stored choice in place.
  await assert.rejects(page.evaluate(() => window.bowserPages.start.setWidget('chart', true)));
  await assert.rejects(page.evaluate(() => window.bowserPages.start.setShortcutCount(13)));
  assert.equal(settingsFile().newtabWidgets.favorites, true);

  console.log('start-widgets smoke: passed');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
