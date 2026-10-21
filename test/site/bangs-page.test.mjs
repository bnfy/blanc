import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { directoryRows, filterBangs } from '../../site/src/scripts/bangs-directory.mjs';

// /bangs: the headline, a search, the app's popular bangs as icon cards, the
// full list, and one short How bangs work section
// (docs/superpowers/specs/2026-10-17-bangs-page-redesign-design.md).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/bangs.json'), 'utf8'));
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const url = `${baseURL}/bangs`;
const countText = data.count.toLocaleString('en-US');
// The icon server is a separate Worker; here a 1×1 PNG stands in for it.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(options = {}, { blockData = false, icons = 'png' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  const requests = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.origin !== new URL(baseURL).origin) return route.abort();
    if (address.pathname.startsWith('/bang-icons/')) {
      return icons === 'png'
        ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
        : route.fulfill({ status: 404, body: '' });
    }
    if (blockData && /bangs\.[^/]*\.json$/.test(request.url())) return route.fulfill({ status: 404, body: '' });
    return route.continue();
  });
  await context.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  const page = await context.newPage();
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(url);
  return { context, page, requests };
}

const visibleRows = (page) => page.locator('#bangs-rows li:not([hidden])');
// Typing waits 120 ms before the list updates; wait for the page to apply
// this query rather than a fixed delay, which a slow runner can outlast.
const search = async (page, text) => {
  await page.locator('#bangs-search').fill(text);
  await page.waitForFunction((q) => document.querySelector('[data-view]')?.dataset.query === q, text);
};

