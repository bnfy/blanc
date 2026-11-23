// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/home-hero.test.mjs
// The homepage's first screen: the floating Island window
// (docs/superpowers/specs/2026-10-21-floating-island-homepage-hero-design.md).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const { measured } = JSON.parse(readFileSync(new URL('../../docs/website-captures-float-island-v1.40.0.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function openHome({ width = 1440, height = 900, reducedMotion = 'reduce', javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, javaScriptEnabled });
  const page = await context.newPage();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => context.close() };
}

const inView = (box, width, height) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;

test('the first screen ends on the headline and Download, with the window’s top in view', async () => {
  for (const [width, height] of [[1440, 900], [1280, 800], [1280, 720]]) {
    const { page, close } = await openHome({ width, height });
    try {
      const h1 = await page.locator('#opening-title').boundingBox();
      const download = await page.locator('#opening [data-download-cta]').boundingBox();
      const windowBox = await page.locator('[data-float-window]').boundingBox();
      assert.ok(inView(h1, width, height), `${width}×${height}: headline ${JSON.stringify(h1)}`);
      assert.ok(inView(download, width, height), `${width}×${height}: Download ${JSON.stringify(download)}`);
      assert.ok(windowBox.y < height - 120, `${width}×${height}: the window starts on the first screen (${windowBox.y})`);
      const h1Lines = await page.locator('#opening-title').evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
      });
      assert.equal(h1Lines, 1, `${width}×${height}: the headline is one line`);
    } finally { await close(); }
  }
});

test('the window scales as one piece at every width, with no sideways scroll', async () => {
  for (const width of [390, 768, 1024, 1440]) {
    const { page, close } = await openHome({ width });
    try {
      const result = await page.evaluate(() => {
        const figure = document.querySelector('[data-float-window]').getBoundingClientRect();
        const island = document.querySelector('.float-window .hero-native-model').shadowRoot.querySelector('[id$="islandPill"]').getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ratio: figure.width / figure.height,
          x: (island.left - figure.left) / figure.width, w: island.width / figure.width, y: (island.top - figure.top) / figure.height,
          inside: figure.left >= 0 && figure.right <= innerWidth,
        };
      });
      assert.ok(result.scroll <= 0, `${width}: page scrolls sideways by ${result.scroll}px`);
      assert.ok(result.inside, `${width}: the window is cropped`);
      assert.ok(Math.abs(result.ratio - measured.window.width / measured.window.height) < 0.01, `${width}: window ratio ${result.ratio}`);
      assert.ok(Math.abs(result.x - measured.islandRect.x / measured.window.width) < 0.01, `${width}: Island x ${result.x}`);
      assert.ok(Math.abs(result.w - measured.islandRect.width / measured.window.width) < 0.01, `${width}: Island width ${result.w}`);
      assert.ok(Math.abs(result.y - measured.islandRect.y / measured.window.height) < 0.01, `${width}: Island y ${result.y}`);
    } finally { await close(); }
  }
});

test('reduced motion and no script show the Island at rest over the page', async () => {
  for (const options of [{ reducedMotion: 'reduce' }, { reducedMotion: 'no-preference', javaScriptEnabled: false }]) {
    const { page, close } = await openHome(options);
    try {
      await page.waitForTimeout(600);
      const state = await page.locator('[data-float-window]').getAttribute('data-state');
      assert.equal(state, 'shown', JSON.stringify(options));
      const visible = await page.locator('.float-window .hero-native-model').evaluate(el => getComputedStyle(el).visibility);
      assert.equal(visible, 'visible', JSON.stringify(options));
    } finally { await close(); }
  }
});

test('with motion, the Island hides and floats back', async () => {
  const { page, close } = await openHome({ reducedMotion: 'no-preference' });
  try {
    const seen = await page.evaluate(() => new Promise(resolve => {
      const figure = document.querySelector('[data-float-window]');
      const states = new Set([figure.dataset.state]);
      const started = performance.now();
      const tick = () => {
        states.add(figure.dataset.state);
        if ((states.has('hidden') && states.has('shown') && states.size >= 2 && performance.now() - started > 3000) || performance.now() - started > 8000) resolve([...states]);
        else requestAnimationFrame(tick);
      };
      tick();
    }));
    assert.ok(seen.includes('hidden') && seen.includes('shown'), JSON.stringify(seen));
  } finally { await close(); }
});

