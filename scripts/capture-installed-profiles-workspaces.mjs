import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';

// Captures the Settings → Profiles sheet and the Named Workspaces switcher
// from the installed public Blanc in a disposable profile. Both surfaces are
// separate views stacked over the page, so this takes a native macOS window
// capture (screencapture -l) rather than a page screenshot. CDP only calls
// shipped preload actions and clicks shipped controls; nothing is patched,
// retouched, or forged (no Patron entitlement is granted).

if (process.platform !== 'darwin') throw new Error('The installed-public capture helper currently requires macOS.');

const run = promisify(execFile);
const executablePath = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE
  || '/Applications/Blanc.app/Contents/MacOS/Blanc');
const appPath = executablePath.slice(0, executablePath.lastIndexOf('.app/') + 4);
const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.30.1';
const outputDirectory = path.resolve(process.env.BLANC_CAPTURE_OUTPUT_DIR
  || 'site/public/feature-captures');

assert.ok(fs.existsSync(executablePath) && appPath.endsWith('.app'), 'An installed Blanc.app executable is required.');
const plist = path.join(appPath, 'Contents/Info.plist');
const version = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).stdout.trim();
const build = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist])).stdout.trim();
assert.equal(version, expectedVersion, `Installed Blanc must be ${expectedVersion}; found ${version}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-profiles-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-profiles-raw-'));
const writeJson = (name, value) => fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(value, null, 2));
const now = Date.now();

// Synthetic fixtures only: public sites, no accounts, no real browsing.
const favorites = [
  ['mdn', 'https://developer.mozilla.org/', 'MDN Web Docs'],
  ['github', 'https://github.com/', 'GitHub'],
  ['hacker-news', 'https://news.ycombinator.com/', 'Hacker News'],
  ['verge', 'https://www.theverge.com/', 'The Verge'],
];
const urls = ['blanc://newtab/', 'https://developer.mozilla.org/en-US/docs/Web/API', 'https://github.com/explore'];
const groups = [{ id: 'capture-research', name: 'research', collapsed: false }];
const groupIds = [null, 'capture-research', 'capture-research'];
const meta = [
  { title: 'Start Page', favicon: null },
  { title: 'Web APIs | MDN', favicon: null },
  { title: 'Explore GitHub', favicon: null },
];
const sessionEntry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups, groupIds, pinned: urls.map(() => false), meta };
const workspace = (id, name, minutesAgo, tabs, group) => ({
  id, name, profileId: 'default', createdAt: now - minutesAgo * 60_000, updatedAt: now - minutesAgo * 60_000, revision: 1,
  urls: tabs.map(([url]) => url), activeIndex: 0,
  groups: [{ id: `${id}-group`, name: group, collapsed: false }], groupIds: tabs.map(() => `${id}-group`),
  pinned: tabs.map(() => false), meta: tabs.map(([, title]) => ({ title, favicon: null })),
});

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  newtabLayout: 'billboard',
  presentationDefaultsResetVersion: 1,
});
writeJson('profiles', {
  version: 1,
  profiles: [
    { id: 'default', name: 'Personal', createdAt: 0 },
    { id: 'capture-studio', name: 'Studio', createdAt: now - 86_400_000 },
  ],
});
writeJson('workspaces', {
  version: 2,
  workspaces: [
    workspace('capture-research-desk', 'Research desk', 30, [['https://developer.mozilla.org/en-US/docs/Web/CSS', 'CSS | MDN'], ['https://github.com/topics/css', 'css · GitHub Topics']], 'css'),
    workspace('capture-weekend-reading', 'Weekend reading', 90, [['https://www.theverge.com/tech', 'Technology'], ['https://news.ycombinator.com/', 'Hacker News']], 'reading'),
  ],
  deleted: [],
});
writeJson('bookmarks', {
  items: favorites.map(([id, url, title], index) => ({
    id: `capture-${id}`, url, title, favicon: null, addedAt: now - (index + 1) * 60_000, updatedAt: now - (index + 1) * 60_000, folder: null,
  })),
  tombstones: [],
});
writeJson('history', {
  entries: favorites.flatMap(([, url, title], siteIndex) => Array.from({ length: favorites.length - siteIndex }, (_, visitIndex) => ({
    url, title, visitedAt: now - (siteIndex * 10 + visitIndex) * 60_000,
  }))),
  siteIcons: [],
});
const monday = new Date();
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const days = [148, 180, 0, 0, 0, 0, 0];
writeJson('adblock-stats', { weekStart: monday.getTime(), blocked: days.reduce((sum, value) => sum + value, 0), days });
writeJson('session', { version: 2, activeWindowId: sessionEntry.id, windows: [sessionEntry], urls, activeIndex: 0, groups, groupIds, pinned: sessionEntry.pinned });

const poll = async (read, accept, label) => {
  const deadline = Date.now() + 30_000;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}; last observation: ${String(value)}`);
};
const settle = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// The isolated instance's main process is the one carrying this profile's
// --user-data-dir without a --type= helper flag.
async function mainPid() {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  return Number(line.trim().split(/\s+/, 1)[0]);
}

