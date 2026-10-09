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
      assert.ok(t.href && t.track === 'feature_cta_click' && t.feature && t.position === 'feature-hub', t.id);
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
    const labelOf = id => page.locator(`#pop-${id}`).getAttribute('data-pop-label');
    const [prevLabel, nextLabel] = [await labelOf(order.at(-1)), await labelOf(order[1])];
    assert.ok(prevLabel && nextLabel, 'every popover names itself for the previous/next buttons');
    assert.equal((await page.locator('[data-pop-prev]').textContent()).trim(), prevLabel);
    assert.equal((await page.locator('[data-pop-next]').textContent()).trim(), nextLabel);
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
      // Record the card's animations as they start: a short spring can finish
      // before a slow runner reads getAnimations() back after the click.
      await page.evaluate(() => {
        const card = document.querySelector('.pop-card');
        window.__cardStarts = [];
        const animate = card.animate.bind(card);
        card.animate = (keyframes, options) => { window.__cardStarts.push(keyframes[0]?.transform ?? null); return animate(keyframes, options); };
      });
      await page.locator('#island').click();
      await page.waitForFunction(() => document.getElementById('feature-pop').open);
      const transforms = await page.evaluate(() => window.__cardStarts);
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
      assert.ok(await stage.locator('.demo [data-at], .demo [data-dim], .demo [data-on]').count() >= 3, `${id}: per-step states`);
      await page.locator(`#${id}`).click();
      await page.waitForFunction(i => !document.getElementById(`pop-${i}`).hidden, id);
      assert.equal(await stage.getAttribute('data-step'), '3', `${id}: reduced motion rests on 3`);
      for (const step of ['1', '2', '3']) {
        await stage.evaluate((el, n) => { el.dataset.step = n; }, step);
        // A step is shown when displayed and visible (the shield demo stacks
        // its steps in one cell and hides the others with visibility).
        const wrong = await stage.locator('[data-at]').evaluateAll((els, n) => els.filter(el => {
          const style = getComputedStyle(el);
          return (style.display !== 'none' && style.visibility !== 'hidden') !== el.dataset.at.split(' ').includes(n);
        }).length, step);
        assert.equal(wrong, 0, `${id} step ${step}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    }
  } finally { await context.close(); }
});

test('a close during arrow navigation leaves no tile hidden and no demo running', async () => {
  const context = await contextFor({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    await page.locator('#glance').click();
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    await page.waitForTimeout(700);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.is-source').count(), 0, 'no tile left hidden');
    assert.equal(new URL(page.url()).hash, '');
  } finally { await context.close(); }
});

test('a native dialog close still restores the tile, the hash and later deep links', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features#sync`);
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    await page.evaluate(() => document.getElementById('feature-pop').close());
    await page.waitForFunction(() => !document.querySelector('.is-source'));
    assert.equal(new URL(page.url()).hash, '');
    await page.evaluate(() => { location.hash = 'glance'; });
    await page.waitForFunction(() => document.getElementById('feature-pop').open && !document.getElementById('pop-glance').hidden);
  } finally { await context.close(); }
});

test('a malformed hash is ignored without a page error', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${baseURL}/features#%E0%A4`);
    await page.waitForTimeout(500);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#feature-pop').evaluate(d => d.open), false);
  } finally { await context.close(); }
});

test('tiles announce a popup only with script, and a popover open is tracked under its own name', async () => {
  const noScript = await contextFor({ javaScriptEnabled: false });
  try {
    const page = await noScript.newPage();
    await page.goto(`${baseURL}/features`);
    assert.equal(await page.locator('[data-pop][aria-haspopup]').count(), 0);
  } finally { await noScript.close(); }
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    assert.equal(await page.locator('[data-pop][aria-haspopup="dialog"]').count(), 33);
    const seen = await page.evaluate(() => new Promise(resolve => {
      document.addEventListener('click', event => resolve(event.target.closest('[data-track]')?.dataset.track), { once: true });
      document.getElementById('glance').click();
    }));
    assert.equal(seen, 'feature_popover_open');
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#glance').getAttribute('data-track'), 'feature_cta_click');
  } finally { await context.close(); }
});

test('the Quiet Tabs and wallpaper tiles animate only while they are on screen', async () => {
  const context = await contextFor({ reducedMotion: 'no-preference', viewport: { width: 1268, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const states = () => page.evaluate(() => [
      getComputedStyle(document.querySelector('#quiet-tabs .ui-quiet')).animationPlayState,
      getComputedStyle(document.querySelector('#wallpaper')).animationPlayState,
      ...[...document.querySelectorAll('#wallpaper .bento-daypart')].map(img => getComputedStyle(img).animationPlayState),
    ]);
    await page.locator('#quiet-tabs').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => ['.bento-R1', '.bento-R2'].every(s => document.querySelector(s).hasAttribute('data-in-view')));
    assert.deepEqual(await states(), Array(6).fill('running'));
    await page.locator('.bento-patron').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => ['.bento-R1', '.bento-R2'].every(s => !document.querySelector(s).hasAttribute('data-in-view')));
    assert.deepEqual(await states(), Array(6).fill('paused'));
  } finally { await context.close(); }
});

