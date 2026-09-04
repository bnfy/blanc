'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const styles = fs.readFileSync(path.join(ROOT, 'site/src/styles/site.css'), 'utf8');
const demoScript = fs.readFileSync(path.join(ROOT, 'site/src/scripts/demo.js'), 'utf8');
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

test('website Island proximity and morph match the released interaction', () => {
  assert.match(styles, /#demoStage \.demo-island\.proximity-active \.pill \{[^}]*translateY\(calc\(-2px \* var\(--island-k, 0\)\)\)[^}]*scale\(calc\(1 \+ 0\.02 \* var\(--island-k, 0\)\)\)/s);
  assert.doesNotMatch(styles, /translateX\(calc\([^)]*--island-lean/);
  assert.match(demoScript, /classList\.toggle\('proximity-active', k > 0\)/);
  assert.doesNotMatch(demoScript, /--island-lean/);
  assert.match(demoScript, /--island-resting-radius/);
  assert.doesNotMatch(demoScript, /pill\.height \/ 2/);
  assert.match(styles, /\.demo-island \.field \{[^}]*height: 36px;[^}]*border-radius: 14px/s);
  assert.match(styles, /\.demo-stage\.glance-mode \.demo-island \.pill \{ max-width: 100%; \}/);
  assert.match(demoScript, /demo\.style\.maxWidth = `\$\{Math\.max\(0, primaryWidth - 24\)\}px`/);
  assert.match(demoScript, /demo\.style\.removeProperty\('max-width'\)/);
  assert.match(styles, /#demoStage \.demo-island \{[^}]*max-width: calc\(100% - 24px\);/);
});

test('resting website figures show the quiet Plus shortcut in horizontal layouts', () => {
  const restingFigures = [
    'site/src/pages/index.astro',
    'site/src/pages/features/island.astro',
    'site/src/pages/features/quiet-tabs.astro',
    'site/src/pages/features/ad-blocking.astro',
    'site/src/pages/features/security.astro',
    'site/src/pages/features/private-tabs.astro',
    'site/src/components/PressIslandDemo.astro',
  ];
  for (const file of restingFigures) {
    assert.match(source(file), /class="pill-shortcut"|class="pill-shortcut" id="pressIslandPillNewTab"/, `${file} should show Plus`);
  }

  const verticalTabs = source('site/src/pages/features/vertical-tabs.astro');
  assert.doesNotMatch(verticalTabs, /pill-shortcut/, 'vertical-tabs figure should omit the redundant Plus');
  assert.match(styles, /\.pill-shortcuts \{[^}]*gap: calc\(4px \/ var\(--pill-zoom\)\)/s);
  assert.match(styles, /\.pill-slash,\s*\.demo-island \.pill-shortcut \{[^}]*width: 22px;[^}]*height: 22px/s);
  assert.match(pressScript, /#pressIslandPillNewTab/);
  assert.match(pressScript, /enterBlankTab\(\)/);
});

test('desktop navigation rests at the bottom edge and tucks on downward scroll', () => {
  assert.match(styles, /\.site-header \{[^}]*position: fixed;[^}]*inset: auto 0 0;[^}]*padding: 0 24px calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)/s);
  assert.match(styles, /\.site-header\.is-tucked \{[^}]*opacity: 0;[^}]*translateY\(calc\(100% \+ 12px\)\)/s);
  assert.doesNotMatch(styles, /body\.has-consent \.site-header|--consent-h/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.site-header \{[^}]*inset: 0 0 auto/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.site-header \{ transition: none; \}/);
  assert.match(header, /matchMedia\('\(min-width: 641px\)'\)/);
  assert.match(header, /tuckDistance >= 12/);
  assert.match(header, /else if \(delta < 0\) \{\s*show\(\)/);
  assert.match(header, /header\.classList\.add\('is-tucked'\)/);
  assert.match(header, /header\.addEventListener\('focusin', show\)/);
});

test('homepage keeps the Sunrise mark above the hero eyebrow', () => {
  const homepage = source('site/src/pages/index.astro');
  assert.match(homepage, /import BrandMark from '\.\.\/components\/BrandMark\.astro'/);
  assert.match(homepage, /<BrandMark class="hero-sunrise-mark" \/>\s*<p class="hero-eyebrow">/);
  assert.match(styles, /\.hero-sunrise-mark \{ width: 32px; height: 32px; margin: 0 auto 14px; color: var\(--text\); \}/);
});

test('optional measurement uses the selected upper-right toast and stays reopenable', () => {
  assert.match(consent, /Help improve Blanc/);
  assert.match(consent, /Allow analytics and limited ad measurement to see what visitors explore/);
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
  assert.match(siteScript, /showConsent\(\{ focus: true \}\)/);
  assert.match(siteScript, /analytics_storage: 'denied'/);
});