test('without script the Island still keeps its captured size at every width', async () => {
  const share = measured.islandRect.width / measured.window.width;
  for (const width of [390, 768, 1024, 1280, 1440]) {
    const { page, close } = await openHome({ width, javaScriptEnabled: false });
    try {
      const w = await page.evaluate(() => {
        const figure = document.querySelector('[data-float-window]').getBoundingClientRect();
        const pill = document.querySelector('.float-window .hero-native-model').shadowRoot.querySelector('[id$="islandPill"]').getBoundingClientRect();
        return pill.width / figure.width;
      });
      // Breakpoint steps may draw it a little small, never larger than the capture.
      assert.ok(w <= share * 1.01 && w >= share * 0.92, `${width}: Island width share ${w} (captured ${share})`);
    } finally { await close(); }
  }
});

// The device tour: the floating Island window is its first slide, then Blanc
// on iPhone, iPad and iPhone Duo (docs/superpowers/specs/2026-11-23-homepage-device-tour-design.md).
const shownPanels = page => page.evaluate(() => [...document.querySelectorAll('.tour-panel')]
  .filter(panel => getComputedStyle(panel).visibility === 'visible').map(panel => panel.id));

test('the tour’s tabs show one device at a time, inside the page at every width', async () => {
  for (const width of [390, 768, 1440]) {
    const { page, close } = await openHome({ width });
    try {
      assert.deepEqual(await shownPanels(page), ['device-desktop'], `${width}: opens on the desktop`);
      for (const device of ['iphone', 'ipad', 'duo', 'desktop']) {
        await page.click(`[data-device-tab="${device}"]`);
        assert.deepEqual(await shownPanels(page), [`device-${device}`], `${width}: ${device}`);
        assert.equal(await page.getAttribute(`[data-device-tab="${device}"]`, 'aria-selected'), 'true');
        const fits = await page.evaluate(id => {
          const stage = document.querySelector(`#${id} .tour-stage`).getBoundingClientRect();
          const frames = [...document.querySelectorAll(`#${id} .tour-frame, #${id} .float-window`)].map(el => el.getBoundingClientRect());
          return {
            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            inside: frames.every(box => box.left >= stage.left - 1 && box.right <= stage.right + 1 && box.top >= stage.top - 1 && box.bottom <= stage.bottom + 1),
            onPage: frames.every(box => box.left >= 0 && box.right <= innerWidth),
          };
        }, `device-${device}`);
        assert.ok(fits.scroll <= 0, `${width} ${device}: page scrolls sideways by ${fits.scroll}px`);
        assert.ok(fits.inside, `${width} ${device}: a device spills out of the stage`);
        assert.ok(fits.onPage, `${width} ${device}: a device is cropped`);
      }
      const tabsFit = await page.evaluate(() => {
        const tabs = document.querySelector('.tour-tabs');
        return tabs.scrollWidth <= tabs.clientWidth;
      });
      assert.ok(tabsFit, `${width}: every tab fits without scrolling`);
    } finally { await close(); }
  }
});

test('with motion the tour moves on to the iPhone, and the pause button holds it', async () => {
  const { page, close } = await openHome({ reducedMotion: 'no-preference' });
  try {
    await page.mouse.move(2, 300);
    assert.equal(await page.isVisible('[data-device-toggle]'), true);
    await page.waitForFunction(() => document.querySelector('[data-device-tour]').dataset.device === 'iphone', null, { timeout: 9000 });
    await page.click('[data-device-toggle]');
    assert.equal(await page.getAttribute('[data-device-toggle]', 'aria-label'), 'Play the device tour');
    await page.mouse.move(2, 300);
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(5600);
    assert.equal(await page.evaluate(() => document.querySelector('[data-device-tour]').dataset.device), 'iphone');
  } finally { await close(); }
});

test('with the pause button showing, the tabs still fit one row on a phone', async () => {
  for (const width of [360, 390]) {
    const { page, close } = await openHome({ width, reducedMotion: 'no-preference' });
    try {
      assert.equal(await page.isVisible('[data-device-toggle]'), true);
      const fit = await page.evaluate(() => {
        const tabs = document.querySelector('.tour-tabs');
        const row = document.querySelector('.tour-controls').getBoundingClientRect();
        return { tabs: tabs.scrollWidth <= tabs.clientWidth, row: row.left >= 0 && row.right <= innerWidth };
      });
      assert.deepEqual(fit, { tabs: true, row: true }, `${width}`);
    } finally { await close(); }
  }
});

test('without script only the desktop slide shows and the tabs stay hidden', async () => {
  const { page, close } = await openHome({ javaScriptEnabled: false });
  try {
    assert.deepEqual(await shownPanels(page), ['device-desktop']);
    assert.equal(await page.isVisible('.tour-controls'), false);
    assert.equal(await page.isVisible('.float-window-lights'), false, 'no traffic lights');
  } finally { await close(); }
});
