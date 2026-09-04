// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs
//
// Level A of the Newsreader reach decision (4 Sep 2026): one Newsreader line
// per page, the press quote in italic, everything else in Inter.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => {
  browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch();
});
after(async () => { await browser?.close(); });

async function openPage(path = '/', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const serif = /^"?Newsreader Variable"?/;
const sans = /^"?Inter/;

test('the homepage headline is Newsreader regular and the demo headline stays Inter', async () => {
  const { page, context } = await openPage('/');
  try {
    const type = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const h1 = getComputedStyle(document.querySelector('.hero h1'));
      const demo = getComputedStyle(document.querySelector('.hero-message h2'));
      return {
        token: root.getPropertyValue('--site-font-display').trim(),
        h1Font: h1.fontFamily, h1Weight: h1.fontWeight, h1Tracking: h1.letterSpacing,
        demoFont: demo.fontFamily,
        loaded: document.fonts.check('64px "Newsreader Variable"'),
      };
    });
    assert.match(type.token, /Newsreader Variable/);
    assert.match(type.h1Font, serif, 'homepage h1 is Newsreader');
    assert.equal(type.h1Weight, '400');
    assert.match(type.demoFont, sans, 'demo showcase headline stays Inter');
    assert.equal(type.loaded, true);
  } finally { await context.close(); }
});

const serifRoutes = ['/features', '/features/island', '/features/ad-blocking', '/download', '/changelog', '/about', '/faq', '/press', '/ambassadors'];
const sansRoutes = ['/privacy', '/terms'];

test('every page headline is Newsreader regular, legal pages stay Inter, nothing overflows', { timeout: 120000 }, async () => {
  const { page, context } = await openPage('/');
  try {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...serifRoutes, ...sansRoutes]) {
        const response = await page.goto(`${baseURL}${route}`);
        assert.equal(response.status(), 200, route);
        await page.evaluate(() => document.fonts.ready);
        const type = await page.evaluate(() => {
          const h1 = document.querySelector('main h1, .hero h1, h1');
          const s = getComputedStyle(h1);
          const h2 = document.querySelector('main h2');
          return {
            font: s.fontFamily, weight: s.fontWeight, tracking: parseFloat(s.letterSpacing),
            size: parseFloat(s.fontSize),
            h2Font: h2 ? getComputedStyle(h2).fontFamily : null,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(type.overflow, false, `${width}px ${route} overflows`);
        if (sansRoutes.includes(route)) {
          assert.match(type.font, sans, `${route} legal h1 stays Inter`);
          continue;
        }
        assert.match(type.font, serif, `${width}px ${route} h1 is Newsreader`);
        assert.equal(type.weight, '400', `${route} h1 weight`);
        assert.ok(Math.abs(type.tracking - type.size * -0.02) < 0.6, `${route} h1 tracking is -0.02em, got ${type.tracking}px at ${type.size}px`);
        if (type.h2Font) assert.match(type.h2Font, sans, `${route} section headings stay Inter`);
      }
    }
  } finally { await context.close(); }
});
