// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/sunrise-light.test.mjs
//
// Guards the Sunrise "light" treatments borrowed from premium fintech pages on
// 4 Sep 2026: the gold Patron name and price on a warm ink card with a light
// spill, the horizon rule at the footer seam, the top-lit demo frame, and the
// one-time reveal on the homepage grid and Patron section. The reveal must
// never hide content from a visitor without JavaScript or with reduced motion.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => {
  browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch();
});
after(async () => { await browser?.close(); });

async function openPage({ width = 1440, path = '/', reducedMotion = 'reduce', javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion, javaScriptEnabled });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  if (javaScriptEnabled) await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const luminance = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255)
  .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
  .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('the Patron offer sets its name and price in gold on warm ink under a light spill', async () => {
  const { page, context } = await openPage();
  try {
    const patron = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const section = document.querySelector('.home-patron');
      const s = getComputedStyle(section);
      return {
        warmInk: root.getPropertyValue('--site-ink-warm').trim(),
        goldOnDark: root.getPropertyValue('--site-gold-on-dark').trim(),
        background: s.backgroundColor,
        backgroundImage: s.backgroundImage,
        name: getComputedStyle(section.querySelector('.home-patron-name')).color,
        amount: getComputedStyle(section.querySelector('.home-patron-amount')).color,
        intro: getComputedStyle(section.querySelector('.home-patron-intro')).color,
        mark: getComputedStyle(section.querySelector('.home-patron-mark')).color,
        cta: getComputedStyle(section.querySelector('.cta')).backgroundColor,
      };
    });
    // Minified production CSS lowercases hex, the dev server does not.
    assert.equal(patron.warmInk.toLowerCase(), '#12100b');
    assert.equal(patron.background, 'rgb(18, 16, 11)', 'Patron sits on the website-only warm ink');
    assert.match(patron.backgroundImage, /radial-gradient/, 'a gold light spill is painted on the card');
    assert.equal(patron.name, 'rgb(212, 173, 102)', 'the Patron name is gold');
    assert.equal(patron.amount, 'rgb(212, 173, 102)', 'the price numeral is gold');
    assert.equal(patron.intro, 'rgb(247, 240, 229)', 'supporting copy stays ivory');
    assert.equal(patron.mark, 'rgb(247, 240, 229)', 'the Sunrise mark stays monochrome ivory');
    assert.equal(patron.cta, 'rgb(212, 173, 102)', 'the filled gold button is unchanged');
    assert.ok(ratio(patron.goldOnDark, patron.warmInk) >= 4.5, 'gold on warm ink meets 4.5:1');
    assert.ok(ratio('#F7F0E5', patron.warmInk) >= 4.5, 'ivory on warm ink meets 4.5:1');
  } finally { await context.close(); }
});

test('a gold horizon rule marks the footer seam on every page profile without overflow', async () => {
  const { page, context } = await openPage();
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/features/island', '/privacy']) {
        await page.goto(`${baseURL}${path}`);
        const seam = await page.evaluate(() => {
          const footer = document.querySelector('.site-footer');
          const glow = getComputedStyle(footer, '::before');
          const line = getComputedStyle(footer, '::after');
          return {
            position: getComputedStyle(footer).position,
            glow: glow.backgroundImage,
            glowHeight: parseFloat(glow.height),
            line: line.backgroundImage,
            lineHeight: line.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
            footerBackground: getComputedStyle(footer).backgroundColor,
          };
        });
        assert.equal(seam.position, 'relative', `${width}px ${path}: footer anchors its seam`);
        assert.match(seam.glow, /radial-gradient/, `${width}px ${path}: glow above the seam`);
        assert.ok(seam.glowHeight >= 96, `${width}px ${path}: glow has height, got ${seam.glowHeight}`);
        assert.match(seam.line, /linear-gradient/, `${width}px ${path}: horizon line`);
        assert.equal(seam.lineHeight, '1px', `${width}px ${path}: the line is a hairline`);
        assert.equal(seam.overflow, false, `${width}px ${path} overflows`);
        assert.equal(seam.footerBackground, 'rgb(239, 230, 216)', 'footer surface unchanged');
      }
    }
  } finally { await context.close(); }
});

test('the demo showcase frame is lit from the top', async () => {
  const { page, context } = await openPage();
  try {
    const frame = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.demo-showcase'));
      return { image: s.backgroundImage, color: s.backgroundColor };
    });
    assert.match(frame.image, /linear-gradient/);
    assert.equal(frame.color, 'rgb(239, 230, 216)', 'the frame still resolves to the warm surface');
  } finally { await context.close(); }
});

test('the homepage reveal never hides content without JavaScript or with reduced motion', async () => {
  const html = await (await fetch(`${baseURL}/`)).text();
  assert.doesNotMatch(html, /class="[^"]*\bis-(?:waiting|revealed)\b/, 'server HTML carries no reveal state on any element');

  const noScript = await openPage({ javaScriptEnabled: false });
  try {
    const visible = await noScript.page.locator('.home-feature').evaluateAll(els => els.map(el => getComputedStyle(el).opacity));
    assert.deepEqual(visible, ['1', '1', '1']);
  } finally { await noScript.context.close(); }

  const reduced = await openPage({ reducedMotion: 'reduce' });
  try {
    const grid = await reduced.page.locator('.home-feature').evaluateAll(els => els.map(el => [getComputedStyle(el).opacity, getComputedStyle(el).transform]));
    assert.deepEqual(grid, [['1', 'none'], ['1', 'none'], ['1', 'none']], 'reduced motion sees the grid at rest');
    const patron = await reduced.page.locator('.home-patron').evaluate(el => getComputedStyle(el).opacity);
    assert.equal(patron, '1');
  } finally { await reduced.context.close(); }
});

test('the feature grid and Patron section rise once into view, then stay put', async () => {
  const { page, context } = await openPage({ reducedMotion: 'no-preference' });
  try {
    const belowFold = await page.locator('.home-feature-grid').evaluate(el => el.getBoundingClientRect().top > innerHeight);
    assert.equal(belowFold, true, 'the grid starts below a 900px viewport');
    const waiting = await page.locator('.home-feature').evaluateAll(els => els.map(el => [el.classList.contains('is-waiting'), getComputedStyle(el).opacity]));
    assert.deepEqual(waiting, [[true, '0'], [true, '0'], [true, '0']], 'below-fold cards wait for the viewport');

    await page.locator('.home-feature-grid').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('.home-feature')].every(el => el.classList.contains('is-revealed') && getComputedStyle(el).opacity === '1'), null, { timeout: 5000 });
    const delays = await page.locator('.home-feature').evaluateAll(els => els.map(el => getComputedStyle(el).animationDelay));
    assert.equal(new Set(delays).size, 3, `cards stagger, got ${delays.join(' ')}`);

    await page.locator('.home-patron').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector('.home-patron');
      return el.classList.contains('is-revealed') && getComputedStyle(el).opacity === '1';
    }, null, { timeout: 5000 });

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const settled = await page.evaluate(() => [...document.querySelectorAll('.home-feature, .home-patron')].map(el => [el.classList.contains('is-waiting'), getComputedStyle(el).opacity]));
    assert.deepEqual(settled, settled.map(() => [false, '1']), 'a revealed section never hides again');
  } finally { await context.close(); }
});
