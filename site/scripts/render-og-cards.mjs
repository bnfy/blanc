#!/usr/bin/env node
/*
 * Renders the Open Graph card manifest from the built site and public captures.
 *
 * They were hand-authored PNGs and had drifted badly: og-image.png still showed
 * a `blocked 18` text chip from two Island designs ago, feature-island.png and
 * feature-ad-blocking.png were byte-identical to each other AND 2784x1824 while
 * BaseLayout told every crawler they were 1200x630, and the private-tabs and
 * tab-groups cards were a small pill stranded on an otherwise empty field.
 *
 * Every card is a Sunrise composition (docs/brand-usage.md): the original gold
 * Sunrise artwork with clear space and nothing behind it, an ivory or dark
 * Sunrise surface, a gold mono label naming the feature, the page's own
 * Newsreader headline, and the website's address. A soft gold horizon may glow
 * near the bottom edge, always away from the mark. The product is always real:
 * a released native capture framed as a window, or the feature page's OWN
 * Island figure, so a change to the Island reaches the share cards by
 * re-running this. Three compositions share that system:
 *
 *   horizon  og-image.png. Centered copy over the dawn Start Page, whose sun
 *            sits on the card's own gold horizon line.
 *   window   Copy on the left, a native capture on the right.
 *   figure   An open panel beside the copy, or a resting pill standing on the
 *            horizon below it.
 *
 *   node scripts/render-og-cards.mjs                       (after `npm run build`)
 *   node scripts/render-og-cards.mjs --only=og-image.png   (one card)
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
 * visitor is about to land on, and the label is the page's own eyebrow (the
 * Spaces page's names the feature, Blanc Spaces). og-image.png is the
 * site-wide default and takes the homepage hero's line and description. */
const CARDS = [
  {
    out: 'og-image.png',
    layout: 'horizon',
    capture: 'home-wallpaper-dawn-v1.31.0.png',
    headline: 'A little less browser.',
    sub: 'A minimal desktop browser, with ad and tracker blocking built in.',
  },
  {
    out: 'feature-start-page.png',
    capture: 'billboard-v1.31.0.png',
    kicker: 'start page',
    headline: 'Four ways to begin. Mahjong when you want a break.',
  },
  {
    out: 'feature-glance.png',
    capture: 'glance.png',
    kicker: 'glance',
    headline: 'Keep a reference beside the page you’re using.',
    // The reference panel is the right-hand third of the window; running the
    // window off the edge would cut away the very thing the card is about.
    whole: true,
  },
  {
    out: 'feature-workspaces.png',
    capture: 'workspaces.png',
    kicker: 'blanc spaces',
    headline: 'Save a whole window. Return to it by name.',
  },
  {
    out: 'feature-profiles.png',
    capture: 'profiles.png',
    kicker: 'profiles & windows',
    headline: 'Separate browsing identities. Keep every window independent.',
  },
  {
    out: 'feature-reopen-closed-tabs.png',
    capture: 'reopen-closed-tabs.png',
    kicker: 'reopen closed tabs',
    headline: 'Get the tab back, not just its address.',
  },
  {
    out: 'feature-island.png',
    page: '/features/island.html',
    figure: '.island-figure',
    kicker: 'the island',
    headline: 'One small island. The whole browser.',
    shape: 'pill',
    identity: { domain: 'blanc.day', favicon: '/favicon.svg' },
  },
  {
    out: 'feature-ad-blocking.png',
    page: '/features/ad-blocking.html',
    figure: '.island-figure--site-controls',
    kicker: 'ad blocking',
    headline: 'Ad blocking built in. uBlock Origin if you prefer it.',
  },
  {
    out: 'feature-command-palette.png',
    page: '/features/command-palette.html',
    figure: '.island-figure--panel',
    kicker: 'command palette',
    headline: 'One shortcut to move through your whole session.',
  },
  {
    out: 'feature-private-tabs.png',
    page: '/features/private-tabs.html',
    figure: '.island-figure',
    kicker: 'private tabs',
    headline: 'Private browsing tabs that stay out of the record.',
    shape: 'pill',
  },
  {
    out: 'feature-tab-groups.png',
    page: '/features/tab-groups.html',
    figure: '.island-figure--panel',
    kicker: 'tab groups',
    headline: 'Named tab groups: keep the tabs you need. Tuck away the rest.',
  },
  {
    out: 'feature-quiet-tabs.png',
    page: '/features/quiet-tabs.html',
    figure: '.island-figure',
    kicker: 'quiet tabs',
    headline: 'Tabs you are not using give their memory back.',
    shape: 'pill',
    theme: 'dark',
  },
  {
    out: 'feature-security.png',
    page: '/features/security.html',
    figure: '.island-figure',
    kicker: 'security',
    headline: 'Private by architecture.',
    shape: 'pill',
    theme: 'dark',
  },
  {
    out: 'feature-sync.png',
    page: '/features/sync.html',
    figure: '.island-figure--panel',
    kicker: 'sync',
    headline: 'Your favorites and settings on your other devices.',
    theme: 'dark',
  },
];

