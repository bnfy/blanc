'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const styles = fs.readFileSync(path.join(ROOT, 'site/src/styles/site.css'), 'utf8');
const pressScript = fs.readFileSync(path.join(ROOT, 'site/src/scripts/press-island.js'), 'utf8');
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
  const restingFigures = ['site/src/components/PressIslandDemo.astro'];
  for (const file of restingFigures) {
    assert.match(source(file), /class="pill-shortcut"|class="pill-shortcut" id="pressIslandPillNewTab"/, `${file} should show Plus`);
  }

  const verticalTabs = source('site/src/components/guides/vertical-tabs.astro');
  assert.doesNotMatch(verticalTabs, /pill-shortcut/, 'vertical-tabs figure should omit the redundant Plus');
  assert.match(styles, /\.pill-shortcuts \{[^}]*gap: calc\(4px \/ var\(--pill-zoom\)\)/s);
  assert.match(styles, /\.pill-slash,\s*\.demo-island \.pill-shortcut \{[^}]*width: 22px;[^}]*height: 22px/s);
  assert.match(pressScript, /#pressIslandPillNewTab/);
  assert.match(pressScript, /enterBlankTab\(\)/);
});

test('the masthead is a sticky top bar and the navigation hides on scroll down and returns on scroll up', () => {
  assert.match(styles, /\.site-header \{ position: sticky; top: 0; z-index: 30;/);
  assert.doesNotMatch(styles, /is-tucked/);
  assert.doesNotMatch(styles, /\.site-header[^{}]*\{[^}]*inset: auto 0 0/s);
  assert.doesNotMatch(styles, /body\.has-consent \.site-header|--consent-h/);
  assert.match(styles, /\.site-brand-mark \{ width: 24px; height: 24px;/);
  assert.match(styles, /\.site-mega::before \{[^}]*var\(--site-gold-on-dark\)/);
  assert.doesNotMatch(header, /tuckDistance|is-tucked/);
  assert.match(header, /import \{ directLinks(, pagePath)? \} from ['"]\.\.\/data\/navigation\.mjs['"]/);
  assert.match(header, /is-scroll-hidden/);
  assert.match(header, /focusin/);
  assert.match(header, /travel >= 8/);
  assert.doesNotMatch(header, /pointerenter|mouseenter|site-mega/);
});

test('homepage keeps the Sunrise mark above the hero eyebrow', () => {
  const homepage = source('site/src/pages/index.astro');
  assert.match(homepage, /src="\/sunrise-hero-mark\.png" alt=""\s*\/?>(?:\s*)<p class="frame-kicker">\s*Blanc Browser\s*<\/p>\s*<h1[^>]*>A little less browser\.<\/h1>/);
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
  assert.match(layout, /<Footer measurementControls=\{analytics\} \/>/);
  assert.match(layout, /\{analytics && <Consent \/>\}/);
  assert.match(layout, /\{analytics && <script src="\.\.\/scripts\/site\.js"><\/script>\}/);
  assert.match(siteScript, /querySelectorAll\('\[data-consent-open\]'\)/);
  assert.match(siteScript, /showChoice\(button\)/);
  assert.match(siteScript, /analytics_storage: 'granted'/);
});
