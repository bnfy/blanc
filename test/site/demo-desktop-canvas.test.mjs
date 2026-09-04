// Run against a built site: BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/demo-desktop-canvas.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => {
  browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch();
});
after(async () => { await browser?.close(); });

async function openPage(width, reducedMotion = 'reduce') {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.waitForFunction(() => Number(document.getElementById('demoFrame').style.getPropertyValue('--demo-scale')) > 0);
  await page.getByRole('button', { name: 'No thanks', exact: true }).click();
  return { page, errors };
}

async function geometry(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('demoStage');
    const rect = stage.getBoundingClientRect();
    const scale = rect.width / stage.offsetWidth;
    const selectors = ['.pill', '.panel', '.field', '.pnav', '.pacts', '.foot-new', '.foot-act.ws', '.trow .dom', '.demo-bb-clock', '.demo-bb-favs', '.demo-tab-context', '.demo-workspace-switcher', '.demo-glance-header', '.demo-glance-divider'];
    return {
      width: stage.offsetWidth,
      height: getComputedStyle(stage).height,
      ratio: rect.width / rect.height,
      overflow: document.documentElement.scrollWidth > innerWidth,
      items: selectors.map(selector => {
        const element = stage.querySelector(selector);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        const s = getComputedStyle(element);
        if (!element.getClientRects().length) return { selector, display: 'none' };
        return { selector, left: Math.round((r.left - rect.left) / scale), top: Math.round((r.top - rect.top) / scale), width: Math.round(r.width / scale), height: Math.round(r.height / scale), display: s.display, fontSize: s.fontSize };
      }),
      shot: document.getElementById('demoShot').getAttribute('src'),
      glanceShot: document.getElementById('demoGlanceShot').getAttribute('src'),
    };
  });
}

async function productColors(page, selector) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    const pill = element.querySelector('.pill');
    // Production builds minify #ffffff to #fff; the dev server keeps the
    // source form. Compare the color, not the spelling.
    const hex = name => style.getPropertyValue(name).trim()
      .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, '#$1$1$2$2$3$3').toLowerCase();
    return {
      text: style.color,
      background: hex('--bg'),
      surface: hex('--surface'),
      raised: hex('--surface-raised'),
      border: hex('--border'),
      muted: hex('--text-dim'),
      pill: getComputedStyle(pill, '::after').backgroundColor,
    };
  });
}

test('Sunrise website colors never leak into light, private, or enlarged product replicas', async () => {
  const { page } = await openPage(1440);
  const light = {
    text: 'rgb(14, 14, 14)', background: '#ffffff', surface: '#f7f7f7',
    raised: '#ffffff', border: '#dedede', muted: '#6b6b6b',
    pill: 'rgba(255, 255, 255, 0.94)',
  };
  try {
    assert.deepEqual(await productColors(page, '#demoStage'), light);
    await page.locator('#demoEnlarge').click();
    assert.deepEqual(await productColors(page, '#demoViewer #demoStage'), light);
    await page.keyboard.press('Escape');
    await page.locator('#demoMount #demoStage').waitFor({ state: 'attached' });
    assert.deepEqual(await productColors(page, '#demoStage'), light);

    await page.goto(`${baseURL}/features/private-tabs`);
    assert.deepEqual(await productColors(page, '.demo-stage'), {
      text: 'rgb(245, 245, 245)', background: '#0a0a0a', surface: '#131313',
      raised: '#191919', border: '#333333', muted: '#9c9c9c',
      pill: 'rgba(25, 25, 25, 0.94)',
    });
    await page.goto(`${baseURL}/press`);
    assert.deepEqual(await productColors(page, '.press-island-stage'), light);
  } finally { await page.close(); }
});

