// The Start Page's widget cards end to end in the real app (ported from the
// fork's native-start-widgets.mjs and native-start-devices.mjs): the
// switches, On your other devices grouped by device with three tabs each and
// "N more tabs", a card resized by its bottom edge from the keyboard and kept
// after a reload, double-click fitting it again, and Favorites listing eight
// until it has a size, and refused writes leaving the saved choice alone.
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
  for (let i = 0; i < 20; i += 1) await callTestHook(app, 'seedFavorite', [`https://fav-${i}.example/`, `Favorite ${i + 1}`]);
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForLoadState('domcontentloaded');
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
  await page.locator('#remoteSection > .bb-widget-resize').dblclick();
  await waitForValue(() => settingsFile().newtabWidgets?.sizes, (sizes) => sizes && !('devices' in sizes), 'the size removed');

  // A sized Favorites card lists every favorite and scrolls inside.
  await page.locator('#favoritesWidget > .bb-widget-resize').focus();
  await page.keyboard.press('End');
  await waitForValue(() => settingsFile().newtabWidgets?.sizes?.favorites, (size) => size === 720, 'Favorites sized');
  await page.waitForFunction(() => document.querySelectorAll('#favoritesList [data-favorite-url]').length === 20);

  // A refused write leaves the stored choice in place.
  await assert.rejects(page.evaluate(() => window.bowserPages.start.setWidget('chart', true)));
  await assert.rejects(page.evaluate(() => window.bowserPages.start.setShortcutCount(13)));
  assert.equal(settingsFile().newtabWidgets.favorites, true);

  console.log('start-widgets smoke: passed');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
