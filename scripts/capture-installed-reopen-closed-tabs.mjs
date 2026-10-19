import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the Reopen Closed Tabs page's image from the installed public
// Blanc, in a disposable profile seeded with synthetic tabs that match the
// Blanc Spaces captures: a Painting class group holding The Met's
// public-domain Wheat Field with Cypresses (active) and a Wikipedia article,
// Van Gogh's Wikipedia article on its own, and a Lisbon trip group of two
// pages. The Van Gogh tab and then the whole Lisbon trip group are closed
// through the shipped close actions (the same calls the Island's close
// buttons make), so Recently closed holds one tab entry and one group entry
// that Blanc recorded itself. The Island is then opened as a click on it opens
// it, and the Recently closed band is unfolded with a real click on its header:
//   reopen-closed-tabs  the Island panel with Recently closed unfolded
// The panel is a separate view over the page, so the state is a native macOS
// window capture (screencapture -l), resized to a 1440x900 sRGB PNG with a
// .webp companion for inline use. Nothing is patched or retouched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set
// (captures carry live page content, so a rerun never matches a ledger's hashes).

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.36.0';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('reopen-closed-tabs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-reopen-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-reopen-raw-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);

const groups = [
  { id: 'capture-painting', name: 'Painting class', collapsed: false },
  { id: 'capture-lisbon', name: 'Lisbon trip', collapsed: false },
];
// BLANC_CAPTURE_FRONT_URL and BLANC_CAPTURE_FRONT_TITLE replace the active
// Painting class page (default The Met's Wheat Field with Cypresses).
const met = process.env.BLANC_CAPTURE_FRONT_URL || 'https://www.metmuseum.org/art/collection/search/436535';
const frontTitle = process.env.BLANC_CAPTURE_FRONT_TITLE || 'Wheat Field with Cypresses';
const impasto = 'https://en.wikipedia.org/wiki/Impasto';
const vanGogh = 'https://en.wikipedia.org/wiki/Vincent_van_Gogh';
// [url, title, group]
const tabs = [
  [met, frontTitle, 'capture-painting'],
  [impasto, 'Impasto - Wikipedia', 'capture-painting'],
  [vanGogh, 'Vincent van Gogh - Wikipedia', null],
  ['https://en.wikipedia.org/wiki/Lisbon', 'Lisbon - Wikipedia', 'capture-lisbon'],
  ['https://www.nytimes.com/section/travel', 'Travel', 'capture-lisbon'],
];
const urls = tabs.map(([url]) => url);
const groupIds = tabs.map(([, , group]) => group);
const meta = tabs.map(([, title]) => ({ title, favicon: null }));
const entry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups, groupIds, pinned: urls.map(() => false), meta };

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  tabSleep: 'off',
  presentationDefaultsResetVersion: 1,
});
writeJson('session', { version: 2, activeWindowId: entry.id, windows: [entry], urls, activeIndex: 0, groups, groupIds, pinned: entry.pinned });

// The isolated instance's main process is the one carrying this profile's
// --user-data-dir without a --type= helper flag; the window list is ordered
// front to back, so its first normal window is the one just brought forward.
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
  await settle(400);
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((item) => item.includes(`--user-data-dir=${profile}`) && !item.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  const windowId = (await run('/usr/bin/swift', [windowIdScript, line.trim().split(/\s+/, 1)[0]])).stdout.trim();
  assert.match(windowId, /^\d+$/, 'Blanc window id not found');
  const raw = path.join(scratch, `${name}-raw.png`);
  await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
  const { width, height } = await sharp(raw).metadata();
  assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
  const png = path.join(outputDirectory, `${name}-v${expectedVersion}.png`);
  // sharp converts the Display P3 capture to sRGB and writes no profile,
  // matching the existing site captures.
  await sharp(raw).resize(1440, 900, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(png);
  const webp = png.replace(/\.png$/, '.webp');
  await sharp(png).webp({ quality: 85 }).toFile(webp);
  process.stdout.write(`Captured ${name} from ${width}×${height} to ${png} (${sha256(png)}) and ${path.basename(webp)}\n`);
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
  // The strip document; the overlay shares its preload, so match its address.
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://index/')
    && await page.evaluate(() => typeof window.browserAPI?.openIsland === 'function'), 'Blanc chrome document did not appear');

  const allTabs = () => chrome.evaluate(() => window.browserAPI.getAllTabs());
  const restored = await poll(allTabs, (state) => state?.tabs?.length === tabs.length, 'the seeded tabs did not restore');
  const idOf = (url) => restored.tabs.find((tab) => tab.url === url)?.id;
  const loaded = (url) => poll(async () => (await allTabs()).tabs.find((tab) => tab.id === idOf(url)),
    (tab) => tab && !tab.isLoading && tab.favicon, `${url} did not finish loading`, 60_000);

  // Restored tabs are born quiet. Visit the Impasto article once so its row
  // shows the favicon the page serves, then return to The Met and let its
  // images settle.
  await chrome.evaluate((tabId) => window.browserAPI.switchTab(tabId), idOf(impasto));
  await loaded(impasto);
  await chrome.evaluate((tabId) => window.browserAPI.switchTab(tabId), idOf(met));
  await loaded(met);
  await settle(4_000);

  // Close the Van Gogh article, then the whole Lisbon trip group, as their
  // close buttons do.
  await chrome.evaluate((tabId) => window.browserAPI.closeTab(tabId), idOf(vanGogh));
  await settle(500);
  await chrome.evaluate((groupId) => window.browserAPI.closeGroup(groupId), 'capture-lisbon');
  const after = await poll(allTabs, (state) => state?.tabs?.length === 2, 'the Van Gogh tab and the Lisbon trip group did not close');
  assert.deepEqual(after.tabs.map((tab) => tab.url), [met, impasto]);
  assert.equal(after.activeTabId, idOf(met), 'The Met stays the active tab');

  // Open the Island as a click on it does. Window activation can swallow the
  // first open, so ask again until an overlay reports panel mode.
  await chrome.bringToFront();
  await settle(400);
  const panelOpen = async (page) => page.url().startsWith('blanc-chrome://overlay/')
    && await page.evaluate(() => document.body.dataset.mode === 'panel');
  let overlay = null;
  for (let attempt = 0; attempt < 5 && !overlay; attempt += 1) {
    await chrome.evaluate(() => window.browserAPI.openIsland());
    await settle(600);
    for (const page of app.pages()) if (!page.isClosed() && await panelOpen(page).catch(() => false)) overlay = page;
  }
  assert.ok(overlay, 'Island panel did not open');

  // Recently closed starts folded on every open; unfold it from its header.
  const header = overlay.locator('.closed-band .island-ghead');
  await header.waitFor({ state: 'visible' });
  await header.locator('.ghead-toggle').click();
  const closed = await poll(() => overlay.locator('.closed-band .closed-row .row-title').allInnerTexts(),
    (titles) => titles.length === 2, 'Recently closed did not unfold with two entries');
  assert.equal(closed[0], 'Lisbon trip · 2 tabs', 'the newest entry is the Lisbon trip group');
  assert.equal(closed[1], 'Vincent van Gogh - Wikipedia');
  // Park the pointer in a corner of the panel so no row shows a hover.
  await overlay.mouse.move(2, 2);
  await settle();
  await captureWindow('reopen-closed-tabs', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Reopen Closed Tabs to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
