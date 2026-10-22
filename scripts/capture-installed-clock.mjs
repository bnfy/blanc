import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, seedStartPageFixtures, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the installed public Blanc's Billboard clock styles added in
// v1.41.0 (F54, Font & color), for the website: the Font & color sheet open,
// and clock styles over the Sunrise wallpaper, your own images (paintings
// and photographs) and the Color wallpaper. A disposable
// profile is seeded per state with sample Favorites and visits (the shared
// Start Page fixtures) and the clock style as the app stores it
// (settings.json `newtabClock*`), except the sheet state, which picks its
// style through the shipped sheet.
//
// Images are public-domain samples (BLANC_CAPTURE_IMAGES, below). The
// released importer runs only behind the native file picker, so the fixture
// stores it as the importer would: fitted inside 3840 px, re-encoded as JPEG
// without metadata, at userData/wallpaper/current.jpg with its record in
// wallpaper.json. Everything drawn is the released app's own rendering.
// Each state is a native macOS window capture (screencapture -l, 2560×1600),
// resized to 1440×900 and converted from Display P3 to sRGB by sharp, with a
// same-size WebP companion (quality 85), as the other installed captures.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.41.0';
// BLANC_CAPTURE_IMAGES is a JSON map of image keys to { path, trim, crop },
// where trim is the fraction cut from each edge of the sample (a scan's frame
// or paper margin) and crop, if given, is [left, top, right, bottom]. The states below name their image by key.
const images = JSON.parse(process.env.BLANC_CAPTURE_IMAGES || '{}');
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('clock');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-clock-raw-'));
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['wikipedia', 'https://www.wikipedia.org/', 'Wikipedia'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
];
const clock = (font, weight, height, color, style, tone = 50) => ({
  newtabClockFont: font, newtabClockWeight: weight, newtabClockHeight: height,
  newtabClockColor: color, newtabClockTone: tone, newtabClockStyle: style,
});
const states = [
  // Picked through the sheet: Roboto Flex, Glass, Height 200%.
  { name: 'sheet', sheet: true },
  { name: 'glass-image', image: 'wheat', wash: ['spotlight', 100], clock: clock('flex', 600, 200, 'auto', 'glass') },
  { name: 'solid-color', clock: clock('inter', 800, 100, 'rose', 'solid') },
  { name: 'solid-condensed', clock: clock('condensed', 400, 100, 'sky', 'solid', 35) },
  { name: 'wave', image: 'wave', wash: ['spotlight', 100], clock: clock('flex', 500, 250, 'auto', 'glass') },
  { name: 'landers-peak', image: 'landers', wash: ['auto', 60], clock: clock('instrument', 600, 100, 'auto', 'solid') },
  { name: 'kanbara-snow', image: 'kanbara', wash: ['spotlight', 100], clock: clock('condensed', 700, 100, 'graphite', 'solid', 40) },
  { name: 'sainte-victoire', image: 'cezanne', wash: ['spotlight', 100], clock: clock('inter', 400, 100, 'sage', 'solid', 30) },
  { name: 'oxbow', image: 'oxbow', theme: 'dark', wash: ['dark', 60], clock: clock('flex', 400, 300, 'auto', 'glass') },
  { name: 'irises', image: 'irises', wash: ['spotlight', 100], clock: clock('instrument', 700, 120, 'iris', 'solid', 45) },
  { name: 'merced', image: 'merced', theme: 'dark', wash: ['spotlight', 100], clock: clock('condensed', 500, 100, 'auto', 'glass') },
  { name: 'shono', image: 'shono', wash: ['spotlight', 100], clock: clock('inter', 900, 100, 'clay', 'solid', 45) },
  // Photographs (Unsplash License) and the Color wallpaper, for range.
  { name: 'pitch', image: 'pitch', wash: ['spotlight', 100], clock: clock('inter', 900, 100, 'graphite', 'solid', 40) },
  { name: 'hoop', image: 'hoop', theme: 'dark', wash: ['dark', 30], clock: clock('flex', 400, 300, 'auto', 'glass') },
  { name: 'stage', image: 'stage', theme: 'dark', wash: ['dark', 60], clock: clock('condensed', 700, 100, 'auto', 'solid') },
  { name: 'festival', image: 'festival', theme: 'dark', wash: ['dark', 20], clock: clock('flex', 600, 250, 'auto', 'glass') },
  { name: 'track', image: 'track', wash: ['spotlight', 100], clock: clock('instrument', 700, 130, 'graphite', 'solid', 40) },
  { name: 'dog', image: 'dog', theme: 'dark', wash: ['dark', 20], clock: clock('inter', 800, 100, 'sand', 'solid', 70) },
  { name: 'cat', image: 'cat', wash: ['light', 20], clock: clock('instrument', 600, 100, 'rose', 'solid', 35) },
  { name: 'beach', image: 'beach', wash: ['spotlight', 100], clock: clock('condensed', 700, 100, 'sky', 'solid', 30) },
  { name: 'aurora', image: 'aurora', theme: 'dark', wash: ['dark', 20], clock: clock('flex', 300, 300, 'auto', 'glass') },
  { name: 'skyline', image: 'skyline', theme: 'dark', wash: ['dark', 30], clock: clock('condensed', 400, 100, 'auto', 'solid') },
  { name: 'earth', image: 'earth', theme: 'dark', wash: ['dark', 20], clock: clock('inter', 200, 100, 'auto', 'solid') },
  { name: 'color-iris', color: ['iris', 'gradient'], theme: 'dark', clock: clock('flex', 500, 250, 'auto', 'glass') },
  { name: 'color-sand', color: ['sand', 'solid'], clock: clock('instrument', 700, 100, 'auto', 'solid') },
  { name: 'color-rose', color: ['rose', 'soft'], clock: clock('condensed', 700, 100, 'rose', 'solid', 25) },
];
// BLANC_CAPTURE_STATES (e.g. "sheet") limits the run to the named states.
const only = process.env.BLANC_CAPTURE_STATES?.split(',').map((name) => name.trim()).filter(Boolean);
const selected = states.filter((state) => !only || only.includes(state.name));
for (const state of selected) if (state.image) assert.ok(images[state.image] && fs.existsSync(images[state.image].path), `BLANC_CAPTURE_IMAGES needs ${state.image}`);

