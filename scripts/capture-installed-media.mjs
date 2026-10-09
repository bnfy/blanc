import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the Media page's two island images from the installed public Blanc,
// in a disposable profile: The Met's public-domain Van Gogh as the active page,
// with six sample tabs in the named groups "inspiration" and "reading".
//   island-resting   the resting island over the page
//   island-expanded  the island expanded through the shipped openIsland action
// Every tab is visited once so its favicon is the site's own. Each state is a
// native macOS window capture (screencapture -l) kept at its native size (a
// 1280 × 800 window at 2x), with 2560px and 1280px WebP display copies
// (quality 90). CDP only calls shipped preload actions; nothing is patched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set
// (captures carry live page content, so a rerun never matches a ledger's hashes).

const tabs = [
  ['inspiration', 'https://www.metmuseum.org/art/collection/search/436535'],
  ['inspiration', 'https://www.metmuseum.org/art/collection/search/45434'],
  ['inspiration', 'https://science.nasa.gov/'],
  ['reading', 'https://en.wikipedia.org/wiki/Stockholm_Public_Library'],
  ['reading', 'https://www.gutenberg.org/'],
  ['reading', 'https://archive.org/'],
];

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.31.0';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('media');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-media-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-media-raw-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  tabSleep: 'off',
  presentationDefaultsResetVersion: 1,
});
// Restore the six tabs in their groups; each is woken below so it loads.
const groups = [{ id: 'capture-inspiration', name: 'inspiration', collapsed: false }, { id: 'capture-reading', name: 'reading', collapsed: false }];
const urls = tabs.map(([, url]) => url);
const groupIds = tabs.map(([group]) => `capture-${group}`);
const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups, groupIds, pinned: urls.map(() => false), meta: urls.map(() => ({ title: '', favicon: null })) };
writeJson('session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups, groupIds, pinned: entry.pinned });

const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

async function captureWindow(name, page) {
  await page.bringToFront().catch(() => {});
  await settle(500);
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((item) => item.includes(`--user-data-dir=${profile}`) && !item.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  const windowId = (await run('/usr/bin/swift', [windowIdScript, line.trim().split(/\s+/, 1)[0]])).stdout.trim();
  assert.match(windowId, /^\d+$/, 'Blanc window id not found');
  const raw = path.join(scratch, `${name}-raw.png`);
  await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
  const { width, height } = await sharp(raw).metadata();
  assert.deepEqual([width, height], [2560, 1600], `expected a 1280 × 800 window at 2x, got ${width}×${height}`);
  const png = path.join(outputDirectory, `blanc-${name}-v${expectedVersion}.png`);
  fs.copyFileSync(raw, png);
  await sharp(png).webp({ quality: 90 }).toFile(png.replace(/\.png$/, '.webp'));
  await sharp(png).resize(1280).webp({ quality: 90 }).toFile(png.replace(/\.png$/, '-1280.webp'));
  process.stdout.write(`Captured ${name}: ${png} (${sha256(png)})\n`);
}

let app;
try {
  app = await launchPackagedOverCdp({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BLANC_TEST: '0' },
    launchViaOpen: true,
  });
  await settle(2_000);
  const findPage = (predicate, label, timeoutMs) => poll(async () => {
    for (const page of app.pages()) if (!page.isClosed() && await predicate(page).catch(() => false)) return page;
    return null;
  }, Boolean, label, timeoutMs);
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://')
    && await page.evaluate(() => typeof window.browserAPI?.openIsland === 'function'), 'Blanc chrome document did not appear');

  // Tab ids come from the shipped tabs:updated broadcast.
  await chrome.evaluate(() => { window.browserAPI.onTabsUpdated((payload) => { window.__captureTabs = payload; }); });
  // A broadcast only follows a change: open and close one blank tab.
  const blankId = await chrome.evaluate(() => window.browserAPI.createTab());
  await chrome.evaluate((id) => window.browserAPI.closeTab(id), blankId);
  const list = await poll(() => chrome.evaluate(() => window.__captureTabs?.tabs), (value) => Array.isArray(value) && value.length === tabs.length, 'tab list not reported');
  const ids = urls.map((url) => list.find((tab) => tab.url === url)?.id);
  assert.ok(ids.every((id) => id != null), 'restored tabs not found');
  // Visit every tab so each loads its own title and favicon, then return to The Met.
  for (const id of [...ids.slice(1), ids[0]]) {
    await chrome.evaluate((id) => window.browserAPI.switchTab(id), id);
    await poll(() => chrome.evaluate((id) => {
      const tab = window.__captureTabs?.tabs?.find((item) => item.id === id);
      return tab && !tab.isLoading && tab.favicon && tab.title ? true : false;
    }, id), Boolean, `tab ${id} did not finish loading`, 60_000);
  }
  // Let page images settle, then dismiss anything focused.
  await settle(4_000);
  await captureWindow('island-resting', chrome);

  let overlay = null;
  for (let attempt = 0; attempt < 5 && !overlay; attempt += 1) {
    await chrome.evaluate(() => window.browserAPI.openIsland());
    await settle(800);
    for (const page of app.pages()) {
      if (!page.isClosed() && /overlay/.test(page.url()) && await page.evaluate(() => document.body.dataset.mode === 'panel').catch(() => false)) overlay = page;
    }
  }
  assert.ok(overlay, 'Island panel did not open');
  await settle(600);
  await captureWindow('island-expanded', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) media set to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
