#!/usr/bin/env node
// Renders the media kit's Blanc lockup downloads: the Sunrise mark beside the
// outlined "Blanc", in ink (for light grounds) and white (for dark grounds),
// as SVG, a 3000px-wide transparent PNG, and WebP previews.
//
//   node site/scripts/render-press-lockup.mjs           (write)
//   node site/scripts/render-press-lockup.mjs --check   (fail if stale)
//
// The placement is the website footer's Display lockup (.site-lockup--display
// in site/src/styles/revamp.css, the construction in docs/brand-usage.md), and
// both parts are embedded unchanged from assets/sunrise-mark.svg and
// assets/wordmark/. Only the viewBox, the drawn bounds plus a clear space of
// 10% of the height, is measured from a render. librsvg renders slightly
// differently on each platform, so --check keeps the committed viewBox and
// compares everything else, and checks that every raster exists at its size.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
const OUT = path.join(ROOT, 'site/public/press');
const COLORS = ['ink', 'white'];
const PNG_WIDTH = 3000;
const PREVIEW_WIDTHS = [600, 1200];
const check = process.argv.includes('--check');

const markSrc = fs.readFileSync(path.join(ROOT, 'assets/sunrise-mark.svg'), 'utf8');
const markInner = markSrc.slice(markSrc.indexOf('>', markSrc.indexOf('<svg')) + 1, markSrc.lastIndexOf('</svg>'));
const word = (color) => {
  const source = fs.readFileSync(path.join(ROOT, `assets/wordmark/blanc-word-display-${color}.svg`), 'utf8');
  return { viewBox: source.match(/viewBox="([^"]+)"/)[1], path: source.match(/<path[^>]+\/>/)[0] };
};

// The footer lockup is a 155 × 40 box; drawn here at 10 units per pixel.
const css = fs.readFileSync(path.join(ROOT, 'site/src/styles/revamp.css'), 'utf8');
// Reads one rule's declarations by plain string search, e.g. "left: -3.784%".
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`revamp.css has no "${selector}" rule`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const values = Object.fromEntries(body.split(';').map((declaration) => declaration.split(':').map((part) => part.trim())));
  const value = (prop) => Number.parseFloat(values[prop]);
  return { left: value('left'), top: value('top'), width: value('width'), height: value('height') };
};
const box = rule('.site-lockup--display');
const W = box.width * 10, H = box.height * 10;
const markRule = rule('.site-lockup--display .site-lockup-mark');
const wordRule = rule('.site-lockup--display .site-lockup-word');
const mark = { x: markRule.left / 100 * W, y: markRule.top / 100 * H, size: markRule.width / 100 * W };
const wordView = word('ink').viewBox.split(' ').map(Number);
const wordBox = { x: wordRule.left / 100 * W, y: wordRule.top / 100 * H, w: wordRule.width / 100 * W };
wordBox.h = wordBox.w * wordView[3] / wordView[2];

const round = (n) => Number(n.toFixed(3));
const compose = (color, viewBox) => {
  const w = word(color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" width="${viewBox[2]}" height="${viewBox[3]}" role="img" aria-label="Blanc">
<svg x="${round(mark.x)}" y="${round(mark.y)}" width="${round(mark.size)}" height="${round(mark.size)}" viewBox="0 0 1024 1024" fill="none">${markInner}</svg>
<svg x="${round(wordBox.x)}" y="${round(wordBox.y)}" width="${round(wordBox.w)}" height="${round(wordBox.h)}" viewBox="${w.viewBox}">${w.path}</svg>
</svg>\n`;
};

async function measuredViewBox() {
  const pad0 = 200, probe = [-pad0, -pad0, W + 2 * pad0, H + 2 * pad0];
  const { data, info } = await sharp(Buffer.from(compose('ink', probe)), { density: 72 * 4 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = info.width / probe[2];
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const left = probe[0] + x0 / k, top = probe[1] + y0 / k, right = probe[0] + (x1 + 1) / k, bottom = probe[1] + (y1 + 1) / k;
  const pad = 0.1 * (bottom - top);
  return [left - pad, top - pad, right - left + 2 * pad, bottom - top + 2 * pad].map((n) => Math.round(n * 100) / 100);
}

const problems = [];
const rel = (p) => path.relative(ROOT, p);
const files = (color) => ({
  svg: path.join(OUT, `blanc-lockup-${color}.svg`),
  png: path.join(OUT, `blanc-lockup-${color}.png`),
  previews: PREVIEW_WIDTHS.map((width) => [width, path.join(OUT, `blanc-lockup-${color}-${width}.webp`)]),
});

let viewBox;
if (check) {
  const committed = fs.existsSync(files('ink').svg) ? fs.readFileSync(files('ink').svg, 'utf8').match(/viewBox="([^"]+)"/) : null;
  if (!committed) problems.push('site/public/press/blanc-lockup-ink.svg is missing');
  else viewBox = committed[1].split(' ').map(Number);
} else {
  viewBox = await measuredViewBox();
}

const height = (width) => Math.round(width * viewBox[3] / viewBox[2]);
for (const color of viewBox ? COLORS : []) {
  const f = files(color);
  const svg = compose(color, viewBox);
  if (check) {
    if (!fs.existsSync(f.svg) || fs.readFileSync(f.svg, 'utf8') !== svg) problems.push(`${rel(f.svg)} no longer matches the mark, wordmark, or footer construction`);
    for (const [file, width] of [[f.png, PNG_WIDTH], ...f.previews.map(([w, p]) => [p, w])]) {
      if (!fs.existsSync(file)) { problems.push(`${rel(file)} is missing`); continue; }
      const meta = await sharp(file).metadata();
      if (meta.width !== width || Math.abs(meta.height - height(width)) > 1) problems.push(`${rel(file)} is ${meta.width} × ${meta.height}, expected ${width} × ${height(width)}`);
    }
    continue;
  }
  fs.writeFileSync(f.svg, svg);
  const density = (width) => 72 * width / viewBox[2];
  await sharp(Buffer.from(svg), { density: density(PNG_WIDTH) }).resize({ width: PNG_WIDTH }).png({ compressionLevel: 9 }).toFile(f.png);
  for (const [width, file] of f.previews) {
    await sharp(Buffer.from(svg), { density: density(width) * 2 }).resize({ width }).webp({ quality: 90, alphaQuality: 100 }).toFile(file);
  }
  console.log(`wrote ${rel(f.svg)}, ${rel(f.png)} (${PNG_WIDTH} × ${height(PNG_WIDTH)}) and previews`);
}

if (problems.length) {
  console.error(`Press lockup is stale (run node site/scripts/render-press-lockup.mjs):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
if (check) console.log('press lockup up to date');
