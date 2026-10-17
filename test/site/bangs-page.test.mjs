import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// /bangs: the explainer, the try-it box and the full directory
// (docs/superpowers/specs/2026-10-17-bangs-page-design.md).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/bangs.json'), 'utf8'));
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const url = `${baseURL}/bangs`;
const countText = data.count.toLocaleString('en-US');
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(options = {}, { blockData = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  const requests = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(baseURL).origin) return route.abort();
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

test('the page leads with its headline, breadcrumb and a jump to the directory', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal((await page.locator('h1').innerText()).trim(), 'Search the site. Skip the engine.');
    assert.equal((await page.locator('.breadcrumb').innerText()).replace(/\s+/g, ' ').trim(), 'home / features / bangs');
    assert.equal(await page.locator('a[href="#find-a-bang"]').count(), 1);
    assert.equal(await page.locator('#find-a-bang').count(), 1);
  } finally { await context.close(); }
});

test('without JavaScript every bang is in the page and the try-it box shows its example', async () => {
  const { context, page } = await open({ javaScriptEnabled: false });
  try {
    assert.equal(await page.locator('#bangs-rows li').count(), data.count);
    assert.match(await page.locator('#bangs-try-list').innerText(), /!yt[\s\S]*Search YouTube for “lofi”/);
    assert.match(await page.locator('.bangs-dir-sub').innerText(), new RegExp(countText));
  } finally { await context.close(); }
});

test('the try-it box answers as the app does and goes nowhere', async () => {
  const { context, page, requests } = await open();
  try {
    const before = page.url();
    await page.waitForLoadState('networkidle');
    const loaded = requests.length;
    await page.locator('#bangs-try').fill('!w golden retriever');
    await page.waitForFunction(() => document.querySelector('#bangs-try-list').textContent.includes('golden retriever'));
    const list = await page.locator('#bangs-try-list').innerText();
    assert.match(list, /!wikipedia/);
    assert.match(list, /Search Wikipedia for “golden retriever”/);
    assert.match(await page.locator('#bangs-try-dest').innerText(), /Return would open https:\/\/wikipedia\.org\/w\/index\.php\?search=golden\+retriever/);
    await page.locator('#bangs-try').press('Enter');
    await page.waitForTimeout(300);
    assert.equal(page.url(), before);
    assert.equal(context.pages().length, 1);
    // Typing may fetch the page's own bang data asset, and nothing else.
    const typed = requests.slice(loaded).filter((request) => !/\/_astro\/bangs\.[^/]+\.json$/.test(request));
    assert.deepEqual(typed, [], 'typing sends nothing anywhere');
    // The Island's hint line follows the app (overlay.js renderList): the
    // bang hint while a bang is typed, the private-tab note otherwise.
    assert.equal(await page.locator('#bangs-try-hint').innerText(), data.labels.hintBang);
    await page.locator('#bangs-try').fill('plain words');
    // The page's explanation sits under the Island; the app draws no row for it.
    await page.waitForFunction(() => document.querySelector('#bangs-try-dest').textContent.includes('Not a bang'));
    assert.equal(await page.locator('#bangs-try-list').innerText(), '');
    assert.equal(await page.locator('#bangs-try-hint').innerText(), data.labels.hintPrivate);
  } finally { await context.close(); }
});

test('pasted text is capped at 200 characters and the page stays responsive', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#bangs-try').fill(`!yt ${'a'.repeat(5000)}`);
    assert.equal((await page.locator('#bangs-try').inputValue()).length, 200);
    const started = Date.now();
    await page.evaluate(() => 1);
    assert.ok(Date.now() - started < 1000);
  } finally { await context.close(); }
});

