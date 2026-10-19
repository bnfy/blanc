import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, seedStartPageFixtures, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the installed public Blanc's Billboard Start Page with the
// wallpapers added in v1.38.0, for the website: your own image (F49) and the
// Color wallpaper (F50), each with the Customize popover closed and open on
// Wallpaper. A disposable profile is seeded per state with sample Favorites
// and visits (the shared Start Page fixtures).
//
// BLANC_CAPTURE_IMAGE is the sample image. The released importer runs only
// behind the native file picker, which can't be driven here, so the fixture
// stores the image as the importer would: fitted inside 3840 px, re-encoded
// as JPEG without metadata, at userData/wallpaper/current.jpg with its record
// in wallpaper.json. Everything drawn is the released app's own rendering.
// Each state is a native macOS window capture (screencapture -l, 2560×1600),
// resized to 1440×900 and converted from Display P3 to sRGB by sharp, with a
// same-size WebP companion (quality 85), as the other installed captures.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.38.0';
const imagePath = process.env.BLANC_CAPTURE_IMAGE;
assert.ok(imagePath && fs.existsSync(imagePath), 'Set BLANC_CAPTURE_IMAGE to the sample image.');
const fade = Number(process.env.BLANC_CAPTURE_FADE ?? 100);
const washStyle = process.env.BLANC_CAPTURE_WASH || 'auto';
// Fraction trimmed from each edge of the sample, e.g. a scan's canvas border.
const trim = Number(process.env.BLANC_CAPTURE_TRIM ?? 0);
const color = process.env.BLANC_CAPTURE_COLOR || 'sky';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('custom-wallpaper');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-custom-wallpaper-raw-'));
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['wikipedia', 'https://www.wikipedia.org/', 'Wikipedia'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
];
const states = [
  { name: 'image', source: 'image', customize: false },
  { name: 'image-customize', source: 'image', customize: true },
  { name: 'color', source: 'color', customize: false },
  { name: 'color-customize', source: 'color', customize: true },
];

const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

// The stored image, made once: fitted inside 3840 px, JPEG, no metadata.
const source = sharp(imagePath).rotate();
const { width: sourceWidth, height: sourceHeight } = await sharp(imagePath).rotate().metadata();
const trimmed = trim > 0
  ? source.extract({ left: Math.round(sourceWidth * trim), top: Math.round(sourceHeight * trim), width: Math.round(sourceWidth * (1 - 2 * trim)), height: Math.round(sourceHeight * (1 - 2 * trim)) })
  : source;
const storedImage = await trimmed.resize(3840, 3840, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });

function seedProfile(profile, state) {
  const now = Date.now();
  writeProfileJson(profile, 'settings', {
    onboardingVersion: 1,
    migrationChecklistDismissed: true,
    searchSuggestions: false,
    usagePing: false,
    theme: 'light',
    newtabLayout: 'billboard',
    newtabDynamicWallpaper: false,
    presentationDefaultsResetVersion: 1,
    // Already ran this version, so the footer shows no What's new pill.
    lastRunVersion: expectedVersion,
    // The Patron pill takes that slot otherwise; it hides for 90 days.
    patronCalloutDismissedAt: now,
    ...(state.source === 'image'
      ? { newtabCustomWallpaper: true, newtabWallpaperStyle: washStyle, newtabWallpaperWash: fade }
      : { newtabColorWallpaper: true, newtabWallpaperColor: color, newtabWallpaperFill: 'gradient', newtabFollowSpaceColor: false }),
  });
  seedStartPageFixtures(profile, { favorites, now });
  if (state.source === 'image') {
    fs.mkdirSync(path.join(profile, 'wallpaper'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(profile, 'wallpaper', 'current.jpg'), storedImage.data, { mode: 0o600 });
    const hash = crypto.createHash('sha256').update(storedImage.data).digest('hex').slice(0, 16);
    writeProfileJson(profile, 'wallpaper', { version: 1, hash, width: storedImage.info.width, height: storedImage.info.height, updatedAt: now });
  }
  const urls = ['blanc://newtab/'];
  const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Start Page', favicon: null }] };
  writeProfileJson(profile, 'session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });
}

async function captureState(state) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-custom-wallpaper-'));
  seedProfile(profile, state);
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
    await start.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await start.waitForFunction(() => document.body.dataset.layout === 'billboard', null, { timeout: 30_000 });
    const pick = state.source === 'image' ? '#customWallpaperToggle' : '#colorWallpaperPick';
    await start.waitForFunction((pick) => document.querySelector(pick)?.getAttribute('aria-pressed') === 'true', pick, { timeout: 30_000 });
    await start.waitForFunction(() => [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0));
    if (state.customize) {
      await start.click('#customizeButton');
      await start.waitForFunction(() => document.querySelector('#customizePopover')?.matches(':popover-open'), null, { timeout: 10_000 });
    }
    await settle(1_500);
    await chrome.bringToFront().catch(() => {});
    await settle(400);
    if (state.customize) assert.ok(await start.evaluate(() => document.querySelector('#customizePopover').matches(':popover-open')), 'Customize closed before the capture');
    const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
    const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
    assert.ok(line, 'isolated Blanc main process not found');
    const windowId = (await run('/usr/bin/swift', [windowIdScript, line.trim().split(/\s+/, 1)[0]])).stdout.trim();
    assert.match(windowId, /^\d+$/, 'Blanc window id not found');
    const raw = path.join(scratch, `${state.name}-raw.png`);
    await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
    const { width, height } = await sharp(raw).metadata();
    assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
    const name = `start-page-${state.name}-v${expectedVersion}`;
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
  for (const state of states) await captureState(state);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) custom wallpaper set to ${outputDirectory} (image ${sha256(imagePath)}, trim ${trim}, wash ${washStyle}, fade ${fade}, color ${color}).\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
