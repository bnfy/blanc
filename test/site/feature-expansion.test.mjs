import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const routes = ['start-page', 'glance', 'workspaces', 'profiles', 'reopen-closed-tabs'];
const linkTab = process.env.BLANC_SITE_BROWSER === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function contextFor(options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  return context;
}

test('new feature breadcrumbs stay lowercase and native corners have no black backing', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  try {
    for (const route of routes) {
      await page.goto(`${baseURL}/features/${route}`);
      const crumbs = await page.locator('.breadcrumb').innerText();
      assert.equal(crumbs, crumbs.toLowerCase(), `${route}: lowercase breadcrumbs`);
      const backgrounds = await page.locator('.released-capture img').evaluateAll(images => images.map(image => getComputedStyle(image).backgroundColor));
      assert.ok(backgrounds.length, `${route}: native product capture`);
      assert.ok(backgrounds.every(color => color === 'rgba(0, 0, 0, 0)'), `${route}: transparent corners blend into the frame`);
    }
  } finally { await context.close(); }
});

test('expanded pages load their images and fit 360, 768, and 1440 pixel viewports', { timeout: 120000 }, async () => {
  const context = await contextFor();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/features', '/download', '/faq', '/press', ...routes.map(route => `/features/${route}`)]) {
        assert.equal((await page.goto(`${baseURL}${route}`)).status(), 200, route);
        for (const img of await page.locator('main img[src^="/feature-captures/"]').all()) {
          await img.scrollIntoViewIfNeeded();
          await img.evaluate(image => image.decode());
          assert.ok(await img.evaluate(image => image.complete && image.naturalWidth === 1440), `${route}: capture loaded`);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px ${route}: no horizontal overflow`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('homepage showcase and six-card grid stay visible without JavaScript', async () => {
  const context = await contextFor({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(baseURL);
      assert.equal(await page.locator('.home-start-captures img').count(), 2);
      assert.equal(await page.locator('.home-feature-grid > article').count(), 6);
      assert.ok(await page.locator('.home-start-page').isVisible());
      const columns = await page.locator('.home-feature-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width <= 760 ? 1 : 3, `${width}px: preserve existing responsive grid`);
      const demoPrecedes = await page.locator('.home-start-page').evaluate(showcase => Boolean(document.querySelector('.demo-showcase').compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING));
      assert.ok(demoPrecedes, 'static showcase follows the existing interactive demo');
      for (const card of await page.locator('.home-feature-grid > article').all()) assert.ok(await card.isVisible());
    }
  } finally { await context.close(); }
});

test('new guides have unique metadata, keyboard-reachable captures, and the existing CTA event', async () => {
  const context = await contextFor({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const titles = new Set();
  const descriptions = new Set();
  try {
    for (const route of routes) {
      await page.goto(`${baseURL}/features/${route}`);
      titles.add(await page.title());
      descriptions.add(await page.locator('meta[name="description"]').getAttribute('content'));
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `https://blancbrowser.com/features/${route}`);
      const feature = route === 'workspaces' ? 'named-workspaces' : route;
      assert.equal(await page.locator('.feature-close [data-track="feature_cta_click"]').getAttribute('data-feature'), feature);
      await page.locator('.breadcrumb a').last().focus();
      await page.keyboard.press(linkTab);
      assert.ok(await page.locator('.released-capture > a').first().evaluate(link => document.activeElement === link), `${route}: image link follows breadcrumb in keyboard order`);
      assert.notEqual(await page.locator('.released-capture > a').first().evaluate(link => getComputedStyle(link).outlineStyle), 'none');
    }
    assert.equal(titles.size, 5);
    assert.equal(descriptions.size, 5);
  } finally { await context.close(); }
});

test('feature hub has fourteen ordered guides and Press captures download as real PNGs', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const hrefs = await page.locator('.feature-hub-row .text-link').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.deepEqual(hrefs, ['island', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'command-palette', 'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync', 'security'].map(route => `/features/${route}`));
    assert.equal(await page.locator('#small-details-title').innerText(), 'Smaller details that matter.');
    await page.goto(`${baseURL}/press`);
    const downloads = page.locator('.press-feature-gallery figcaption a[download]');
    assert.equal(await downloads.count(), 6);
    for (const link of await downloads.all()) {
      const href = await link.getAttribute('href');
      const response = await context.request.get(new URL(href, baseURL).href);
      assert.equal(response.status(), 200, href);
      const bytes = await response.body();
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(16), 1440);
      assert.equal(bytes.readUInt32BE(20), 900);
    }
    const downloaded = page.waitForEvent('download');
    await downloads.first().click();
    assert.equal((await downloaded).suggestedFilename(), 'billboard.png');
  } finally { await context.close(); }
});