const windowIdSource = `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let windows = list.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
let largest = windows.max { a, b in
  let ra = a[kCGWindowBounds as String] as! [String: Double], rb = b[kCGWindowBounds as String] as! [String: Double]
  return ra["Width"]! * ra["Height"]! < rb["Width"]! * rb["Height"]!
}
print(largest.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`;
const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, windowIdSource);

async function captureWindow(name, page) {
  // Activate the window so its title-bar controls render in their active state.
  await page.bringToFront().catch(() => {});
  await settle(400);
  const pid = await mainPid();
  const windowId = (await run('/usr/bin/swift', [windowIdScript, String(pid)])).stdout.trim();
  assert.match(windowId, /^\d+$/, 'Blanc window id not found');
  const raw = path.join(scratch, `${name}-raw.png`);
  await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
  const { width, height } = await sharp(raw).metadata();
  assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
  const file = path.join(outputDirectory, `${name}-v${expectedVersion}.png`);
  // sharp converts the Display P3 capture to sRGB and writes no profile,
  // matching the existing site captures.
  await sharp(raw).resize(1440, 900, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(file);
  process.stdout.write(`Captured ${name} from ${width}×${height} to ${file} (${sha256(file)})\n`);
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
  // The strip document is the one whose shipped preload exposes openPage.
  const chrome = await poll(async () => {
    for (const page of app.pages()) {
      if (page.isClosed() || !page.url().startsWith('blanc-chrome://')) continue;
      if (await page.evaluate(() => typeof window.browserAPI?.openPage === 'function').catch(() => false)) return page;
    }
    return null;
  }, Boolean, 'Blanc chrome document did not appear');
  await poll(async () => app.pages().find((page) => page.url().startsWith('blanc://newtab/')), Boolean, 'Start Page did not restore');
  fs.mkdirSync(outputDirectory, { recursive: true });

  // 1. Settings → Profiles, opened through the shipped preload action.
  await chrome.evaluate(() => window.browserAPI.openPage('settings', 'profiles'));
  const settings = await poll(async () => app.pages().find((page) => page.url().startsWith('blanc://settings/')), Boolean, 'Settings sheet did not open');
  // Choose the Profiles group with the sheet's own navigation link.
  await settings.locator('.settings-nav a[data-group="profiles"]').click();
  await settings.locator('#profilesList > *').first().waitFor({ state: 'visible' });
  await poll(async () => (await settings.locator('#profilesList').innerText()).includes('Studio'), Boolean, 'Studio profile not listed');
  await settle();
  await captureWindow('profiles', chrome);

  // 2. Named Workspaces: close the sheet, open the Island panel, open its
  // workspace switcher from the panel footer.
  // Summoning the Island dismisses the utility sheet (its view is kept, so
  // the page target does not disappear).
  await chrome.evaluate(() => window.browserAPI.openIsland());
  const overlay = await poll(
    async () => app.pages().find((page) => !page.isClosed() && /overlay/.test(page.url())) ?? app.pages().map((page) => page.url()).join(' | '),
    (value) => typeof value === 'object',
    'Island overlay not found',
  );
  await overlay.locator('#footerWorkspace').waitFor({ state: 'visible' });
  await overlay.locator('#footerWorkspace').click();
  await overlay.locator('#workspaceSwitcher').waitFor({ state: 'visible' });
  await poll(async () => (await overlay.locator('#workspaceSwitcherList').innerText()).includes('Weekend reading'), Boolean, 'workspaces not listed');
  // Opening the menu focuses its first row. A plain click on the menu's own
  // padding moves focus off that row without closing the menu.
  const menu = await overlay.locator('#workspaceSwitcher').boundingBox();
  await overlay.mouse.click(menu.x + 6, menu.y + menu.height - 6);
  await overlay.locator('#workspaceSwitcher').waitFor({ state: 'visible' });
  await settle();
  await captureWindow('workspaces', chrome);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Profiles and Workspaces.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
