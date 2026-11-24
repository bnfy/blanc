// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-overview.test.mjs
//
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const WAITLIST = readFileSync(new URL('../../site/src/components/MailWaitlistForm.astro', import.meta.url), 'utf8')
  .match(/WAITLIST_ENDPOINT = '([^']+)'/)[1];
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

// Stands in for the waitlist Worker. Registered after openPage's catch-all,
// so it runs first (Playwright runs routes in reverse order of registration).
async function answerWaitlist(page, status) {
  await page.route(WAITLIST, route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });
}

// Opens the bar's waitlist and waits for its email field to take focus,
// which happens in the popover's toggle event, a task after it opens.
async function openBarWaitlist(page) {
  await page.locator('.mail-bar-join').click();
  await page.waitForFunction(() => document.getElementById('mail-bar-waitlist').matches(':popover-open'));
  await page.waitForFunction(() => document.activeElement?.id === 'bar-waitlistEmail');
}

test('the hero shows both ways to use Mail with equal actions before pricing', async () => {
  for (const width of [390, 1440]) {
    const { page, context } = await openPage('/mail', width, { viewport: { width, height: 844 } });
    try {
      assert.equal(await page.locator('h1').innerText(), 'A little less inbox.');
      assert.match(await page.locator('.mail-eyebrow').innerText(), /coming soon/i);
      const paths = page.locator('.offer-path');
      assert.deepEqual(await paths.locator('h2').allTextContents(), ['Keep your email address', 'Get a Blanc address']);
      assert.match(await paths.first().innerText(), /Proton Mail Bridge/);
      const open = JSON.parse(readFileSync(new URL('../../site/src/data/mail-reservations.json', import.meta.url))).open;
      const address = paths.last().getByRole('link');
      assert.equal(await address.getAttribute('href'), open ? '/mail/reserve' : '#address');
      assert.equal(await address.innerText(), open ? 'Reserve your address' : 'Explore Blanc addresses');
      assert.equal(/is free/i.test(await paths.last().innerText()), open);
      const [wait, reserve] = await paths.locator('.offer-action').evaluateAll(actions => actions.map(action => action.getBoundingClientRect().toJSON()));
      assert.equal(wait.height, reserve.height);
      assert.equal(wait.width, reserve.width);
      assert.ok(reserve.bottom <= 844);
      if (width === 390) assert.ok(reserve.top > wait.bottom);
      else assert.equal(wait.top, reserve.top);
      assert.ok((await page.locator('#pricing').boundingBox()).y >= reserve.bottom);
      assert.equal(await page.locator('.offer-jump').getAttribute('href'), '#pricing');
      assert.equal(await page.locator('.offer-hero + section').getAttribute('id'), 'pricing');
      if (open) {
        await address.click();
        assert.equal(new URL(page.url()).pathname, '/mail/reserve');
      } else {
        await address.click();
        assert.equal(new URL(page.url()).hash, '#address');
        assert.equal(await page.locator('main a[href="/mail/reserve"]').count(), 0);
      }
    } finally { await context.close(); }
  }
});

test('the example address shimmers in the hero and address section and stays gold under reduced motion', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const { endings } = JSON.parse(readFileSync(new URL('../../site/src/data/mail-reservations.json', import.meta.url)));
    for (const section of ['.offer-paths', '#address']) {
      const address = page.locator(section).getByText(`mira@${endings[0]}`, { exact: true });
      assert.ok(await address.isVisible());
      const { backgroundClip, backgroundImage, animationName } = await address.evaluate(el => {
        const { backgroundClip, backgroundImage, animationName } = getComputedStyle(el);
        return { backgroundClip, backgroundImage, animationName };
      });
      assert.equal(backgroundClip, 'text');
      assert.match(backgroundImage, /linear-gradient/);
      assert.equal(animationName, 'none');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const address of await page.locator('.mail-shimmer').all()) {
      assert.ok(await address.evaluate(el => {
        const [shimmer] = el.getAnimations();
        if (!shimmer) return false;
        shimmer.pause();
        shimmer.currentTime = 0;
        const start = getComputedStyle(el).backgroundPosition;
        shimmer.currentTime = shimmer.effect.getTiming().duration;
        return getComputedStyle(el).backgroundPosition !== start;
      }), 'the gold highlight travels across the address');
    }
  } finally { await context.close(); }
});

