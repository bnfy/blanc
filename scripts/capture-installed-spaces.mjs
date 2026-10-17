import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the Blanc Spaces page's images from the installed public Blanc, in a
// disposable profile seeded with four sample spaces, each with its colour and
// symbol (space-identity.js presets): Work, Home, Painting class and Lisbon
// trip. The window opens in Painting class with The Met's public-domain Van
// Gogh as its active page, and the Spaces menu is opened by clicking the
// Island's space mark, as a person would:
//   workspaces       the Spaces menu listing the four spaces
//   workspaces-edit  Painting class's editor: name, colour and symbol
// The menu is a separate view over the page, so each state is a native macOS
// window capture (screencapture -l), resized to a 1440x900 sRGB PNG with a
// .webp companion for inline use. CDP only clicks shipped controls and calls
// shipped preload actions; nothing is patched or retouched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set
// (captures carry live page content, so a rerun never matches a ledger's hashes).

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.33.0';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('spaces');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-spaces-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-spaces-raw-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);
const now = Date.now();

// [id, name, colour, symbol, minutes since last update, [url, title] tabs]
const spaces = [
  ['capture-work', 'Work', '#376694', 'briefcase', 20, [
    ['https://github.com/explore', 'Explore GitHub'], ['https://developer.mozilla.org/en-US/docs/Web/CSS', 'CSS | MDN'],
    ['https://news.ycombinator.com/', 'Hacker News'], ['https://www.theverge.com/tech', 'Technology'],
  ]],
  ['capture-home', 'Home', '#426c4c', 'house', 45, [
    ['https://www.notion.so/', 'Notion'], ['https://www.youtube.com/', 'YouTube'], ['https://www.reddit.com/r/Cooking/', 'Cooking'],
  ]],
  ['capture-painting', 'Painting class', '#6757a3', 'cap', 5, [
    ['https://www.metmuseum.org/art/collection/search/436535', 'Wheat Field with Cypresses'],
    ['https://www.metmuseum.org/art/collection/search/45434', 'The Met'],
    ['https://en.wikipedia.org/wiki/Impasto', 'Impasto - Wikipedia'],
  ]],
  ['capture-lisbon', 'Lisbon trip', '#974f2a', 'plane', 90, [
    ['https://en.wikipedia.org/wiki/Lisbon', 'Lisbon - Wikipedia'], ['https://www.nytimes.com/section/travel', 'Travel'],
  ]],
];
const workspaces = spaces.map(([id, name, color, symbol, minutesAgo, tabs]) => ({
  id, name, color, symbol, profileId: 'default',
  createdAt: now - minutesAgo * 60_000, updatedAt: now - minutesAgo * 60_000, revision: 1,
  urls: tabs.map(([url]) => url), activeIndex: 0, groups: [], groupIds: tabs.map(() => null),
  pinned: tabs.map(() => false), meta: tabs.map(([, title]) => ({ title, favicon: null })),
}));
const painting = workspaces.find((space) => space.id === 'capture-painting');

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  tabSleep: 'off',
  presentationDefaultsResetVersion: 1,
});
writeJson('workspaces', { version: 2, workspaces, deleted: [] });
// The window restores bound to Painting class, with the same tabs the space holds.
const entry = {
  id: 'primary', profileId: 'default', workspaceId: painting.id, urls: painting.urls, activeIndex: 0,
  groups: [], groupIds: painting.groupIds, pinned: painting.pinned, meta: painting.meta,
};
writeJson('session', { version: 2, activeWindowId: entry.id, windows: [entry], urls: entry.urls, activeIndex: 0, groups: [], groupIds: entry.groupIds, pinned: entry.pinned });

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
  // The strip document is the one whose shipped preload exposes openIsland.
  // The overlay shares that preload, so match the strip's own address.
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://index/')
    && await page.evaluate(() => typeof window.browserAPI?.openIsland === 'function'), 'Blanc chrome document did not appear');

  // The window restored into Painting class: its mark shows that space.
  await poll(() => chrome.evaluate(() => {
    const mark = document.getElementById('pillSpace');
    return mark && !mark.hidden && mark.dataset.state === 'space' && document.getElementById('pillSpaceName').textContent;
  }), (name) => name === 'Painting class', 'the space mark did not show Painting class');

  // Only the selected tab wakes on restore; wait for The Met to finish
  // loading with its own title and favicon (tab ids come from the shipped
  // tabs:updated broadcast, which follows any change).
  await chrome.evaluate(() => { window.browserAPI.onTabsUpdated((payload) => { window.__captureTabs = payload; }); });
  const blankId = await chrome.evaluate(() => window.browserAPI.createTab());
  await chrome.evaluate((id) => window.browserAPI.closeTab(id), blankId);
  const met = painting.urls[0];
  await poll(() => chrome.evaluate((url) => {
    const tab = window.__captureTabs?.tabs?.find((item) => item.url === url);
    return tab && !tab.isLoading && tab.favicon && tab.title ? tab.id : null;
  }, met), Boolean, 'The Met did not finish loading', 60_000);
  // Let the page's images settle.
  await settle(4_000);

  // Open the Spaces menu from the mark with a real click. Window activation
  // can swallow the first one, so click again until an overlay reports the
  // spaces mode (each window has its own overlay document).
  await chrome.bringToFront();
  await settle(400);
  const spacesOpen = async (page) => /overlay/.test(page.url())
    && await page.evaluate(() => document.body.dataset.mode === 'spaces' && !document.getElementById('workspaceSwitcher').hidden);
  let overlay = null;
  for (let attempt = 0; attempt < 5 && !overlay; attempt += 1) {
    await chrome.locator('#pillSpace').click();
    await settle(700);
    for (const page of app.pages()) if (!page.isClosed() && await spacesOpen(page).catch(() => false)) overlay = page;
  }
  assert.ok(overlay, 'Spaces menu did not open from the mark');
  const rows = await poll(() => overlay.locator('#workspaceSwitcherList .ws-row-name').allInnerTexts(), (names) => names.length === spaces.length, 'spaces not listed');
  assert.deepEqual(rows, spaces.map(([, name]) => name));
  // Opening the menu focuses its current row. A plain click on the menu's own
  // padding moves focus off that row without closing the menu; confirm both,
  // so a layout change cannot turn the click into an action.
  const menu = await overlay.locator('#workspaceSwitcher').boundingBox();
  await overlay.mouse.click(menu.x + 6, menu.y + menu.height - 6);
  await settle(300);
  const menuState = await overlay.evaluate(() => {
    const switcher = document.getElementById('workspaceSwitcher');
    return { open: !switcher.hidden, mode: document.body.dataset.mode, focusInMenu: switcher.contains(document.activeElement) && document.activeElement !== switcher };
  });
  assert.deepEqual(menuState, { open: true, mode: 'spaces', focusInMenu: false }, 'Spaces menu must stay open with no control focused');
  await settle();
  await captureWindow('workspaces', overlay);

  // 2. Customizing a space: the menu reshapes into Painting class's editor
  // when its row's ••• button (shown on hover) is clicked. Focus lands in the
  // name field; a click on the editor's title moves it off without changing
  // anything, so no caret or focus ring is captured.
  const row = overlay.locator('#workspaceSwitcherList .ws-row', { hasText: 'Painting class' });
  await row.hover();
  await row.locator('.ws-row-more').click();
  await overlay.locator('#workspaceEditor').waitFor({ state: 'visible' });
  await settle(600);
  await overlay.locator('#workspaceEditor .ws-editor-title').click();
  await settle(300);
  const editorState = await overlay.evaluate(() => {
    const editor = document.getElementById('workspaceEditor');
    return {
      mode: document.body.dataset.mode,
      name: document.getElementById('workspaceName').value,
      title: editor.querySelector('.ws-editor-title').textContent,
      focusInEditor: editor.contains(document.activeElement),
    };
  });
  assert.deepEqual(editorState, { mode: 'spaces', name: 'Painting class', title: 'Edit space', focusInEditor: false }, 'the editor must be open on Painting class with no control focused');
  await settle();
  await captureWindow('workspaces-edit', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Spaces set to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
