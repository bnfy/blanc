// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/blubird-reach.test.mjs
//
// Since October 15, 2026 every page is set in Blubird (site/src/styles/blubird.css):
// headings in Blubird Display at regular weight and 0 tracking, text in Blubird
// Text. Both fall back to Inter where the licensed files are absent, as in CI,
// so these checks match the stack, not the face that rendered. It replaced the
// Newsreader reach decision of 4 Sep 2026; product replicas keep Inter.
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

const display = /^"?Blubird Display"?, "?Inter/;
const text = /^"?Blubird Text"?, "?Inter/;

test('the homepage, header and footer are Blubird over Inter, and other pages share its stacks', async () => {
  const { page, context } = await openPage('/');
  try {
    const type = await page.evaluate(() => {
      const font = selector => getComputedStyle(document.querySelector(selector));
      return {
        h1: font('main h1').fontFamily, h1Weight: font('main h1').fontWeight, h1Tracking: font('main h1').letterSpacing,
        h2s: [...document.querySelectorAll('main h2')].map(h2 => [getComputedStyle(h2).fontFamily, getComputedStyle(h2).fontWeight, h2.textContent.trim()]),
        lead: font('main .lead').fontFamily,
        nav: font('.revamp-nav-link').fontFamily,
        tagline: font('#site-footer .website-footer-identity p').fontFamily,
      };
    });
    assert.match(type.h1, display, 'homepage h1');
    assert.equal(type.h1Weight, '400');
    // Blubird is drawn with its own spacing: headlines are set at 0.
    assert.ok(['normal', '0px'].includes(type.h1Tracking), `h1 tracking ${type.h1Tracking}`);
    for (const [family, weight, title] of type.h2s) {
      if (title === 'Built by Bananify, an independent software studio.') { assert.match(family, text, title); continue; }
      assert.match(family, display, title);
      assert.equal(weight, '400', title);
    }
    assert.match(type.lead, text, 'homepage copy');
    assert.match(type.nav, text, 'header links');
    assert.match(type.tagline, text, 'footer tagline');
    await page.goto(`${baseURL}/features`);
    const other = await page.evaluate(() => ({
      token: getComputedStyle(document.documentElement).getPropertyValue('--site-font-display').trim(),
      body: getComputedStyle(document.body).fontFamily,
    }));
    assert.match(other.token, /Blubird Display/);
    assert.match(other.body, text);
  } finally { await context.close(); }
});

// Legal pages set their headline in Blubird Display; their section headings
// read as part of the legal text, in Blubird Text.
const legalRoutes = ['/privacy', '/terms'];
const routes = ['/features', '/features/island', '/features/security', '/mail', '/features/ad-blocking', '/download', '/changelog', '/about', '/faq', '/media', '/ambassadors', '/roadmap', '/support', '/patron', '/privacy', '/terms'];

test('every page headline and section heading is Blubird Display at 0 tracking, text is Blubird Text, and nothing overflows', { timeout: 180000 }, async () => {
  const { page, context } = await openPage('/');
  try {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        const response = await page.goto(`${baseURL}${route}`);
        assert.equal(response.status(), 200, route);
        await page.evaluate(() => document.fonts.ready);
        const type = await page.evaluate(() => {
          const h1 = document.querySelector('main h1, .hero h1, h1');
          const s = getComputedStyle(h1);
          const h2 = document.querySelector('main h2');
          const h2Style = h2 ? getComputedStyle(h2) : null;
          return {
            font: s.fontFamily, weight: s.fontWeight, tracking: parseFloat(s.letterSpacing) || 0,
            h2Font: h2Style ? h2Style.fontFamily : null, h2Weight: h2Style ? h2Style.fontWeight : null,
            body: getComputedStyle(document.body).fontFamily,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(type.overflow, false, `${width}px ${route} overflows`);
        assert.match(type.font, display, `${width}px ${route} h1 is Blubird Display`);
        assert.equal(type.weight, '400', `${route} h1 weight`);
        assert.equal(type.tracking, 0, `${route} h1 tracking`);
        assert.match(type.body, text, `${route} text is Blubird Text`);
        if (type.h2Font && legalRoutes.includes(route)) {
          assert.match(type.h2Font, text, `${route} legal section headings are Blubird Text`);
        } else if (type.h2Font) {
          assert.match(type.h2Font, display, `${route} section headings are Blubird Display`);
          assert.equal(type.h2Weight, '400', `${route} section heading weight`);
        }
      }
    }
  } finally { await context.close(); }
});

test('no page declares Newsreader any more', async () => {
  for (const route of ['/', '/features', '/media', '/mail']) {
    const { page, context } = await openPage(route);
    try {
      const declared = await page.evaluate(() => [...document.fonts].some(f => /Newsreader/.test(f.family)));
      assert.equal(declared, false, `${route} declares no Newsreader face`);
    } finally { await context.close(); }
  }
});

test('the Patron page and the newsletter card set every heading in Blubird Display and their copy in Blubird Text', async () => {
  const { page, context } = await openPage('/patron');
  try {
    const patron = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('main :is(h1, h2:not(.sr-only), h3), main summary')].map(el => [el.textContent.trim(), getComputedStyle(el).fontFamily, getComputedStyle(el).fontWeight]),
      copy: [...document.querySelectorAll('main p, main .patron-button')].map(el => [el.textContent.trim().slice(0, 30), getComputedStyle(el).fontFamily]),
    }));
    for (const [title, family, weight] of patron.headings) {
      assert.match(family, display, title);
      assert.equal(weight, '400', title);
    }
    for (const [snippet, family] of patron.copy) {
      if (!/^US\$\d/.test(snippet)) assert.match(family, text, snippet);
    }
    await page.goto(`${baseURL}/features`);
    const card = await page.evaluate(() => {
      const el = document.getElementById('newsletter-prompt');
      return {
        title: getComputedStyle(el.querySelector('h2')).fontFamily,
        weight: getComputedStyle(el.querySelector('h2')).fontWeight,
        copy: [...el.querySelectorAll('p, input[type="email"], button')].map(node => getComputedStyle(node).fontFamily),
      };
    });
    assert.match(card.title, display, 'card title');
    assert.equal(card.weight, '400', 'card title weight');
    for (const family of card.copy) assert.match(family, text, 'card copy');
  } finally { await context.close(); }
});
