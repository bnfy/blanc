import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { launchPackagedOverCdp } from '../test/desktop/support/packaged-cdp.mjs';
import { captureOutputDirectory, installedBlanc, poll, run, settle, sha256, writeProfileJson } from '../test/desktop/support/installed-capture.mjs';

// Captures the floating Island (Auto-hide, float style) in the installed
// public Blanc, for the homepage's first screen: The Met's page for Van
// Gogh's Wheat Field with Cypresses filling a window to its top edge, once
// with the Island hidden and once with it floated back over the page.
//
// The Island is revealed the way a person reveals it: the system pointer is
// moved to the window's top edge (CGWarpMouseCursorPosition), and Blanc's own
// dwell sampler, which reads the pointer's screen position, brings it in.
// CDP only reads the chrome documents (to wait for each state and to measure
// where the Island is and what it shows); nothing in the app, its DOM or its
// pixels is changed. Each state is a native macOS window capture
// (screencapture -o -l), kept whole at Retina density and converted to sRGB.
// The macOS window buttons are drawn by the system, not the app, so their
// place is measured from the two captures: the pixels that differ in the
// window's top-left corner.
//
// Output goes to a temporary directory unless BLANC_CAPTURE_OUTPUT_DIR is set.

const PAGE_URL = 'https://www.metmuseum.org/art/collection/search/436535';
const expectedVersion = process.env.BLANC_CAPTURE_VERSION || '1.40.0';
const { executablePath, appPath, version, build } = await installedBlanc(expectedVersion);
const outputDirectory = captureOutputDirectory('float-island');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-float-island-'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-float-island-raw-'));
const writeJson = (name, value) => writeProfileJson(profile, name, value);

writeJson('settings', {
  onboardingVersion: 1,
  migrationChecklistDismissed: true,
  searchSuggestions: false,
  usagePing: false,
  theme: 'light',
  tabSleep: 'off',
  presentationDefaultsResetVersion: 1,
  islandAutoHide: true,
  islandAutoHideStyle: 'float',
  islandHoverOpen: false,
  // Already on this version, its What's New page already shown: no second tab.
  lastRunVersion: expectedVersion,
  whatsNewPageVersion: expectedVersion,
  whatsNewTabRelease: expectedVersion.split('.').slice(0, 2).join('.'),
});
const urls = [PAGE_URL];
const sessionEntry = { id: 'primary', profileId: 'default', workspaceId: null, urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false], meta: [{ title: 'Wheat Field with Cypresses', favicon: null }] };
writeJson('session', { version: 2, activeWindowId: sessionEntry.id, windows: [sessionEntry], urls, activeIndex: 0, groups: [], groupIds: [null], pinned: [false] });

async function mainPid() {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,command=']);
  const line = stdout.split('\n').find((entry) => entry.includes(`--user-data-dir=${profile}`) && !entry.includes('--type='));
  assert.ok(line, 'isolated Blanc main process not found');
  return Number(line.trim().split(/\s+/, 1)[0]);
}

// The front window of a process: its number and bounds in screen points.
const windowScript = path.join(scratch, 'window.swift');
fs.writeFileSync(windowScript, `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
if let w = list.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }) {
  let b = w[kCGWindowBounds as String] as! [String: Double]
  print("\\(w[kCGWindowNumber as String]!) \\(b["X"]!) \\(b["Y"]!) \\(b["Width"]!) \\(b["Height"]!)")
}
`);
const warpScript = path.join(scratch, 'warp.swift');
fs.writeFileSync(warpScript, `
import CoreGraphics
CGWarpMouseCursorPosition(CGPoint(x: Double(CommandLine.arguments[1])!, y: Double(CommandLine.arguments[2])!))
`);
async function frontWindow() {
  const out = (await run('/usr/bin/swift', [windowScript, String(await mainPid())])).stdout.trim();
  const [id, x, y, width, height] = out.split(' ').map(Number);
  assert.ok(id > 0, 'Blanc window not found');
  return { id, x, y, width, height };
}
// The dwell sampler runs only in a focused window, so Blanc must be the
// frontmost app while the pointer is at the top edge.
const activateScript = path.join(scratch, 'activate.swift');
fs.writeFileSync(activateScript, `
import AppKit
let app = NSRunningApplication(processIdentifier: pid_t(CommandLine.arguments[1])!)
app?.activate(options: [.activateAllWindows])
`);
const frontmostPid = async () => Number((await run('/usr/bin/osascript', ['-e', 'tell application "System Events" to get unix id of first application process whose frontmost is true'])).stdout.trim());
// Ask the app to come forward, then LaunchServices for the app at this path;
// wait until this Blanc is frontmost.
const activate = async () => {
  const pid = await mainPid();
  await run('/usr/bin/swift', [activateScript, String(pid)]);
  if (await frontmostPid() !== pid) await run('/usr/bin/open', ['-a', appPath]);
  await poll(async () => (await frontmostPid()) === pid, Boolean, 'this Blanc did not come to the front', 15_000);
};
const warp = (x, y) => run('/usr/bin/swift', [warpScript, String(Math.round(x)), String(Math.round(y))]);