test('the envelope holds still under reduced motion, and otherwise leans toward the pointer', async () => {
  // Whether the envelope is rotated at all: the perspective alone leaves the
  // matrix's rotation terms at zero.
  const leaning = page => page.evaluate(() => {
    const { m13, m23, m31, m32 } = new DOMMatrix(getComputedStyle(document.querySelector('.mail-envelope')).transform);
    return [m13, m23, m31, m32].some(v => Math.abs(v) > 1e-4);
  });

  const reduced = await openPage('/mail');
  try {
    await reduced.page.mouse.move(40, 200);
    await reduced.page.waitForTimeout(400);
    assert.equal(await leaning(reduced.page), false, 'no lean');
    assert.equal(await reduced.page.evaluate(() => document.querySelector('.envelope-stage').getAnimations({ subtree: true }).length), 0, 'nothing animates');
  } finally { await reduced.context.close(); }

  const full = await openPage('/mail', 1440, { reducedMotion: 'no-preference' });
  try {
    await full.page.mouse.move(40, 200);
    await full.page.waitForFunction(() => getComputedStyle(document.querySelector('.mail-envelope')).getPropertyValue('--mx').trim() !== '0.5');
    await full.page.waitForTimeout(1000);
    assert.equal(await leaning(full.page), true, 'it leans');
    await full.page.mouse.move(720, 450);
    await full.page.mouse.move(-1, 450);
    await full.page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')));
    await full.page.waitForTimeout(1100);
    assert.equal(await leaning(full.page), false, 'and settles when the pointer leaves');
  } finally { await full.context.close(); }
});

test('the hero waitlist opens by keyboard and reuses the email confirmation flow', async () => {
  const { page, context } = await openPage('/mail');
  try {
    await answerWaitlist(page, 200);
    await page.locator('.offer-signup summary').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'waitlistEmail');
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#waitlist .mail-waitlist-status', { hasText: 'Check your inbox to confirm your place.' }).waitFor();
  } finally { await context.close(); }
});

test('mailbox features and the reservation action are visible before opening a design preview', async () => {
  for (const [width, columns] of [[390, 1], [768, 2], [1440, 3]]) {
    const { page, context } = await openPage('/mail', width);
    try {
      const features = page.getByRole('list', { name: 'Blanc mailbox features' });
      assert.deepEqual(await features.locator('h3').allTextContents(), [
        'Encrypted mailbox storage', 'Your password stays on your Mac', 'Choose when images load',
        'Your name, your ending', '15 GB for your mail', 'Spam and phishing checks',
      ]);
      const featureCopy = await features.innerText();
      assert.match(featureCopy, /can read mail when it receives or sends it/);
      assert.match(featureCopy, /[Ss]enders, recipients, subjects and dates remain visible/);
      assert.match(featureCopy, /load automatically by default/);
      assert.equal(await features.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), columns);
      const { endings, open } = JSON.parse(readFileSync(new URL('../../site/src/data/mail-reservations.json', import.meta.url)));
      assert.deepEqual(await features.locator('strong').allTextContents(), endings);
      assert.equal(await page.locator('#address-features + a[href="/mail/reserve"]').count(), open ? 1 : 0);
      assert.equal(await page.locator('.address-preview').getAttribute('open'), null);
      assert.equal(await page.locator('#pricing + section').getAttribute('id'), 'address');
      assert.equal(await page.locator('main .mail-shot, #design, #island').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Inside Blanc Mail' }).count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    } finally { await context.close(); }
  }
});

test('the app grid shows mail tools and privacy protections at each breakpoint', async () => {
  for (const [width, columns] of [[390, 1], [768, 2], [1440, 3]]) {
    const { page, context } = await openPage('/mail#features', width);
    try {
      const section = page.getByRole('region', { name: 'Every account, one calm inbox.' });
      const grid = section.getByRole('list');
      assert.deepEqual(await grid.getByRole('heading', { level: 3 }).allTextContents(), [
        'Every account together', 'Groups', 'Read with scripts blocked',
        'Gmail and Proton Mail', 'Blanc adds no tracking', 'Later, on your terms',
        'Ghost Mode', 'Share photos without geotags', 'Drafts that keep up',
      ]);
      assert.equal(await grid.locator('.mail-feature-badge svg').count(), 9);
      assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), columns);
    } finally { await context.close(); }
  }
});

