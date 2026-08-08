// PHASE TWO — vertical slice through Blanc's REAL island, split across windows.
// Everything here drives the shipping IPC/preload path (__blanc test hook →
// main → chrome renderers), not a mock.
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

const server = createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<title>Fixture</title><body style="margin:0;height:400vh;background:repeating-linear-gradient(
    180deg,#ff0040 0 70px,#ffd400 70px 140px,#00e5ff 140px 210px,#0d00ff 210px 280px)"></body>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/`;

const app = await _electron.launch({
  args: ['/Users/anthonyjloria/Projects/Blanc Browser',
         `--user-data-dir=${fs.mkdtempSync('/tmp/blanc-p2-')}`],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '1' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.getParentWindow());
  w.setBounds({ x: 260, y: 180, width: 1000, height: 660 });
  w.show(); w.focus();
});
await sleep(2500);

// ---- window topology -----------------------------------------------------
const win = (role) => app.evaluate(({ BrowserWindow }, r) => {
  const all = BrowserWindow.getAllWindows();
  const parent = all.find((w) => !w.getParentWindow());
  const kids = all.filter((w) => w.getParentWindow());
  const byUrl = (frag) => kids.find((w) => w.webContents.getURL().includes(frag));
  const w = r === 'parent' ? parent : r === 'island' ? byUrl('index.html') : byUrl('overlay.html');
  if (!w) return null;
  return {
    id: w.id, bounds: w.getBounds(), visible: w.isVisible(), focused: w.isFocused(),
    url: w.webContents.getURL().split('/').pop(),
  };
}, role);

const evalIn = (role, src) => app.evaluate(async ({ BrowserWindow }, p) => {
  const all = BrowserWindow.getAllWindows();
  const kids = all.filter((w) => w.getParentWindow());
  const w = p.role === 'island'
    ? kids.find((x) => x.webContents.getURL().includes('index.html'))
    : kids.find((x) => x.webContents.getURL().includes('overlay.html'));
  if (!w) return { __missing: true };
  return w.webContents.executeJavaScript(p.src);
}, { role, src });

const glassFrame = () => app.evaluate(({ BrowserWindow }) => {
  const parent = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow());
  const tree = globalThis.__glass?.describe(parent) || [];
  const line = tree.find((l) => l.startsWith('NSGlassEffectView'));
  const m = line && line.match(/frame=\{\{([-\d.]+), ([-\d.]+)\}, \{([-\d.]+), ([-\d.]+)\}\}/);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
});

const t = await Promise.all([win('parent'), win('island'), win('overlay')]);
rec('three windows: parent + island(index.html) + overlay(overlay.html)',
  !!t[0] && t[1]?.url === 'index.html' && t[2]?.url === 'overlay.html',
  JSON.stringify(t.map((x) => x && { url: x.url, visible: x.visible })));

// ---- 1. resting pill renders the REAL island -----------------------------
const pill = await evalIn('island', `(() => {
  const p = document.getElementById('islandPill');
  const r = p.getBoundingClientRect();
  return { exists: !!p, w: Math.round(r.width), h: Math.round(r.height),
           domain: document.getElementById('pillDomain')?.textContent?.trim() || null,
           glass: document.documentElement.getAttribute('data-glass') };
})()`);
rec('resting pill is the real #islandPill, glass-scoped',
  pill.exists && pill.w > 0 && pill.glass === 'on', JSON.stringify(pill));

const restGlass = await glassFrame();
rec('native glass tracks the resting pill width',
  !!restGlass && Math.abs(restGlass.w - pill.w) <= 3,
  `glass.w=${restGlass?.w} pill.w=${pill.w}`);

// ---- 2. ⌘L opens the palette, glass follows the panel ---------------------
await app.evaluate(() => globalThis.__blanc.openPalette());
await sleep(1200);
const ov = await win('overlay');
const panel = await evalIn('overlay', `(() => {
  const el = document.querySelector('#islandPanel');
  const r = el.getBoundingClientRect();
  return { mode: document.body.dataset.mode, w: Math.round(r.width), h: Math.round(r.height),
           scrimShown: !document.getElementById('backdrop').hidden,
           focused: document.activeElement?.id };
})()`);
rec('⌘L palette: overlay window shown, panel rendered, address focused',
  ov.visible && panel.mode === 'palette' && panel.w > 0 && panel.focused === 'addressInput',
  JSON.stringify(panel));

const panelGlass = await glassFrame();
rec('native glass grew to the expanded panel',
  !!panelGlass && Math.abs(panelGlass.w - panel.w) <= 3 && panelGlass.w > restGlass.w,
  `glass=${panelGlass?.w}x${panelGlass?.h} panel=${panel.w}x${panel.h}`);

rec('palette scrim needs (and gets) a full-window child surface',
  panel.scrimShown && ov.bounds.width >= 990,
  `scrim=${panel.scrimShown} overlayWindow.w=${ov.bounds.width}`);

