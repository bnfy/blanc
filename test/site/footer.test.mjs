// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/footer.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const endpoint = 'https://blanc-newsletter.bnfy-441.workers.dev/subscribe';
const screenshotDir = process.env.BLANC_FOOTER_SCREENSHOTS;
let browser;
before(async () => {
  browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch();
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
});
after(async () => { await browser?.close(); });

async function openPage(width = 1440, path = '/', scale = 1) {
  const page = await browser.newPage({ viewport: { width, height: 900 / scale }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  // No subscriptions, analytics, or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const navigation = [
  ['Overview', '/'], ['Features', '/features'], ['Changelog', '/changelog'],
  ['Download', '/download'], ['FAQ', '/faq'], ['About', '/about'],
  ['Press', '/press'], ['Ambassadors', '/ambassadors'],
];
const social = [
  'mailto:support@blancbrowser.com', 'https://blancbrowser.substack.com/',
  'https://www.facebook.com/blancbrowser/', 'https://www.threads.net/@blancbrowser',
  'https://www.instagram.com/blancbrowser/', 'https://www.tiktok.com/@blancbrowser',
  'https://github.com/bnfy/blanc',
];

test('footer links, current routes, and conditional privacy choices survive the redesign', async () => {
  const page = await openPage();
  try {
    for (const [path, current, privacy] of [
      ['/', '/', true], ['/features/island', '/features', true],
      ['/press', '/press', false], ['/privacy', '/privacy', false], ['/terms', '/terms', false],
    ]) {
      await page.goto(`${baseURL}${path}`);
      const footer = page.locator('.site-footer');
      assert.deepEqual(await footer.locator('.foot-nav a').evaluateAll(links => links.map(a => [a.textContent, a.getAttribute('href')])), navigation);
      assert.deepEqual(await footer.locator('.foot-nav h2').allTextContents(), ['Explore', 'Blanc']);
      assert.deepEqual(await footer.locator('.foot-social a').evaluateAll(links => links.map(a => a.getAttribute('href'))), social);
      assert.equal((await footer.locator('.foot-brand').textContent()).trim(), '');
      assert.equal(await footer.locator('.foot-brand').getAttribute('aria-label'), 'Blanc Browser home');
      assert.equal(await footer.locator('.foot-brand').getAttribute('href'), '/');
      assert.ok(await footer.locator('.foot-social a').evaluateAll(links => links.every(el => getComputedStyle(el).color === 'rgb(128, 93, 40)')));
      assert.equal(await footer.locator('[aria-current="page"]').getAttribute('href'), current);
      assert.deepEqual(await footer.locator('.foot-legal-links a').evaluateAll(links => links.map(a => [a.textContent, a.getAttribute('href')])), [['Privacy', '/privacy'], ['Terms', '/terms']]);
      assert.equal(await footer.locator('.foot-credit a').getAttribute('href'), 'https://bnfy.me');
      assert.equal(await footer.locator('.foot-credit a').textContent(), 'BNFY');
      assert.equal(await footer.locator('.foot-mark').getAttribute('aria-hidden'), 'true');
      assert.equal(await footer.locator('.foot-mark').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(14, 14, 14)');
      assert.equal(await footer.locator('.foot-identity p').textContent(), 'A little less browser.');
      assert.ok(await footer.locator('a[href^="https:"]').evaluateAll(links => links.every(a => a.target === '_blank' && a.relList.contains('noopener'))));
      assert.equal(await footer.getByRole('button', { name: 'Privacy choices' }).count(), privacy ? 1 : 0);
      if (privacy) {
        await footer.getByRole('button', { name: 'Privacy choices' }).click();
        await page.getByRole('dialog', { name: 'Help improve Blanc' }).waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.activeElement?.id === 'consentAllow');
        await page.getByRole('button', { name: 'No thanks', exact: true }).click();
        await page.locator('#consent').waitFor({ state: 'hidden' });
      }
    }
  } finally { await page.close(); }
});

test('footer fits every requested page and width without affecting press attribution', { timeout: 60000 }, async () => {
  const page = await openPage();
  try {
    for (const width of [320, 390, 768, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/features/island', '/press', '/privacy']) {
        await page.goto(`${baseURL}${path}`);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const layout = await page.locator('.site-footer').evaluate(footer => {
          const rect = selector => footer.querySelector(selector).getBoundingClientRect();
          const mark = footer.querySelector('.foot-brand');
          const style = getComputedStyle(mark);
          const nav = document.querySelector('.site-nav');
          const navVisible = nav && nav.getClientRects().length && innerWidth > 640;
          const interactive = [...footer.querySelectorAll('a, button, input[type="email"]')];
          const bottom = footer.querySelector('.foot-bottom').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            inBounds: interactive.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
            touchTargets: interactive.every(el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; }),
            mark: { color: style.color, animation: style.animationName, transform: style.transform },
            stacked: rect('.foot-news').top >= rect('.foot-nav').bottom,
            groupsSideBySide: rect('.foot-nav-group').top === footer.querySelectorAll('.foot-nav-group')[1].getBoundingClientRect().top,
            navClear: !navVisible || bottom.bottom + 16 <= nav.getBoundingClientRect().top,
            contentWidth: footer.clientWidth - parseFloat(getComputedStyle(footer).paddingLeft) - parseFloat(getComputedStyle(footer).paddingRight),
          };
        });
        const message = `${width}px ${path}`;
        assert.equal(layout.overflow, false, message);
        assert.equal(layout.inBounds, true, message);
        assert.equal(layout.touchTargets, true, message);
        assert.equal(layout.mark.color, 'rgb(14, 14, 14)', message);
        assert.equal(layout.mark.animation, 'none', message);
        assert.equal(layout.mark.transform, 'none', message);
        assert.equal(layout.stacked, width < 900, message);
        assert.equal(layout.groupsSideBySide, true, message);
        assert.equal(layout.navClear, true, message);
        if (width === 1440) assert.equal(layout.contentWidth, 1132);
        if (path === '/press') {
          const attribution = await page.locator('.press-announcement blockquote footer').evaluate(el => {
            const s = getComputedStyle(el);
            return { background: s.backgroundColor, padding: s.padding, display: s.display };
          });
          assert.deepEqual(attribution, { background: 'rgba(0, 0, 0, 0)', padding: '0px', display: 'block' });
        }
        if (screenshotDir) await page.locator('.site-footer').screenshot({ path: `${screenshotDir}/${width}-${path.replaceAll('/', '-') || 'home'}.png` });
      }
    }
  } finally { await page.close(); }
});

