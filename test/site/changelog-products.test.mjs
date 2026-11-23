// BLANC_SITE_URL=http://localhost:4341 node --test test/site/changelog-products.test.mjs
// The changelog's product filter (docs/superpowers/specs/2026-11-23-changelog-all-builds-design.md).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(new URL(path, baseURL).href);
  await page.waitForFunction(() => document.documentElement.dataset.changelogReady === 'true');
  return page;
}

const visibleProducts = (page) => page.$$eval('.release-list .release', (items) =>
  [...new Set(items.filter((item) => !item.hidden).map((item) => item.dataset.product))].sort());
const pressed = (page) => page.$eval('[data-product-filter][aria-pressed="true"]', (button) => button.dataset.productFilter);
const visibleCount = (page) => page.$$eval('.release-list .release', (items) => items.filter((item) => !item.hidden).length);

test('opens on Stable', async () => {
  const page = await open('/changelog');
  assert.equal(await pressed(page), 'stable');
  assert.deepEqual(await visibleProducts(page), ['desktop', 'ios']);
  const count = await visibleCount(page);
  assert.match(await page.locator('#changelog-results').innerText(), new RegExp(`^Showing ${count} `));
  await page.close();
});

test('the page without scripting shows Stable too', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/changelog', baseURL).href);
  const hidden = await page.$$eval('.release[data-product="beta"]', (items) => items.every((item) => item.hidden));
  assert.ok(hidden);
  await context.close();
});

test('?product=beta shows only betas', async () => {
  const page = await open('/changelog?product=beta');
  assert.equal(await pressed(page), 'beta');
  assert.deepEqual(await visibleProducts(page), ['beta']);
  await page.close();
});

test('?product=all shows everything', async () => {
  const page = await open('/changelog?product=all');
  assert.deepEqual(await visibleProducts(page), ['beta', 'desktop', 'ios']);
  await page.close();
});

test('?product=bogus behaves as Stable', async () => {
  const page = await open('/changelog?product=bogus');
  assert.equal(await pressed(page), 'stable');
  assert.deepEqual(await visibleProducts(page), ['desktop', 'ios']);
  await page.close();
});

test('a beta anchor opens its entry', async () => {
  const page = await open('/changelog#beta-mac-2-0-0-beta-9');
  assert.equal(await pressed(page), 'all');
  const entry = page.locator('#beta-mac-2-0-0-beta-9');
  assert.ok(await entry.isVisible());
  await page.waitForFunction(() => {
    const box = document.getElementById('beta-mac-2-0-0-beta-9').getBoundingClientRect();
    return box.top >= 0 && box.top < window.innerHeight;
  });
  await page.close();
});

test('New features with Blanc Beta shows the empty state', async () => {
  const page = await open('/changelog');
  await page.click('[data-product-filter="beta"]');
  await page.click('[data-features-toggle]');
  assert.equal(await visibleCount(page), 0);
  assert.equal(await page.locator('.release-empty').innerText(), 'No feature releases found.');
  await page.close();
});

test('the desktop chip says Desktop', async () => {
  const page = await open('/changelog?product=desktop');
  assert.equal(await pressed(page), 'desktop');
  assert.match(await page.locator('[data-product-filter="desktop"]').innerText(), /^Desktop \d+$/);
  assert.deepEqual(await visibleProducts(page), ['desktop']);
  assert.match(await page.locator('#changelog-results').innerText(), /desktop releases$/);
  await page.close();
});

test('choosing a chip updates the address', async () => {
  const page = await open('/changelog');
  await page.click('[data-product-filter="iphone"]');
  assert.equal(new URL(page.url()).searchParams.get('product'), 'iphone');
  assert.deepEqual(await visibleProducts(page), ['ios']);
  await page.click('[data-product-filter="stable"]');
  assert.equal(new URL(page.url()).search, '');
  await page.close();
});

test('existing anchors still work', async () => {
  const page = await open('/changelog#v1-52-0');
  assert.equal(await pressed(page), 'stable');
  assert.ok(await page.locator('#v1-52-0').isVisible());
  await page.close();
});

test('each entry names its product', async () => {
  const page = await open('/changelog?product=all');
  const label = (id) => page.locator(`#${id} .release-product`).innerText();
  assert.equal(await label('v1-52-0'), 'Blanc for desktop');
  assert.equal(await label('ios-1-1'), 'Blanc for iPhone and iPad');
  assert.equal(await label('ios-1-0-2'), 'Blanc for iPhone');
  assert.equal(await label('beta-windows-158-0-8127-904'), 'Blanc Beta for Windows');
  assert.equal(await page.locator('#beta-mac-2-0-0-beta-9 h2').innerText(), 'Blanc Beta 2.0.0-beta.9');
  assert.equal(await page.locator('#ios-1-1 .release-links a').getAttribute('href'), 'https://apps.apple.com/app/id6828027794');
  await page.close();
});

test('the header shows the latest release of each product', async () => {
  const page = await open('/changelog');
  assert.equal(await page.locator('.changelog-hero h1').innerText(), 'What’s new in Blanc');
  const cards = await page.$$eval('.changelog-latest a', (links) => links.map((link) => ({
    href: link.getAttribute('href'), kind: link.querySelector('.changelog-latest-kind').textContent.trim(),
  })));
  assert.deepEqual(cards.map((card) => card.kind.split(' for ')[0]), ['Desktop', 'iPhone & iPad', 'Blanc Beta']);
  const firstOf = (product) => page.$eval(`.release[data-product="${product}"]`, (item) => `#${item.id}`);
  assert.equal(cards[0].href, await firstOf('desktop'));
  assert.equal(cards[1].href, await firstOf('ios'));
  assert.equal(cards[2].href, await firstOf('beta'));
  await page.close();
});

test('the Blanc Beta card opens its entry under All', async () => {
  const page = await open('/changelog');
  const href = await page.locator('.changelog-latest a').nth(2).getAttribute('href');
  await page.locator('.changelog-latest a').nth(2).click();
  await page.waitForFunction((id) => !document.getElementById(id).hidden, href.slice(1));
  assert.equal(await pressed(page), 'all');
  await page.close();
});

for (const width of [375, 768, 900]) {
  test(`at ${width} px nothing scrolls sideways and every chip shows`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(new URL('/changelog', baseURL).href);
    await page.waitForFunction(() => document.documentElement.dataset.changelogReady === 'true');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const outside = await page.$$eval('[data-product-filter], [data-features-toggle], #changelog-search', (items) =>
      items.filter((item) => { const box = item.getBoundingClientRect(); return box.left < 0 || box.right > window.innerWidth; })
        .map((item) => item.dataset.productFilter || item.id || 'toggle'));
    assert.deepEqual(outside, []);
    await page.close();
  });
}

test('a malformed link fragment leaves the filters working', async () => {
  const page = await open('/changelog#%E0%A4%A');
  await page.click('[data-product-filter="beta"]');
  assert.equal(await pressed(page), 'beta');
  await page.close();
});