test('website palette, text contrast, and ink footer symbols hold across pages and breakpoints', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ reducedMotion: 'reduce', colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/', '/features', '/download', '/changelog', '/about', '/faq', '/press', '/ambassadors', '/privacy', '/terms',
    ...['ad-blocking', 'command-palette', 'island', 'private-tabs', 'quiet-tabs', 'security', 'sync', 'tab-groups', 'vertical-tabs'].map(name => `/features/${name}`)];
  try {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        const response = await page.goto(`${baseURL}${route}`);
        assert.equal(response.status(), 200, route);
        const colors = await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          const get = name => style.getPropertyValue(name).trim();
          const luminance = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255)
            .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
            .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
          const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
          const backgrounds = ['--site-bg', '--site-surface', '--site-surface-raised', '--site-selection'];
          return {
            background: getComputedStyle(document.body).backgroundColor,
            footer: getComputedStyle(document.querySelector('.site-footer')).backgroundColor,
            mark: getComputedStyle(document.querySelector('.site-footer .foot-brand')).color,
            theme: document.querySelector('meta[name="theme-color"]').content,
            overflow: document.documentElement.scrollWidth > innerWidth,
            contrast: ['--site-text-dim', '--site-gold'].flatMap(text => backgrounds.map(bg => ratio(get(text), get(bg)))),
            darkContrast: ratio(get('--site-gold-on-dark'), get('--site-accent')),
          };
        });
        assert.equal(colors.background, 'rgb(247, 240, 229)', `${width}px ${route}`);
        assert.equal(colors.footer, 'rgb(239, 230, 216)', `${width}px ${route}`);
        assert.equal(colors.mark, 'rgb(14, 14, 14)', `${width}px ${route}`);
        assert.equal(colors.theme, '#F7F0E5');
        assert.equal(colors.overflow, false, `${width}px ${route} overflows`);
        assert.ok(colors.contrast.every(ratio => ratio >= 4.5), `${route}: text contrast`);
        assert.ok(colors.darkContrast >= 4.5);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('gold marks remain visible with reduced motion and mobile navigation stays usable', async () => {
  const { page } = await openPage(1440);
  const mark = page.locator('.hero-sunrise-mark');
  const markStyle = () => mark.evaluate(element => {
    const s = getComputedStyle(element);
    return { background: s.backgroundImage, mask: s.maskImage, animation: s.animationName, transform: s.transform };
  });
  try {
    await mark.hover();
    assert.deepEqual(await markStyle(), {
      background: `url("${baseURL}/sunrise-hero-mark.png")`, mask: 'none', animation: 'none', transform: 'none',
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.hero-sunrise-mark')).transform.startsWith('matrix(1.18,'));
    assert.equal((await markStyle()).animation, 'none');
    const navBrand = page.locator('.site-brand');
    await navBrand.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-brand'), '::after').opacity === '1');
    const navGold = await navBrand.evaluate(el => {
      const s = getComputedStyle(el, '::after');
      return { image: s.backgroundImage, width: s.width, height: s.height, duration: s.transitionDuration };
    });
    assert.deepEqual(navGold, { image: `url("${baseURL}/sunrise-hero-mark.png")`, width: '24px', height: '24px', duration: '0.22s' });
    assert.equal(await page.locator('.site-brand-mark').evaluate(el => getComputedStyle(el).opacity), '0');
    if (process.env.BLANC_NAV_SCREENSHOT) await page.locator('.site-nav').screenshot({ path: process.env.BLANC_NAV_SCREENSHOT });
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-brand'), '::after').opacity === '0');
    assert.equal(await page.locator('.site-brand-mark').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await navBrand.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await navBrand.evaluate(el => getComputedStyle(el, '::after').opacity), '1');
    assert.equal(await navBrand.evaluate(el => getComputedStyle(el, '::after').transitionDuration), '0s');
    await page.keyboard.press('Tab');
    assert.equal(await navBrand.evaluate(el => getComputedStyle(el, '::after').opacity), '0');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await mark.isVisible(), false);
    assert.equal(await page.locator('.site-brand-mark').evaluate(el => getComputedStyle(el).maskImage), 'none');
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    assert.equal(await page.locator('#siteMobileMenu').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    // The sheet's Features entry is an accordion now; the direct link is What's new.
    await page.locator('#siteMobileMenu').getByRole('link', { name: "What's new", exact: true }).click();
    assert.ok(page.url().endsWith('/changelog'));
    const current = page.locator('#siteMobileMenu a[aria-current="page"]');
    assert.equal(await current.count(), 1);
    assert.equal(await current.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(246, 235, 213)');
  } finally { await page.close(); }
});

const chapters = ['the island', 'glance split view', 'ad blocker', 'browser commands', 'tab groups', 'workspaces'];
test('each chapter keeps its desktop geometry and captures at phone widths', { timeout: 60000 }, async () => {
  const baseline = new Map();
  for (const width of [1440, 320, 390, 430]) {
    const { page, errors } = await openPage(width);
    try {
      assert.equal(await page.locator('#demoEnlarge').isVisible(), width > 640);
      for (const chapter of chapters) {
        if (width <= 640) await page.getByLabel('Demo chapter', { exact: true }).selectOption({ label: chapter });
        else await page.getByRole('button', { name: `Jump to ${chapter}`, exact: true }).click();
        await page.waitForTimeout(100); // Settle the scene's deferred end-state actions.
        const state = await geometry(page);
        assert.equal(state.width, 900);
        assert.equal(state.height, '506.25px');
        assert.ok(Math.abs(state.ratio - 16 / 9) < 0.002);
        assert.equal(state.overflow, false, `${width}px / ${chapter}`);
        for (const src of [state.shot, state.glanceShot]) {
          if (src) assert.ok(src.startsWith('/shots/desktop/'), src);
        }
        if (width === 1440) baseline.set(chapter, state.items);
        else state.items.forEach((item, index) => {
          const expected = baseline.get(chapter)[index];
          if (!item || !expected) return assert.equal(item, expected);
          assert.deepEqual(Object.keys(item), Object.keys(expected));
          for (const key of Object.keys(item)) {
            // WebKit rounds transformed fractional pixels at different scales.
            if (typeof item[key] === 'number') assert.ok(Math.abs(item[key] - expected[key]) <= 1, `${width}px / ${chapter} / ${item.selector} / ${key}`);
            else assert.equal(item[key], expected[key]);
          }
        });
        if (chapter === 'glance split view') {
          assert.equal(await page.locator('#demoGlance').getAttribute('data-direction'), 'horizontal');
        }
      }
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});

test('desktop larger viewer preserves one scene, supports panning, resizing, focus, and restoration', { timeout: 30000 }, async () => {
  const { page, errors } = await openPage(820);
  try {
    await page.getByRole('button', { name: 'Jump to tab groups', exact: true }).click();
    await page.evaluate(() => { window.originalDemoStage = document.getElementById('demoStage'); });
    await page.locator('#demoEnlarge').scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => scrollY);
    await page.locator('#demoEnlarge').click();
    await page.waitForFunction(() => document.getElementById('demoViewer').open);
    assert.equal(await page.locator('#demoScrubToggle').getAttribute('aria-label'), 'Play demo');
    assert.equal(await page.locator('#demoViewerFit').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#demoViewerHeadline').textContent(), await page.locator('#demoHeadline').textContent());
    const fits = () => page.evaluate(() => {
      const viewport = document.getElementById('demoViewerCanvas');
      const frame = document.getElementById('demoFrame').getBoundingClientRect();
      return frame.width <= viewport.clientWidth + 1 && frame.height <= viewport.clientHeight + 1;
    });
    assert.ok(await fits());
    await page.locator('#demoViewerActual').click();
    assert.equal(await page.locator('#demoViewerActual').getAttribute('aria-pressed'), 'true');
    const panning = await page.evaluate(() => {
      const viewport = document.getElementById('demoViewerCanvas');
      const initial = viewport.scrollLeft;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 80;
      return { initial, left: viewport.scrollLeft, top: viewport.scrollTop, width: document.getElementById('demoFrame').getBoundingClientRect().width };
    });
    assert.equal(panning.width, 900);
    assert.ok(panning.initial > 0);
    assert.equal(panning.left, 0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.getElementById('demoViewerCanvas').clientHeight < 506);
    assert.ok(await page.evaluate(() => {
      const viewport = document.getElementById('demoViewerCanvas');
      viewport.scrollTop = 80;
      return viewport.scrollTop > 0;
    }));
    await page.locator('#demoViewerFit').click();
    assert.ok(await fits());
    assert.equal(await page.evaluate(() => document.getElementById('demoGlance').dataset.direction), undefined);
    assert.ok(await page.evaluate(() => document.getElementById('demoStage') === window.originalDemoStage));
    assert.equal(await page.locator('#demoStage').count(), 1);
    // Native dialog must keep keyboard focus out of the underlying document.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.getElementById('demoViewer').contains(document.activeElement)));
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('demoViewer').open);
    // The native close event restores the canvas in a separate task after
    // the dialog's open flag is cleared.
    await page.locator('#demoMount #demoStage').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'demoEnlarge');
    assert.ok(await page.locator('#demoMount #demoStage').count());
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - scrollY) < 2);
    assert.equal(await page.locator('#demoScrubCurrent').textContent(), 'tab groups');
    await page.locator('#demoEnlarge').click();
    assert.equal(await page.locator('#demoViewerFit').getAttribute('aria-pressed'), 'true');
    await page.locator('#demoScrubToggle').click();
    await page.locator('#demoViewerClose').click();
    assert.equal(await page.locator('#demoScrubToggle').getAttribute('aria-label'), 'Pause demo');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the complete animated sequence runs without coordinate drift or responsive scene changes', { timeout: 60000 }, async () => {
  const { page, errors } = await openPage(390, 'no-preference');
  try {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.locator('#demoScrubToggle').evaluate(button => button.click());
    await page.locator('#demoChapterSelect').selectOption('0');
    await page.clock.runFor(100);
    await page.evaluate(() => {
      window.demoEvidence = { headlines: [], badShots: [], badDirections: [], cursorPositions: [] };
      const stage = document.getElementById('demoStage');
      const headline = document.getElementById('demoHeadline');
      new MutationObserver(() => {
        window.demoEvidence.headlines.push(headline.textContent);
      }).observe(headline, { childList: true });
      new MutationObserver(() => {
        for (const id of ['demoShot', 'demoGlanceShot']) {
          const src = document.getElementById(id).getAttribute('src');
          if (src && !src.startsWith('/shots/desktop/')) window.demoEvidence.badShots.push(src);
        }
        const direction = document.getElementById('demoGlance').dataset.direction;
        if (direction && direction !== 'horizontal') window.demoEvidence.badDirections.push(direction);
        const cursor = document.getElementById('demoCursor');
        if (!cursor.hidden) {
          window.demoEvidence.cursorPositions.push([parseFloat(cursor.style.getPropertyValue('--cursor-x')), parseFloat(cursor.style.getPropertyValue('--cursor-y'))]);
        }
      }).observe(stage, { attributes: true, subtree: true, attributeFilter: ['style', 'src', 'data-direction'] });
    });
    await page.locator('#demoScrubToggle').evaluate(button => button.click());
    // More than one authored loop, including typing, menus, Glance, and blocker actions.
    await page.clock.runFor(82000);
    const evidence = await page.evaluate(() => window.demoEvidence);
    for (const text of ['Drag the divider', 'Make either tab', 'Without the ad layer', 'Browse every', 'Netflix joins', 'Netflix moves', 'Reopen the whole']) {
      assert.ok(evidence.headlines.some(headline => headline.startsWith(text)), `missing scene: ${text}`);
    }
    assert.deepEqual(evidence.badShots, []);
    assert.deepEqual(evidence.badDirections, []);
    assert.ok(evidence.cursorPositions.length > 15);
    assert.ok(evidence.cursorPositions.every(([x, y]) => x >= 4 && x <= 898 && y >= 4 && y <= 505));
    // Stage-local cursor coordinates reach the far side of the desktop canvas,
    // rather than being clamped to the phone's display pixels.
    assert.ok(evidence.cursorPositions.some(([x]) => x > 500));
    await page.locator('#demoChapterSelect').selectOption('2');
    await page.clock.runFor(2500);
    const aimError = await page.evaluate(() => {
      const stage = document.getElementById('demoStage');
      const r = stage.getBoundingClientRect();
      const target = document.getElementById('demoGlanceDivider').getBoundingClientRect();
      const scale = r.width / stage.offsetWidth;
      const cursor = document.getElementById('demoCursor');
      const x = parseFloat(cursor.style.getPropertyValue('--cursor-x'));
      const y = parseFloat(cursor.style.getPropertyValue('--cursor-y'));
      return Math.hypot(x - ((target.left + target.width / 2 - r.left) / scale - stage.clientLeft), y - ((target.top + target.height / 2 - r.top) / scale - stage.clientTop));
    });
    assert.ok(aimError < 2, `cursor missed the Glance divider by ${aimError}px`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