// ---- 3. typing + navigation through the real path ------------------------
await evalIn('overlay', `(() => {
  const i = document.getElementById('addressInput');
  i.focus(); i.value = ${JSON.stringify(PAGE)};
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
})()`);
await sleep(3200);
const nav = await app.evaluate(() => {
  const s = globalThis.__blanc.state();
  return { url: s.tabs.find((x) => x.id === s.activeTabId)?.url, overlay: globalThis.__blanc.overlayMode() };
});
rec('typed address navigated the real tab and dismissed the overlay',
  (nav.url || '').startsWith('http://127.') && !nav.overlay, JSON.stringify(nav));

const afterNavGlass = await glassFrame();
const pillNow = await evalIn('island',
  "Math.round(document.getElementById('islandPill').getBoundingClientRect().width)");
rec('glass returned to tight resting-pill bounds after dismissal',
  !!afterNavGlass && Math.abs(afterNavGlass.w - pillNow) <= 3 && afterNavGlass.w < 620,
  `glass.w=${afterNavGlass?.w} livePill=${pillNow} (was ${restGlass.w} showing "new tab")`);

// ---- 4. Escape dismissal -------------------------------------------------
await app.evaluate(() => globalThis.__blanc.openPalette());
await sleep(900);
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('overlay.html'));
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
});
await sleep(900);
rec('Escape dismisses across the window boundary',
  (await app.evaluate(() => globalThis.__blanc.overlayMode())) === null
    && !(await win('overlay')).visible,
  'overlayMode=null, overlay window hidden');

// ---- 5. blur dismissal ---------------------------------------------------
await app.evaluate(() => globalThis.__blanc.openPalette());
await sleep(900);
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).focus();
});
await sleep(1200);
rec('parent focus blurs the overlay window and dismisses',
  (await app.evaluate(() => globalThis.__blanc.overlayMode())) === null,
  'overlayMode after parent focus');

// ---- 6. focus reclaim on a blank new tab ---------------------------------
await app.evaluate(({ Menu }) => {
  // The production path: the menu item passes focusAddress:true, which the
  // test hook's newTab() does not. Only this exercises the reclaim.
  const find = (items) => {
    for (const it of items) {
      if (it.label === 'New Tab') return it;
      if (it.submenu) { const hit = find(it.submenu.items); if (hit) return hit; }
    }
    return null;
  };
  find(Menu.getApplicationMenu().items).click();
});
await sleep(2200);
const reclaim = await app.evaluate(() => ({
  overlay: globalThis.__blanc.overlayMode(),
  url: globalThis.__blanc.state().tabs.find((t) => t.id === globalThis.__blanc.state().activeTabId)?.url,
}));
const reclaimFocus = reclaim.overlay ? await evalIn('overlay', "document.activeElement?.id") : null;
rec('blank new tab reclaims address-bar focus into the child window',
  reclaim.overlay === 'panel' && reclaimFocus === 'addressInput',
  `mode=${reclaim.overlay} focus=${reclaimFocus} url=${reclaim.url}`);
await app.evaluate(() => globalThis.__blanc.closeOverlay());
await sleep(600);

// ---- 7. parent lifecycle -------------------------------------------------
async function lifecycle(label, fn, settle = 1600) {
  await app.evaluate(fn);
  await sleep(settle);
  const [p, i] = await Promise.all([win('parent'), win('island')]);
  const expectedX = p.bounds.x + Math.round((p.bounds.width - i.bounds.width) / 2);
  const aligned = Math.abs(i.bounds.x - expectedX) <= 3 || i.bounds.width >= p.bounds.width - 4;
  rec(`lifecycle: ${label}`, i.visible && aligned,
    `parent=${p.bounds.x},${p.bounds.y} ${p.bounds.width}x${p.bounds.height} island=${i.bounds.x},${i.bounds.y} ${i.bounds.width}x${i.bounds.height}`);
}
await lifecycle('move', ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setBounds({ x: 120, y: 260, width: 1000, height: 660 });
});
await lifecycle('resize', ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setBounds({ x: 120, y: 260, width: 1240, height: 700 });
});
await lifecycle('native fullscreen', ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(true);
}, 3400);
await lifecycle('leave fullscreen', ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).setFullScreen(false);
}, 3000);

// minimize / restore
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).minimize();
});
await sleep(1800);
const minned = await win('island');
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows().find((x) => !x.getParentWindow()).restore();
});
await sleep(2200);
const restored = await win('island');
rec('minimize hides the island child; restore brings it back',
  minned.visible === false && restored.visible === true,
  `minimized.visible=${minned.visible} restored.visible=${restored.visible}`);

fs.writeFileSync(process.argv[2] || '/tmp/phase2.json', JSON.stringify(results, null, 2));
console.log(`\n=== ${results.filter((r) => r.pass).length}/${results.length} passed ===`);
await app.close();
server.close();
