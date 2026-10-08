// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs
//
// Level B of the Newsreader reach decision (4 Sep 2026): every heading in
// Newsreader regular, the press quote in italic, the demo's single-sentence
// figure title and everything else in Inter.
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

test('the homepage headline and footer tagline are Newsreader regular, and the display face loads', async () => {
  const { page, context } = await openPage('/');
  try {
    const type = await page.evaluate(() => {
      const h1 = getComputedStyle(document.querySelector('main h1'));
      return {
        token: getComputedStyle(document.documentElement).getPropertyValue('--site-font-display').trim(),
        h1Font: h1.fontFamily, h1Weight: h1.fontWeight,
        tagFont: getComputedStyle(document.querySelector('#site-footer .website-footer-identity p')).fontFamily,
        loaded: document.fonts.check('64px "Newsreader Variable"'),
      };
    });
    assert.match(type.token, /Newsreader Variable/);
    assert.match(type.h1Font, serif, 'homepage h1 is Newsreader');
    assert.equal(type.h1Weight, '400');
    assert.match(type.tagFont, serif, 'the footer tagline is Newsreader');
    assert.equal(type.loaded, true);
  } finally { await context.close(); }
});

// Since the website revamp (#491) legal pages set their headline in Newsreader
// too, while their section headings stay Inter like the legal text.
const legalRoutes = ['/privacy', '/terms'];
const serifRoutes = ['/features', '/features/island', '/features/ad-blocking', '/download', '/changelog', '/about', '/faq', '/press', '/ambassadors', '/privacy', '/terms'];

test('every page headline and section heading is Newsreader regular with tight tracking, and nothing overflows', { timeout: 120000 }, async () => {
  const { page, context } = await openPage('/');
  try {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of serifRoutes) {
        const response = await page.goto(`${baseURL}${route}`);
        assert.equal(response.status(), 200, route);
        await page.evaluate(() => document.fonts.ready);
        const type = await page.evaluate(() => {
          const h1 = document.querySelector('main h1, .hero h1, h1');
          const s = getComputedStyle(h1);
          const h2 = document.querySelector('main h2');
            const h2Style = h2 ? getComputedStyle(h2) : null;
          return {
            font: s.fontFamily, weight: s.fontWeight, tracking: parseFloat(s.letterSpacing),
            size: parseFloat(s.fontSize),
            h2Font: h2Style ? h2Style.fontFamily : null, h2Weight: h2Style ? h2Style.fontWeight : null,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(type.overflow, false, `${width}px ${route} overflows`);
        assert.match(type.font, serif, `${width}px ${route} h1 is Newsreader`);
        assert.equal(type.weight, '400', `${route} h1 weight`);
        // Display tracking is negative and tight: -0.02em on guides, -0.045em on
        // the revamp's utility pages (revamp.css).
        const em = type.tracking / type.size;
        assert.ok(em <= -0.015 && em >= -0.05, `${route} h1 tracking is tight, got ${em.toFixed(3)}em`);
        if (type.h2Font && legalRoutes.includes(route)) {
          assert.match(type.h2Font, sans, `${route} legal section headings stay Inter`);
        } else if (type.h2Font) {
          assert.match(type.h2Font, serif, `${route} section headings are Newsreader`);
          assert.equal(type.h2Weight, '400', `${route} section heading weight`);
        }
      }
    }
  } finally { await context.close(); }
});

test('the press announcement quote is the only Newsreader italic on the site', async () => {
  const { page, context } = await openPage('/press');
  try {
    const quote = await page.evaluate(() => {
      const p = getComputedStyle(document.querySelector('.press-announcement blockquote p'));
      return { font: p.fontFamily, style: p.fontStyle, weight: p.fontWeight, loaded: document.fonts.check('italic 24px "Newsreader Variable"') };
    });
    assert.match(quote.font, serif);
    assert.equal(quote.style, 'italic');
    assert.equal(quote.weight, '400');
    assert.equal(quote.loaded, true, 'the italic file is loaded on the press page');
  } finally { await context.close(); }

  const home = await openPage('/');
  try {
    const italicDeclared = await home.page.evaluate(() => [...document.fonts].some(f => f.family === 'Newsreader Variable' && f.style === 'italic'));
    assert.equal(italicDeclared, false, 'the italic file is not declared on pages that do not use it');
  } finally { await home.context.close(); }
});
