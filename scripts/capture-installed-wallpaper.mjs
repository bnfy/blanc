import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the installed public Blanc's Billboard Start Page with the
// time-of-day wallpaper in each phase (dawn, day, dusk, night), in light and
// dark appearance, for the website. A disposable profile is seeded with four
// sample Favorites and their visits; no blocked totals are seeded.
//
// The released wallpaper controller and Billboard clock read the renderer's
// clock. A capture-only init script fixes that clock at the top of a sample
// hour (6, 12, 18 or 23) on today's date; nothing else in the app, the OS
// clock or the shipped code is changed. Reduced motion settles each phase
// without a cross-fade, and the page is reloaded per phase so the released
// top-edge sampler tints the native Island strip from the rendered wallpaper.
// Each state is a native macOS window capture (screencapture -l), kept at its
// native size as source evidence, with a proportional 1440px WebP display copy
// (quality 90). The Island strip's tint is read from the capture (15% across,
// 2% down) for the capture ledger.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.31.0';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('wallpaper');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-wallpaper-raw-'));
const phases = [['dawn', 6], ['day', 12], ['dusk', 18], ['night', 23]];
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['wikipedia', 'https://www.wikipedia.org/', 'Wikipedia'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
];

const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

function seedProfile(profile, theme) {
  const now = Date.now();
  const writeJson = (name, value) => writeProfileJson(profile, name, value);
  writeJson('settings', {
    onboardingVersion: 1,
    migrationChecklistDismissed: true,
    searchSuggestions: false,
    usagePing: false,
    theme,
    newtabLayout: 'billboard',
    newtabDynamicWallpaper: true,
    presentationDefaultsResetVersion: 1,
  });
  writeJson('bookmarks', {
    items: favorites.map(([id, url, title], index) => ({
      id: `capture-${id}`, url, title, favicon: null,
      addedAt: now - (index + 1) * 60_000, updatedAt: now - (index + 1) * 60_000, folder: null,
    })),
    tombstones: [],
  });
  writeJson('history', {
    entries: favorites.map(([, url, title], index) => ({ url, title, visitedAt: now - (index + 1) * 600_000 })),
    siteIcons: [],
  });
  const urls = ['blanc://newtab/'];
  const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Start Page', favicon: null }] };
  writeJson('session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });
}

async function captureTheme(theme) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-wallpaper-'));
  seedProfile(profile, theme);
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

    // Capture-only clock fixture: today's date at the top of the sample hour
    // stored in this origin's localStorage, set before each reload.
    await start.addInitScript(() => {
      const stored = localStorage.getItem('blanc-capture-hour');
      if (stored === null) return;
      const RealDate = Date;
      const base = new RealDate();
      base.setHours(Number(stored), 0, 0, 0);
      const offset = base.getTime() - RealDate.now();
      class CaptureDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
        static now() { return RealDate.now() + offset; }
      }
      globalThis.Date = CaptureDate;
    });
    await start.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });

    for (const [phase, hour] of phases) {
      await start.evaluate((hour) => localStorage.setItem('blanc-capture-hour', String(hour)), hour);
      await start.reload({ waitUntil: 'load' });
      await start.waitForFunction((phase) => document.body.dataset.wallpaperPhase === phase
        && document.body.dataset.layout === 'billboard', phase, { timeout: 30_000 });
      await start.waitForFunction(() => [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0));
      const clock = await start.locator('#bbClock').innerText();
      assert.equal(clock.replace(/\s/g, ''), new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
        .formatToParts(new Date(2000, 0, 1, hour)).filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim().replace(/\s/g, ''),
      `clock fixture not applied for ${phase}`);
      // Let the strip sample the wallpaper edge and both views repaint.
      await settle(1_500);
      await chrome.bringToFront().catch(() => {});
      await settle(400);
      const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
      const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
      assert.ok(line, 'isolated Blanc main process not found');
      const windowId = (await run('/usr/bin/swift', [windowIdScript, line.trim().split(/\s+/, 1)[0]])).stdout.trim();
      assert.match(windowId, /^\d+$/, 'Blanc window id not found');
      const raw = path.join(scratch, `${phase}-${theme}-raw.png`);
      await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
      const { width, height } = await sharp(raw).metadata();
      assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
      const name = `home-wallpaper-${phase}${theme === 'dark' ? '-dark' : ''}-v${expectedVersion}`;
      const png = path.join(outputDirectory, `${name}.png`);
      fs.copyFileSync(raw, png);
      const webp = png.replace(/\.png$/, '.webp');
      await sharp(png).resize(1440).webp({ quality: 90 }).toFile(webp);
      const { data } = await sharp(png).extract({ left: Math.round(width * 0.15), top: Math.round(height * 0.02), width: 1, height: 1 })
        .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
      const tint = `#${[...data.subarray(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      process.stdout.write(`Captured ${name} (${clock}) ${width}×${height} tint ${tint}: ${sha256(png)} webp ${sha256(webp)}\n`);
    }
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

try {
  for (const theme of ['light', 'dark']) await captureTheme(theme);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) wallpaper set to ${outputDirectory}.\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