// Allow a single repaired card to be regenerated without touching other exports.
const selectedOutput = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
if (selectedOutput && !CARDS.some(card => card.out === selectedOutput)) {
  throw new Error(`Unknown card: ${selectedOutput}`);
}

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

// The original gold artwork, never a tint of the monochrome favicon.svg.
const sunrise = dataUrl(path.join(PUBLIC_ROOT, 'sunrise-hero-mark.png'), 'image/png');
const inter = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'font/woff2');
// The site no longer depends on @fontsource/jetbrains-mono; use the face the app bundles.
const mono = dataUrl(path.join(SITE_ROOT, '../src/renderer/pages/jetbrains-mono-latin.woff2'), 'font/woff2');
const newsreader = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'), 'font/woff2');

// The website's Sunrise tokens (site.css) and the dark surface the dusk
// captures sit on. Gold on dark is the website's --site-gold-on-dark.
const THEMES = {
  light: {
    bg: '#F7F0E5', wash: 'none', ink: '#14110D', muted: '#6B6257', gold: '#805D28',
    glow: 'rgba(212, 173, 102, 0.30)', line: 'rgba(184, 140, 72, 0.55)', shadow: 'rgba(96, 64, 24, 0.24)',
  },
  dark: {
    bg: '#221C19', wash: 'linear-gradient(180deg, #1E1916 0%, #251E1B 55%, #2E231E 100%)',
    ink: '#F7F0E5', muted: '#B9AE9F', gold: '#D4AD66',
    glow: 'rgba(212, 173, 102, 0.24)', line: 'rgba(212, 173, 102, 0.45)', shadow: 'rgba(0, 0, 0, 0.55)',
  },
};

// Transparent room left around a shot Island so its shadow fades out instead
// of stopping at a hard edge. Figures are sized by the Island itself, so this
// room simply runs past their place on the card.
const SHADOW_ROOM = 120;

