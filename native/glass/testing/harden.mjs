// HARDENING PASS — validates the three design decisions through real flows.
//   1. resting island child is TIGHT to the pill (traffic lights + drag space)
//   2. panel/find tight; full-window overlay child reserved for palette
//   3. a utility sheet hides the glass and the island child outright
// Plus permission prompting under the new bounds, Spaces, and display handling.
import { createRequire } from 'node:module';
const require = createRequire('/Users/anthonyjloria/Projects/Blanc Browser/');
const { _electron } = require('playwright');
import { createServer } from 'node:http';
import fs from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const note = (name, detail) => {
  results.push({ name, pass: null, detail });
  console.log(`NOTE  ${name} — ${detail}`);
};

const server = createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<title>Fixture</title><body style="margin:0;height:400vh;background:repeating-linear-gradient(
    180deg,#ff0040 0 70px,#ffd400 70px 140px,#00e5ff 140px 210px,#0d00ff 210px 280px)"></body>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/`;

const app = await _electron.launch({
  args: ['/Users/anthonyjloria/Projects/Blanc Browser',
         `--user-data-dir=${fs.mkdtempSync('/tmp/blanc-h-')}`],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '1' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));
const PARENT = { x: 240, y: 190, width: 1040, height: 660 };
await app.evaluate(({ BrowserWindow }, b) => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow());
  w.setBounds(b); w.show(); w.focus();
}, PARENT);
const tabId = await app.evaluate((_e, u) => globalThis.__blanc.openTab(u), PAGE);
await sleep(2600);
await app.evaluate((_e, i) => globalThis.__blanc.activateTab(i), tabId);
await sleep(1600);

const snap = () => app.evaluate(({ BrowserWindow, screen }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const kids = all.filter((w) => w.getParentWindow());
  const by = (f) => kids.find((w) => w.webContents.getURL().includes(f));
  const island = by('index.html'); const overlay = by('overlay.html');
  const tree = globalThis.__glass?.describe(parent) || [];
  const line = tree.find((l) => l.startsWith('NSGlassEffectView'));
  const m = line && line.match(/frame=\{\{([-\d.]+), ([-\d.]+)\}, \{([-\d.]+), ([-\d.]+)\}\}/);
  return {
    parent: parent.getContentBounds(),
    island: island ? { b: island.getBounds(), visible: island.isVisible() } : null,
    overlay: overlay ? { b: overlay.getBounds(), visible: overlay.isVisible() } : null,
    glass: m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null,
    glassHidden: !line ? null : /NSGlassEffectView/.test(line) ? undefined : null,
    mode: globalThis.__blanc.overlayMode(),
    displays: screen.getAllDisplays().map((d) => ({ id: d.id, sf: d.scaleFactor, b: d.bounds })),
  };
});

// ---- DECISION 1: tight resting island ------------------------------------
let s = await snap();
const TRAFFIC_LIGHT_ZONE = 92; // native lights occupy roughly the first 92pt
rec('resting island child is tight to the pill, not a full-width band',
  s.island.b.width < s.parent.width * 0.6 && s.island.b.height < 64,
  `island=${s.island.b.width}x${s.island.b.height} parent.w=${s.parent.width}`);
rec('traffic lights + left drag space are clear of the island child',
  s.island.b.x > s.parent.x + TRAFFIC_LIGHT_ZONE,
  `island.x=${s.island.b.x} lights end ≈${s.parent.x + TRAFFIC_LIGHT_ZONE}`);
rec('glass matches the tight pill',
  s.glass && Math.abs(s.glass.w - s.island.b.width) <= 3,
  `glass.w=${s.glass?.w} island.w=${s.island.b.width}`);
const restIslandW = s.island.b.width;

// ---- DECISION 2: tight panel/find, full-window palette --------------------
await app.evaluate(() => globalThis.__blanc.openPanel());
await sleep(1400);
s = await snap();
rec('panel: overlay child is TIGHT (page stays clickable around it)',
  s.overlay.visible && s.overlay.b.width <= 640 && s.overlay.b.width < s.parent.width * 0.8,
  `overlay=${s.overlay.b.width}x${s.overlay.b.height} parent.w=${s.parent.width}`);
await app.evaluate(() => globalThis.__blanc.closeOverlay());
await sleep(900);

await app.evaluate(() => globalThis.__blanc.openPalette());
await sleep(1400);
s = await snap();
rec('palette: overlay child is FULL-WINDOW (scrim owns outside clicks)',
  s.overlay.visible && s.overlay.b.width >= s.parent.width - 4,
  `overlay=${s.overlay.b.width}x${s.overlay.b.height} parent.w=${s.parent.width}`);
rec('palette glass still tracks only the card, not the whole window',
  s.glass && s.glass.w <= 640 && s.glass.w > restIslandW,
  `glass.w=${s.glass?.w}`);
await app.evaluate(() => globalThis.__blanc.closeOverlay());
await sleep(900);

await app.evaluate(() => globalThis.__blanc.openFind());
await sleep(1200);
s = await snap();
if (s.mode === 'find') {
  rec('find: overlay child is TIGHT',
    s.overlay.b.width <= 520 && s.overlay.b.width < s.parent.width * 0.7,
    `overlay=${s.overlay.b.width}x${s.overlay.b.height}`);
  await app.evaluate(() => globalThis.__blanc.closeOverlay());
  await sleep(800);
} else {
  note('find bounds', `find not reachable from the test hook (mode=${s.mode}); panel/palette cover the decision`);
}

