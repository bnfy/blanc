import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the Island's three homepage states (at rest, opened, and with /
// typed) over live Smithsonian American Art Museum pages, for the
// website's Island stage. A disposable profile restores one tab (Smithsonian
// Open Access) and the script opens the two artwork pages as new tabs, so all
// three load and show their own favicons; the active tab is Albert Bierstadt's
// Among the Sierra Nevada, California (1868, public domain), scrolled to the
// painting. Blanc Blocker runs as shipped, so the shield count is what the
// pages actually loaded.
//
// Each state is a native macOS window capture (screencapture -l, 2560×1600),
// kept whole as source evidence, with a lossless 1400×1000 center crop (left
// 580, top 0) that the site's display copies are made from. Nothing in the
// app, its DOM or its pixels is changed: the Island opens through the same
// call a click on it makes (browserAPI.openIsland), and / is typed into it.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.31.0';
const suffix = process.env.BLANC_CAPTURE_SUFFIX || `v${expectedVersion}`;
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('island');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-island-raw-'));
const pages = {
  openAccess: { url: 'https://www.si.edu/openaccess', title: 'Smithsonian Open Access | Smithsonian Institution' },
  moran: { url: 'https://americanart.si.edu/artwork/grand-canyon-yellowstone-17831', title: 'The Grand Canyon of the Yellowstone | Smithsonian American Art Museum' },
  bierstadt: { url: 'https://americanart.si.edu/artwork/among-sierra-nevada-california-2059', title: 'Among the Sierra Nevada, California | Smithsonian American Art Museum' },
};
const crop = { left: 580, top: 0, width: 1400, height: 1000 };

const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

function seedProfile(profile) {
  writeProfileJson(profile, 'settings', {
    onboardingVersion: 1,
    migrationChecklistDismissed: true,
    searchSuggestions: false,
    usagePing: false,
    theme: 'light',
    presentationDefaultsResetVersion: 1,
  });
  const urls = [pages.openAccess.url];
  const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: pages.openAccess.title, favicon: null }] };
  writeProfileJson(profile, 'session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-island-'));
seedProfile(profile);
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
    && await page.evaluate(() => typeof window.browserAPI?.createTab === 'function'), 'Blanc chrome document did not appear');
  const loaded = async ({ url }) => {
    const page = await findPage(async (candidate) => candidate.url().startsWith(url), `${url} did not open`);
    await page.waitForLoadState('load', { timeout: 60_000 });
    return page;
  };
  await loaded(pages.openAccess);
  await chrome.evaluate((url) => window.browserAPI.createTab(url), pages.moran.url);
  await loaded(pages.moran);
  await chrome.evaluate((url) => window.browserAPI.createTab(url), pages.bierstadt.url);
  const active = await loaded(pages.bierstadt);
  assert.equal(await active.title(), pages.bierstadt.title);

  // Scroll the painting under the Island and let it and the blocker settle.
  await active.evaluate(async () => {
    const largest = [...document.images].sort((a, b) => {
      const area = (img) => { const box = img.getBoundingClientRect(); return box.width * box.height; };
      return area(b) - area(a);
    })[0];
    window.scrollTo(0, largest.getBoundingClientRect().top + window.scrollY - 40);
    await largest.decode();
  });
  await settle(3_000);

  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  const pid = line.trim().split(/\s+/, 1)[0];

  const capture = async (state, overlay) => {
    // Park the pointer in a corner of the Island so no row shows a hover
    // from wherever the real mouse happens to be.
    await overlay?.mouse.move(2, 2);
    await settle(900);
    const windowId = (await run('/usr/bin/swift', [windowIdScript, pid])).stdout.trim();
    assert.match(windowId, /^\d+$/, 'Blanc window id not found');
    const raw = path.join(outputDirectory, `island-smithsonian-${state}-${suffix}-window.png`);
    await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
    const { width, height } = await sharp(raw).metadata();
    assert.deepEqual([width, height], [2560, 1600], `unexpected window capture ${width}×${height}`);
    const file = path.join(outputDirectory, `island-smithsonian-${state}-${suffix}.webp`);
    await sharp(raw).extract(crop).webp({ lossless: true }).toFile(file);
    process.stdout.write(`Captured ${state}: window ${sha256(raw)}, crop ${path.basename(file)} ${sha256(file)}\n`);
  };

  await chrome.bringToFront().catch(() => {});
  await capture('rest');

  // Open the Island as a click on it does. (Shortcuts sent over the debugging
  // protocol never reach the app's own key handling.)
  await chrome.evaluate(() => window.browserAPI.openIsland());
  const overlay = await findPage(async (page) => page.url().startsWith('blanc-chrome://overlay')
    && await page.evaluate(() => document.activeElement?.tagName === 'INPUT'), 'the Island did not open');
  await capture('tabs', overlay);

  await overlay.keyboard.type('/');
  await overlay.waitForFunction(() => document.activeElement?.value === '/');
  await capture('command', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Island states to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
