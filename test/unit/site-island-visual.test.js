'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const styles = fs.readFileSync(path.join(ROOT, 'site/src/styles/site.css'), 'utf8');
const header = fs.readFileSync(path.join(ROOT, 'site/src/components/Header.astro'), 'utf8');
const consent = fs.readFileSync(path.join(ROOT, 'site/src/components/Consent.astro'), 'utf8');
const footer = fs.readFileSync(path.join(ROOT, 'site/src/components/Footer.astro'), 'utf8');
const layout = fs.readFileSync(path.join(ROOT, 'site/src/layouts/BaseLayout.astro'), 'utf8');
const siteScript = fs.readFileSync(path.join(ROOT, 'site/src/scripts/site.js'), 'utf8');

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('website Island replicas use the released resting material and geometry', () => {
  assert.match(styles, /--island-resting-surface:\s*rgba\(255,255,255,\.94\)/);
  assert.match(styles, /--shadow-island-resting:\s*inset 0 1px 0 rgba\(255,255,255,\.72\), inset 0 -1px 0 rgba\(14,14,14,\.035\), 0 5px 18px -12px rgba\(14,14,14,\.24\)/);
  assert.match(styles, /--island-resting-height:\s*44px/);
  assert.match(styles, /--island-resting-radius:\s*17px/);
  assert.match(styles, /--island-strip-height:\s*68px/);
  assert.match(styles, /\.demo-island \.pill \{[^}]*height: calc\(var\(--island-resting-height\) \/ var\(--pill-zoom\)\)[^}]*zoom: var\(--pill-zoom\)[^}]*transform: none/s);
  assert.match(styles, /\.demo-island \.pill::after \{[^}]*backdrop-filter: blur\(16px\)[^}]*box-shadow: var\(--shadow-island-resting\)/s);
  assert.doesNotMatch(styles, /\.demo-island \.pill \{[^}]*0 12px 28px/s);
});

test('website Island figures keep the released command-bar geometry', () => {
  // The self-playing homepage demo (and its cursor-proximity response) was
  // retired with the homepage revamp; the remaining figures are static.
  assert.doesNotMatch(styles, /--island-k|proximity-active|#demoStage/);
  assert.match(styles, /\.demo-island \.field \{[^}]*height: 36px;[^}]*border-radius: 14px/s);
});

test('resting website figures show the quiet Plus shortcut in horizontal layouts', () => {
  // The interactive press demo was retired with the Media page; the Island
  // guide's resting figure carries the same pill.
  const restingFigures = ['site/src/pages/features/island.astro'];
  for (const file of restingFigures) {
    assert.match(source(file), /class="pill-shortcut"/, `${file} should show Plus`);
  }

  const verticalTabs = source('site/src/components/guides/vertical-tabs.astro');
  assert.doesNotMatch(verticalTabs, /pill-shortcut/, 'vertical-tabs figure should omit the redundant Plus');
  assert.match(styles, /\.pill-shortcuts \{[^}]*gap: calc\(4px \/ var\(--pill-zoom\)\)/s);
  assert.match(styles, /\.pill-slash,\s*\.demo-island \.pill-shortcut \{[^}]*width: 22px;[^}]*height: 22px/s);
});

test('the masthead is one sticky bar that stays put while the homepage scenes scroll beneath it', () => {
  const revamp = source('site/src/styles/revamp.css');
  assert.match(revamp, /\.site-header\.revamp-header \{\s*position: sticky;\s*top: 0;\s*z-index: 30;/);
  assert.match(revamp, /--site-header-h: 52px;/);
  assert.doesNotMatch(styles + revamp, /is-tucked|is-scroll-hidden/);
  assert.doesNotMatch(styles, /\.site-header[^{}]*\{[^}]*inset: auto 0 0/s);
  assert.doesNotMatch(styles, /body\.has-consent \.site-header|--consent-h/);
  assert.match(header, /import \{ directLinks(, pagePath)? \} from ['"]\.\.\/data\/navigation\.mjs['"]/);
  // The homepage's sticky scenes sit just below the bar, so it never hides.
  assert.doesNotMatch(header, /is-scroll-hidden|travel >= 8|tuckDistance|is-tucked/);
  assert.doesNotMatch(header, /pointerenter|mouseenter|site-mega/);
  // Phones fold the links behind a Menu button that names the panel it opens.
  assert.match(header, /<div class="site-nav-links" id="site-menu">/);
  assert.match(header, /class="site-menu-toggle"\s+type="button"\s+aria-expanded="false"\s+aria-controls="site-menu"\s+hidden>Menu</);
  assert.match(header, /event\.key !== "Escape"/);
});

test('homepage opens on the Sunrise mark above the hero eyebrow', () => {
  const homepage = source('site/src/pages/index.astro');
  assert.match(homepage, /class="sun-mark"[\s\S]*?<div class="sun-copy">\s*<p class="eyebrow">Blanc Browser<\/p>\s*<h1[^>]*>A little less browser\.<\/h1>/);
  assert.match(homepage, /src="\/lockup\/sunrise-mark-2048\.webp"/);
  assert.doesNotMatch(layout, /jetbrains-mono/);
});

test('optional measurement uses the selected upper-right toast and stays reopenable', () => {
  assert.match(consent, /Privacy choices/);
  assert.match(consent, /stay off until you allow them/);
  assert.match(consent, />Allow<\/button>/);
  assert.match(consent, />No thanks<\/button>/);
  assert.match(consent, /role="dialog"/);

  assert.match(styles, /\.consent \{[^}]*position: fixed;[^}]*inset: max\(12px, env\(safe-area-inset-top, 0px\)\) 16px auto auto;[^}]*width: min\(330px, calc\(100vw - 32px\)\)/s);
  assert.match(styles, /\.consent \{[^}]*backdrop-filter: blur\(16px\)[^}]*border-radius: 16px;/s);
  assert.doesNotMatch(styles, /\.consent \{[^}]*inset: auto 0 0/s);

  assert.match(footer, /data-consent-open/);
  assert.match(layout, /<Footer measurementControls=\{analytics\}[ >]/);
  assert.match(layout, /\{analytics && <Consent \/>\}/);
  assert.match(layout, /\{analytics && <script src="\.\.\/scripts\/site\.js"><\/script>\}/);
  assert.match(siteScript, /querySelectorAll\('\[data-consent-open\]'\)/);
  assert.match(siteScript, /showChoice\(button\)/);
  assert.match(siteScript, /analytics_storage: 'granted'/);
});
