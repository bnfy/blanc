import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures Glance in the installed public Blanc, in a disposable profile: a
// map of a city as the main page with a travel guide for it as the reference
// page, two ordinary tabs in one Personal window. The reference pane is a
// separate view beside the page, so this is a native macOS window capture
// (screencapture -l), resized to 1440x900 sRGB PNG with a .webp companion.
// CDP only calls shipped preload actions; nothing is patched or retouched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set
// (captures carry live page content, so a rerun never matches a ledger's hashes).

const MAIN_URL = 'https://www.openstreetmap.org/#map=15/38.7120/-9.1365';
const REFERENCE_URL = 'https://en.wikivoyage.org/wiki/Lisbon';

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.30.1';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('glance');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-glance-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-glance-raw-'));
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
const urls = ['blanc://newtab/'];
const sessionEntry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Start Page', favicon: null }] };
writeJson('session', { version: 2, activeWindowId: sessionEntry.id, windows: [sessionEntry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });

async function mainPid() {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  return Number(line.trim().split(/\s+/, 1)[0]);
}

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
  const windowId = (await run('/usr/bin/swift', [windowIdScript, String(await mainPid())])).stdout.trim();
  assert.match(windowId, /^\d+$/, 'Blanc window id not found');
  const raw = path.join(scratch, `${name}-raw.png`);
  await run('/usr/sbin/screencapture', ['-o', '-x', `-l${windowId}`, raw]);
  const { width, height } = await sharp(raw).metadata();
  assert.ok(width / height > 1.59 && width / height < 1.61, `unexpected window capture ${width}×${height}`);
  const png = path.join(outputDirectory, `${name}.png`);
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
    for (const page of app.pages()) {
      if (!page.isClosed() && await predicate(page).catch(() => false)) return page;
    }
    return null;
  }, Boolean, label, timeoutMs);
  const chrome = await findPage(async (page) => page.url().startsWith('blanc-chrome://')
    && await page.evaluate(() => typeof window.browserAPI?.setGlanceTab === 'function'), 'Blanc chrome document did not appear');
  await findPage(async (page) => page.url().startsWith('blanc://newtab/'), 'Start Page did not restore');

  // Open the reference tab first and the main tab last, so the main tab ends
  // up active; then close the restored Start Page and put the reference tab
  // in Glance, all through shipped preload actions.
  await chrome.evaluate(() => {
    window.__captureTabs = null;
    window.browserAPI.onTabsUpdated((payload) => { window.__captureTabs = payload; });
  });
  const referenceId = await chrome.evaluate((url) => window.browserAPI.createTab(url), REFERENCE_URL);
  const mainId = await chrome.evaluate((url) => window.browserAPI.createTab(url), MAIN_URL);
  assert.ok(referenceId != null && mainId != null, 'createTab did not return tab ids');
  const startId = await poll(() => chrome.evaluate(() => window.__captureTabs?.tabs?.find((tab) => String(tab.url).startsWith('blanc://newtab'))?.id), (id) => id != null, 'Start Page tab id not reported');
  await chrome.evaluate((id) => window.browserAPI.closeTab(id), startId);

  const mainPage = await findPage(async (page) => page.url().startsWith('https://www.openstreetmap.org/'), 'map page did not load', 60_000);
  const referencePage = await findPage(async (page) => page.url().startsWith('https://en.wikivoyage.org/'), 'guide page did not load', 60_000);
  await Promise.all([mainPage.waitForLoadState('load'), referencePage.waitForLoadState('load')]);
  // Dismiss each site's own welcome panels and notices with its own close
  // controls, and bring the guide's photo banner to the top of its pane.
  await settle(2_000);
  for (const page of [mainPage, referencePage]) {
    const closers = page.locator('button:visible, a:visible').filter({ hasText: /^\s*(×|\[?dismiss\]?)\s*$/i })
      .or(page.locator('[aria-label="Close" i]:visible, .btn-close:visible, .cn-close:visible'));
    for (let index = await closers.count() - 1; index >= 0; index -= 1) {
      await closers.nth(index).click({ timeout: 2_000 }).catch(() => {});
    }
  }
  await referencePage.evaluate(() => {
    const banner = document.querySelector('.wpb-topbanner, .pagebanner, .wpb-banner');
    if (banner) window.scrollTo(0, banner.getBoundingClientRect().top + window.scrollY - 110);
  });
  await chrome.evaluate((id) => window.browserAPI.switchTab(id), mainId);
  assert.equal(await chrome.evaluate((id) => window.browserAPI.setGlanceTab(id), referenceId), true, 'Glance did not open');
  // Map tiles and the guide's photos keep loading after the load event.
  await settle(5_000);
  await captureWindow('glance', chrome);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) Glance to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
