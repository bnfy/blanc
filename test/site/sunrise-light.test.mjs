// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/sunrise-light.test.mjs
//
// Guards the Sunrise "light" treatments borrowed from premium fintech pages on
// 4 Sep 2026: the gold Patron name and price on a warm ink card with a light
// spill and the horizon rule at the footer seam.
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
        nameFont: getComputedStyle(section.querySelector('.home-patron-name')).fontFamily,
        amountFont: getComputedStyle(section.querySelector('.home-patron-amount')).fontFamily,
        serifLoaded: document.fonts.check('84px "Newsreader Variable"'),
        instrumentGone: [...document.fonts].every(font => font.family !== 'Instrument Serif'),
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
    assert.match(patron.nameFont, /^"?Newsreader Variable"?/, 'the Patron name is set in Newsreader');
    assert.match(patron.amountFont, /^"?Newsreader Variable"?/, 'the price numeral is set in Newsreader');
    assert.equal(patron.serifLoaded, true, 'the self-hosted Newsreader face is loaded');
    assert.equal(patron.instrumentGone, true, 'Instrument Serif is no longer declared');
  } finally { await context.close(); }
});

test('a gold horizon rule marks the footer seam on every page profile without overflow', async () => {
  const { page, context } = await openPage();
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/features/island', '/privacy', '/mail']) {
        await page.goto(`${baseURL}${path}`);
        const seam = await page.evaluate(() => {
          const footer = document.querySelector('.website-footer');
          const glow = getComputedStyle(footer, '::before');
          const line = getComputedStyle(footer, '::after');
          return {
            position: getComputedStyle(footer).position,
            glow: glow.backgroundImage,
            glowHeight: parseFloat(glow.height),
            line: line.backgroundImage,
            lineHeight: line.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
            footerBorder: getComputedStyle(footer).borderTopWidth,
          };
        });
        assert.equal(seam.position, 'relative', `${width}px ${path}: footer anchors its seam`);
        assert.match(seam.glow, /radial-gradient/, `${width}px ${path}: glow above the seam`);
        assert.ok(seam.glowHeight >= 96, `${width}px ${path}: glow has height, got ${seam.glowHeight}`);
        assert.match(seam.line, /linear-gradient/, `${width}px ${path}: horizon line`);
        assert.equal(seam.lineHeight, '1px', `${width}px ${path}: the line is a hairline`);
        assert.equal(seam.overflow, false, `${width}px ${path} overflows`);
        assert.equal(seam.footerBorder, '0px', `${width}px ${path}: the rule replaces the neutral top border`);
      }
    }
  } finally { await context.close(); }
});