test('the page leads with its headline, search and the popular bangs', async () => {
  const { context, page } = await open();
  try {
    assert.equal((await page.locator('h1').innerText()).trim(), 'Search the site. Skip the engine.');
    assert.equal((await page.locator('.breadcrumb').innerText()).replace(/\s+/g, ' ').trim(), 'home / features / bangs');
    assert.equal(
      (await page.locator('.bangs-hero p').innerText()).replace(/\s+/g, ' ').trim(),
      'Type a site’s code before your search, like !yt lofi, to go straight to its results. Works with any search engine.',
    );
    const order = await page.evaluate(() => {
      const at = (selector) => document.querySelector(selector);
      return at('#bangs-search').compareDocumentPosition(at('#bangs-cards')) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    assert.ok(order, 'the search comes before the cards');
    assert.deepEqual(await page.locator('#bangs-cards li').evaluateAll((cards) => cards.map((card) => card.dataset.code)), data.popular);
    assert.equal(await page.locator('#bangs-cards a').count(), 0, 'cards are not links');
    assert.equal(await page.locator('#bangs-try, a[href="#find-a-bang"]').count(), 0);
  } finally { await context.close(); }
});

test('without JavaScript every bang and card is in the page', async () => {
  const { context, page } = await open({ javaScriptEnabled: false });
  try {
    assert.equal(await page.locator('#bangs-cards li').count(), 19);
    assert.equal(await page.locator('#bangs-rows li').count(), data.count);
    assert.equal(await page.locator('#bangs-search-them').isVisible(), false);
    assert.equal(await page.locator('#bangs-browse').isVisible(), false);
    assert.match(await page.locator('.bangs-dir-sub').innerText(), new RegExp(countText));
  } finally { await context.close(); }
});

test('a missing icon leaves the lettered tile', async () => {
  for (const javaScriptEnabled of [true, false]) {
    const { context, page, requests } = await open({ javaScriptEnabled }, { icons: 'missing' });
    try {
      await page.waitForTimeout(400);
      const letters = await page.locator('#bangs-cards .bangs-icon').evaluateAll((tiles) => tiles.map((tile) => tile.textContent.trim()));
      assert.equal(letters.length, 19);
      for (const letter of letters) assert.match(letter, /^[\p{L}\p{N}?]$/u);
      if (javaScriptEnabled) {
        const broken = await page.evaluate(() => [...document.querySelectorAll('#bangs-cards img')].filter((img) => img.complete && img.naturalWidth === 0).length);
        assert.equal(broken, 0, 'a broken image stayed in the page');
      } else {
        // Without the script nothing can tell a failed icon from a loaded
        // one, so no icon is requested and the letters are the page.
        assert.equal(requests.filter((address) => new URL(address).pathname.startsWith('/bang-icons/')).length, 0);
        const shown = await page.locator('#bangs-cards img').evaluateAll((imgs) => imgs.filter((img) => img.getAttribute('src') || getComputedStyle(img).opacity !== '0').length);
        assert.equal(shown, 0, 'an icon image is drawn over a tile');
      }
    } finally { await context.close(); }
  }
});

test('a loaded icon sits on the card with no tile, plate or edge around it', async () => {
  const { context, page } = await open();
  try {
    await page.waitForFunction(() => document.querySelectorAll('#bangs-cards img.is-loaded').length === 19);
    const looks = await page.locator('#bangs-cards .bangs-icon').evaluateAll((tiles) => tiles.map((tile) => {
      const img = tile.querySelector('img');
      return [getComputedStyle(tile).backgroundColor, getComputedStyle(tile).color, getComputedStyle(img).backgroundColor];
    }));
    for (const [tile, letter, plate] of looks) {
      assert.equal(tile, 'rgba(0, 0, 0, 0)', 'the tile keeps its color behind a loaded icon');
      assert.equal(letter, 'rgba(0, 0, 0, 0)', 'the letter shows behind a loaded icon');
      assert.equal(plate, 'rgba(0, 0, 0, 0)', 'the icon has a plate');
    }
  } finally { await context.close(); }
});

test('phones get two card columns and no sideways scroll', async () => {
  const { context, page } = await open({ viewport: { width: 360, height: 780 } });
  try {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `page overflows by ${overflow}px`);
    const tops = await page.locator('#bangs-cards li').evaluateAll((cards) => cards.slice(0, 3).map((card) => Math.round(card.getBoundingClientRect().top)));
    assert.equal(tops[0], tops[1], 'the first two cards share a row');
    assert.notEqual(tops[1], tops[2], 'the third card starts a new row');
  } finally { await context.close(); }
});

test('How bangs work comes after the index', async () => {
  const { context, page } = await open();
  try {
    const after = await page.evaluate(() => !!(document.querySelector('#bangs-list').compareDocumentPosition(document.querySelector('.bangs-how')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.ok(after);
    assert.equal((await page.locator('.bangs-how h2').innerText()).trim(), 'How bangs work');
    assert.equal(await page.locator('.bangs-how li').count(), 4);
    const how = await page.locator('.bangs-how').textContent();
    assert.match(how, /A bang typed at the end is different/);
    assert.match(how, /Google or DuckDuckGo/);
  } finally { await context.close(); }
});

test('typing shows matching rows instead of the cards', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await page.locator('#bangs-cards').isVisible(), true, 'the cards show first');
    assert.equal(await page.locator('#bangs-list').count(), 1);
    assert.equal(await page.locator('#bangs-list').isVisible(), false, 'the list starts folded away');
    await search(page, 'youtube');
    assert.equal(await page.locator('#bangs-cards').isVisible(), false);
    assert.equal(await page.locator('#bangs-list').isVisible(), true);
    assert.equal(await visibleRows(page).first().getAttribute('data-code'), 'yt');
    const n = filterBangs(directoryRows(data), 'youtube').length;
    assert.equal((await page.locator('#bangs-count').innerText()).trim(), `${n.toLocaleString('en-US')} bangs`);
  } finally { await context.close(); }
});

test('clearing the search brings the cards back and resets the list', async () => {
  const { context, page } = await open();
  try {
    await search(page, 'a');
    await page.locator('#bangs-more').click();
    assert.equal(await visibleRows(page).count(), 100);
    await search(page, '');
    assert.equal(await page.locator('#bangs-cards').isVisible(), true);
    assert.equal(await page.locator('#bangs-list').isVisible(), false);
    await search(page, 'a');
    assert.equal(await visibleRows(page).count(), 50);
  } finally { await context.close(); }
});

test('Browse all opens the full list and Search them focuses the box', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#bangs-browse').click();
    assert.equal(await page.locator('#bangs-list').isVisible(), true);
    assert.equal(await visibleRows(page).count(), 50);
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing 50 of ${countText}`));
    await page.reload();
    await page.locator('#bangs-search-them').click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'bangs-search');
  } finally { await context.close(); }
});

test('Browse all moves focus to the list and can be closed', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#bangs-browse').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'bangs-dir-title');
    assert.equal((await page.locator('#bangs-dir-title').innerText()).trim(), 'Every bang in Blanc');
    assert.equal(await page.locator('#bangs-back').isVisible(), true);
    await page.locator('#bangs-back').click();
    assert.equal(await page.locator('#bangs-cards').isVisible(), true);
    assert.equal(await page.locator('#bangs-list').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'bangs-browse');
    await search(page, 'youtube');
    await page.locator('#bangs-back').click();
    assert.equal(await page.locator('#bangs-search').inputValue(), '', 'going back clears the search');
    assert.equal(await page.locator('#bangs-cards').isVisible(), true);
  } finally { await context.close(); }
});

test('the fold leaves the last cards readable', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#bangs-fold'), '::before').content), 'none');
  } finally { await context.close(); }
});

test('only shown rows ask for icons', async () => {
  const { context, page, requests } = await open();
  try {
    await page.locator('#bangs-browse').click();
    await page.waitForTimeout(500);
    const icons = requests.filter((address) => new URL(address).pathname.startsWith('/bang-icons/'));
    assert.ok(icons.length <= 50 + 19, `${icons.length} icon requests`);
    for (const address of icons) assert.equal(new URL(address).origin, new URL(baseURL).origin);
    const rowIcons = await visibleRows(page).evaluateAll((rows) => rows.filter((row) => row.querySelector('.bangs-icon img')).length);
    assert.equal(rowIcons, 50, 'every shown row has its icon');
    assert.equal(await page.locator('#bangs-rows li[hidden] img').count(), 0, 'hidden rows have no icon');
  } finally { await context.close(); }
});

test('keyboard focus shows on the search box and the fold buttons', async () => {
  const { context, page } = await open();
  try {
    const ring = (selector) => page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}|${style.borderColor}`;
    });
    const resting = await ring('.bangs-search');
    await page.locator('#bangs-search').focus();
    assert.notEqual(await ring('.bangs-search'), resting, 'the search shows focus');
    for (const id of ['#bangs-search-them', '#bangs-browse']) {
      await page.locator(id).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const style = await page.locator(id).evaluate((el) => ({ focused: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle }));
      assert.ok(style.focused && style.outline !== 'none', `${id} has no focus ring`);
    }
  } finally { await context.close(); }
});

