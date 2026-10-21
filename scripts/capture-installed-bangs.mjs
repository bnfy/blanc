import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the /bangs share card's image from the installed public Blanc, in
// a disposable profile on its own Start Page (no third-party page behind the
// panel). The Island is opened as a click on it opens it and `!yt lofi` is
// typed into its field with real key events, so the shipped bang code draws
// its hint row, Search YouTube for “lofi”, selected:
//   bangs  the Island panel with a bang typed and its hint row
// The panel is a separate view over the page, so the state is a native macOS
// window capture (screencapture -l), resized to a 1440x900 sRGB PNG with a
// .webp companion for inline use. Nothing is patched or retouched.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.36.0';
const { executablePath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('bangs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-bangs-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-bangs-raw-'));

writeProfileJson(profile, 'settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  tabSleep: 'off',
  presentationDefaultsResetVersion: 1,
});

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
  // A fresh profile opens one Start Page; let its wallpaper and fonts settle.
  await findPage(async (page) => page.url().startsWith('blanc://newtab'), 'the Start Page did not open');
  await settle(3_000);

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

  // Type the bang with real key events; the shipped bangs code draws the hint.
  const field = overlay.locator('#addressInput');
  await field.click();
  await field.pressSequentially('!yt lofi', { delay: 80 });
  const hint = await poll(() => overlay.locator('.island-row.active').first().innerText(),
    (text) => /!yt/.test(text) && /Search YouTube for “lofi”/.test(text), 'the !yt hint row did not appear');
  assert.match(hint, /Search YouTube for “lofi”/);
  // Park the pointer in a corner of the panel so no row shows a hover.
  await overlay.mouse.move(2, 2);
  await settle();
  await captureWindow('bangs', overlay);
  process.stdout.write(`Captured installed Blanc ${version} (${build}) bangs to ${outputDirectory}.\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
