// test/unit/patron-checkout-cta.test.js
// Guards the visible Patron purchase funnel: Settings must expose a same-frame
// Polar checkout CTA (sheet popup policy denies target=_blank) and keep the
// manual license path for reinstalls / additional devices.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const POLAR_CHECKOUT =
  'https://buy.polar.sh/polar_cl_auwRq39Q2hIVLJwANEqFWgWuZ8DGjdJmEI4mE0JaNDf';

const html = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/settings.html'),
  'utf8',
);
const page = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/pages/settings.js'),
  'utf8',
);
const siteIndex = fs.readFileSync(
  path.join(__dirname, '../../site/src/pages/index.astro'),
  'utf8',
);

test('Settings Patron CTA is a same-frame link to the production Polar checkout', () => {
  const block = html.match(/<section class="settings-group" id="group-patron">[\s\S]*?<\/section>/)?.[0];
  assert.ok(block, 'no #group-patron section in settings.html');

  const cta = block.match(/<a\b[^>]*\bid="patronCheckout"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(cta, 'missing #patronCheckout CTA');
  assert.match(cta, new RegExp(`href="${POLAR_CHECKOUT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.doesNotMatch(cta, /\btarget\s*=/);
  assert.match(cta, /Become a Patron — \$4\/month or \$30\/year/);

  assert.match(block, /Named Workspaces on every platform/);
  assert.match(block, /on macOS three\s+extra Dock colorways/);
  assert.match(block, /existing workspaces stay available while creating new ones pauses/);
  assert.match(block, /on macOS,\s+colorways quietly revert to Sunrise/);

  assert.match(
    block,
    /Already a Patron\? Enter the license key available under Purchases in Polar to activate this device\./,
  );
  assert.match(block, /id="patronKey"/);
  assert.match(block, /id="patronActivate"/);
});

test('the Settings checkout URL matches the live marketing-site Polar link', () => {
  assert.match(siteIndex, new RegExp(POLAR_CHECKOUT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Patron activation stays available on every platform; only icon colorways are macOS-gated', () => {
  assert.match(page, /supports\('supporter'\)/);
  assert.doesNotMatch(
    page,
    /supports\('supporter'\)\s*&&\s*supportsNativeAppIcon/,
  );
  assert.match(page, /const supportsNativeAppIcon = appIconPlatform\.startsWith\('Mac'\);/);
  assert.match(page, /getElementById\('patronCheckoutRow'\)/);
  assert.match(page, /patronCheckoutRow\.hidden = true/);
});
