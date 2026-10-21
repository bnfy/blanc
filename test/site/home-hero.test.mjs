// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/home-hero.test.mjs
// The homepage's first screen: the floating Island window
// (docs/superpowers/specs/2026-10-21-floating-island-homepage-hero-design.md).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const { measured } = JSON.parse(readFileSync(new URL('../../docs/website-captures-float-island-v1.40.0.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function openHome({ width = 1440, height = 900, reducedMotion = 'reduce', javaScriptEnabled = true, blockNoteFont = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, javaScriptEnabled });
  const page = await context.newPage();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (blockNoteFont && url.pathname.startsWith('/fonts/reenie-beanie/')) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

const inView = (box, width, height) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;

test('the first screen ends on the headline and Download, with the window’s top in view', async () => {
  for (const [width, height] of [[1440, 900], [1280, 800], [1280, 720]]) {
    const { page, close } = await openHome({ width, height });
    try {
      const h1 = await page.locator('#opening-title').boundingBox();
      const download = await page.locator('#opening [data-download-cta]').boundingBox();
      const windowBox = await page.locator('[data-float-window]').boundingBox();
      assert.ok(inView(h1, width, height), `${width}×${height}: headline ${JSON.stringify(h1)}`);
      assert.ok(inView(download, width, height), `${width}×${height}: Download ${JSON.stringify(download)}`);
      assert.ok(windowBox.y < height - 120, `${width}×${height}: the window starts on the first screen (${windowBox.y})`);
      const h1Lines = await page.locator('#opening-title').evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
      });
      assert.equal(h1Lines, 1, `${width}×${height}: the headline is one line`);
    } finally { await close(); }
  }
});

test('the note sits above the headline’s end, clear of its letters, with or without its font', async () => {
  for (const blockNoteFont of [false, true]) {
    for (const width of [1440, 1024, 768, 390]) {
      const { page, close } = await openHome({ width, blockNoteFont });
      try {
        const result = await page.evaluate(() => {
          const h1 = document.getElementById('opening-title');
          const note = document.querySelector('.opening-note').getBoundingClientRect();
          // Each line of the headline, as tall as its line box: a Range's rects
          // add the font's empty ascent above the letters.
          const range = document.createRange(); range.selectNodeContents(h1);
          const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
          const letters = [...range.getClientRects()].map(r => {
            const middle = (r.top + r.bottom) / 2;
            return { left: r.left, right: r.right, width: r.width, top: middle - lineHeight / 2, bottom: middle + lineHeight / 2 };
          });
          const overlaps = letters.some(r => note.left < r.right && note.right > r.left && note.top < r.bottom && note.bottom > r.top);
          return { overlaps, above: note.bottom <= letters[0].top + 4, nearEnd: Math.abs(note.right - Math.max(...letters.map(r => r.right))) < h1.getBoundingClientRect().width * 0.25, family: getComputedStyle(document.querySelector('.opening-note')).fontFamily };
        });
        assert.equal(result.overlaps, false, `${width}, font blocked ${blockNoteFont}: note overlaps the headline`);
        assert.ok(result.above, `${width}, font blocked ${blockNoteFont}: note sits above the headline`);
        assert.ok(result.nearEnd, `${width}, font blocked ${blockNoteFont}: note sits at the headline’s end`);
        assert.match(result.family, /Reenie Beanie/);
      } finally { await close(); }
    }
  }
});

test('the window scales as one piece at every width, with no sideways scroll', async () => {
  for (const width of [390, 768, 1024, 1440]) {
    const { page, close } = await openHome({ width });
    try {
      const result = await page.evaluate(() => {
        const figure = document.querySelector('[data-float-window]').getBoundingClientRect();
        const island = document.querySelector('.float-window .hero-native-model').shadowRoot.querySelector('[id$="islandPill"]').getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ratio: figure.width / figure.height,
          x: (island.left - figure.left) / figure.width, w: island.width / figure.width, y: (island.top - figure.top) / figure.height,
          inside: figure.left >= 0 && figure.right <= innerWidth,
        };
      });
      assert.ok(result.scroll <= 0, `${width}: page scrolls sideways by ${result.scroll}px`);
      assert.ok(result.inside, `${width}: the window is cropped`);
      assert.ok(Math.abs(result.ratio - measured.window.width / measured.window.height) < 0.01, `${width}: window ratio ${result.ratio}`);
      assert.ok(Math.abs(result.x - measured.islandRect.x / measured.window.width) < 0.01, `${width}: Island x ${result.x}`);
      assert.ok(Math.abs(result.w - measured.islandRect.width / measured.window.width) < 0.01, `${width}: Island width ${result.w}`);
      assert.ok(Math.abs(result.y - measured.islandRect.y / measured.window.height) < 0.01, `${width}: Island y ${result.y}`);
    } finally { await close(); }
  }
});

test('reduced motion and no script show the Island at rest over the page', async () => {
  for (const options of [{ reducedMotion: 'reduce' }, { reducedMotion: 'no-preference', javaScriptEnabled: false }]) {
    const { page, close } = await openHome(options);
    try {
      await page.waitForTimeout(600);
      const state = await page.locator('[data-float-window]').getAttribute('data-state');
      assert.equal(state, 'shown', JSON.stringify(options));
      const visible = await page.locator('.float-window .hero-native-model').evaluate(el => getComputedStyle(el).visibility);
      assert.equal(visible, 'visible', JSON.stringify(options));
    } finally { await close(); }
  }
});

test('with motion, the Island hides and floats back', async () => {
  const { page, close } = await openHome({ reducedMotion: 'no-preference' });
  try {
    const seen = await page.evaluate(() => new Promise(resolve => {
      const figure = document.querySelector('[data-float-window]');
      const states = new Set([figure.dataset.state]);
      const started = performance.now();
      const tick = () => {
        states.add(figure.dataset.state);
        if ((states.has('hidden') && states.has('shown') && states.size >= 2 && performance.now() - started > 3000) || performance.now() - started > 8000) resolve([...states]);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    assert.ok(seen.includes('hidden') && seen.includes('shown'), JSON.stringify(seen));
  } finally { await close(); }
});