test('the address setup previews stay labelled and switch by mouse or keyboard', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const address = page.locator('#address');
    await address.locator('summary').click();
    const visibleStep = address.locator('.mail-teaser:visible');
    assert.equal(await visibleStep.getAttribute('data-teaser'), 'offer');
    assert.deepEqual((await address.locator('label').allTextContents()).map(t => t.trim()), ['Get started', 'Pick a name', 'Open inbox']);
    for (const caption of await address.locator('figcaption').allTextContents()) assert.equal(caption.trim(), 'Design preview');
    assert.equal(await address.locator('img[alt^="Design preview"]').count(), 3);
    const pickName = address.getByLabel('Pick a name');
    await pickName.check();
    assert.equal(await visibleStep.getAttribute('data-teaser'), 'choose');
    await pickName.press('ArrowRight');
    assert.equal(await visibleStep.getAttribute('data-teaser'), 'ready');
    const addressText = await address.innerText();
    assert.match(addressText, /15 GB of storage/);
    assert.doesNotMatch(addressText, /can[’']t read your mail|Apple Mail|iPhone|iPad|end-to-end/i);
  } finally { await context.close(); }
});

test('visitors see one plan, the address add-on and the Patron upgrade without opening checkout', async () => {
  const { page, context } = await openPage('/mail');
  try {
    assert.match(await page.locator('#pricing .section-intro').innerText(), /Planned pricing at launch.*Purchases are not open/);
    const plan = page.locator('.offer-plan');
    assert.equal(await plan.count(), 1);
    assert.equal(await plan.locator('h3').innerText(), 'Blanc Mail');
    assert.deepEqual(await plan.locator('.offer-prices p').allTextContents(), ['$49.99 / year', 'or $4.99 / month']);
    assert.match(await plan.innerText(), /existing email accounts/);
    const addOn = plan.locator('.plan-addon');
    assert.equal(await addOn.locator('h4').innerText(), 'Add a Blanc address');
    assert.match(await addOn.innerText(), /\$20 more a year, \$69\.99 in all.*15 GB.*Annual billing only/s);
    const upgrade = page.locator('#pricing .plan-upgrade');
    assert.match(await upgrade.innerText(), /Browser Patrons can upgrade to Blanc Bundle for \$79\.99 a year or \$7\.99 a month/);
    assert.equal(await upgrade.getByRole('link', { name: 'Nodding Off' }).getAttribute('href'), 'https://noddingoffapp.com/');
    assert.equal(await page.locator('main a[href*="polar.sh"]').count(), 0);
    assert.doesNotMatch(await page.locator('#pricing').innerText(), /recommended|most popular/i);
  } finally { await context.close(); }
});

test('the plan card fits from narrow phones to wide screens', async () => {
  const { page, context } = await openPage('/mail#pricing');
  try {
    for (const width of [320, 390, 639, 640, 768, 884, 901, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const card = await page.locator('.offer-plan').evaluate(el => {
        const { left, right } = el.getBoundingClientRect();
        return { left, right, fits: el.scrollWidth <= el.clientWidth };
      });
      assert.ok(card.fits && card.left >= 0 && card.right <= width, `content fits at ${width}px`);
    }
  } finally { await context.close(); }
});

test('FAQ disclosures explain reservations, privacy and billing and are keyboard operable', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const questions = page.locator('#support details');
    for (const [title, answer] of [
      ['What does reserving a name get me?', /30 days after addresses open/],
      ['What is encrypted in a Blanc mailbox?', /subjects and dates remain visible/],
      ['What if I forget my mailbox password?', /cannot open mail you received before recovery/],
      ['What happens if my subscription ends?', /read, search and export/],
      ['I’m a Browser Patron.', /existing Browser key keeps working/],
    ]) {
      const question = questions.filter({ has: page.locator('summary', { hasText: title }) });
      await question.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.ok(await question.locator('p').isVisible());
      assert.match(await question.locator('p').innerText(), answer);
    }
    assert.equal(await page.locator('#support a[href^="mailto:"]').first().getAttribute('href'), 'mailto:support@blanc.day');
    assert.match(await page.locator('#download').innerText(), /macOS 14 or later on an Apple Silicon or Intel Mac/);
    assert.equal(await page.locator('#download form').getAttribute('id'), 'closing-waitlist');
  } finally { await context.close(); }
});