// Shoot a feature page's own Island figure at 3x, on a transparent ground so
// it sits directly on the card's Sunrise surface. Panels and popovers are
// shown whole: beside the copy their size is set by the column's width, so a
// crop would no longer make their text any larger.
async function shootFigure(card) {
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
  // card's own Sunrise surface, which is both on-brand and unmistakably the
  // subject.
  await shooter.addStyleTag({ content: `
    ${card.figure} .demo-shot, ${card.figure} .demo-page { display: none !important; }
    [data-og-backdrop] { background: transparent !important; border-color: transparent !important; box-shadow: none !important; outline: none !important; }
    [data-og-backdrop]::before, [data-og-backdrop]::after { display: none !important; }
  ` });
  // Isolate the Island: everything beside it on the way up to the document is
  // hidden (layout kept), and every element it sits in paints nothing, so the
  // shot's shadow room never picks up a caption, hairline or section fill.
  await shooter.evaluate((sel) => {
    const island = document.querySelector(sel)?.querySelector('.demo-island');
    for (let node = island; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node) sibling.style.setProperty('visibility', 'hidden', 'important');
      }
      node.parentElement.setAttribute('data-og-backdrop', '');
    }
  }, card.figure);
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
  const box = await shooter.evaluate(({ sel, pad }) => {
    const figure = document.querySelector(sel);
    const island = figure.querySelector('.demo-island');
    // The Island's own border box covers the resting pill ONLY: its panel and
    // its site-control popover are absolutely positioned, and an absolutely
    // positioned child never grows its parent's box. Measuring the island
    // alone therefore sliced the popover clean off the ad-blocking card.
    // Union it with every visible descendant instead.
    const union = (a, b) => !a ? b : ({
      left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
    });
    // A scrolling list's rows below the fold are laid out but never seen, so
    // each box is clipped to every scroll or overflow container it sits in.
    const visibleRect = (node) => {
      let { left, top, right, bottom } = node.getBoundingClientRect();
      for (let up = node.parentElement; up && up !== island.parentElement; up = up.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(up);
        if (overflowX === 'visible' && overflowY === 'visible') continue;
        const c = up.getBoundingClientRect();
        left = Math.max(left, c.left); top = Math.max(top, c.top);
        right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
      }
      return { left, top, right, bottom };
    };
    let box = null;
    for (const node of island.querySelectorAll('*')) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) continue;
      const r = visibleRect(node);
      if (r.right - r.left > 0 && r.bottom - r.top > 0) box = union(box, r);
    }
    // Descendants only, deliberately: a panel figure gives .demo-island a
    // full-width box so the centred, absolutely positioned panel has
    // something to size against. Including it padded the crop with blank
    // space on both sides and shrank the panel to half the room available.
    if (!box) box = island.getBoundingClientRect();
    // The figure's transparent surroundings are part of the shot, so the
    // shadow room may run past the figure's own box.
    return {
      x: box.left - pad, y: box.top - pad,
      width: box.right - box.left + pad * 2, height: box.bottom - box.top + pad * 2,
    };
  }, { sel: card.figure, pad: SHADOW_ROOM });
  const shot = await shooter.screenshot({ clip: box, omitBackground: true });
  await shooter.close();
  return {
    src: `data:image/png;base64,${shot.toString('base64')}`,
    width: box.width, height: box.height,
    island: { width: box.width - SHADOW_ROOM * 2, height: box.height - SHADOW_ROOM * 2 },
  };
}

// Scale a shot so the Island itself fills (but never exceeds) a region,
// centred on that region; its transparent shadow room spills past it.
function placeFigure(art, { cx, cy, width, height }) {
  const scale = Math.min(width / art.island.width, height / art.island.height);
  const w = art.width * scale, h = art.height * scale;
  return `<img class="figure" src="${art.src}" alt="" style="left: ${(cx - w / 2).toFixed(1)}px; top: ${(cy - h / 2).toFixed(1)}px; width: ${w.toFixed(1)}px;" />`;
}