const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

// Each stored image, made once: fitted inside 3840 px, JPEG, no metadata.
const stored = new Map();
async function storedImage(key) {
  if (stored.has(key)) return stored.get(key);
  // crop [left, top, right, bottom] fractions, when given, replaces trim: it
  // moves a photo's subject out from under the clock.
  const { path: imagePath, trim = 0, crop = [trim, trim, trim, trim] } = images[key];
  const { width, height } = await sharp(imagePath).rotate().metadata();
  const source = sharp(imagePath).rotate();
  const [l, t, r, b] = crop;
  const trimmed = crop.some((edge) => edge > 0)
    ? source.extract({ left: Math.round(width * l), top: Math.round(height * t), width: Math.round(width * (1 - l - r)), height: Math.round(height * (1 - t - b)) })
    : source;
  // padLeft, when given, extends a plain dark background leftwards by that
  // fraction of the width, so a centered subject sits right of the clock.
  const { padLeft = 0 } = images[key];
  let prepared = trimmed;
  if (padLeft > 0) {
    const cut = await trimmed.toBuffer({ resolveWithObject: true });
    const { dominant } = await sharp(cut.data).extract({ left: 0, top: 0, width: Math.max(1, Math.round(cut.info.width * 0.02)), height: cut.info.height }).stats();
    prepared = sharp(cut.data).extend({ left: Math.round(cut.info.width * padLeft), background: dominant });
  }
  const result = await sharp(await prepared.toBuffer()).resize(3840, 3840, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  stored.set(key, result);
  return result;
}

async function seedProfile(profile, state) {
  const now = Date.now();
  writeProfileJson(profile, 'settings', {
    onboardingVersion: 1,
    migrationChecklistDismissed: true,
    searchSuggestions: false,
    usagePing: false,
    theme: state.theme ?? 'light',
    newtabLayout: 'billboard',
    newtabDynamicWallpaper: true,
    presentationDefaultsResetVersion: 1,
    // Already ran this version, so the footer shows no What's new pill.
    lastRunVersion: expectedVersion,
    // The Patron pill takes that slot otherwise; it hides for 90 days.
    patronCalloutDismissedAt: now,
    ...(state.image ? { newtabCustomWallpaper: true, newtabWallpaperStyle: state.wash[0], newtabWallpaperWash: state.wash[1] } : {}),
    ...(state.color ? { newtabColorWallpaper: true, newtabWallpaperColor: state.color[0], newtabWallpaperFill: state.color[1], newtabFollowSpaceColor: false } : {}),
    ...(state.clock ?? {}),
  });
  seedStartPageFixtures(profile, { favorites, now });
  if (state.image) {
    const image = await storedImage(state.image);
    fs.mkdirSync(path.join(profile, 'wallpaper'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(profile, 'wallpaper', 'current.jpg'), image.data, { mode: 0o600 });
    const hash = crypto.createHash('sha256').update(image.data).digest('hex').slice(0, 16);
    writeProfileJson(profile, 'wallpaper', { version: 1, hash, width: image.info.width, height: image.info.height, updatedAt: now });
  }
  const urls = ['blanc://newtab/'];
  const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Start Page', favicon: null }] };
  writeProfileJson(profile, 'session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });
}

async function captureState(state) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-clock-'));
  await seedProfile(profile, state);
  let app;
  try {
    app = await launchPackagedOverCdp({
      executablePath,
      args: [`--user-data-dir=${profile}`],
      env: { ...process.env, BLANC_TEST: '0' },
      launchViaOpen: true,
    });
    await settle(2_000);
    const findPage = (predicate, label) => poll(async () => {
      for (const page of app.pages()) if (!page.isClosed() && await predicate(page).catch(() => false)) return page;
      return null;
    }, Boolean, label);
    const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://')
      && await page.evaluate(() => typeof window.browserAPI?.openPage === 'function'), 'Blanc chrome document did not appear');
    const start = await findPage(async (page) => page.url().startsWith('blanc://newtab/'), 'Start Page did not restore');
    await start.emulateMedia({ reducedMotion: 'reduce', colorScheme: state.theme ?? 'light' });
    await start.waitForFunction(() => document.body.dataset.layout === 'billboard', null, { timeout: 30_000 });
    if (state.image) await start.waitForFunction(() => document.querySelector('#customWallpaperToggle')?.getAttribute('aria-pressed') === 'true', null, { timeout: 30_000 });
    if (state.color) await start.waitForFunction(() => document.querySelector('#colorWallpaperPick')?.getAttribute('aria-pressed') === 'true', null, { timeout: 30_000 });
    await start.waitForFunction(() => [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0));
    if (state.sheet) {
      // Right-click the clock, as the release notes describe, then pick
      // through the shipped sheet.
      await start.click('#bbClock', { button: 'right' });
      await start.waitForFunction(() => document.querySelector('#clockPopover')?.matches(':popover-open'), null, { timeout: 10_000 });
      await start.click('[data-clock-font-pick="flex"]');
      await start.click('[data-clock-style-pick="glass"]');
      await start.locator('#clockHeight').evaluate((el) => {
        el.value = '200';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    // The real pointer sits wherever the window opened; park the page's own
    // pointer in empty space so no tile shows its hover controls.
    await start.mouse.move(120, 420);
    await settle(2_500);
    await chrome.bringToFront().catch(() => {});
    await settle(400);
    if (state.sheet) assert.ok(await start.evaluate(() => document.querySelector('#clockPopover').matches(':popover-open')), 'Font & color closed before the capture');
    const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
    const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
    assert.ok(line, 'isolated Blanc main process not found');
    const windowId = (await run('/usr/bin/swift', [windowIdScript, line.trim().split(/\s+/, 1)[0]])).stdout.trim();
    assert.match(windowId, /^\d+$/, 'Blanc window id not found');
    const raw = path.join(scratch, `${state.name}-raw.png`);
    await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
    const { width, height } = await sharp(raw).metadata();
    assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
    const name = `clock-${state.name}-v${expectedVersion}`;
    const png = path.join(outputDirectory, `${name}.png`);
    await sharp(raw).resize(1440, 900, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(png);
    const webp = png.replace(/\.png$/, '.webp');
    await sharp(png).webp({ quality: 85 }).toFile(webp);
    process.stdout.write(`Captured ${name} ${width}×${height}: ${sha256(png)} webp ${sha256(webp)}\n`);
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

try {
  for (const state of selected) await captureState(state);
  const used = Object.entries(images).map(([key, { path: file, trim = 0, crop, padLeft }]) => `${key} ${sha256(file).slice(0, 12)} ${crop ? `crop ${crop.join('/')}` : `trim ${trim}`}${padLeft ? ` padLeft ${padLeft}` : ''}`).join(', ');
  process.stdout.write(`Captured installed Blanc ${version} (${build}) clock set to ${outputDirectory} (${used}).\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
