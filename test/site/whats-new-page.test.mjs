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
// The 1.38 page's own highlights, then the two previous releases' (newest first).
const byRelease = [...data.pages].sort((a, b) => b.release.localeCompare(a.release, undefined, { numeric: true }));
const at = byRelease.findIndex((p) => p.release === '1.38');
const entries = byRelease.slice(at, at + 3).flatMap((p) => p.highlights.map((h) => ({ id: h.id, release: p.release }))).slice(0, 8);
const ids = entries.map((e) => e.id);
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

// Shown highlights: laid out and visible (inactive ones stay laid out, hidden).
const visibleSections = (page) => page.$$eval('.wn-highlight', (els) => els
  .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility === 'visible')
  .map((el) => el.id));

test('the 1.38 page opens on an intro: the Sunrise, the headline and the tiles, no highlight yet', async () => {
  const { context, page } = await open('/whats-new/1.38');
  assert.equal(await page.locator('.site-header .site-lockup').count(), 1, 'the shared masthead with the lockup');
  assert.equal(await page.locator('.site-header :is(.site-nav-links, .site-nav-cta, .site-menu-toggle)').count(), 0, 'the masthead carries no site nav');
  assert.equal(await page.locator('.website-footer').count(), 1, 'the shared footer and its horizon rule');
  const intro = page.locator('.wn-intro');
  assert.ok(await intro.isVisible());
  assert.equal(await intro.locator('h1').innerText(), 'See what’s new in Blanc');
  assert.equal(await intro.locator('img.wn-intro-mark').getAttribute('src'), '/lockup/sunrise-mark-256.webp', 'the original Sunrise artwork');
  assert.deepEqual(await visibleSections(page), [], 'no highlight until one is chosen');
  assert.equal(await page.locator('.wn-tile[aria-current="true"]').count(), 0);
  const tiles = await page.locator('.wn-tiles').boundingBox();
  assert.ok(tiles.y + tiles.height <= 900, 'the tiles sit on the first screen, like Chrome');
  await context.close();
});

test('each highlight names its release, and earlier releases\' tiles carry their version', async () => {
  const { context, page } = await open('/whats-new/1.38');
  assert.equal(await page.locator(`#${ids[0]} .section-kicker`).textContent(), 'What’s new · Blanc 1.38 · October 18');
  const earlier = entries.filter((e) => e.release !== '1.38');
  assert.equal(await page.locator('.wn-tile-version').count(), earlier.length);
  assert.equal(await page.locator(`#${earlier[0].id} .section-kicker`).textContent(), `Recently · Blanc ${earlier[0].release} · October 18`);
  await context.close();
});

test('the arrows step from the intro into the highlights and back', async () => {
  const { context, page } = await open('/whats-new/1.38');
  await page.locator('.wn-arrow--next').click();
  assert.deepEqual(await visibleSections(page), [ids[0]]);
  assert.equal(await page.locator('.wn-intro').isVisible(), false);
  assert.equal(await page.locator('.wn-tile').nth(0).getAttribute('aria-current'), 'true');
  await page.locator('.wn-arrow--prev').click();
  assert.ok(await page.locator('.wn-intro').isVisible(), 'back to the intro from the first highlight');
  assert.deepEqual(await visibleSections(page), []);
  assert.equal(new URL(page.url()).hash, '');
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
  const selected = await page.locator('.wn-tile').nth(1).evaluate((el) => getComputedStyle(el).borderTopColor);
  assert.equal(selected, 'rgb(14, 14, 14)', 'the selected card is outlined in the site ink, not gold');
  assert.equal(new URL(page.url()).hash, `#${ids[1]}`);
  await page.locator(`#${ids[1]} .wn-next`).click();
  assert.deepEqual(await visibleSections(page), [ids[2]]);
  await page.locator('.wn-tile').nth(ids.length - 1).click();
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

test('changing the hash on an open page shows that highlight without scrolling away', async () => {
  const { context, page } = await open('/whats-new/1.38', { viewport: { width: 1280, height: 700 } });
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.evaluate((id) => { location.hash = id; }, ids[2]);
  await page.waitForTimeout(150);
  assert.deepEqual(await visibleSections(page), [ids[2]]);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await context.close();
});

test('stepping into a taller highlight keeps the page at its top', async () => {
  const { context, page } = await open('/whats-new/1.38', { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  await page.locator('.wn-arrow--next').click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await context.close();
});

test('the tile row stays put while you move through the intro and every highlight', async () => {
  // Phones stack each highlight tall, so there the row follows the content.
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1024, height: 700 }]) {
    const { context, page } = await open('/whats-new/1.38', { viewport });
    const railTop = () => page.locator('.wn-rail').evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    const tops = [await railTop()];
    for (let i = 0; i < ids.length; i += 1) {
      await page.locator('.wn-arrow--next').click();
      tops.push(await railTop());
    }
    assert.equal(new Set(tops).size, 1, `${viewport.width}×${viewport.height}: ${tops.join(', ')}`);
    await context.close();
  }
});

test('the tile row glides to the chosen tile, and only the shown highlight can be reached', async () => {
  const { context, page } = await open('/whats-new/1.38', { reducedMotion: 'no-preference' });
  assert.equal(await page.locator('.wn-tiles').evaluate((el) => getComputedStyle(el).scrollBehavior), 'smooth');
  await page.locator('.wn-tile').nth(ids.length - 1).click();
  await page.waitForTimeout(800);
  const fits = await page.locator('.wn-tiles').evaluate((row) => {
    const last = row.lastElementChild.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    return last.left >= box.left - 1 && last.right <= box.right + 1;
  });
  assert.ok(fits, 'the chosen tile ends fully in view');
  const inert = await page.$$eval('.wn-highlight', (els) => els.map((el) => el.inert));
  assert.deepEqual(inert, ids.map((id, i) => i !== ids.length - 1), 'hidden highlights are inert');
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
  assert.ok(await page.locator('.wn-intro').isVisible(), 'the intro leads');
  assert.deepEqual(await visibleSections(page), ids);
  await context.close();
});

test('at phone width nothing overflows', async () => {
  const { context, page } = await open('/whats-new/1.38', { viewport: { width: 375, height: 812 } });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375));
  await context.close();
});

