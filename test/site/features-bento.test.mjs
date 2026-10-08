import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const guides = ['island', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'command-palette', 'mouse-gestures',
  'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync', 'security', '1password'];
const keptIds = ['features-title', 'island', '1password', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'commands',
  'mouse-gestures', 'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync',
  'security', 'small-details-title', 'feature-patron-title', 'feature-close-title'];
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function contextFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1268, height: 900 }, reducedMotion: 'reduce', ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await context.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  return context;
}

test('board keeps every anchor, every tile is a tracked link, and all 16 guides are reachable', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of keptIds) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `#${id}`);
    const tiles = await page.locator('[data-pop]').evaluateAll(as => as.map(a => ({
      tag: a.tagName, id: a.id, pop: a.dataset.pop, href: a.getAttribute('href'),
      track: a.dataset.track, feature: a.dataset.feature, position: a.dataset.ctaPosition })));
    assert.equal(tiles.length, 33);
    for (const t of tiles) {
      assert.equal(t.tag, 'A', t.id);
      assert.equal(t.pop, t.id);
      assert.ok(t.href && t.track === 'feature_popover_open' && t.feature && t.position === 'feature-hub', t.id);
    }
    const reachable = new Set(await page.locator('a[href^="/features/"]').evaluateAll(as => as.map(a => a.getAttribute('href'))));
    for (const guide of guides) assert.ok(reachable.has(`/features/${guide}`), guide);
    assert.equal(await page.locator('.bento-tile').count(), 15);
    assert.equal(await page.locator('.bento-small').count(), 18);
    assert.equal(await page.locator('h1').innerText(), 'Everything in Blanc.');
  } finally { await context.close(); }
});

test('every popover article is in the HTML and hidden until opened', async () => {
  const context = await contextFor({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const pops = await page.locator('[data-pop]').evaluateAll(as => as.map(a => a.dataset.pop));
    for (const id of pops) {
      const article = page.locator(`#pop-${id}`);
      assert.equal(await article.count(), 1, id);
      assert.equal(await article.getAttribute('hidden'), '', `${id} hidden`);
      assert.ok((await page.locator(`#pop-${id}-title`).textContent()).trim().length > 10, `${id} title`);
    }
    assert.equal(await page.locator('dialog#feature-pop').evaluate(d => d.open), false);
  } finally { await context.close(); }
});

test('board proportions follow the measured Apple system at a 1220px board', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const m = await page.evaluate(() => {
      const board = document.querySelector('.bento-board'), tile = document.querySelector('.bento-tile'), label = document.querySelector('.bento-tile--white .bento-label h3');
      const bs = getComputedStyle(board), ts = getComputedStyle(tile);
      return { width: board.getBoundingClientRect().width, gap: parseFloat(bs.columnGap), radius: parseFloat(ts.borderTopLeftRadius),
        shadow: ts.boxShadow, label: parseFloat(getComputedStyle(label).fontSize), weight: getComputedStyle(label).fontWeight,
        shadows: [...document.querySelectorAll('.bento-tile, .bento-small')].filter(t => getComputedStyle(t).boxShadow !== 'none').length };
    });
    assert.ok(Math.abs(m.width - 1220) < 1, `board ${m.width}`);
    assert.ok(Math.abs(m.gap - 10.98) < 0.6, `gap ${m.gap}`);
    assert.ok(Math.abs(m.radius - 24.4) < 0.6, `radius ${m.radius}`);
    assert.ok(Math.abs(m.label - 15.62) < 0.6, `label ${m.label}`);
    assert.equal(m.weight, '500');
    assert.equal(m.shadows, 0, 'tiles have no shadows');
  } finally { await context.close(); }
});

test('features page never scrolls sideways', { timeout: 60000 }, async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    for (const width of [320, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseURL}/features`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflows`);
    }
  } finally { await context.close(); }
});

test('clicking a tile opens its popover, Escape closes it and focus returns to the tile', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    await page.locator('#glance').click();
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    assert.equal(await page.locator('#pop-glance').isVisible(), true);
    assert.equal(await page.locator('#pop-island').isVisible(), false);
    assert.equal(await page.locator('#feature-pop').getAttribute('aria-labelledby'), 'pop-glance-title');
    assert.equal(new URL(page.url()).hash, '#glance');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'glance');
    assert.equal(new URL(page.url()).hash, '');
  } finally { await context.close(); }
});

test('arrow keys move between features and the source tile follows', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const order = await page.locator('[data-pop]').evaluateAll(as => as.map(a => a.dataset.pop));
    await page.locator('#glance').click();
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(id => !document.getElementById(`pop-${id}`).hidden, order[1]);
    assert.equal(await page.locator(`#${order[1]}`).evaluate(el => el.classList.contains('is-source')), true);
    assert.equal(await page.locator('#glance').evaluate(el => el.classList.contains('is-source')), false);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(id => !document.getElementById(`pop-${id}`).hidden, order.at(-1));
  } finally { await context.close(); }
});

test('a modified click is left to the browser', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const opened = await page.evaluate(() => {
      const tile = document.getElementById('glance');
      // Registered after the page's own handler, so it only stops the test navigating away.
      tile.addEventListener('click', e => e.preventDefault(), { once: true });
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true, button: 0 }));
      return document.getElementById('feature-pop').open;
    });
    assert.equal(opened, false, 'meta-click does not open the popover');
  } finally { await context.close(); }
});

test('a hash link opens that popover', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features#sync`);
    await page.waitForFunction(() => document.getElementById('feature-pop').open && !document.getElementById('pop-sync').hidden);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    await page.evaluate(() => { location.hash = 'glance'; });
    await page.waitForFunction(() => document.getElementById('feature-pop').open && !document.getElementById('pop-glance').hidden);
  } finally { await context.close(); }
});

test('with motion allowed the card grows from the tile; with reduced motion it only fades', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await contextFor({ reducedMotion });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features`);
      await page.locator('#island').click();
      const transforms = await page.evaluate(() => document.querySelector('.pop-card').getAnimations().map(a => a.effect.getKeyframes()[0].transform ?? null));
      if (reducedMotion === 'reduce') assert.deepEqual(transforms, []);
      else assert.match(transforms[0], /translate\(.+\) scale\(/);
    } finally { await context.close(); }
  }
});

test('each demo shows exactly its own step and rests on step 3 without motion', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of ['commands', 'ad-blocking', 'quiet-tabs', 'reopen-closed-tabs', 'private-tabs']) {
      const stage = page.locator(`#pop-${id} .pop-stage`);
      assert.ok(await stage.locator('.demo [data-at], .demo [data-dim]').count() >= 3, `${id}: per-step states`);
      await page.locator(`#${id}`).click();
      await page.waitForFunction(i => !document.getElementById(`pop-${i}`).hidden, id);
      assert.equal(await stage.getAttribute('data-step'), '3', `${id}: reduced motion rests on 3`);
      for (const step of ['1', '2', '3']) {
        await stage.evaluate((el, n) => { el.dataset.step = n; }, step);
        const wrong = await stage.locator('[data-at]').evaluateAll((els, n) => els.filter(el =>
          (getComputedStyle(el).display !== 'none') !== el.dataset.at.split(' ').includes(n)).length, step);
        assert.equal(wrong, 0, `${id} step ${step}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    }
  } finally { await context.close(); }
});
