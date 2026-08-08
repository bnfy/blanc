// Does NSGlassEffectView sample the Chromium-composited page in the NSView
// beneath it, or only the window background?
//
// The page is bold horizontal bands. If the glass samples it, the pill's
// interior tracks the bands and CHANGES when the page scrolls — with the window
// stationary and the desktop untouched, so nothing else can explain the delta.
// Scroll position is the independent variable; window position is not.
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

const html = `<body style="margin:0;height:400vh;background:repeating-linear-gradient(
  180deg,#ff0040 0 70px,#ffd400 70px 140px,#00e5ff 140px 210px,#0d00ff 210px 280px)"></body>`;
const server = createServer((_q, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = fs.mkdtempSync('/tmp/blanc-native-');
const app = await _electron.launch({
  args: [REPO, `--user-data-dir=${userDataDir}`],
  env: { ...process.env, BLANC_TEST: '1', BLANC_GLASS: '1' },
});
await app.evaluate(() => new Promise((r) => {
  const t = setInterval(() => { if (globalThis.__blanc) { clearInterval(t); r(); } }, 50);
}));

const W = 900, H = 600, PAD = 30;
const WIN = { x: 280, y: 200, width: W, height: H };
await app.evaluate(({ BrowserWindow }, b) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setBounds(b); w.show(); w.focus();
}, WIN);

const tabId = await app.evaluate((_e, u) => globalThis.__blanc.openTab(u), PAGE);
await sleep(2600);
await app.evaluate((_e, id) => globalThis.__blanc.activateTab(id), tabId);
await sleep(1400);

async function shot(name) {
  await sleep(600);
  execFileSync('/usr/sbin/screencapture', ['-x', '-R',
    `${WIN.x - PAD},${WIN.y - PAD},${W + PAD * 2},${H + PAD * 2}`,
    path.join(OUT, `${name}.png`)]);
  console.log('captured', name);
}

async function scrollTo(px) {
  await app.evaluate(async ({ webContents }, y) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('http://127.'));
    await wc.executeJavaScript(`window.scrollTo(0, ${y}); document.title='y'+window.scrollY;`);
  }, px);
  await sleep(900);
}

// Same window position, same desktop, only the page moves underneath.
for (const y of [0, 35, 70, 105]) {
  await scrollTo(y);
  await shot(`scroll-${String(y).padStart(3, '0')}`);
}

console.log('done ->', OUT);
await app.close();
server.close();
