import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, seedStartPageFixtures, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures three states of the installed public Blanc for the Profiles and
// Named Workspaces guides, in a disposable profile seeded with synthetic data:
//   profiles        Settings sheet on the Profiles group (Personal + Studio)
//   profile-window  the Studio profile in its own window, opened with the
//                   profile row's shipped Open button
//   workspaces      the Personal window's Island panel with the workspace
//                   switcher open (no Patron entitlement is forged)
// Settings, the panel and the switcher are separate views stacked over the
// page, so each state is a native macOS window capture (screencapture -l),
// resized to 1440x900 sRGB PNG with a .webp companion for inline use. CDP
// only calls shipped preload actions and clicks shipped controls; nothing is
// patched or retouched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set
// (captures carry a live clock, so a rerun never matches a ledger's hashes).

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.30.1';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('profiles-workspaces');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-profiles-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-profiles-raw-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);
const now = Date.now();

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
seedStartPageFixtures(profile, { favorites, now });
writeJson('session', { version: 2, activeWindowId: sessionEntry.id, windows: [sessionEntry], urls, activeIndex: 0, groups, groupIds, pinned: sessionEntry.pinned });

// The isolated instance's main process is the one carrying this profile's
// --user-data-dir without a --type= helper flag.
async function mainPid() {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  return Number(line.trim().split(/\s+/, 1)[0]);
}

// The window list is ordered front to back, so the first normal window of
// this process is the one just brought to the front.
const windowIdScript = path.join(scratch, 'window-id.swift');
fs.writeFileSync(windowIdScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let front = list.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
print(front.map { "\\($0[kCGWindowNumber as String]!)" } ?? "")
`);

async function captureWindow(name, page) {
  // Activate the window so its title-bar controls render in their active state.
  await page.bringToFront().catch(() => {});
  await settle(400);
  const windowId = (await run('/usr/bin/swift', [windowIdScript, String(await mainPid())])).stdout.trim();
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
  // First open page matching an async predicate, polled until it appears.
  const findPage = (predicate, label) => poll(async () => {
    for (const page of app.pages()) {
      if (!page.isClosed() && await predicate(page).catch(() => false)) return page;
    }
    return null;
  }, Boolean, label);
  const isStartPage = (page) => page.url().startsWith('blanc://newtab/');
  // The strip document is the one whose shipped preload exposes openPage.
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://')
    && await page.evaluate(() => typeof window.browserAPI?.openPage === 'function'), 'Blanc chrome document did not appear');
  await findPage(async (page) => isStartPage(page), 'Start Page did not restore');

  // 1. Settings → Profiles: open Settings through the shipped preload action,
  // then choose the Profiles group with the sheet's own navigation link.
  await chrome.evaluate(() => window.browserAPI.openPage('settings'));
  const settings = await findPage(async (page) => page.url().startsWith('blanc://settings/'), 'Settings sheet did not open');
  await settings.locator('.settings-nav a[data-group="profiles"]').click();
  await settings.locator('#profilesList > *').first().waitFor({ state: 'visible' });
  await poll(async () => (await settings.locator('#profilesList').innerText()).includes('Studio'), Boolean, 'Studio profile not listed');
  await settle();
  await captureWindow('profiles', chrome);

  // 2. The Studio profile in its own window. Its Start Page is the newtab
  // page that did not exist before the click.
  const existing = new Set(app.pages().filter(isStartPage));
  await settings.locator('#profilesList > *', { hasText: 'Studio' }).getByRole('button', { name: 'Open', exact: true }).click();
  const studio = await findPage(async (page) => isStartPage(page) && !existing.has(page), 'Studio profile window did not open');
  await studio.waitForLoadState('load');
  await settle(1_200);
  await captureWindow('profile-window', studio);

  // 3. Named Workspaces, in the Personal window. Bring it forward first: the
  // panel closes when its window loses focus. Window activation can swallow
  // the first open, so ask again until an overlay reports panel mode (each
  // window has its own overlay document). Summoning the Island also
  // dismisses the utility sheet.
  await chrome.bringToFront();
  await settle(400);
  const panelOpen = async (page) => /overlay/.test(page.url())
    && await page.evaluate(() => document.body.dataset.mode === 'panel');
  let overlay = null;
  for (let attempt = 0; attempt < 5 && !overlay; attempt += 1) {
    await chrome.evaluate(() => window.browserAPI.openIsland());
    await settle(600);
    for (const page of app.pages()) if (!page.isClosed() && await panelOpen(page).catch(() => false)) overlay = page;
  }
  assert.ok(overlay, 'Island panel did not open');
  await overlay.locator('#footerWorkspace').waitFor({ state: 'visible' });
  await overlay.locator('#footerWorkspace').click();
  await overlay.locator('#workspaceSwitcher').waitFor({ state: 'visible' });
  await poll(async () => (await overlay.locator('#workspaceSwitcherList').innerText()).includes('Weekend reading'), Boolean, 'workspaces not listed');
  // Opening the menu focuses its first row. A plain click on the menu's own
  // padding moves focus off that row without closing the menu; confirm both,
  // so a layout change cannot turn the click into an action.
  const menu = await overlay.locator('#workspaceSwitcher').boundingBox();
  await overlay.mouse.click(menu.x + 6, menu.y + menu.height - 6);
  await settle(300);
  const menuState = await overlay.evaluate(() => {
    const switcher = document.getElementById('workspaceSwitcher');
    return { open: !switcher.hidden, mode: document.body.dataset.mode, focusInMenu: switcher.contains(document.activeElement) && document.activeElement !== switcher };
  });
  assert.deepEqual(menuState, { open: true, mode: 'panel', focusInMenu: false }, 'workspace menu must stay open with no control focused');
  await settle();
  await captureWindow('workspaces', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Profiles and Workspaces set to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
