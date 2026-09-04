#!/usr/bin/env node
/*
 * Renders the six Open Graph cards from the built site.
 *
 * They were hand-authored PNGs and had drifted badly: og-image.png still showed
 * a `blocked 18` text chip from two Island designs ago, feature-island.png and
 * feature-ad-blocking.png were byte-identical to each other AND 2784x1824 while
 * BaseLayout told every crawler they were 1200x630, and the private-tabs and
 * tab-groups cards were a small pill stranded on an otherwise empty field.
 *
 * Each card now composites the feature page's OWN island figure — the same
 * markup the page renders — so a change to the Island reaches the share cards
 * by re-running this, exactly like render-press-primary-capture.mjs. The layout
 * is that script's editorial system at OG scale: mono brand line, tight Inter
 * headline, the product sitting on the baseline.
 *
 *   node scripts/render-og-cards.mjs        (after `npm run build`)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = path.join(SITE_ROOT, 'dist');
const PUBLIC_ROOT = path.join(SITE_ROOT, 'public');

const WIDTH = 1200;
const HEIGHT = 630;
/* Headlines are each page's own h1, so a shared link previews the sentence the
 * visitor is about to land on. og-image.png is the site-wide default and takes
 * the homepage hero's line instead. */
const CARDS = [
  {
    out: 'og-image.png',
    page: '/features/island.html',
    figure: '.island-figure',
    headline: 'The browser that gets out of your way.',
    identity: { domain: 'blancbrowser.com', favicon: '/favicon.svg' },
  },
  {
    out: 'feature-island.png',
    page: '/features/island.html',
    figure: '.island-figure',
    headline: 'One small island. The whole browser.',
    identity: { domain: 'blancbrowser.com', favicon: '/favicon.svg' },
  },
  {
    out: 'feature-ad-blocking.png',
    page: '/features/ad-blocking.html',
    figure: '.island-figure--site-controls',
    headline: 'A clearer control for a quieter site.',
    // Keeps the shield and the popover's state row — the site, whether blocking
    // is on, and the switch. Uncropped, the pill-plus-popover stack is tall
    // enough that fitting it whole shrank that payload to fine print.
    crop: 0.68,
  },
  {
    out: 'feature-command-palette.png',
    page: '/features/command-palette.html',
    figure: '.island-figure--panel',
    headline: 'One shortcut to move through your whole session.',
    // Cropped to the address capsule and the first results, so the thing the
    // headline promises is legible at feed size. Whole-panel would shrink the
    // type to a blur — the detail is the message here, not the silhouette.
    crop: 0.52,
  },
  {
    out: 'feature-private-tabs.png',
    page: '/features/private-tabs.html',
    figure: '.island-figure',
    headline: 'Private tabs that stay out of the record.',
  },
  {
    out: 'feature-tab-groups.png',
    page: '/features/tab-groups.html',
    figure: '.island-figure--panel',
    headline: 'Keep the tabs you need. Tuck away the rest.',
    // Deliberately NOT cropped: pinned above two named groups is the whole
    // point, and that only reads as a complete shape. One card in the set has
    // to show what the open panel actually looks like.
  },
];

