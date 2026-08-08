// CROSS-WINDOW COMPOSITION PROOF
//
// Parent window: full-bleed page + native NSGlassEffectView.
// Child window:  transparent, frameless, parented — carries the island's HTML.
//
// The question is whether the WindowServer composites the child's Chromium
// pixels ON TOP of the parent's finished output (glass included) while the
// parent's glass keeps sampling the page inside the parent.
import { createRequire } from 'node:module';
const require = createRequire('/Users/anthonyjloria/Projects/Blanc Browser/');
const { _electron } = require('playwright');
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/Users/anthonyjloria/Projects/Blanc Browser';
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

const html = `<body style="margin:0;height:400vh;background:repeating-linear-gradient(
  180deg,#ff0040 0 70px,#ffd400 70px 140px,#00e5ff 140px 210px,#0d00ff 210px 280px)"></body>`;
const server = createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = fs.mkdtempSync('/tmp/blanc-xwin-');
const app = await _electron.launch({
  args: [REPO, `--user-data-dir=${userDataDir}`],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '1' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));

const W = 900, H = 600, PAD = 30;
let WIN = { x: 280, y: 200, width: W, height: H };
await app.evaluate(({ BrowserWindow }, b) => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow());
  w.setBounds(b); w.show(); w.focus();
}, WIN);

const tabId = await app.evaluate((_e, u) => globalThis.__blanc.openTab(u), PAGE);
await sleep(2600);
await app.evaluate((_e, id) => globalThis.__blanc.activateTab(id), tabId);
await sleep(1500);

// ---- helpers -------------------------------------------------------------
// The display is finite: an unclamped -R that runs past an edge makes
// screencapture fail outright ("could not create image from rect"), which would
// abort the run rather than just produce a bad frame.
const SCREEN = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().bounds);

async function shot(name, rect = WIN, pad = PAD) {
  await sleep(600);
  const x = Math.max(SCREEN.x, rect.x - pad);
  const y = Math.max(SCREEN.y, rect.y - pad);
  const w = Math.min(rect.width + pad * 2, SCREEN.x + SCREEN.width - x);
  const h = Math.min(rect.height + pad * 2, SCREEN.y + SCREEN.height - y);
  const R = `${x},${y},${w},${h}`;
  try {
    execFileSync('/usr/sbin/screencapture', ['-x', '-R', R, path.join(OUT, `${name}.png`)]);
  } catch (err) {
    // A failed frame must not abort the behavioural checks — they are the point.
    console.log(`  [shot ${name} FAILED] rect=${R} screen=${JSON.stringify(SCREEN)} :: ${String(err.stderr).trim()}`);
    return null;
  }
  return path.join(OUT, `${name}.png`);
}

const childEval = (fn) => app.evaluate(async ({ BrowserWindow }, src) => {
  const child = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
  if (!child) return { __missing: true };
  return child.webContents.executeJavaScript(src);
}, fn);

async function scrollTo(px) {
  await app.evaluate(async ({ webContents }, y) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.'));
    await wc.executeJavaScript(`window.scrollTo(0, ${y});`);
  }, px);
  await sleep(900);
}

// ---- 0. the child window exists and is a real NSWindow child --------------
const topology = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const child = all.find((w) => w.getParentWindow());
  return {
    count: all.length,
    hasChild: !!child,
    childBounds: child ? child.getBounds() : null,
    parentId: child ? child.getParentWindow().id : null,
  };
});
record('child window created & parented', topology.hasChild && topology.parentId != null,
  JSON.stringify(topology));

await shot('01-initial');

// ---- 1. page scrolling still changes the glass ----------------------------
const samples = [];
for (const y of [0, 70]) {
  await scrollTo(y);
  samples.push(await shot(`02-scroll-${y}`));
}

// ---- 2. child text sharp / 3. clicks / keyboard ---------------------------
const before = await childEval('window.__probe()');

// Click the hit target: it sits just right of the address input.
const childRect = topology.childBounds;
await app.evaluate(({ BrowserWindow }) => {
  const child = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
  child.focus();
});
await sleep(400);
await childEval("document.getElementById('hit').click(); null");
await sleep(300);
await childEval("document.getElementById('domain').focus(); null");
await sleep(300);
const afterFocus = await childEval('window.__probe()');
record('child DOM interactive (synthetic click + focus)',
  afterFocus.clicks === before.clicks + 1 && afterFocus.focused === 'domain',
  JSON.stringify(afterFocus));

