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
  // The privacy page lists the measured website events; this form adds none.
  assert.doesNotMatch(form, /data-track/);
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

test('the Download page has an Android tab that leads only to the beta signup', async () => {
  const { detectSystem } = await import('../../site/src/scripts/download-switcher.js');
  const page = await read('site/src/pages/download.astro');
  assert.match(page, /<input class="dl-radio" type="radio" name="dl-os" id="dl-os-android" value="android" \/>/);
  assert.match(page, /<label for="dl-os-android"><PlatformLogo platform="android" \/>Android<\/label>/);
  const panel = page.match(/<div class="dl-panel" data-os="android">([\s\S]*?)\n        <\/div>/)?.[1] ?? '';
  assert.match(panel, /<a class="dl-button" href="\/android-beta">Join the Android beta<\/a>/);
  assert.equal([...panel.matchAll(/href="/g)].length, 1, 'the panel links only to the beta signup');
  assert.match(panel, /Blanc for Android isn’t released yet\./);
  assert.doesNotMatch(page, /data-android/, 'the phone-box version is gone');
  assert.equal(detectSystem('Mozilla/5.0 (Linux; Android 15; Pixel 9)'), 'android');
  assert.equal(detectSystem('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  const logo = await read('site/public/revamp/android.svg');
  assert.match(logo, /Font Awesome Free 6\.7\.2 .*Icons: CC BY 4\.0/, 'the icon keeps its attribution, like the other platform logos');
});