test('a closing popover hands back to a visible tile instead of an empty card', async () => {
  const context = await contextFor({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    await page.locator('#quiet-tabs').click();
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    const midClose = await page.evaluate(() => ({
      open: document.getElementById('feature-pop').open,
      tile: getComputedStyle(document.getElementById('quiet-tabs')).visibility,
    }));
    assert.deepEqual(midClose, { open: true, tile: 'visible' }, 'the tile shows under the card while it lands');
    await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    await page.locator('#quiet-tabs').click();
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.pop-card')).opacity), '1', 'the card is opaque again on the next open');
  } finally { await context.close(); }
});

test('the native shield popover meets its chip after an animated or a reduced-motion open', async () => {
  const placements = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await contextFor({ reducedMotion, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features`);
      await page.locator('#ad-blocking').click();
      // Measure the settled card: a busy main thread (the shields' WebGL
      // starting up) can stretch the open spring past any fixed wait.
      // Measure the settled card, once feature-bento.js has placed the demo (a
      // reduced-motion open has no card animation to wait for, and placement
      // lands on the next layout).
      await page.waitForFunction(() => document.getElementById('feature-pop').open
        && document.querySelector('.pop-card').getAnimations().every(animation => animation.playState === 'finished')
        && document.querySelector('.demo-native-step[data-at="1"] .native-shield-demo').style.getPropertyValue('--view-x') !== '');
      placements.push(await page.evaluate(() => {
        const host = document.querySelector('.demo-native-step[data-at="1"] .native-shield-demo'), root = host.shadowRoot;
        const rect = suffix => root.querySelector(`[id$="${suffix}"]`).getBoundingClientRect();
        const chip = rect('pillShield'), card = rect('shieldPop'), pointer = rect('shieldPopPointer');
        const zoom = parseFloat(getComputedStyle(host).zoom) || 1;
        return {
          gap: Math.round((card.top - chip.bottom) / zoom),
          pointerOffset: Math.round((pointer.left + pointer.width / 2) - (chip.left + chip.width / 2)) || 0,
        };
      }));
    } finally { await context.close(); }
  }
  // The app places the card 10px below the chip's bottom edge, its pointer centred on the chip.
  for (const placement of placements) assert.deepEqual(placement, { gap: 10, pointerOffset: 0 });
});

test('the blocking popover keeps its two columns down to 721px and stacks below', async () => {
  for (const [width, columns] of [[1268, 2], [798, 2], [721, 2], [720, 1], [390, 1]]) {
    const context = await contextFor({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features`);
      await page.locator('#ad-blocking').click();
      await page.waitForFunction(() => document.getElementById('feature-pop').open);
      const tracks = await page.locator('#pop-ad-blocking').evaluate(body => getComputedStyle(body).gridTemplateColumns.split(' ').length);
      assert.equal(tracks, columns, `${width}px`);
    } finally { await context.close(); }
  }
});

test('popover demos run only while their popover shows them', async () => {
  const context = await contextFor({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const paused = () => page.evaluate(() => document.querySelector('.pop-drag .drag-demo').hasAttribute('data-paused'));
    assert.equal(await paused(), true, 'closed: the drag figure is paused');
    await page.locator('#drag-to-reorder').click();
    await page.waitForFunction(() => !document.querySelector('.pop-drag .drag-demo').hasAttribute('data-paused'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.pop-drag .drag-demo').hasAttribute('data-paused'));
    assert.equal(await page.evaluate(() => document.querySelector('#pop-drag-to-reorder .demo-shot').loading), 'eager', 'reaching for the tile started its image');
  } finally { await context.close(); }
});

test('an open popover warms its neighbours, so arrow navigation lands on loaded images', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    // Deep-link to the feature just before drag-to-reorder; its tile is never hovered.
    await page.goto(`${baseURL}/features#passkeys`);
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    const loading = selector => page.evaluate(s => document.querySelector(s).loading, selector);
    assert.equal(await loading('#pop-drag-to-reorder .demo-shot'), 'eager', 'the next popover is warmed');
    assert.equal(await loading('#pop-mahjong .pop-img'), 'lazy', 'a distant popover is left alone');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !document.getElementById('pop-drag-to-reorder').hidden);
    await page.waitForFunction(() => document.querySelector('#pop-drag-to-reorder .demo-shot').complete);
  } finally { await context.close(); }
});

test('narrow tiles fold their visual and centre the label; the Island stays framed', async () => {
  for (const [width, folded] of [[1280, false], [1000, true]]) {
    const context = await contextFor({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features`);
      const state = await page.evaluate(() => {
        const tile = document.getElementById('ad-blocking'), box = tile.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(tile.querySelector('.bento-label'));
        const text = range.getBoundingClientRect();
        return {
          shown: getComputedStyle(tile.querySelector('.bento-visual')).display !== 'none',
          offCentre: Math.abs((text.top - box.top) - (box.bottom - text.bottom)),
          island: getComputedStyle(document.querySelector('#island img')).objectPosition,
        };
      });
      assert.equal(state.shown, !folded, `${width}px: shield ${folded ? 'folded' : 'shown'}`);
      if (folded) assert.ok(state.offCentre <= 2, `${width}px: label centred (off by ${state.offCentre}px)`);
      assert.equal(state.island, '50% 0px', `${width}px: the Island photo keeps the captured Island in frame`);
    } finally { await context.close(); }
  }
});

test('reduced motion holds the wallpaper on dawn and tiles never lift', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    await page.locator('#glance').hover();
    const state = await page.evaluate(() => ({
      dayparts: [...document.querySelectorAll('#wallpaper .bento-daypart')].map(img => getComputedStyle(img).opacity),
      animations: document.getAnimations().filter(a => /bento-daypart/.test(a.animationName)).length,
      lift: getComputedStyle(document.getElementById('glance')).scale,
    }));
    assert.deepEqual(state, { dayparts: ['1', '0', '0', '0'], animations: 0, lift: 'none' });
  } finally { await context.close(); }
});