async function captureWindow(name) {
  const { id } = await frontWindow();
  const raw = path.join(scratch, `${name}-raw.png`);
  await run('/usr/sbin/screencapture', ['-o', '-x', `-l${id}`, raw]);
  const png = path.join(outputDirectory, `float-island-${name}-v${expectedVersion}.png`);
  await sharp(raw).toColorspace('srgb').png({ compressionLevel: 9 }).toFile(png);
  const { width, height } = await sharp(png).metadata();
  process.stdout.write(`Captured ${name}: ${width}×${height} ${png} (${sha256(png)})\n`);
  return { png, width, height };
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
  const strip = await findPage(async (page) => page.url().startsWith('blanc-chrome://index'), 'strip document did not appear');
  const sitePage = await findPage(async (page) => page.url().startsWith('https://www.metmuseum.org/'), 'The Met page did not load', 60_000);
  await sitePage.waitForLoadState('load');
  await settle(5_000);
  // The pill's own float view says whether it is shown (html.float-shown).
  const pillShown = async () => {
    for (const page of app.pages()) {
      if (page.isClosed() || !page.url().startsWith('blanc-chrome://float')) continue;
      if (await page.evaluate(() => document.documentElement.classList.contains('float-shown') && document.documentElement.dataset.floatRole === 'pill').catch(() => false)) return true;
    }
    return false;
  };
  await strip.bringToFront().catch(() => {});
  const win = await frontWindow();

  // Hidden: the pointer rests in the page's middle.
  await warp(win.x + win.width / 2, win.y + win.height * 0.6);
  await poll(async () => !(await pillShown()), Boolean, 'the Island did not hide', 20_000);
  await settle(1_000);
  const hidden = await captureWindow('hidden');

  // Revealed: the pointer at the window's top edge, centered.
  await activate();
  await settle(800);
  await warp(win.x + win.width / 2, win.y + 2);
  await poll(pillShown, Boolean, 'the Island did not float back', 20_000).catch(async (error) => {
    for (const page of app.pages()) {
      if (page.isClosed() || !page.url().startsWith('blanc-chrome://')) continue;
      const state = await page.evaluate(() => ({ cls: document.documentElement.className, data: { ...document.documentElement.dataset }, focus: document.hasFocus(), vis: document.visibilityState })).catch((e) => String(e));
      process.stdout.write(`${page.url()} ${JSON.stringify(state)}\n`);
    }
    throw error;
  });
  await settle(600);
  const measured = await strip.evaluate(() => {
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; };
    const dots = [...document.querySelectorAll('#pillDots .island-dot')];
    const favicon = getComputedStyle(document.getElementById('pillFavicon')).backgroundImage;
    return {
      window: { width: window.innerWidth, height: window.innerHeight },
      islandRect: rect(document.getElementById('islandPill')),
      pill: {
        domain: document.getElementById('pillDomain').textContent.trim(),
        dots: dots.length,
        activeDot: dots.findIndex((dot) => dot.classList.contains('active')),
        shieldCount: (document.getElementById('pillShieldCount')?.textContent || '').trim(),
        faviconUrl: favicon.match(/url\("?(.*?)"?\)$/)?.[1] ?? null,
      },
    };
  });
  assert.equal(measured.pill.domain, 'www.metmuseum.org', 'the Island shows The Met page');
  assert.equal(measured.pill.dots, 1, 'one tab, The Met page');
  const revealed = await captureWindow('revealed');
  await warp(win.x + win.width / 2, win.y + win.height * 0.6);
  assert.equal(revealed.width, hidden.width);
  assert.equal(revealed.height, hidden.height);

  // The window buttons: the pixels that differ in the top-left 120×40 CSS px.
  const scale = hidden.width / measured.window.width;
  const corner = { left: 0, top: 0, width: Math.round(120 * scale), height: Math.round(40 * scale) };
  const [a, b] = await Promise.all([hidden.png, revealed.png].map((file) => sharp(file).extract(corner).removeAlpha().raw().toBuffer()));
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (let y = 0; y < corner.height; y += 1) {
    for (let x = 0; x < corner.width; x += 1) {
      const i = (y * corner.width + x) * 3;
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  assert.ok(maxX > 0, 'the window buttons were not found in the revealed capture');
  const pad = 2;
  measured.trafficLightsRect = {
    x: Math.max(0, Math.floor(minX / scale) - pad),
    y: Math.max(0, Math.floor(minY / scale) - pad),
    width: Math.ceil((maxX - minX + 1) / scale) + 2 * pad,
    height: Math.ceil((maxY - minY + 1) / scale) + 2 * pad,
  };
  // The favicon the pill showed, as the site shows it.
  if (measured.pill.faviconUrl?.startsWith('data:')) {
    const favicon = path.join(outputDirectory, 'metmuseum-favicon.png');
    await sharp(Buffer.from(measured.pill.faviconUrl.split(',')[1], 'base64')).png().toFile(favicon);
    measured.pill.favicon = path.basename(favicon);
  }
  delete measured.pill.faviconUrl;
  fs.writeFileSync(path.join(outputDirectory, 'measured.json'), JSON.stringify({ version, build, scale, measured }, null, 2));
  process.stdout.write(`${JSON.stringify({ version, build, scale, measured }, null, 2)}\n`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
}
