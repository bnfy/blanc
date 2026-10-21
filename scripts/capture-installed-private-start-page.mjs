import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the private Start Page (blanc://newtab/?private=1) for the page
// area of the website's private-tabs figure, which draws the strip and the
// resting Island itself (site/src/components/NativeWindowFigure.astro). A
// disposable profile restores one ordinary new tab, and the script opens a
// private tab through the same preload call the Island footer's Private
// button makes (browserAPI.createTab with private: true). The page is shot
// over the debugging protocol at the page area of a 1280×800 window (the
// window less the 68px strip) at 2x; nothing in the app, its DOM or its
// pixels is changed.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.36.0';
const suffix = process.env.BLANC_CAPTURE_SUFFIX || `v${expectedVersion}`;
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('private-start-page');
const viewport = { width: 1280, height: 800 - 68 };

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-private-start-page-'));
writeProfileJson(profile, 'settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  presentationDefaultsResetVersion: 1,
});
const urls = ['blanc://newtab/'];
const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Start Page', favicon: null }] };
writeProfileJson(profile, 'session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });

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
  const findPage = (predicate, label) => poll(async () => {
    for (const page of app.pages()) if (!page.isClosed() && await predicate(page).catch(() => false)) return page;
    return null;
  }, Boolean, label);
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://')
    && await page.evaluate(() => typeof window.browserAPI?.createTab === 'function'), 'Blanc chrome document did not appear');
  await chrome.evaluate(() => window.browserAPI.createTab(null, { private: true }));
  const page = await findPage(async (candidate) => candidate.url().startsWith('blanc://newtab/?private=1'), 'the private Start Page did not open');
  await page.waitForLoadState('load');
  // Playwright's setViewportSize would drop the shot to 1x; ask Chromium for
  // the page area at a Retina screen's 2x, as the window draws it there.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: false });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'private');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const file = path.join(outputDirectory, `private-start-page-${suffix}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  const { width, height } = await sharp(file).metadata();
  assert.deepEqual([width, height], [viewport.width * 2, viewport.height * 2], `unexpected capture ${width}×${height}`);
  // The figure draws the WebP companion; the PNG stays the pinned source.
  const webp = file.replace(/\.png$/, '.webp');
  await sharp(file).webp({ quality: 85 }).toFile(webp);
  process.stdout.write(`Captured the private Start Page (${width}×${height}) to ${file} (${sha256(file)}), WebP ${sha256(webp)}\n`);
  process.stdout.write(`Captured installed Blanc ${version} (${build}).\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
}