// Real OS-level keystrokes into the focused child input.
await app.evaluate(({ BrowserWindow }) => {
  const child = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
  child.webContents.focus();
  for (const ch of 'XY') {
    child.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  }
});
await sleep(600);
const afterType = await childEval('window.__probe()');
record('keyboard reaches child window',
  afterType.domainValue !== before.domainValue,
  `"${before.domainValue}" -> "${afterType.domainValue}"`);
await shot('03-after-interaction');

// ---- 4. parent move / resize ---------------------------------------------
WIN = { ...WIN, x: 200, y: 300 };
await app.evaluate(({ BrowserWindow }, b) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setBounds(b);
}, WIN);
await sleep(1200);
let geo = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const child = all.find((w) => w.getParentWindow());
  return { parent: parent.getContentBounds(), child: child.getBounds() };
});
let expectedX = geo.parent.x + Math.round((geo.parent.width - 430) / 2);
record('child follows parent MOVE',
  Math.abs(geo.child.x - expectedX) <= 2 && Math.abs(geo.child.y - (geo.parent.y + 12)) <= 2,
  `child=${geo.child.x},${geo.child.y} expected≈${expectedX},${geo.parent.y + 12}`);
await shot('04-after-move');

WIN = { ...WIN, width: 1150, height: 700 };
await app.evaluate(({ BrowserWindow }, b) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setBounds(b);
}, WIN);
await sleep(1200);
geo = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const child = all.find((w) => w.getParentWindow());
  return { parent: parent.getContentBounds(), child: child.getBounds() };
});
expectedX = geo.parent.x + Math.round((geo.parent.width - 430) / 2);
record('child re-centres on parent RESIZE',
  Math.abs(geo.child.x - expectedX) <= 2,
  `child.x=${geo.child.x} expected≈${expectedX}`);
await shot('05-after-resize');

// ---- 6. child must not float above unrelated apps -------------------------
// Activate Finder, then look at whether Blanc's child is still painted on top.
execFileSync('/usr/bin/osascript', ['-e', 'tell application "Finder" to activate']);
await sleep(1800);
const occluded = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const child = all.find((w) => w.getParentWindow());
  return { childVisible: child.isVisible(), appFocused: all.some((w) => w.isFocused()) };
});
await shot('06-other-app-active', { x: 0, y: 0, width: 1512, height: 950 }, 0);
record('app deactivates cleanly (child not always-on-top)',
  occluded.appFocused === false,
  JSON.stringify(occluded));

// Refocus Blanc. System Events needs Accessibility permission, which may not be
// granted — fall back to Electron's own activation rather than aborting.
try {
  execFileSync('/usr/bin/osascript', ['-e',
    'tell application "System Events" to set frontmost of (first process whose unix id is ' +
    (await app.evaluate(() => process.pid)) + ') to true']);
} catch {
  await app.evaluate(({ app: a, BrowserWindow }) => {
    a.focus({ steal: true });
    BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).focus();
  });
}
await sleep(1500);
record('app refocuses with child intact',
  (await app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    return all.find((w) => w.getParentWindow())?.isVisible() === true;
  })), 'child still visible after app reactivation');
await shot('07-refocused');

// ---- 5. fullscreen --------------------------------------------------------
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(true);
});
await sleep(3000);
const fsGeo = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const child = all.find((w) => w.getParentWindow());
  return {
    fullScreen: parent.isFullScreen(),
    parent: parent.getContentBounds(),
    child: child.getBounds(),
    childVisible: child.isVisible(),
  };
});
await shot('08-fullscreen', { x: 0, y: 0, width: 1512, height: 950 }, 0);
const fsExpectedX = fsGeo.parent.x + Math.round((fsGeo.parent.width - 430) / 2);
record('fullscreen keeps child aligned & visible',
  fsGeo.fullScreen && fsGeo.childVisible && Math.abs(fsGeo.child.x - fsExpectedX) <= 2,
  JSON.stringify(fsGeo));

await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(false);
});
await sleep(2500);
const restored = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const child = all.find((w) => w.getParentWindow());
  return { fullScreen: parent.isFullScreen(), child: child.getBounds(), parent: parent.getContentBounds() };
});
record('leaves fullscreen without losing the child',
  !restored.fullScreen &&
    Math.abs(restored.child.x - (restored.parent.x + Math.round((restored.parent.width - 430) / 2))) <= 2,
  JSON.stringify(restored));

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\n=== ' + results.filter((r) => r.pass).length + '/' + results.length + ' passed ===');
await app.close();
server.close();