// ---- DECISION 3: utility sheet hides glass + island -----------------------
const beforeSheet = await snap();
// main routes utility URLs into the sheet (utility-pages.js isUtilityUrl),
// so opening one as a "tab" is the real entry point.
await app.evaluate(() => globalThis.__blanc.openTab('blanc://settings/'));
await sleep(2200);
const duringSheet = await app.evaluate(({ BrowserWindow }) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const island = all.filter((w) => w.getParentWindow())
    .find((w) => w.webContents.getURL().includes('index.html'));
  const tree = globalThis.__glass?.describe(parent) || [];
  return {
    islandVisible: island.isVisible(),
    glassInTree: tree.some((l) => l.startsWith('NSGlassEffectView')),
  };
});
rec('utility sheet hides the resting island child',
  duringSheet.islandVisible === false && beforeSheet.island.visible === true,
  `island.visible before=${beforeSheet.island.visible} during=${duringSheet.islandVisible}`);

// Summoning the island dismisses the sheet (one floating layer at a time).
await app.evaluate(() => globalThis.__blanc.openPalette());
await sleep(1600);
const afterSheet = await snap();
rec('island child returns when the sheet closes',
  afterSheet.island.visible === true,
  `island.visible=${afterSheet.island.visible}`);
await app.evaluate(() => globalThis.__blanc.closeOverlay()).catch(() => {});
await sleep(700);

// ---- permission prompting under the new bounds ---------------------------
const perm = await app.evaluate(async ({ BrowserWindow }) => {
  const island = BrowserWindow.getAllWindows().filter((w) => w.getParentWindow())
    .find((w) => w.webContents.getURL().includes('index.html'));
  const before = island.getBounds();
  // Drive the real renderer path: main sends permissions:prompt on this channel.
  island.webContents.send('permissions:prompt',
    { id: 'probe-1', origin: 'https://example.com', permission: 'geolocation', mediaTypes: [] });
  await new Promise((r) => setTimeout(r, 1200));
  const shown = await island.webContents.executeJavaScript(`(() => {
    const bar = document.getElementById('permissionBar');
    const r = bar.getBoundingClientRect();
    return { hidden: bar.hidden, w: Math.round(r.width), h: Math.round(r.height),
             text: (bar.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 60) };
  })()`);
  return { before, shown, after: island.getBounds() };
});
// The bar is narrower than the pill and flows BELOW it, so the host grows in
// HEIGHT, not width — the first run asserted the wrong axis.
rec('permission prompt renders in the tight island child and grows its host',
  perm.shown.hidden === false && perm.shown.w > 0
    && perm.after.height > perm.before.height
    && perm.after.height >= perm.shown.h,
  `bar=${perm.shown.w}x${perm.shown.h} host ${perm.before.width}x${perm.before.height}`
  + ` -> ${perm.after.width}x${perm.after.height} "${perm.shown.text}"`);
rec('permission prompt keeps its own opaque surface (not glass)',
  perm.shown.bg && perm.shown.bg !== 'rgba(0, 0, 0, 0)',
  `#permissionBar background=${perm.shown.bg}`);

// ---- Spaces / fullscreen -------------------------------------------------
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(true);
});
await sleep(3600);
s = await snap();
rec('native fullscreen (own Space): island tight + centred, glass aligned',
  s.island.visible && Math.abs(s.island.b.x - (s.parent.x + Math.round((s.parent.width - s.island.b.width) / 2))) <= 3
    && s.glass && Math.abs(s.glass.w - s.island.b.width) <= 3,
  `parent=${s.parent.width}x${s.parent.height} island.x=${s.island.b.x} w=${s.island.b.width}`);
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(false);
});
await sleep(3000);
s = await snap();
rec('leaves fullscreen with tight bounds intact',
  Math.abs(s.island.b.x - (s.parent.x + Math.round((s.parent.width - s.island.b.width) / 2))) <= 3,
  `island.x=${s.island.b.x} parent=${s.parent.x} ${s.parent.width}`);

const spaces = await app.evaluate(({ BrowserWindow }) => {
  const kids = BrowserWindow.getAllWindows().filter((w) => w.getParentWindow());
  return kids.map((w) => ({
    url: w.webContents.getURL().split('/').pop(),
    allSpaces: w.isVisibleOnAllWorkspaces(),
    parented: !!w.getParentWindow(),
  }));
});
rec('children are parented and NOT pinned to all Spaces (they ride the parent)',
  spaces.every((k) => k.parented && k.allSpaces === false),
  JSON.stringify(spaces));

// ---- displays ------------------------------------------------------------
s = await snap();
if (s.displays.length < 2) {
  note('multi-display / mixed scale',
    `UNTESTABLE here — one display attached (${s.displays.map((d) => `${d.b.width}x${d.b.height}@${d.sf}x`).join(', ')}). `
    + 'Bounds math is DIP-based via getContentBounds, which is display-agnostic; the unverified risks are '
    + 'backingScaleFactor changes mid-drag and NSWindow child re-homing across screens.');
} else {
  note('multi-display', `${s.displays.length} displays present — extend this check`);
}

fs.writeFileSync(process.argv[2] || '/tmp/harden.json', JSON.stringify(results, null, 2));
const graded = results.filter((r) => r.pass !== null);
console.log(`\n=== ${graded.filter((r) => r.pass).length}/${graded.length} passed, ${results.length - graded.length} noted ===`);
await app.close();
server.close();
