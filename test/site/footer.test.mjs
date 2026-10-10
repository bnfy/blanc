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

// The footer since the website revamp (#491): the Sunrise mark, tagline and
// newsletter form; Explore, Resources and Blanc link groups; and a bottom row
// with the Bananify credit, legal links, privacy choices (only where the page
// runs measurement) and social links.
const groups = {
  'Explore Blanc': [['Feature guides', '/features'], ['Download', '/download'], ['What’s new', '/changelog'], ['Roadmap', '/roadmap'], ['Blanc Patron', '/#patron'], ['Switching from Arc', '/arc-alternative'], ['Blanc Mail', '/mail']],
  'Blanc resources': [['Support', '/support'], ['Security guide', '/features/security'], ['Privacy & Security', '/trust'], ['Source code', 'https://github.com/bnfy/blanc'], ['Contact', 'mailto:support@blancbrowser.com']],
  'About Blanc': [['About', '/about'], ['Media', '/media'], ['Ambassadors', '/ambassadors']],
};
const social = [
  'https://blancbrowser.substack.com/', 'https://www.instagram.com/blancbrowser/', 'https://www.threads.net/@blancbrowser',
  'https://www.facebook.com/blancbrowser/', 'https://www.tiktok.com/@blancbrowser',
];

test('footer groups, legal links and conditional privacy choices render on every page', async () => {
  const page = await openPage();
  try {
    for (const [path, privacy] of [['/', true], ['/features/island', true], ['/media', false], ['/privacy', false], ['/terms', false]]) {
      await page.goto(`${baseURL}${path}`);
      const footer = page.locator('#site-footer');
      assert.deepEqual(await footer.locator('h2').allTextContents(), ['Explore', 'Resources', 'Blanc'], path);
      for (const [label, links] of Object.entries(groups)) {
        const found = await footer.locator(`nav[aria-label="${label}"] a`).evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')]));
        assert.deepEqual(found, links, `${path}: ${label}`);
      }
      assert.deepEqual(await footer.locator('nav[aria-label="Legal"] a').evaluateAll(as => as.map(a => [a.textContent.trim(), a.getAttribute('href')])), [['Privacy Policy', '/privacy'], ['Terms', '/terms']], path);
      assert.deepEqual(await footer.locator('nav[aria-label="Follow Blanc"] a').evaluateAll(as => as.map(a => a.getAttribute('href'))), social, path);
      assert.equal(await footer.locator('a[href="https://bnfy.me"]').textContent(), 'Bananify', path);
      assert.equal(await footer.locator('a[aria-label="Blanc home"]').getAttribute('href'), '/#opening', path);
      assert.equal((await footer.locator('.website-footer-identity p').textContent()).trim(), 'A little less browser.', path);
      assert.equal(await footer.getByRole('button', { name: 'Privacy choices' }).count(), privacy ? 1 : 0, `${path}: privacy choices`);
      if (privacy) {
        await footer.getByRole('button', { name: 'Privacy choices' }).click();
        await page.getByRole('dialog', { name: 'Privacy choices' }).waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'No thanks', exact: true }).click();
        await page.locator('#consent').waitFor({ state: 'hidden' });
      }
    }
  } finally { await page.close(); }
});

test('footer fits every page and width with its controls inside the viewport', { timeout: 60000 }, async () => {
  const page = await openPage();
  try {
    for (const width of [320, 390, 768, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/features', '/features/island', '/media', '/privacy']) {
        await page.goto(`${baseURL}${path}`);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const layout = await page.locator('#site-footer').evaluate(footer => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          footerOverflow: footer.scrollWidth > footer.clientWidth,
          // The newsletter honeypot sits off-screen on purpose; it is not a visitor control.
          inBounds: [...footer.querySelectorAll('a, button, input:not(.foot-news-hp)')].filter(el => el.getClientRects().length)
            .every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
          groupsShown: [...footer.querySelectorAll('h2')].every(h => h.getClientRects().length),
        }));
        const message = `${width}px ${path}`;
        assert.equal(layout.overflow, false, message);
        assert.equal(layout.footerOverflow, false, message);
        assert.equal(layout.inBounds, true, message);
        assert.equal(layout.groupsShown, true, message);
        if (screenshotDir) await page.locator('#site-footer').screenshot({ path: `${screenshotDir}/${width}-${path.replaceAll('/', '-') || 'home'}.png` });
      }
    }
  } finally { await page.close(); }
});

