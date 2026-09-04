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
