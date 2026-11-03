#!/usr/bin/env node
// The iPhone Duo screenshots: the same six shots as the iPhone set, each
// taking its headline, subtitle, colors and sky from the matching artboard in
// docs/ios/app-store/design/project/ (so a caption changed on the canvas
// changes here too), framed around the Duo captures in
// docs/ios/app-store/captures/duo-closed/ (outer display, 1398 x 2034) and
// duo-open/ (inner display, landscape, 2853 x 2007). A shot with no capture
// for a display is left out of that set. Writes docs/ios/app-store/duo-closed/
// and duo-open/.
//
//   node scripts/ios-app-store-compose-duo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const design = path.join(root, 'docs/ios/app-store/design/project');
const canvas = JSON.parse(fs.readFileSync(path.join(design, 'canvas.json'), 'utf8'));
const fonts = path.join(root, 'site/public/fonts/blubird');
const font = (f) => pathToFileURL(path.join(fonts, f)).href;
for (const f of ['Blubird-RegularDisplay.woff2', 'Blubird-RegularText.woff2']) {
  if (!fs.existsSync(path.join(fonts, f))) throw new Error(`${f} is missing (npm run site:fonts -- /path/to/Blubird.zip)`);
}
const sunrise = pathToFileURL(path.join(root, 'site/public/lockup/sunrise-mark-2048.webp')).href;
const captures = ['1-start', '2-devices', '3-spaces', '4-commands', '5-grid', '6-private'];

// What an artboard says and how it's colored, read from its markup.
function read(board) {
  const src = fs.readFileSync(path.join(design, board), 'utf8');
  const pick = (re) => (src.match(re) || [])[1];
  return {
    sky: pick(/<div style="position: relative; width: 1320px;[^"]*?background: (.*?); font-family/),
    title: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/),
    titleColor: pick(/<h1 style="[^"]*?color: (#[0-9A-Fa-f]{6})/),
    sub: pick(/<p style="[^"]*">([\s\S]*?)<\/p>/),
    subColor: pick(/<p style="[^"]*?color: (#[0-9A-Fa-f]{6})/),
    mark: src.includes('745cf8f66e1c585df02334091a43e067'),
  };
}

function page(a, shot, open) {
  const [W, H] = open ? [2853, 2007] : [1398, 2034];
  const head = `<!doctype html><meta charset=utf-8><style>
    @font-face{font-family:BD;src:url(${font('Blubird-RegularDisplay.woff2')})}
    @font-face{font-family:BT;src:url(${font('Blubird-RegularText.woff2')})}
    *{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;overflow:hidden}
    body{position:relative;background:${a.sky};font-family:BT;-webkit-font-smoothing:antialiased}
    h1{font-family:BD;font-weight:400;letter-spacing:0;line-height:1.02;color:${a.titleColor};text-wrap:balance}
    p{line-height:1.32;color:${a.subColor};text-wrap:pretty}
    .frame{position:absolute;background:linear-gradient(145deg,#4a4743 0%,#1a1917 42%,#2e2c29 100%);
      box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),0 60px 140px rgba(40,25,6,.34)}
    .frame img{display:block;width:100%;height:100%;object-fit:cover}
  </style>`;
  const img = pathToFileURL(shot).href;
  if (open) {
    // Inner display, landscape: the words on the left, the unfolded Duo right.
    const sw = 1620, sh = Math.round(sw * 2007 / 2853), pad = 28;
    return `${head}<div style="position:absolute;left:150px;top:${a.mark ? 150 : 260}px;width:860px;display:flex;flex-direction:column;gap:44px">
      ${a.mark ? `<img src="${sunrise}" style="width:240px;height:240px;margin-bottom:10px">` : ''}
      <h1 style="font-size:116px">${a.title}</h1><p style="font-size:46px">${a.sub}</p></div>
      <div class="frame" style="left:${W - sw - 2 * pad - 110}px;top:${(H - sh) / 2 - pad}px;width:${sw + 2 * pad}px;height:${sh + 2 * pad}px;padding:${pad}px;border-radius:110px">
      <div style="width:100%;height:100%;border-radius:80px;overflow:hidden"><img src="${img}"></div></div>`;
  }
  // Outer display, portrait: like the iPhone set.
  const sw = 900, sh = Math.round(sw * 2034 / 1398), pad = 24;
  return `${head}<div style="position:absolute;left:90px;right:90px;top:150px;display:flex;flex-direction:column;align-items:center;gap:30px;text-align:center">
    <h1 style="font-size:100px">${a.title}</h1><p style="font-size:42px;max-width:1120px">${a.sub}</p></div>
    <div class="frame" style="left:${(W - sw) / 2 - pad}px;top:${H - sh - 2 * pad - 70}px;width:${sw + 2 * pad}px;height:${sh + 2 * pad}px;padding:${pad}px;border-radius:96px">
    <div style="width:100%;height:100%;border-radius:74px;overflow:hidden"><img src="${img}"></div></div>`;
}

const browser = await chromium.launch();
const work = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'blanc-duo-'));
for (const open of [false, true]) {
  const kind = open ? 'duo-open' : 'duo-closed';
  const [W, H] = open ? [2853, 2007] : [1398, 2034];
  const tab = await browser.newPage({ viewport: { width: W, height: H } });
  const outDir = path.join(root, 'docs/ios/app-store', kind);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [i, board] of canvas.order.entries()) {
    const shot = path.join(root, 'docs/ios/app-store/captures', kind, `${captures[i]}.png`);
    if (!fs.existsSync(shot)) continue;
    const a = read(board);
    if (!a.sky || !a.title || !a.sub) throw new Error(`can't read the caption or sky of ${board}`);
    const html = path.join(work, `${kind}-${i}.html`);
    fs.writeFileSync(html, page(a, shot, open));
    await tab.goto(pathToFileURL(html).href);
    await tab.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((im) => im.decode())); });
    const slug = (canvas.boards[board].title || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = path.join(outDir, `${i + 1}-${slug}.png`);
    await tab.screenshot({ path: file });
    execFileSync('magick', [file, '-background', '#F8F2E8', '-alpha', 'remove', '-alpha', 'off', file]);
    console.log(`${kind}/${path.basename(file)}`);
  }
  await tab.close();
}
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
