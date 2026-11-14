// node --test test/site/android-beta-page.test.mjs (after npm run site:build)
//
// blanc.day/android-beta signs people up for the Blanc for Android beta through
// the blanc-newsletter Worker's /android-beta route (its own contract is in
// test/unit/newsletter-worker.test.js). The form, the Worker contract and the
// privacy page's #android-beta section change together. Blanc
// for Android isn't released, so the page is unlisted and noindex and claims
// nothing about the app beyond the beta itself.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

test('the form posts to the Worker route, keeps the address out of the URL and has the honeypot', async () => {
  const form = await read('site/src/components/AndroidBetaForm.astro');
  assert.match(form, /'https:\/\/blanc-newsletter\.bnfy-441\.workers\.dev\/android-beta'/);
  assert.match(form, /<form class="android-beta-form"[^>]*method="post"/, 'an address never lands in the page URL');
  assert.match(form, /name="website" tabindex="-1" autocomplete="off" aria-hidden="true"/);
  assert.match(form, /<button type="submit"[^>]*\bdisabled>/, 'no submission before the script is ready');
  assert.match(form, /button\.disabled = false;\n/);
  assert.match(form, /separate from the Blanc newsletter, and we delete it when the beta ends/);
  assert.match(form, /href="\/privacy#android-beta"/);
});

test('the privacy page describes the beta list', async () => {
  const privacy = await read('site/src/pages/privacy.astro');
  assert.match(privacy, /<h3 id="android-beta">Blanc for Android beta \(optional, double opt-in\)<\/h3>/);
  assert.match(privacy, /does not subscribe you to the newsletter or the Blanc Mail waitlist/);
  assert.match(privacy, /we delete the whole beta list and those notices/);
  assert.match(privacy, /Google Play receives the addresses of confirmed Android beta testers/);
});

test('the built page is noindex, unlisted, and offers no second signup prompt', async () => {
  const html = await read('site/dist/android-beta.html');
  assert.match(html, /<meta[^>]+name="robots"[^>]+content="noindex,follow"/i);
  assert.match(html, /<link[^>]+rel="canonical"[^>]+href="https:\/\/blanc\.day\/android-beta"/i);
  assert.match(html, /Test Blanc for Android/);
  assert.match(html, /isn’t released yet/);
  assert.doesNotMatch(html, /data-newsletter-prompt/, 'the page already asks for an address');
  const sitemap = await read('site/dist/sitemap.xml');
  assert.doesNotMatch(sitemap, /\/android-beta</);
});

test('the Download page shows the beta line and button to Android phones only', async () => {
  const { isAndroid, initHandheldDownload } = await import('../../site/src/scripts/handheld-download.js');
  const page = await read('site/src/pages/download.astro');
  assert.match(page, /<p data-android hidden>Blanc for Android isn’t released yet\./);
  assert.match(page, /<a class="download-handheld-action is-secondary" href="\/android-beta" data-android data-track="android_beta_cta" hidden>Join the Android beta<\/a>/);

  const visit = (userAgent, maxTouchPoints = 5) => {
    const android = [{ hidden: true }, { hidden: true }];
    const document = {
      querySelectorAll: (selector) => (selector === '[data-android]' ? android : []),
      getElementById: () => null,
    };
    initHandheldDownload({ document, view: { navigator: { userAgent, maxTouchPoints } } });
    return android.every((item) => !item.hidden);
  };
  assert.equal(visit('Mozilla/5.0 (Linux; Android 15; Pixel 9)'), true);
  assert.equal(visit('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), false);
  assert.equal(visit('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), false, 'an iPad asking for the desktop site');
  assert.equal(visit('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false, 'a desktop');
  assert.equal(isAndroid({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), false, 'desktop Linux is not Android');
});