test('a link to a section lands with its heading below the bars', async () => {
  for (const id of ['pricing', 'address', 'features', 'support', 'download']) {
    // Load the page first, then follow the link within it. Loading /mail#id
    // directly jumps while images and fonts above the section are still
    // settling, and on a slow runner that jump stayed about 43px too far
    // (November 17, 2026, on #pricing and #download): the runner's timing,
    // not the offset this test checks.
    const { page, context } = await openPage('/mail');
    try {
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
      await page.goto(`${baseURL}/mail#${id}`);
      const measure = id => document.getElementById(id).getBoundingClientRect().top - document.querySelector('.mail-bar').getBoundingClientRect().bottom;
      await page.waitForFunction(id => {
        const gap = document.getElementById(id).getBoundingClientRect().top - document.querySelector('.mail-bar').getBoundingClientRect().bottom;
        return gap >= 0 && gap <= 60;
      }, id, { timeout: 5000 }).catch(() => {});
      const gap = await page.evaluate(measure, id);
      assert.ok(gap >= 0 && gap <= 60, `#${id} starts ${gap}px below the bar`);
    } finally { await context.close(); }
  }
});

test('on a phone the waitlist stacks with a full-height field', async () => {
  const { page, context } = await openPage('/mail', 390, { viewport: { width: 390, height: 844 } });
  try {
    await page.locator('.offer-signup summary').click();
    const m = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return { field: box('#waitlistEmail').height, button: box('#waitlist button[type=submit]').toJSON(), fieldBottom: box('#waitlistEmail').bottom };
    });
    assert.ok(m.field >= 40, `the field is ${m.field}px tall`);
    assert.ok(m.button.top >= m.fieldBottom, 'the button sits below the field');
  } finally { await context.close(); }
});

test('the bar, hero and closing waitlists are separate, and the bar keeps its answer in view', async () => {
  const { page, context } = await openPage('/mail');
  try {
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('form[data-mail-waitlist]')].map(f => f.id)), ['bar-waitlist', 'waitlist', 'closing-waitlist']);
    await answerWaitlist(page, 200);
    await openBarWaitlist(page);
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'Check your inbox to confirm your place.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, 'the answer stays in view');
    assert.equal(await page.locator('#waitlist .mail-waitlist-status').textContent(), '', 'the hero form is untouched');
  } finally { await context.close(); }
});

test('a waitlist error shows inside the open bar popover', async () => {
  for (const [status, message] of [
    [400, 'That address didn’t look right. Please check it and try again.'],
    [503, 'We couldn’t add you just now. Please try again later.'],
  ]) {
    const { page, context } = await openPage('/mail');
    try {
      await answerWaitlist(page, status);
      await openBarWaitlist(page);
      await page.keyboard.type('reader@example.com');
      await page.keyboard.press('Enter');
      await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: message }).waitFor();
      assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, `${status}: still open`);
      assert.equal(await page.locator('#bar-waitlist button[type=submit]').isEnabled(), true, `${status}: can try again`);
    } finally { await context.close(); }
  }
  // No answer at all (the catch-all aborts the request).
  const { page, context } = await openPage('/mail');
  try {
    await openBarWaitlist(page);
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'We couldn’t add you just now. Please try again later.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true);
  } finally { await context.close(); }
});