function compose(card, art) {
  const t = THEMES[card.theme || 'light'];
  const head = `
    @font-face { font-family: Inter; src: url('${inter}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'JetBrains Mono'; src: url('${mono}') format('woff2'); font-weight: 500; }
    @font-face { font-family: Newsreader; src: url('${newsreader}') format('woff2-variations'); font-weight: 200 800; }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { position: relative; background: ${t.bg}; background-image: ${t.wash};
           color: ${t.ink}; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
    /* The Sunrise artwork at its own geometry: no badge, tint or glow. */
    .mark { display: block; width: 56px; height: 56px; }
    .kicker { color: ${t.gold}; font: 500 14px/1 'JetBrains Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; }
    h1 { font-family: Newsreader, serif; font-size: 64px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.04;
         font-optical-sizing: auto; text-wrap: balance; color: ${t.ink}; }
    .sub { color: ${t.muted}; font-size: 22px; line-height: 1.45; }
    .domain { position: absolute; left: 72px; bottom: 48px; color: ${t.gold}; font-size: 18px; font-weight: 500; letter-spacing: 0.01em; }
    .glow, .horizon { position: absolute; pointer-events: none; }
    .horizon { left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, ${t.line} 22%, ${t.line} 78%, transparent); }
    .window { position: absolute; border-radius: 12px; overflow: hidden;
              box-shadow: 0 34px 80px ${t.shadow}, 0 3px 8px ${t.shadow}; }
    .window img { display: block; width: 100%; }
    .copy { position: absolute; display: flex; flex-direction: column; }
    .copy .kicker { margin-top: 34px; }
    .copy h1 { margin-top: 16px; }
    .figure { position: absolute; display: block; }
  `;
  const copy = (style) => `<div class="copy" style="${style}">
      <img class="mark" src="${sunrise}" alt="" /><p class="kicker">${card.kicker}</p><h1>${card.headline}</h1>
    </div><p class="domain">blanc.day</p>`;

  let body;
  // The fitted headline must stay inside this height; the caller shrinks it.
  let fit;
  if (card.layout === 'horizon') {
    // The window's sun sits 83% of the way down the dawn capture. The card's
    // horizon line runs through it, so the product rises on Blanc's horizon.
    const top = 262, width = 640, height = width * 10 / 16;
    body = `
      <div class="glow" style="left: 0; right: 0; bottom: 0; height: 420px; background: radial-gradient(50% 70% at 50% 100%, ${t.glow}, transparent 75%);"></div>
      <div class="horizon" style="top: ${Math.round(top + height * 0.83)}px;"></div>
      <img class="mark" src="${sunrise}" alt="" style="position: absolute; left: ${WIDTH / 2 - 28}px; top: 36px;" />
      <h1 style="position: absolute; left: 0; right: 0; top: 104px; font-size: 78px; text-align: center;">${card.headline}</h1>
      <p class="sub" style="position: absolute; left: 0; right: 0; top: 206px; text-align: center;">${card.sub}</p>
      <div class="window" style="left: ${(WIDTH - width) / 2}px; top: ${top}px; width: ${width}px;"><img src="${art.src}" alt="" /></div>`;
    fit = null;
  } else if (card.capture) {
    // A native capture, framed as the window it is. Most run off the right
    // edge so the window reads large; a card whose subject spans the whole
    // window shows all of it instead.
    const frame = card.whole
      ? 'left: 584px; top: 142px; width: 560px;'
      : 'left: 600px; top: 96px; width: 780px;';
    body = `
      <div class="glow" style="inset: 0; background: radial-gradient(55% 60% at 82% 112%, ${t.glow}, transparent 70%);"></div>
      ${copy('left: 72px; top: 56px; bottom: 96px; width: 470px; justify-content: center;')}
      <div class="window" style="${frame}"><img src="${art.src}" alt="" /></div>`;
    fit = { max: 64, min: 44, height: 210 };
  } else if (card.shape === 'pill') {
    // A resting pill stands on the horizon, below the copy, with the line
    // running behind it and the glow rising from the bottom edge.
    body = `
      <div class="glow" style="left: 0; right: 0; bottom: 0; height: 320px; background: radial-gradient(50% 80% at 50% 100%, ${t.glow}, transparent 75%);"></div>
      <div class="horizon" style="top: 430px;"></div>
      ${copy('left: 72px; top: 52px; width: 1000px;')}
      ${placeFigure(art, { cx: WIDTH / 2, cy: 430, width: 760, height: 76 })}`;
    fit = { max: 64, min: 48, height: 140 };
  } else {
    // An open panel or popover beside the copy, on the same surface.
    body = `
      <div class="glow" style="inset: 0; background: radial-gradient(55% 60% at 82% 112%, ${t.glow}, transparent 70%);"></div>
      ${copy('left: 72px; top: 56px; bottom: 96px; width: 470px; justify-content: center;')}
      ${placeFigure(art, { cx: 871, cy: HEIGHT / 2, width: 562, height: 520 })}`;
    fit = { max: 64, min: 44, height: 210 };
  }
  return { html: `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>${head}</style></head><body>${body}</body></html>`, fit };
}

try {
  for (const card of CARDS) {
    if (selectedOutput && card.out !== selectedOutput) continue;
    // Native public-release pixels, never a recreated product state.
    const art = card.capture
      ? { src: dataUrl(path.join(PUBLIC_ROOT, 'feature-captures', card.capture), 'image/png') }
      : await shootFigure(card);
    const { html, fit } = compose(card, art);
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Long headlines step down in size until they fit their column.
    if (fit) {
      await page.evaluate(({ max, min, height }) => {
        const h1 = document.querySelector('.copy h1');
        for (let size = max; size >= min; size -= 2) {
          h1.style.fontSize = `${size}px`;
          if (h1.getBoundingClientRect().height <= height) return;
        }
      }, fit);
    }
    await page.screenshot({ path: path.join(PUBLIC_ROOT, card.out) });
    await page.close();
    console.log(`Rendered ${card.out}`);
  }
} finally {
  await browser.close();
  server.close();
}