// docs/brand-usage.md → Horizon rule: a 1px gold hairline at the seam and a
// soft glow rising into the page above, in place of a neutral top border.
test('a gold horizon rule marks the footer seam on every page profile without overflow', async () => {
  const page = await openPage();
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, appearance] of [['/'], ['/', 'dark'], ['/features/island'], ['/privacy'], ['/mail']]) {
        await page.goto(`${baseURL}${path}`);
        if (appearance) await page.evaluate(value => { document.documentElement.dataset.homeAppearance = value; }, appearance);
        const seam = await page.locator('#site-footer').evaluate(footer => {
          const glow = getComputedStyle(footer, '::before');
          const line = getComputedStyle(footer, '::after');
          return {
            position: getComputedStyle(footer).position,
            border: getComputedStyle(footer).borderTopWidth,
            glow: glow.backgroundImage,
            // bottom: 100% resolves to the footer's height: the glow ends at the seam.
            glowEndsAtSeam: Math.abs(parseFloat(glow.bottom) - footer.clientHeight) < 1,
            glowHeight: parseFloat(glow.height),
            line: line.backgroundImage,
            lineHeight: line.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        const message = `${width}px ${path}${appearance ? ` ${appearance}` : ''}`;
        assert.equal(seam.position, 'relative', `${message}: the footer anchors its seam`);
        assert.equal(seam.border, '0px', `${message}: the rule replaces the neutral top border`);
        assert.match(seam.glow, /radial-gradient/, `${message}: glow`);
        assert.equal(seam.glowEndsAtSeam, true, `${message}: the glow rises above the seam`);
        assert.ok(seam.glowHeight >= 96, `${message}: glow height ${seam.glowHeight}`);
        assert.match(seam.line, /linear-gradient\(90deg, .*rgb\(212, 173, 102\) 18%/, `${message}: gold line`);
        assert.equal(seam.lineHeight, '1px', `${message}: the line is a hairline`);
        assert.equal(seam.overflow, false, `${message}: no sideways scroll`);
      }
    }
  } finally { await page.close(); }
});

test('the newsletter field keeps its label for screen readers only', async () => {
  const page = await openPage();
  try {
    const label = page.locator('label[for="newsletterEmail"]');
    assert.equal(await label.evaluate(el => el.getBoundingClientRect().width <= 1 && getComputedStyle(el).clip !== 'auto'), true);
    assert.equal(await page.getByRole('textbox', { name: 'Updates from Blanc. Email address' }).count(), 1);
  } finally { await page.close(); }
});

test('footer links take keyboard focus with a visible ring and the footer survives 200% zoom', async () => {
  const page = await openPage();
  try {
    const links = page.locator('#site-footer a');
    for (let index = 0; index < await links.count(); index++) {
      const link = links.nth(index);
      await link.focus();
      assert.equal(await link.evaluate(el => el === document.activeElement), true, `link ${index} takes focus`);
      assert.notEqual(await link.evaluate(el => getComputedStyle(el).outlineStyle), 'none', `link ${index} shows a focus ring`);
    }
    // Recreate 200% browser zoom: 1440 physical pixels become a 720px CSS viewport.
    const zoomed = await openPage(720, '/', 2);
    try {
      await zoomed.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      assert.equal(await zoomed.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await zoomed.locator('#site-footer').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      if (screenshotDir) await zoomed.locator('#site-footer').screenshot({ path: `${screenshotDir}/zoom-200.png` });
    } finally { await zoomed.close(); }
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