test('the directory searches by site and by code and keeps its counts truthful', async () => {
  const { context, page } = await open();
  try {
    for (const query of ['youtube', 'yt']) {
      await page.locator('#bangs-search').fill(query);
      await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    }
    await search(page, 'goo');
    if (await page.locator('#bangs-more').isVisible()) await page.locator('#bangs-more').click();
    const shown = await visibleRows(page).count();
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing ${shown.toLocaleString('en-US')} of`));
  } finally { await context.close(); }
});

test('once the data arrives, search finds a bang by an alias its row does not show', async () => {
  const { context, page } = await open();
  try {
    assert.doesNotMatch(await page.locator('#bangs-rows li[data-code="alpha"] small').textContent(), /!wra\b/);
    await page.locator('#bangs-search').focus();
    await page.waitForLoadState('networkidle');
    await page.locator('#bangs-search').fill('wra');
    await page.waitForFunction(() => !!document.querySelector('#bangs-rows li[data-code="alpha"]:not([hidden])'));
  } finally { await context.close(); }
});

test('bangs that search through another engine are marked', async () => {
  const { context, page } = await open({ javaScriptEnabled: false });
  try {
    // textContent: rows off screen are skipped by content-visibility, which innerText honors.
    assert.match(await page.locator('#bangs-rows li[data-code="ubuntufr"]').textContent(), /via Google/);
    assert.match(await page.locator('#bangs-rows li[data-code="aamulehti"]').textContent(), /via DuckDuckGo/);
    assert.doesNotMatch(await page.locator('#bangs-rows li[data-code="yt"]').textContent(), /via /);
    assert.equal(await page.locator('#bangs-rows [data-via]').count(), Object.keys(data.via).length);
  } finally { await context.close(); }
});

test('the search box is at least 16px on phones, so iOS does not zoom in', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 } });
  try {
    assert.ok(parseFloat(await page.locator('#bangs-search').evaluate((el) => getComputedStyle(el).fontSize)) >= 16);
  } finally { await context.close(); }
});

test('a long pasted search never scrolls the page sideways, and long codes are never cut off', async () => {
  const { context, page } = await open({ viewport: { width: 360, height: 780 } });
  try {
    await page.locator('#bangs-search').fill(`https://example.com/${'a'.repeat(400)}`);
    await page.waitForFunction(() => /No bang matches/.test(document.querySelector('#bangs-showing').textContent));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflows');
    const longest = data.entries.map((entry) => entry[0]).sort((a, b) => b.length - a.length)[0];
    await page.locator('#bangs-search').fill(longest);
    await page.waitForFunction((code) => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === code, longest);
    const row = page.locator(`#bangs-rows li[data-code="${longest}"]`);
    await row.scrollIntoViewIfNeeded();
    assert.equal(await row.locator('b').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, `!${longest} is cut off`);
  } finally { await context.close(); }
});

