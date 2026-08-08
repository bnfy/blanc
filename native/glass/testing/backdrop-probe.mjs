// Can CSS backdrop-filter in the overlay WebContentsView sample the tab's
// WebContentsView beneath it?
//
// The overlay is the only chrome surface that genuinely overlaps page content
// (the strip does not — pageBounds.y = stripHeight), so it is the correct place
// to ask. Two probes render side by side in the SAME overlay document:
//
//   A  cross-boundary — over a transparent region of the overlay, with the
//      page's saturated gradient directly beneath it in the tab view.
//   B  positive control — the identical filter over a gradient that lives
//      INSIDE the overlay document.
//
// If B shows the effect and A does not, backdrop-filter is confined to its own
// renderer's layer tree. If neither shows it, the probe itself is broken and
// proves nothing — which is exactly what the control is there to catch.
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

// Bold horizontal bands: a blur across them is obvious, an invert unmistakable.
const html = `<body style="margin:0;height:200vh;background:repeating-linear-gradient(
  180deg,#ff0040 0 60px,#ffd400 60px 120px,#00e5ff 120px 180px,#0d00ff 180px 240px)"></body>`;
const server = createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = fs.mkdtempSync('/tmp/blanc-probe-');
const app = await _electron.launch({
  args: [REPO, `--user-data-dir=${userDataDir}`],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '0' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));

const W = 900, H = 620, PAD = 40;
const WIN = { x: 260, y: 180, width: W, height: H };
await app.evaluate(({ BrowserWindow }, b) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setBounds(b); w.show(); w.focus();
}, WIN);

const tabId = await app.evaluate((_e, u) => globalThis.__blanc.openTab(u), PAGE);
await sleep(2500);
await app.evaluate((_e, id) => globalThis.__blanc.activateTab(id), tabId);
await sleep(1200);
const st = await app.evaluate(() => {
  const s = globalThis.__blanc.state();
  return { active: s.activeTabId, tabs: s.tabs.map((t) => `${t.id}:${t.url.slice(0, 40)}`) };
});
console.log('tab state:', JSON.stringify(st));

await app.evaluate(() => globalThis.__blanc.openPanel());
await sleep(1200);

// Inject both probes into the overlay renderer.
const injected = await app.evaluate(async ({ webContents }) => {
  const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('overlay.html'));
  if (!wc) return 'NO OVERLAY WEBCONTENTS';
  return wc.executeJavaScript(`(() => {
    // Clear the overlay's own chrome out of the probe area so nothing in this
    // document sits behind probe A. Whatever A picks up must cross the boundary.
    const bd = document.querySelector('#backdrop'); if (bd) bd.style.display = 'none';
    for (const el of document.querySelectorAll('body > *')) el.style.visibility = 'hidden';

    const FILTER = 'invert(1) blur(6px)';
    const host = document.createElement('div');
    host.id = '__probe';
    host.style.cssText = 'position:fixed;inset:0;z-index:999999;visibility:visible;font:600 13px system-ui';

    // A — cross-boundary. Transparent overlay here; the tab view is beneath.
    host.innerHTML = \`
      <div style="position:absolute;left:40px;top:150px;width:340px;height:220px;
                  outline:3px solid #000;visibility:visible">
        <div style="position:absolute;inset:0;backdrop-filter:\${FILTER};
                    -webkit-backdrop-filter:\${FILTER}"></div>
        <div style="position:absolute;bottom:-24px;left:0;color:#000;background:#fff;padding:2px 6px">
          A — cross-boundary (page beneath)</div>
      </div>

      <!-- B — positive control. Same filter, over a gradient in THIS document. -->
      <div style="position:absolute;left:440px;top:150px;width:340px;height:220px;
                  outline:3px solid #000;visibility:visible;
                  background:repeating-linear-gradient(180deg,#ff0040 0 60px,#ffd400 60px 120px,
                             #00e5ff 120px 180px,#0d00ff 180px 240px)">
        <div style="position:absolute;inset:0;backdrop-filter:\${FILTER};
                    -webkit-backdrop-filter:\${FILTER}"></div>
        <div style="position:absolute;bottom:-24px;left:0;color:#000;background:#fff;padding:2px 6px">
          B — control (gradient in overlay doc)</div>
      </div>\`;
    document.body.appendChild(host);
    return CSS.supports('backdrop-filter', 'invert(1)') ? 'supported' : 'UNSUPPORTED';
  })()`);
});
console.log('backdrop-filter support in overlay renderer:', injected);
await sleep(1500);

execFileSync('/usr/sbin/screencapture', ['-x', '-R',
  `${WIN.x - PAD},${WIN.y - PAD},${W + PAD * 2},${H + PAD * 2}`,
  path.join(OUT, 'boundary-probe.png')]);
console.log('captured -> ', OUT);

await app.close();
server.close();