// Blanc opens this page in its own window: 1280×800 by default, less the
// Island's 68px strip, and a 13-inch laptop's maximized window. The intro and
// every highlight, the tile row and the changelog link fit without scrolling.
for (const viewport of [{ width: 1280, height: 732 }, { width: 1440, height: 800 }, { width: 1024, height: 680 }]) for (const { release } of byRelease) {
  test(`${release} at ${viewport.width}×${viewport.height}: every view fits without scrolling`, async () => {
    const { context, page } = await open(`/whats-new/${release}`, { viewport });
    const tileIds = await page.$$eval('.wn-tile', (tiles) => tiles.map((tile) => tile.getAttribute('aria-controls')));
    for (const hash of ['', ...tileIds.map((id) => `#${id}`)]) {
      if (hash) await page.locator(`.wn-tile[aria-controls="${hash.slice(1)}"]`).click();
      const bottoms = await page.evaluate(() => {
        const bottom = (selector) => document.querySelector(selector).getBoundingClientRect().bottom;
        const shown = document.querySelector('.wn-stage > [data-current]') ?? document.querySelector('.wn-intro');
        return { shown: shown.getBoundingClientRect().bottom, tiles: bottom('.wn-tiles'), changelog: bottom('.wn-changelog'), scrollY };
      });
      assert.equal(bottoms.scrollY, 0, `${hash || 'intro'}: the page did not scroll`);
      for (const [part, value] of Object.entries(bottoms)) {
        if (part !== 'scrollY') assert.ok(value <= viewport.height, `${hash || 'intro'}: ${part} ends at ${Math.round(value)}, below ${viewport.height}`);
      }
    }
    await context.close();
  });
}

test('/whats-new leads to the newest page and is not indexed', async () => {
  const html = await (await fetch(`${baseURL}/whats-new`)).text();
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  const { context, page } = await open('/whats-new');
  await page.waitForURL(new RegExp(`/whats-new/${byRelease[0].release.replace('.', '\\.')}$`));
  await context.close();
});

test('keys and menu glyphs sit in the site\'s chip', async () => {
  const { context, page } = await open('/whats-new/1.38#group-colors');
  const chips = await page.locator('#group-colors kbd.bang-chip').allTextContents();
  assert.ok(chips.includes('⋮') && chips.includes('⌘L'), chips.join(', '));
  assert.doesNotMatch(await page.locator('.wn').evaluate((el) => el.textContent), /`/, 'no backticks reach the page');
  await context.close();
});

// Sunrise Gold is a macOS icon: Windows and Linux visitors never see its
// highlight or tile; Mac visitors and unknown platforms do.
for (const [label, platform, sees] of [['Windows', 'Win32', false], ['Linux', 'Linux x86_64', false], ['macOS', 'MacIntel', true]]) {
  test(`a ${label} visitor ${sees ? 'sees' : 'never sees'} the Mac-only Sunrise Gold highlight`, async () => {
    const { context, page } = await open('/whats-new/1.39');
    await context.addInitScript((value) => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => value });
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
    }, platform);
    await page.reload();
    assert.equal(await page.locator('#sunrise-gold').count(), sees ? 1 : 0);
    assert.equal(await page.locator('.wn-tile[aria-controls="sunrise-gold"]').count(), sees ? 1 : 0);
    assert.equal(await page.locator('#auto-hide-island').count(), 1, 'highlights for every platform stay');
    await page.locator('.wn-tile').first().click();
    assert.match(await page.locator('.wn-stage > [data-current] h2').innerText(), /\S/, 'the first remaining tile still opens its highlight');
    await context.close();
  });
}

test('?platform= overrides the detected platform for checking', async () => {
  const { context, page } = await open('/whats-new/1.39?platform=windows');
  assert.equal(await page.locator('#sunrise-gold').count(), 0);
  await context.close();
});
