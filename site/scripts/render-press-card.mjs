#!/usr/bin/env node
// Renders the press card (/press/blanc-press-card.png, the Media page's social
// preview) from the native expanded-island capture in the media kit. Re-run it
// after replacing that capture or changing the Blanc mark:
//   node site/scripts/render-press-card.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE = path.join(SITE_ROOT, 'public/press/blanc-island-expanded-v1.31.0.png');
const OUTPUT = path.join(SITE_ROOT, 'public/press/blanc-press-card.png');

function dataUrl(file, mimeType) {
  return `data:${mimeType};base64,${fs.readFileSync(file).toString('base64')}`;
}

/* The press card is an evergreen social-preview asset. Release-specific facts
   stay on the Media page and changelog rather than being burned into a PNG.
   The frame crops the capture to the expanded island and the painting under
   it: the site's logo stays out of frame, so another website's brand never
   becomes the story on every share. Crop in capture pixels (2560 × 1600). */
const CROP = { x: 470, y: 0, width: 1560 };
const FRAME = { width: 1420, height: 1020 };
const scale = FRAME.width / CROP.width;
// The crop is authored against a 2560 × 1600 capture; a recapture at another
// size would move it (possibly onto the site's logo), so refuse instead.
const header = fs.readFileSync(CAPTURE);
const CAPTURE_SIZE = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
if (CAPTURE_SIZE.width !== 2560 || CAPTURE_SIZE.height !== 1600) {
  throw new Error(`Expected a 2560 × 1600 capture, got ${CAPTURE_SIZE.width} × ${CAPTURE_SIZE.height}. Re-author CROP for the new capture.`);
}

const productCapture = dataUrl(CAPTURE, 'image/png');
const brandMark = dataUrl(path.join(SITE_ROOT, 'public/favicon.svg'), 'image/svg+xml');
const inter = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'font/woff2');
const newsreader = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'), 'font/woff2');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1260 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          @font-face { font-family: Inter; src: url('${inter}') format('woff2'); font-weight: 100 900; }
          @font-face { font-family: Newsreader; src: url('${newsreader}') format('woff2-variations'); font-weight: 200 800; }
          * { box-sizing: border-box; }
          html, body { width: 2400px; height: 1260px; margin: 0; overflow: hidden; background: #f7f0e5; }
          body { color: #0e0e0e; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
          .card { position: relative; width: 100%; height: 100%; }
          .brand { position: absolute; top: 84px; left: 104px; display: flex; align-items: center; gap: 24px; color: #6b6257; font: 500 26px/1 Inter, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
          .brand img { width: 52px; height: 52px; object-fit: contain; }
          h1 { position: absolute; top: 246px; left: 94px; width: 720px; margin: 0; font-family: Newsreader, serif; font-size: 122px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; font-optical-sizing: auto; }
          .meta { position: absolute; left: 100px; bottom: 96px; color: #6b6257; font: 500 26px/1 Inter, sans-serif; letter-spacing: 0.04em; }
          .frame { position: absolute; top: 120px; right: 86px; width: ${FRAME.width}px; height: ${FRAME.height}px; overflow: hidden; border-radius: 26px; background: #fff; box-shadow: 0 0 0 1px rgba(18, 16, 11, 0.12), 0 30px 80px rgba(18, 16, 11, 0.16); }
          .frame img { position: absolute; left: ${-CROP.x * scale}px; top: ${-CROP.y * scale}px; width: ${CAPTURE_SIZE.width * scale}px; height: ${CAPTURE_SIZE.height * scale}px; }
        </style>
      </head>
      <body>
        <main class="card">
          <div class="brand"><img src="${brandMark}" alt="" /><span>Blanc&nbsp; · &nbsp;Media</span></div>
          <h1>The browser<br />in one small<br />island.</h1>
          <div class="meta">macOS · Windows · Linux</div>
          <figure class="frame"><img src="${productCapture}" alt="" /></figure>
        </main>
      </body>
    </html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUTPUT });
  console.log(`Rendered ${OUTPUT}`);
} finally {
  await browser.close();
}
