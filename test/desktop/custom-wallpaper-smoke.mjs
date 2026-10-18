// F49 custom Start Page wallpaper, end to end in the real app: choose an
// image (the picker is stood in for), see it drawn, keep it out of private
// tabs and Profile Sync, strip its metadata, and remove it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-custom-wallpaper-'));
const profile = path.join(root, 'profile');
const userData = `${profile}-Dev`;
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaught = path.join(root, 'uncaught.log');
const settingsFile = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
let app;
// blanc:// has no fetch privilege, so probe addresses the way the page uses them.
const loads = (target, src) => target.evaluate((url) => new Promise((resolve) => {
  const img = new Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = url;
}), src);
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught } });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !document.getElementById('customWallpaperToggle').disabled);
  const initial = await page.evaluate(() => window.bowserPages.start.wallpaper());
  assert.deepEqual({ ...initial, color: undefined },
    { source: 'sunrise', hasImage: false, image: null, wash: 100, style: 'auto', color: undefined });
  assert.deepEqual({ preset: initial.color.preset, followSpace: initial.color.followSpace, inSpace: initial.color.inSpace, fill: initial.color.paint.fill },
    { preset: 'sage', followSpace: false, inSpace: false, fill: 'gradient' });

  // Fixtures, made by Electron itself: a wide photo tagged "rotate 90°" with
  // a fake GPS block, an oversized one, and a file that is not an image.
  const fixtures = await app.evaluate(({ nativeImage }, dir) => {
    const fs = process.mainModule.require('fs');
    const path = process.mainModule.require('path');
    const pixels = Buffer.alloc(400 * 200 * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set([40, 90, 160, 255], i);
    const jpeg = nativeImage.createFromBitmap(pixels, { width: 400, height: 200 }).toJPEG(90);
    // Exif with Orientation 6 and an ASCII "GPSSECRET" marker after it.
    const tiff = Buffer.alloc(26);
    tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(6, 18);
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from('GPSSECRET', 'latin1')]);
    const head = Buffer.from([0xff, 0xe1, 0, 0]); head.writeUInt16BE(payload.length + 2, 2);
    const photo = path.join(dir, 'photo.jpg');
    fs.writeFileSync(photo, Buffer.concat([jpeg.subarray(0, 2), head, payload, jpeg.subarray(2)]));
    const big = path.join(dir, 'big.png');
    fs.writeFileSync(big, Buffer.alloc(26 * 1024 * 1024));
    const text = path.join(dir, 'notes.png');
    fs.writeFileSync(text, 'not an image');
    return { photo, big, text };
  }, root);

  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('customizePopover').matches(':popover-open'));
  const custom = page.getByRole('button', { name: 'Your image', exact: true });

  // Refusals leave everything as it was and say why.
  await callTestHook(app, 'chooseWallpaperFile', [fixtures.big]);
  await custom.click();
  await page.waitForFunction(() => !document.getElementById('customWallpaperError').hidden);
  assert.match(await page.locator('#customWallpaperError').textContent(), /25 MB/);
  await callTestHook(app, 'chooseWallpaperFile', [fixtures.text]);
  await custom.click();
  await page.waitForFunction(() => /JPEG or PNG/.test(document.getElementById('customWallpaperError').textContent));
  assert.equal(await custom.getAttribute('aria-pressed'), 'false');
  assert.equal(fs.existsSync(path.join(userData, 'wallpaper', 'current.jpg')), false);

  // The real choice.
  await callTestHook(app, 'chooseWallpaperFile', [fixtures.photo]);
  await custom.click();
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'custom');
  assert.equal(await custom.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#customWallpaperError').isHidden(), true);
  assert.equal(await page.getByRole('button', { name: 'Remove', exact: true }).isVisible(), true);
  const state = await page.evaluate(() => window.bowserPages.start.wallpaper());
  assert.equal(state.source, 'custom');
  assert.match(state.image, /^blanc:\/\/newtab\/user-wallpaper-[0-9a-f]{32}\.jpg\?v=[0-9a-f]{16}$/);
  // Drawn upright: Chromium applies the kept orientation, so 400×200 reads 200×400.
  assert.deepEqual(await page.evaluate((src) => new Promise((resolve) => {
    const img = new Image(); img.onload = () => resolve([img.naturalWidth, img.naturalHeight]); img.src = src;
  }), state.image), [200, 400]);
  const stored = fs.readFileSync(path.join(userData, 'wallpaper', 'current.jpg'));
  assert.equal(stored.indexOf(Buffer.from('GPSSECRET')), -1, 'metadata beyond orientation is stripped');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(userData, 'wallpaper', 'current.jpg')).mode & 0o077, 0, 'owner-only file');
  }
  // settings.json is saved on a short debounce.
  const saved = await waitForValue(async () => settingsFile(), (value) => value.newtabCustomWallpaper === true, 'saved custom choice');
  assert.equal(saved.newtabDynamicWallpaper, false, 'the synced time-of-day choice is untouched');
  // Only the Start Page is told the name; a guessed address is not served.
  assert.equal(await loads(page, state.image), true);
  assert.equal(await loads(page, 'blanc://newtab/user-wallpaper.jpg'), false);

  // Fade: integer 0–100 only, painted as a 0–1 multiplier, kept per device.
  assert.equal(state.wash, 100);
  assert.equal(await page.locator('#customWallpaperWash').isVisible(), true);
  for (const bad of [-5, 140, 50.5, '30']) {
    assert.equal((await page.evaluate((v) => window.bowserPages.start.setWallpaperWash(v), bad)).wash, 100, String(bad));
  }
  await page.locator('#customWallpaperWash').fill('40');
  await page.waitForFunction(() => document.body.style.getPropertyValue('--start-wallpaper-wash') === '0.4');
  await waitForValue(async () => settingsFile(), (value) => value.newtabWallpaperWash === 40, 'saved fade');
  assert.equal((await page.evaluate(() => window.bowserPages.start.wallpaper())).wash, 40);

  // Wash style: Dark forces light text even under the light app theme;
  // Spotlight follows the theme; nothing else is accepted.
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await page.evaluate(() => document.body.dataset.wallpaperStyle), 'auto');
  assert.equal((await page.evaluate(() => window.bowserPages.start.setWallpaperStyle('gradient'))).style, 'auto');
  const textColor = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--text').trim());
  const autoText = await textColor();
  await page.getByRole('button', { name: 'Spotlight', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperStyle === 'spotlight');
  assert.equal(await textColor(), autoText, 'spotlight keeps the theme colors');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperStyle === 'dark');
  assert.equal(await textColor(), '#f7f0e5', 'dark wash brings light text');
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true');
  await waitForValue(async () => settingsFile(), (value) => value.newtabWallpaperStyle === 'dark', 'saved wash style');

  // A private Start Page never shows or offers it.
  await callTestHook(app, 'openTab', ['blanc://newtab/?private=1', { private: true }]);
  const privatePage = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/?private=1'), Boolean, 'private start page');
  await privatePage.waitForLoadState('domcontentloaded');
  await privatePage.waitForFunction(() => window.bowserPages && document.getElementById('customWallpaperRow').hidden);
  const privateState = await privatePage.evaluate(() => window.bowserPages.start.data().then((d) => d.wallpaper));
  assert.deepEqual(privateState, { source: 'sunrise', hasImage: true, image: null, wash: 40, style: 'dark', color: null });
  assert.notEqual(await privatePage.evaluate(() => document.body.dataset.wallpaperPhase), 'custom');
  const publicId = (await callTestHook(app, 'state')).tabs.find((tab) => tab.url === 'blanc://newtab/').id;
  await callTestHook(app, 'activateTab', [publicId, true]);

  // Each wallpaper shows only its own options: the clock switch belongs to
  // Sunrise and is hidden while your image is chosen.
  const clockSwitch = page.getByRole('button', { name: 'Change with time of day', exact: true });
  assert.equal(await clockSwitch.isHidden(), true, 'no clock switch beside your image');
  await page.getByRole('button', { name: 'Sunrise', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase !== 'custom'
    && document.getElementById('customWallpaperRow').hidden);
  assert.equal(await custom.getAttribute('aria-pressed'), 'false');
  await clockSwitch.click();
  await page.waitForFunction(() => ['dawn', 'day', 'dusk', 'night'].includes(document.body.dataset.wallpaperPhase));
  await custom.click();
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase === 'custom');
  assert.equal(await clockSwitch.isHidden(), true);

  // Settings shows the same state and can remove it; the page follows live.
  await callTestHook(app, 'openSettings');
  const sheet = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://settings/'), Boolean, 'settings sheet');
  await sheet.waitForFunction(() => document.getElementById('newtabCustomWallpaper').checked
    && !document.getElementById('customWallpaperRemove').hidden);
  assert.equal(await sheet.locator('#customWallpaperChoose').textContent(), 'Change');
  await sheet.locator('#customWallpaperRemove').click();
  await sheet.waitForFunction(() => !document.getElementById('newtabCustomWallpaper').checked
    && document.getElementById('customWallpaperRemove').hidden);
  await page.waitForFunction(() => document.body.dataset.wallpaperPhase !== 'custom'
    && document.getElementById('customWallpaperRow').hidden);
  assert.equal(fs.existsSync(path.join(userData, 'wallpaper', 'current.jpg')), false);
  await waitForValue(async () => settingsFile(), (value) => value.newtabCustomWallpaper === false, 'saved removal');
  assert.equal(await loads(page, `${state.image}&after-remove`), false);
  await callTestHook(app, 'chooseWallpaperFile', [null]);

  // Color: a Spaces preset, its fill, and the window's space color on request.
  const cssVar = (name) => page.evaluate((n) => getComputedStyle(document.body).getPropertyValue(n).trim(), name);
  await page.getByRole('button', { name: 'Color', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperFill === 'gradient'
    && !document.getElementById('colorWallpaperOptions').hidden);
  assert.equal(await clockSwitch.isHidden(), true, 'no clock switch beside a color');
  assert.equal(await page.locator('.wallpaper-swatch').count(), 8);
  await waitForValue(async () => settingsFile(), (value) => value.newtabColorWallpaper === true, 'saved color choice');
  await page.getByRole('button', { name: 'Sky', exact: true }).click();
  await page.waitForFunction(() => document.body.style.getPropertyValue('--start-color-base') === '#376694');
  await page.getByRole('button', { name: 'Solid', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperFill === 'solid');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(55, 102, 148)');
  assert.equal(await cssVar('--text'), '#ffffff', 'white ink on Sky');
  assert.equal(await page.getByRole('button', { name: 'Sky', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal((await page.evaluate(() => window.bowserPages.start.setWallpaperColor('teal'))).color.preset, 'sky');
  assert.equal((await page.evaluate(() => window.bowserPages.start.setWallpaperFill('noise'))).color.paint.fill, 'solid');
  await waitForValue(async () => settingsFile(), (value) => value.newtabWallpaperColor === 'sky' && value.newtabWallpaperFill === 'solid', 'saved color and fill');
  // Following the space: nothing changes outside one; saving the window as a
  // space (its first color is Sage) and recoloring it repaint the page live.
  const follow = page.getByRole('button', { name: 'Match each space’s color', exact: true });
  await follow.click();
  await page.waitForFunction(() => document.getElementById('colorWallpaperFollow').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('--start-color-base')), '#376694');
  const saved2 = await callTestHook(app, 'workspaceAction', ['save', 'Color test']);
  assert.equal(saved2.ok, true);
  await page.waitForFunction(() => document.body.style.getPropertyValue('--start-color-base') === '#426c4c');
  assert.equal(await page.locator('#colorWallpaperFollowHint').textContent(), 'This window’s space color is showing.');
  assert.equal(await page.evaluate(() => document.getElementById('colorWallpaperSwatches').classList.contains('is-overridden')), true);
  assert.equal((await callTestHook(app, 'workspaceAction', ['update', saved2.workspace.id, { color: '#9b4761' }])).ok, true);
  await page.waitForFunction(() => document.body.style.getPropertyValue('--start-color-base') === '#9b4761');
  // The page learns only the color, never the space's name.
  assert.equal(JSON.stringify(await page.evaluate(() => window.bowserPages.start.wallpaper())).includes('Color test'), false);
  // A private Start Page never takes a color.
  await privatePage.reload();
  await privatePage.waitForFunction(() => window.bowserPages && document.getElementById('colorWallpaperOptions').hidden);
  assert.equal((await privatePage.evaluate(() => window.bowserPages.start.data().then((d) => d.wallpaper))).color, null);
  assert.equal(await privatePage.evaluate(() => document.body.dataset.wallpaperFill), undefined);
  // Back to Sunrise clears the color everywhere this account syncs.
  await page.getByRole('button', { name: 'Sunrise', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.wallpaperFill === undefined);
  await waitForValue(async () => settingsFile(), (value) => value.newtabColorWallpaper === false, 'saved Sunrise');
  console.log('custom-wallpaper-smoke PASS: refusals, choose, upright drawing, metadata strip, owner-only file, Fade slider bounds and save, wash styles, unguessable address, private exclusion, Sunrise/your-image choice with scoped options, Settings remove with live Start Page update, Color presets/fill/space following');
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