test('footer keyboard focus, hover, and zoom preserve usable controls', async () => {
  const page = await openPage();
  try {
    const footer = page.locator('.site-footer');
    await footer.getByRole('link', { name: 'Features', exact: true }).hover();
    assert.equal(await footer.getByRole('link', { name: 'Features', exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(128, 93, 40)');
    await footer.locator('.foot-brand').hover();
    assert.equal(await footer.locator('.foot-brand').evaluate(el => getComputedStyle(el).color), 'rgb(14, 14, 14)');
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const controls = footer.locator('a, input[type="email"], button');
      await controls.first().focus();
      for (let index = 0; index < await controls.count(); index++) {
        assert.equal(await controls.nth(index).evaluate(el => el === document.activeElement), true);
        const outline = await controls.nth(index).evaluate(el => getComputedStyle(el).outlineStyle);
        assert.notEqual(outline, 'none');
        await page.keyboard.press('Tab');
      }
    }
    // Recreate 200% browser zoom: 1440 physical pixels become a 720px CSS viewport.
    const zoomedPage = await openPage(720, '/', 2);
    try {
      const zoomedFooter = zoomedPage.locator('.site-footer');
      assert.equal(await zoomedFooter.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await zoomedPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await zoomedFooter.evaluate(el => {
        const nav = el.querySelector('.foot-nav').getBoundingClientRect();
        return el.querySelector('.foot-news').getBoundingClientRect().top >= nav.bottom;
      }), true);
      if (screenshotDir) await zoomedFooter.screenshot({ path: `${screenshotDir}/zoom-200.png` });
    } finally { await zoomedPage.close(); }
  } finally { await page.close(); }
});

for (const width of [390, 1440]) {
  test(`newsletter validation, pending, success, and retries at ${width}px use only intercepted responses`, async () => {
    const page = await openPage(width);
    let pending;
    let requests = 0;
    await page.route(endpoint, route => { pending = route; requests++; });
    try {
      const form = page.locator('form[data-newsletter]');
      const email = form.getByRole('textbox', { name: /Email address/ });
      const submit = form.locator('button[type="submit"]');
      await email.fill('invalid');
      await submit.click();
      assert.equal(await email.evaluate(el => el.validity.typeMismatch), true);
      assert.equal(requests, 0);
      const honeypot = form.locator('input[name="website"]');
      assert.equal(await honeypot.getAttribute('tabindex'), '-1');
      assert.equal(await honeypot.getAttribute('aria-hidden'), 'true');
      await email.fill('footer-test@example.com');
      for (const [response, message] of [
        [400, 'that address didn’t look right — try again?'],
        [500, 'couldn’t subscribe just now — try again later'],
        ['network', 'couldn’t subscribe just now — try again later'],
        [200, 'check your inbox to confirm — the link expires in 24 hours'],
      ]) {
        pending = null;
        const request = page.waitForRequest(endpoint);
        await submit.click();
        await request;
        await page.waitForFunction(() => document.querySelector('.foot-news button').disabled);
        assert.equal(await submit.isDisabled(), true);
        assert.deepEqual(pending.request().postDataJSON(), { email: 'footer-test@example.com', website: '' });
        if (response === 'network') await pending.abort();
        else await pending.fulfill({ status: response, contentType: 'application/json', body: '{}' });
        await page.waitForFunction(text => document.querySelector('.foot-news-status').textContent === text, message);
        assert.equal(await form.getByRole('status').textContent(), message);
        assert.equal(await email.isVisible(), response !== 200);
        assert.equal(await submit.isDisabled(), false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.equal(requests, 4);
    } finally { await page.close(); }
  });
}
