#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = path.join(SITE_ROOT, 'dist');
const OUTPUT = path.join(SITE_ROOT, 'public/press/blanc-island-product-capture-v2.png');
const LAUNCH_OUTPUT = path.join(SITE_ROOT, 'public/press/blanc-press-card.png');

function dataUrl(file, mimeType) {
  return `data:${mimeType};base64,${fs.readFileSync(file).toString('base64')}`;
}

/* The press card is an evergreen social-preview asset. Release-specific facts
   stay in the press page and changelog rather than being burned into a PNG. */

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target) && fs.existsSync(`${target}.html`)) target = `${target}.html`;
      if (!fs.existsSync(target)) {
        response.writeHead(404).end();
        return;
      }
      const types = {
        '.css': 'text/css',
        '.html': 'text/html',
        '.ico': 'image/x-icon',
        '.jpg': 'image/jpeg',
        '.js': 'text/javascript',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      response.end(fs.readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

if (!fs.existsSync(path.join(DIST_ROOT, 'press.html'))) {
  throw new Error('Build the site first with `npm run build` from site/.');
}

const server = await serve(DIST_ROOT);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 2784, height: 1824 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/press.html#product`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#pressIslandPanel');

  await page.evaluate(() => {
    const stage = document.querySelector('.press-island-stage');
    const photo = stage.querySelector('.press-island-page');
    const sectionHeaders = stage.querySelectorAll('.sec-head');
    const rows = stage.querySelectorAll('.trow');
    const rowContent = [
      ['Mail', 'mail.example'],
      ['Notes', 'notes.example'],
      ['Quiet Spaces', 'spaces.example'],
      ['Garden Journal', 'garden.example'],
      ['Light Studies', 'light.example'],
      ['Material Archive', 'materials.example'],
      ['Architecture Notes', 'architecture.example'],
    ];
    const swatches = ['#d7c8a8', '#b8b2a5', '#8e9a80', '#c9b99c', '#8d9b78', '#b7a78d', '#a0a89a'];
    const monograms = ['M', 'N', 'S', 'G', 'L', 'M', 'A'];

    stage.id = 'pressCaptureStage';
    stage.removeAttribute('tabindex');
    stage.querySelectorAll('.press-island-connector, .press-island-state').forEach((node) => node.remove());
    photo.src = '/press/blanc-editorial-reading-room-v1.png';
    photo.removeAttribute('srcset');

    sectionHeaders[1].firstElementChild.textContent = 'inspiration';
    rows.forEach((row, index) => {
      const [title, domain] = rowContent[index];
      row.dataset.title = title;
      // Still on the dataset — press-island.js reads it to drive the pill — but
      // no longer drawn: 1.1.0 dropped the domain column from tab rows so the
      // title has the room. There is no .dom element to write to any more.
      row.dataset.domain = domain;
      row.querySelector('.title').textContent = title;
      const favicon = row.querySelector('.fav');
      favicon.style.backgroundImage = 'none';
      favicon.style.backgroundColor = swatches[index];
      favicon.style.borderRadius = '3px';
      favicon.style.color = '#fff';
      favicon.style.display = 'grid';
      favicon.style.placeItems = 'center';
      favicon.style.fontFamily = 'Inter, sans-serif';
      favicon.style.fontSize = '7px';
      favicon.style.fontWeight = '700';
      favicon.textContent = monograms[index];
    });

    document.documentElement.removeAttribute('data-theme');
    document.body.replaceChildren(stage);
  });

  await page.addStyleTag({ content: `
    html, body {
      width: 2784px;
      height: 1824px;
      margin: 0;
      overflow: hidden;
      background: #050505;
    }
    body {
      display: grid;
      place-items: center;
    }
    #pressCaptureStage {
      --press-panel-half: 310px;
      width: 2544px;
      height: 1584px;
      margin: 0;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 32px;
      box-shadow: 0 48px 120px rgba(0, 0, 0, 0.42);
    }
    #pressCaptureStage .press-island-strip {
      display: none;
    }
    #pressCaptureStage .press-island-page {
      top: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 54%;
    }
    #pressCaptureStage .press-island-live {
      top: 44px;
      transform: translateX(-50%) scale(2.35) !important;
      transform-origin: top center;
    }
    #pressCaptureStage .press-island-live .panel {
      box-shadow: 0 38px 90px rgba(14, 14, 14, 0.24);
    }
    #pressCaptureStage .press-island-live .trow .fav {
      box-shadow: inset 0 0 0 1px rgba(14, 14, 14, 0.07);
    }
  ` });

  await page.waitForFunction(() => {
    const image = document.querySelector('.press-island-page');
    return image.complete && image.naturalWidth > 0;
  });
  await page.screenshot({ path: OUTPUT });

  const productCapture = dataUrl(OUTPUT, 'image/png');
  const brandMark = dataUrl(path.join(SITE_ROOT, 'public/favicon.svg'), 'image/svg+xml');
  const inter = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'font/woff2');
  const mono = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2'), 'font/woff2');
  const newsreader = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'), 'font/woff2');
  await page.setViewportSize({ width: 2400, height: 1260 });
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          @font-face { font-family: Inter; src: url('${inter}') format('woff2'); font-weight: 100 900; }
          @font-face { font-family: 'JetBrains Mono'; src: url('${mono}') format('woff2'); font-weight: 500; }
          @font-face { font-family: Newsreader; src: url('${newsreader}') format('woff2-variations'); font-weight: 200 800; }
          * { box-sizing: border-box; }
          html, body { width: 2400px; height: 1260px; margin: 0; overflow: hidden; background: #fbfbfa; }
          body { color: #0e0e0e; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
          .card { position: relative; width: 100%; height: 100%; background: #fbfbfa; }
          .brand { position: absolute; top: 82px; left: 104px; display: flex; align-items: center; gap: 28px; color: #666; font: 500 25px/1 'JetBrains Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; }
          .brand img { width: 48px; height: 64px; object-fit: contain; }
          h1 { position: absolute; top: 246px; left: 94px; width: 720px; margin: 0; font-family: Newsreader, serif; font-size: 122px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; font-optical-sizing: auto; }
          .meta { position: absolute; left: 96px; bottom: 92px; display: grid; gap: 24px; color: #151515; font: 500 25px/1 'JetBrains Mono', monospace; letter-spacing: 0.04em; text-transform: uppercase; }
          .platforms { color: #777; }
          .frame { position: absolute; top: 116px; right: 86px; width: 1420px; height: 1020px; overflow: hidden; border: 1px solid #d7d7d4; border-radius: 26px; background: #050505; box-shadow: 0 30px 80px rgba(14, 14, 14, 0.12); }
          .frame img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; transform: scale(1.16); transform-origin: center; }
          .caption { position: absolute; right: 90px; bottom: 52px; color: #777; font: 500 22px/1 'JetBrains Mono', monospace; letter-spacing: 0.025em; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <main class="card">
          <div class="brand"><img src="${brandMark}" alt="" /><span>Blanc&nbsp; · &nbsp;Press</span></div>
          <h1>The browser<br />in one small<br />island.</h1>
          <div class="meta"><span class="platforms">macOS · Windows · Linux</span></div>
          <figure class="frame"><img src="${productCapture}" alt="" /></figure>
          <div class="caption">The island, shown at editorial scale</div>
        </main>
      </body>
    </html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: LAUNCH_OUTPUT });
  console.log(`Rendered ${OUTPUT}`);
  console.log(`Rendered ${LAUNCH_OUTPUT}`);
} finally {
  await browser.close();
  server.close();
}
