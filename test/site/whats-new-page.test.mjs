import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// /whats-new/<major>.<minor>: the page Blanc opens once after a feature update
// (docs/superpowers/specs/2026-10-19-whats-new-page-design.md). One highlight
// at a time after Chrome's What's New tab, colored tiles, no analytics.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/whats-new.json'), 'utf8'));
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const page138 = data.pages.find((p) => p.release === '1.38');
const ids = page138.highlights.map((h) => h.id);
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  const requests = [];
  await context.route('**/*', (route) => {
    const address = new URL(route.request().url());
    requests.push(address.pathname);
    if (address.origin !== new URL(baseURL).origin) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}${url}`);
  return { context, page, requests };
}

const visibleSections = (page) => page.$$eval('.wn-highlight', (els) => els.filter((el) => el.offsetParent !== null).map((el) => el.id));

test('the 1.38 page wears the site masthead and footer, a gold kicker and the first highlight', async () => {
  const { context, page } = await open('/whats-new/1.38');
  assert.equal(await page.locator('.site-header .site-lockup').count(), 1, 'the shared masthead with the lockup');
  assert.equal(await page.locator('.website-footer').count(), 1, 'the shared footer and its horizon rule');
  assert.equal(await page.locator('.wn .section-kicker').innerText(), 'WHAT’S NEW · BLANC 1.38 · OCTOBER 18');
  assert.deepEqual(await visibleSections(page), [ids[0]]);
  await context.close();
});

test('controls use the site\'s own button, link and capture styles', async () => {
  const { context, page } = await open('/whats-new/1.38');
  const section = page.locator(`#${ids[0]}`);
  assert.equal(await section.locator('button.cta.wn-next').count(), 1, 'Next is the dark primary button');
  assert.equal(await section.locator('a.text-link.wn-learn-more').count(), 1, 'Learn more is a text link');
  assert.equal(await section.locator('figure.product-capture.released-capture').count(), 1, 'captures sit in the site frame');
  const ink = await section.locator('.wn-next').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(ink, 'rgb(17, 17, 17)', 'the shared --site-accent ink');
  assert.equal(await page.locator('[data-color]').count(), 0, 'no Spaces colors on website chrome');
  await context.close();
});

test('tiles, Next and arrow keys move between highlights and Next wraps', async () => {
  const { context, page } = await open('/whats-new/1.38');
  await page.locator('.wn-tile').nth(1).click();
  assert.deepEqual(await visibleSections(page), [ids[1]]);
  assert.equal(await page.locator('.wn-tile').nth(1).getAttribute('aria-current'), 'true');
  assert.equal(new URL(page.url()).hash, `#${ids[1]}`);
  await page.locator(`#${ids[1]} .wn-next`).click();
  assert.deepEqual(await visibleSections(page), [ids[2]]);
  await page.locator(`#${ids.at(-1)} .wn-next`).click();
  assert.deepEqual(await visibleSections(page), [ids[0]], 'Next on the last highlight wraps to the first');
  await page.locator('.wn-tile').nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await visibleSections(page), [ids[1]]);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await visibleSections(page), [ids.at(-1)], 'arrows wrap too');
  await context.close();
});

test('a hash opens that highlight', async () => {
  const { context, page } = await open(`/whats-new/1.38#${ids[1]}`);
  assert.deepEqual(await visibleSections(page), [ids[1]]);
  await context.close();
});

test('a hash on arrival keeps the page at the top, header in view', async () => {
  const { context, page } = await open(`/whats-new/1.38#${ids.at(-1)}`, { viewport: { width: 375, height: 812 } });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 375), true);
  await context.close();
});

test('no analytics, no consent banner, no newsletter prompt', async () => {
  const { context, page, requests } = await open('/whats-new/1.38');
  await page.waitForLoadState('networkidle');
  assert.ok(!requests.some((p) => /site\.[^/]*\.js$|googletagmanager|gtag/.test(p)), requests.join('\n'));
  assert.equal(await page.locator('[data-consent], .consent, #consent').count(), 0);
  assert.equal(await page.locator('[data-newsletter-prompt]').count(), 0);
  await context.close();
});

test('the changelog link points at the release anchor', async () => {
  const { context, page } = await open('/whats-new/1.38');
  const line = page.locator('.wn-changelog');
  assert.equal(await line.innerText(), 'Want every detail? Read the full changelog on blanc.day');
  assert.equal(await line.locator('a').getAttribute('href'), '/changelog#v1-38-0');
  await context.close();
});

test('Learn more opens the feature page, only where a highlight has one', async () => {
  const { context, page } = await open('/whats-new/1.38');
  for (const h of page138.highlights) {
    const link = page.locator(`#${h.id} .wn-learn-more`);
    assert.equal(await link.count(), h.learnMore ? 1 : 0, h.id);
    if (h.learnMore) assert.equal(await link.getAttribute('href'), h.learnMore);
  }
  await context.close();
});

test('without scripting every highlight reads in order', async () => {
  const { context, page } = await open('/whats-new/1.38', { javaScriptEnabled: false });
  assert.deepEqual(await visibleSections(page), ids);
  await context.close();
});

test('at phone width nothing overflows', async () => {
  const { context, page } = await open('/whats-new/1.38', { viewport: { width: 375, height: 812 } });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375));
  await context.close();
});

test('/whats-new leads to the newest page and is not indexed', async () => {
  const html = await (await fetch(`${baseURL}/whats-new`)).text();
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  const { context, page } = await open('/whats-new');
  await page.waitForURL(/\/whats-new\/1\.38$/);
  await context.close();
});