test('the directory searches by site and by code and keeps its counts truthful', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await visibleRows(page).count(), 50);
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing 50 of ${countText}`));
    for (const query of ['youtube', 'yt']) {
      await page.locator('#bangs-search').fill(query);
      await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    }
    await page.locator('#bangs-search').fill('goo');
    await page.waitForTimeout(200);
    if (await page.locator('#bangs-more').isVisible()) await page.locator('#bangs-more').click();
    const shown = await visibleRows(page).count();
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing ${shown.toLocaleString('en-US')} of`));
    await page.locator('#bangs-search').fill('');
    await page.waitForTimeout(200);
    assert.equal(await visibleRows(page).count(), 50);
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing 50 of ${countText}`));
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

test('phones get no horizontal scroll', async () => {
  const { context, page } = await open({ viewport: { width: 360, height: 780 } });
  try {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `page overflows by ${overflow}px`);
  } finally { await context.close(); }
});

test('try-it messages and the address show in full, clear of the example chips', async () => {
  for (const width of [1280, 390, 360]) {
    const { context, page } = await open({ viewport: { width, height: 900 } });
    try {
      await page.locator('#bangs-try').fill('!w golden retriever');
      await page.waitForFunction(() => document.querySelector('#bangs-try-list').textContent.includes('golden retriever'));
      const layout = await page.evaluate(() => {
        const dest = document.querySelector('#bangs-try-dest');
        const a = dest.getBoundingClientRect();
        const b = document.querySelector('.bangs-chips').getBoundingClientRect();
        return { clipped: dest.scrollWidth > dest.clientWidth + 1, overlap: a.bottom > b.top && a.top < b.bottom };
      });
      assert.equal(layout.clipped, false, `${width}px: the address is cut off`);
      assert.equal(layout.overlap, false, `${width}px: the address overlaps the chips`);
      for (const [text, needle] of [['plain words', 'Not a bang'], ['!zzqq lofi', 'No bang with that code']]) {
        await page.locator('#bangs-try').fill(text);
        await page.waitForFunction((n) => document.querySelector('#bangs-try-dest').textContent.includes(n), needle);
        const cut = await page.evaluate(() => {
          const message = document.querySelector('#bangs-try-dest');
          const a = message.getBoundingClientRect(), b = document.querySelector('.bangs-chips').getBoundingClientRect();
          return message.scrollWidth > message.clientWidth + 1 || (a.bottom > b.top && a.top < b.bottom);
        });
        assert.equal(cut, false, `${width}px: “${needle}” is cut off`);
      }
    } finally { await context.close(); }
  }
});

test('both search boxes are at least 16px on phones, so iOS does not zoom in', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 } });
  try {
    for (const id of ['#bangs-try', '#bangs-search']) {
      assert.ok(parseFloat(await page.locator(id).evaluate((el) => getComputedStyle(el).fontSize)) >= 16, id);
    }
  } finally { await context.close(); }
});

test('keyboard focus is visible on the try-it field and the example chips', async () => {
  const { context, page } = await open();
  try {
    const ring = () => page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.bangs-field'));
      return `${style.boxShadow}|${style.outlineStyle}|${style.borderColor}`;
    });
    const resting = await ring();
    await page.locator('#bangs-try').focus();
    assert.notEqual(await ring(), resting, 'the field shows focus');
    await page.keyboard.press('Tab');
    const contrast = await page.evaluate(() => {
      const chip = document.activeElement;
      if (!chip?.matches('[data-chip]')) return 0;
      const rgb = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const style = getComputedStyle(chip);
      if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0) return 0;
      let node = chip.parentElement;
      while (node && getComputedStyle(node).backgroundColor.match(/rgba\(.*, 0\)$|transparent/)) node = node.parentElement;
      const [a, b] = [lum(rgb(style.outlineColor)), lum(rgb(getComputedStyle(node).backgroundColor))];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert.ok(contrast >= 3, `chip focus ring contrast is ${contrast.toFixed(2)}`);
    assert.equal(await page.locator('.bangs-chips[role="group"][aria-label="Examples"]').count(), 1);
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

test('the Island drawing and every bang are set in the app\'s Instrument Sans with its chips, and the page around it in Blubird', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#bangs-try').fill('!w golden retriever');
    await page.waitForFunction(() => document.querySelector('#bangs-try-list').textContent.includes('golden retriever'));
    const family = (selectors) => page.evaluate((list) => Object.fromEntries(
      list.map((selector) => [selector, getComputedStyle(document.querySelector(selector)).fontFamily])), selectors);
    // The drawing of the app's Island, and every bang the page asks you to
    // type, use the app's face; the page is the website's.
    const bangs = ['[data-chip]', '#bangs-rows li b', '#bangs-rows li[data-code="yt"] small kbd', '.bangs-hero .bang-chip', '.feature-copy-list .bang-chip'];
    for (const [selector, value] of Object.entries(await family(['#bangs-try', '#bangs-try-list .cmd', '#bangs-try-list .hint', ...bangs]))) {
      assert.match(value, /^"Instrument Sans"/, `${selector} is ${value}`);
    }
    for (const selector of bangs) {
      const style = await page.locator(selector).first().evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, background: getComputedStyle(el).backgroundColor }));
      assert.ok(parseFloat(style.radius) > 0, `${selector} is not round`);
      assert.doesNotMatch(style.background, /rgba\(0, 0, 0, 0\)|transparent/, `${selector} has no chip`);
    }
    for (const [selector, value] of Object.entries(await family(['#bangs-try-dest', '#bangs-search', '#bangs-rows li em', '#bangs-count']))) {
      assert.match(value, /^"Blubird Text"/, `${selector} is ${value}`);
    }
    assert.ok(await page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'Instrument Sans')), 'the page declares Instrument Sans');
    const chip = await page.locator('#bangs-try-list .cmd').evaluate((el) => {
      const style = getComputedStyle(el);
      return { radius: style.borderTopLeftRadius, background: style.backgroundColor };
    });
    assert.equal(chip.radius, '6px');
    assert.doesNotMatch(chip.background, /rgba\(0, 0, 0, 0\)|transparent/);
  } finally { await context.close(); }
});

test('if the data asset fails, search still works from the page and the box keeps its example', async () => {
  const { context, page } = await open({}, { blockData: true });
  try {
    await page.locator('#bangs-search').fill('youtube');
    await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    await page.locator('#bangs-try').fill('!w x');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#bangs-try-list').innerText(), /Search YouTube for “lofi”/);
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
