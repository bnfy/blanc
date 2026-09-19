'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');

test('resting Island places a matching Plus beside the slash shortcut', () => {
  assert.match(
    renderer,
    /plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"\/><\/svg>'/
  );
  assert.match(
    renderer,
    /newTabBtn\.classList\.add\('pill-shortcut'\)[\s\S]*?pillSlash\.after\(newTabBtn\)/
  );
  assert.match(html, /<span id="pillShortcuts" class="pill-shortcuts">\s*<button id="pillSlash"/);
  assert.match(renderer, /pillActions\.append\(reloadBtn, favoriteBtn, closeBtn\)/);
});

test('Plus creates a regular blank tab and focuses the address input', () => {
  assert.match(
    renderer,
    /const newTabBtn = pillButton\('plus',[\s\S]*?window\.browserAPI\.createTab\(null, \{ focusAddress: true \}\);[\s\S]*?\}\);/
  );
  assert.match(renderer, /newTabBtn\.id = 'pillNewTab'/);
  assert.match(renderer, /newTabBtn\.setAttribute\('aria-label', 'New tab'\)/);
  assert.match(
    renderer,
    /window\.browserAPI\.platform === 'darwin' \? '⌘T' : 'Ctrl\+T'/
  );
});

test('Plus uses the quiet slash-keycap treatment and hides with vertical tabs', () => {
  assert.match(
    renderer,
    /function pillButton\([\s\S]*?e\.preventDefault\(\)[\s\S]*?e\.stopPropagation\(\)[\s\S]*?onClick\(\)/
  );
  assert.match(
    styles,
    /:root\[data-tab-layout="vertical"\] #pillNewTab \{ display: none; \}/
  );
  assert.match(
    styles,
    /:root\[data-tab-layout="vertical"\] \.pill-shortcuts:has\(#pillSlash\[hidden\]\) \{\s*display: none;/
  );
  assert.match(styles, /\.pill-slash,\s*\.pill-shortcut\s*\{[^}]*background: transparent;/s);
  assert.match(styles, /\.pill-shortcuts\s*\{[^}]*gap: calc\(4px \/ var\(--pill-zoom\)\);/s);
  assert.match(styles, /\.pill-slash,\s*\.pill-shortcut\s*\{[^}]*width: 22px;[^}]*height: 22px;[^}]*display: inline-flex;[^}]*padding: 0;[^}]*border: none;[^}]*border-radius: calc\(5px \/ var\(--pill-zoom\)\);/s);
  assert.match(styles, /\.pill-slash::before,\s*\.pill-shortcut::before\s*\{[^}]*width: calc\(18px \/ var\(--pill-zoom\)\);[^}]*height: calc\(17px \/ var\(--pill-zoom\)\);[^}]*border: 1px solid var\(--border\);[^}]*border-radius: calc\(5px \/ var\(--pill-zoom\)\);/s);
  assert.match(styles, /\.pill-slash:hover::before,\s*\.pill-shortcut:hover::before \{ border-color: var\(--accent\); \}/);
  assert.doesNotMatch(styles, /#pillNewTab\s*\{[^}]*background:/s, 'Plus must not become a resting CTA');
  assert.match(styles, /\.pill-btn svg\s*\{[^}]*stroke-width: 1\.4;/s);
  assert.match(styles, /\.pill-shortcut svg\s*\{[^}]*width: calc\(11px \/ var\(--pill-zoom\)\);[^}]*height: calc\(11px \/ var\(--pill-zoom\)\);[^}]*stroke-width: 1\.5;/s);
  assert.doesNotMatch(styles, /\.pill-btns\s*\{[^}]*background:/s, 'action cluster must not gain a shared wrapper');
});
