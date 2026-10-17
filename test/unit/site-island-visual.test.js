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

test('website resting-Island figures draw the app’s own resting material and geometry', () => {
  // The resting Island is no longer redrawn in site.css: NativeWindowFigure
  // takes the app's pill, its tokens and its rules from src/renderer, so the
  // figures follow every released change to the material.
  const figure = source('site/src/components/NativeWindowFigure.astro');
  assert.match(figure, /import styles from '\.\.\/\.\.\/\.\.\/src\/renderer\/styles\.css\?raw'/);
  assert.match(figure, /nativeWindowArt\(/);
  const art = source('site/src/lib/native-island-art.mjs');
  for (const selector of ["'#islandPill'", "'#islandPill::after'", "'#strip'"]) assert.ok(art.includes(selector), selector);
  assert.doesNotMatch(styles, /\.demo-island \.pill\b|--island-resting-|--shadow-island-resting/);
});

test('website Island figures keep the released command-bar geometry', () => {
  // The self-playing homepage demo (and its cursor-proximity response) was
  // retired with the homepage revamp; the remaining figures are static.
  assert.doesNotMatch(styles, /--island-k|proximity-active|#demoStage/);
  assert.match(styles, /\.demo-island \.field \{[^}]*height: 36px;[^}]*border-radius: 14px/s);
});

test('resting website figures show the quiet Plus shortcut in horizontal layouts', () => {
  // A site tab's resting Island carries renderer.js's Plus (#pillNewTab);
  // vertical tabs hide it with the app's own rule, the rail having New tab.
  const island = source('site/src/pages/features/island.astro');
  assert.match(island, /<NativeWindowFigure[\s\S]*?tab=\{\{ url: 'https:\/\/github\.com\/'/);
  const art = source('site/src/lib/native-island-art.mjs');
  assert.match(art, /<button id="pillNewTab" class="pill-btn pill-shortcut">/);
  assert.match(art, /scoped\(':root\[data-tab-layout="vertical"\] #pillNewTab'\)/);
  assert.match(source('site/src/pages/features/vertical-tabs.astro'), /<NativeWindowFigure[\s\S]*?rail=\{\{/);
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

test('homepage opens on the Sunrise mark above the headline, with no eyebrow', () => {
  const homepage = source('site/src/pages/index.astro');
  assert.match(homepage, /class="sun-mark"[\s\S]*?<div class="sun-copy">\s*<h1[^>]*>A little less browser\.<\/h1>/);
  assert.match(homepage, /data-cta-position="hero"[^>]*>Download Blanc Browser<\/a>/);
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