function serve(root) {
  return new Promise((resolve) => {
    const types = {
      '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon',
      '.jpg': 'image/jpeg', '.js': 'text/javascript', '.png': 'image/png',
      '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    };
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let target = path.resolve(root, `.${pathname}`);
      if (!target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target) && fs.existsSync(`${target}.html`)) target = `${target}.html`;
      if (!fs.existsSync(target)) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      response.end(fs.readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

if (!fs.existsSync(path.join(DIST_ROOT, 'features/island.html'))) {
  throw new Error('Build the site first with `npm run build` from site/.');
}

const server = await serve(DIST_ROOT);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

const brandMark = dataUrl(path.join(PUBLIC_ROOT, 'favicon.svg'), 'image/svg+xml');
const inter = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'font/woff2');
const mono = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2'), 'font/woff2');
const newsreader = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'), 'font/woff2');

try {
  for (const card of CARDS) {
    // 1. Shoot the page's own island figure at 2x.
    const shooter = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 3,
      reducedMotion: 'reduce',
    });
    await shooter.goto(`${origin}${card.page}`, { waitUntil: 'networkidle' });
    // The address caret blinks on a step-end loop; a live animation makes the
    // capture non-deterministic between runs.
    await shooter.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await shooter.waitForSelector(card.figure);
    // Drop the website render behind the Island. The page's own press guidance
    // is that a visual must not turn another site's brand into the story, and
    // at card size the backdrop did exactly that — GitHub's wordmark and hero
    // line read louder than the product. Without it the Island floats on the
    // card's own paper, which is both on-brand and unmistakably the subject.
    await shooter.addStyleTag({ content: `
      ${card.figure} .demo-shot, ${card.figure} .demo-page { display: none !important; }
      ${card.figure} { background: #fbfbfa !important; --fig-strip-bg: #fbfbfa !important; }
      ${card.figure} .demo-stage, ${card.figure}::before { background: #fbfbfa !important; }
    ` });
    // The feature page demonstrates the island over a third-party website, but
    // the share card represents Blanc itself. Give the card Blanc's real site
    // identity without changing the live example rendered on the page.
    if (card.identity) {
      await shooter.evaluate(({ sel, identity }) => {
        const figure = document.querySelector(sel);
        const domain = figure?.querySelector('.domain');
        const favicon = figure?.querySelector('.pill-fav');
        if (domain) domain.textContent = identity.domain;
        if (favicon) {
          favicon.style.backgroundImage = `url('${identity.favicon}')`;
          favicon.style.backgroundSize = 'contain';
          favicon.style.backgroundRepeat = 'no-repeat';
        }
      }, { sel: card.figure, identity: card.identity });
    }
    await shooter.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), card.figure);
    await shooter.evaluate(() => document.fonts.ready);

    // Clip to the Island itself (plus room for its shadow), not the whole
    // figure — otherwise a short pill floats in a mostly empty frame.
    const box = await shooter.evaluate(({ sel, crop }) => {
      const figure = document.querySelector(sel);
      const island = figure.querySelector('.demo-island');
      const f = figure.getBoundingClientRect();
      // The Island's own border box covers the resting pill ONLY: its panel and
      // its site-control popover are absolutely positioned, and an absolutely
      // positioned child never grows its parent's box. Measuring the island
      // alone therefore sliced the popover clean off the ad-blocking card.
      // Union it with every visible descendant instead.
      const union = (a, b) => !a ? b : ({
        left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
      });
      let box = null;
      for (const node of island.querySelectorAll('*')) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) box = union(box, r);
      }
      // Descendants only, deliberately: a panel figure gives .demo-island a
      // full-width box so the centred, absolutely positioned panel has
      // something to size against. Including it padded the crop with blank
      // space on both sides and shrank the panel to half the room available.
      if (!box) box = island.getBoundingClientRect();
      const pad = 30;                       // room for the Island's own shadow
      const left = Math.max(f.left, box.left - pad);
      const right = Math.min(f.right, box.right + pad);
      const top = Math.max(f.top, box.top - pad);
      let bottom = Math.min(f.bottom, box.bottom + pad);
      // A crop keeps the top slice only. The result is wider than it is tall,
      // so `contain` scales it up to the band's width instead of being limited
      // by the band's height — which is what makes the cropped cards larger.
      if (crop) bottom = top + (bottom - top) * crop;
      return { x: left, y: top, width: right - left, height: Math.max(bottom - top, 60) };
    }, { sel: card.figure, crop: card.crop ?? 0 });
    const figureShot = await shooter.screenshot({ clip: box });
    await shooter.close();

    // 2. Composite it into the card.
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html>
      <html lang="en"><head><meta charset="utf-8" /><style>
        @font-face { font-family: Inter; src: url('${inter}') format('woff2'); font-weight: 100 900; }
        @font-face { font-family: 'JetBrains Mono'; src: url('${mono}') format('woff2'); font-weight: 500; }
        @font-face { font-family: Newsreader; src: url('${newsreader}') format('woff2-variations'); font-weight: 200 800; }
        * { box-sizing: border-box; }
        html, body { width: ${WIDTH}px; height: ${HEIGHT}px; margin: 0; overflow: hidden; background: #fbfbfa; }
        body { color: #0e0e0e; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
        .brand { position: absolute; top: 52px; left: 64px; display: flex; align-items: center; gap: 15px;
                 color: #666; font: 500 13px/1 'JetBrains Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; }
        .brand img { width: 25px; height: 33px; object-fit: contain; }
        h1 { position: absolute; top: 112px; left: 62px; width: 1000px; margin: 0;
             font-family: Newsreader, serif; font-size: 62px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; font-optical-sizing: auto; }
        /* One region for the Island whatever its shape: a resting pill is wide
           and short, an open panel is tall. Containing rather than cropping
           lets both sit at their own proportions on a shared baseline. */
        .band { position: absolute; left: 64px; right: 64px; top: 272px; bottom: ${card.crop ? 0 : 52}px; }
        .band img { display: block; width: 100%; height: 100%;
                    object-fit: contain; object-position: center bottom; }
      </style></head>
      <body>
        <div class="brand"><img src="${brandMark}" alt="" /><span>Blanc</span></div>
        <h1>${card.headline}</h1>
        <figure class="band"><img src="data:image/png;base64,${figureShot.toString('base64')}" alt="" /></figure>
      </body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(PUBLIC_ROOT, card.out) });
    await page.close();
    console.log(`Rendered ${card.out}`);
  }
} finally {
  await browser.close();
  server.close();
}
