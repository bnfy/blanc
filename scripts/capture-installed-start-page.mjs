import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, seedStartPageFixtures, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.38.0';
// BLANC_CAPTURE_SCALE=2 captures at Retina density (2880×1800), so a full-width
// figure is never upscaled.
const scale = Number(process.env.BLANC_CAPTURE_SCALE || 1);
// BLANC_CAPTURE_IMAGE adds a Billboard shot over that image with the Spotlight
// wash, chosen through the shipped Your image and Spotlight controls. The
// image is stored as the released importer stores it (behind the native file
// picker, which can't be driven): fitted inside 3840 px, JPEG, no metadata.
// BLANC_CAPTURE_TRIM trims that fraction from each edge first (a scan border).
const imagePath = process.env.BLANC_CAPTURE_IMAGE;
const trim = Number(process.env.BLANC_CAPTURE_TRIM ?? 0);
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('start-page');
const layouts = ['ledger', 'billboard', 'shelf', 'tally'];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-start-page-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);
const now = Date.now();
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
  ['verge', 'https://www.theverge.com/', 'The Verge'],
  ['notion', 'https://www.notion.so/', 'Notion'],
  ['youtube', 'https://www.youtube.com/', 'YouTube'],
];
const urls = [
  'blanc://newtab/',
  'https://developer.mozilla.org/en-US/docs/Web/API',
  'https://github.com/explore',
  'https://www.theverge.com/tech',
  'https://news.ycombinator.com/',
];
const groups = [
  { id: 'capture-research', name: 'research', collapsed: false },
  { id: 'capture-reading', name: 'reading', collapsed: false },
];
const groupIds = [null, 'capture-research', 'capture-research', 'capture-reading', 'capture-reading'];
const pinned = urls.map(() => false);
const meta = [
  { title: 'Start Page', favicon: null },
  { title: 'Web APIs | MDN', favicon: null },
  { title: 'Explore GitHub', favicon: null },
  { title: 'Technology', favicon: null },
  { title: 'Hacker News', favicon: null },
];
const sessionEntry = {
  id: 'primary',
  profileId: 'default',
  workspaceId: null,
  urls,
  activeIndex: 0,
  groups,
  groupIds,
  pinned,
  meta,
};

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  adblockEnabled: false,
  searchSuggestions: false,
  usagePing: false,
  newtabLayout: 'billboard',
  presentationDefaultsResetVersion: 1,
  // Already ran this version and dismissed the Patron callout, so the footer
  // shows neither the What's new nor the Patron pill.
  lastRunVersion: expectedVersion,
  patronCalloutDismissedAt: now,
});
seedStartPageFixtures(profile, { favorites, bookmarked: 4, now });
if (imagePath) {
  const { width, height } = await sharp(imagePath).rotate().metadata();
  const source = sharp(imagePath).rotate();
  const trimmed = trim > 0
    ? source.extract({ left: Math.round(width * trim), top: Math.round(height * trim), width: Math.round(width * (1 - 2 * trim)), height: Math.round(height * (1 - 2 * trim)) })
    : source;
  const stored = await trimmed.resize(3840, 3840, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  fs.mkdirSync(path.join(profile, 'wallpaper'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(profile, 'wallpaper', 'current.jpg'), stored.data, { mode: 0o600 });
  writeJson('wallpaper', { version: 1, hash: crypto.createHash('sha256').update(stored.data).digest('hex').slice(0, 16), width: stored.info.width, height: stored.info.height, updatedAt: now });
}
writeJson('session', {
  version: 2,
  activeWindowId: sessionEntry.id,
  windows: [sessionEntry],
  urls,
  activeIndex: 0,
  groups,
  groupIds,
  pinned,
});

let app;
try {
  app = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
  });
  // CDP can attach while Blanc is still replacing its bootstrap page with
  // the restored session. Let that handoff settle before retaining a Page.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const startPage = await poll(
    async () => app.pages().find((page) => !page.isClosed() && page.url().startsWith('blanc://newtab/')),
    Boolean,
    'installed Start Page did not appear',
  );
  await startPage.setViewportSize({ width: 1440, height: 900 });
  // Playwright's own screenshot resets the device scale, so at 2× the
  // screenshot is taken through the same CDP session that set it.
  const sessions = new Map();
  const atScale = async (page) => {
    if (scale === 1) return;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: scale, mobile: false });
    sessions.set(page, cdp);
  };
  const shoot = async (page, file) => {
    const cdp = sessions.get(page);
    if (!cdp) return page.screenshot({ path: file, animations: 'disabled' });
    // CDP doesn't freeze animations as Playwright does: wait until none run
    // (the Customize popover fades out after Escape).
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 10_000 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  };
  await atScale(startPage);
  if (scale !== 1) await startPage.emulateMedia({ reducedMotion: 'reduce' });
  await startPage.locator('#favoritesList .fav').first().waitFor({ state: 'attached' });
  await startPage.locator('#groupsList .group-row').first().waitFor({ state: 'attached' });
  await startPage.locator('#bbFavorites .bb-site').first().waitFor({ state: 'visible' });

  for (const layout of layouts) {
    // Since 1.31.0 the layout picker lives in the footer's Customize popover.
    // Open it with its own button, pick, then close it with Escape so the
    // popover is not in the capture.
    const popover = startPage.locator('#customizePopover');
    if (await popover.count() && !await popover.evaluate((el) => el.matches(':popover-open'))) {
      await startPage.locator('#customizeButton').click();
    }
    await startPage.locator(`[data-layout-pick="${layout}"]`).click();
    await startPage.waitForFunction((name) => document.body.dataset.layout === name, layout);
    if (await popover.count() && await popover.evaluate((el) => el.matches(':popover-open'))) {
      await startPage.keyboard.press('Escape');
      await startPage.waitForFunction(() => !document.getElementById('customizePopover').matches(':popover-open'));
      // Escape returns focus to Customize; a click on empty page moves it off
      // so its focus ring is not in the capture.
      await startPage.mouse.click(1420, 180);
    }
    await startPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = path.join(outputDirectory, `${layout}-v${expectedVersion}.png`);
    await shoot(startPage, file);
    process.stdout.write(`Captured ${layout} to ${file} (${sha256(file)})\n`);
  }

  if (imagePath) {
    const popover = startPage.locator('#customizePopover');
    await startPage.locator('#customizeButton').click();
    await startPage.waitForFunction(() => document.getElementById('customizePopover').matches(':popover-open'));
    await startPage.locator('[data-layout-pick="billboard"]').click();
    await startPage.waitForFunction(() => document.body.dataset.layout === 'billboard');
    await startPage.locator('#customWallpaperToggle').click();
    await startPage.waitForFunction(() => document.getElementById('customWallpaperToggle').getAttribute('aria-pressed') === 'true');
    await startPage.locator('[data-wallpaper-style-pick="spotlight"]').click();
    await startPage.waitForFunction(() => document.querySelector('[data-wallpaper-style-pick="spotlight"]').getAttribute('aria-pressed') === 'true');
    await startPage.keyboard.press('Escape');
    await startPage.waitForFunction(() => !document.getElementById('customizePopover').matches(':popover-open'));
    await startPage.mouse.click(1420, 180);
    await startPage.waitForFunction(() => [...document.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0));
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(await popover.evaluate((el) => el.matches(':popover-open')), false);
    const file = path.join(outputDirectory, `billboard-image-v${expectedVersion}.png`);
    await shoot(startPage, file);
    process.stdout.write(`Captured billboard over the image to ${file} (${sha256(file)})\n`);
  }

  await startPage.locator('#mahjongLink').click();
  const mahjong = await poll(
    async () => app.pages().find((page) => page.url().startsWith('blanc://mahjong/')),
    Boolean,
    'standalone Mahjong did not open',
  );
  await mahjong.locator('#mjBoard .mj-tile').first().waitFor({ state: 'visible' });
  await mahjong.setViewportSize({ width: 1440, height: 900 });
  await atScale(mahjong);
  await mahjong.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mahjongFile = path.join(outputDirectory, `mahjong-v${expectedVersion}.png`);
  await shoot(mahjong, mahjongFile);
  process.stdout.write(`Captured Mahjong to ${mahjongFile} (${sha256(mahjongFile)})\n`);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Start Page set.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