test('every bang is set in the app\'s Instrument Sans with its chip, and the page around it in Blubird', async () => {
  const { context, page } = await open();
  try {
    await search(page, 'youtube');
    const family = (selectors) => page.evaluate((list) => Object.fromEntries(
      list.map((selector) => [selector, getComputedStyle(document.querySelector(selector)).fontFamily])), selectors);
    const bangs = ['.bangs-card-codes .bang-chip', '#bangs-rows li b', '#bangs-rows li[data-code="yt"] small kbd', '.bangs-hero .bang-chip', '.bangs-how .bang-chip'];
    for (const [selector, value] of Object.entries(await family(bangs))) {
      assert.match(value, /^"Instrument Sans"/, `${selector} is ${value}`);
    }
    for (const selector of bangs) {
      const style = await page.locator(selector).first().evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, background: getComputedStyle(el).backgroundColor }));
      assert.ok(parseFloat(style.radius) > 0, `${selector} is not round`);
      assert.doesNotMatch(style.background, /rgba\(0, 0, 0, 0\)|transparent/, `${selector} has no chip`);
    }
    for (const [selector, value] of Object.entries(await family(['#bangs-search', '#bangs-rows li em', '#bangs-count', '.bangs-card-name']))) {
      assert.match(value, /^"Blubird Text"/, `${selector} is ${value}`);
    }
  } finally { await context.close(); }
});

test('if the data asset fails, search still works from the page', async () => {
  const { context, page } = await open({}, { blockData: true });
  try {
    await page.locator('#bangs-search').fill('youtube');
    await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    assert.equal(await page.locator('.bangs-error, [role="alert"]').count(), 0);
  } finally { await context.close(); }
});

test('the page and its data stay within budget', () => {
  const html = fs.statSync(path.join(ROOT, 'site/dist/bangs.html')).size;
  assert.ok(html <= 1.8 * 1024 * 1024, `bangs.html is ${html} bytes`);
  const assets = fs.readdirSync(path.join(ROOT, 'site/dist/_astro')).filter((name) => /^bangs\..*\.json$/.test(name));
  assert.equal(assets.length, 1, 'one hashed bang data asset');
  const json = fs.statSync(path.join(ROOT, 'site/dist/_astro', assets[0])).size;
  assert.ok(json <= 1.6 * 1024 * 1024, `bang data is ${json} bytes`);
});
