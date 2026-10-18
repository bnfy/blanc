'use strict';

// The start page footer has no band of its own: the wallpaper carries a scrim
// tinted from its own bottom fog, and the footer frosts only while content
// runs underneath. Spec: docs/superpowers/specs/2026-10-18-start-page-footer-blending-design.md

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages.css'), 'utf8');

function block(selectorPattern, from = 0) {
  const match = selectorPattern.exec(css.slice(from));
  assert.ok(match, `pages.css has ${selectorPattern}`);
  const start = from + match.index + match[0].length;
  return css.slice(start, css.indexOf('}', start));
}

const sunrise = css.indexOf('Sunrise start-page presentation');
const themes = {
  light: block(/\n\.ledger-body \{/, sunrise),
  dark: block(/@media \(prefers-color-scheme: dark\) \{\s*\.ledger-body \{/, sunrise),
  private: block(/\n:root\[data-theme="private"\] \.ledger-body \{/, sunrise),
};

function hex(body, name) {
  const match = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(body);
  assert.ok(match, `--${name} is a six-digit hex color`);
  const value = match[1];
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('every theme tints the footer from each wallpaper with readable ink', () => {
  for (const [theme, body] of Object.entries(themes)) {
    for (const phase of ['sunrise', 'day', 'dusk', 'night']) {
      const tint = hex(body, `start-footer-tint-${phase}`);
      const ink = hex(body, `start-footer-ink-${phase === 'dusk' || phase === 'night' ? 'evening' : 'day'}`);
      assert.ok(contrast(tint, ink) >= 4.5,
        `${theme} ${phase}: footer ink reaches 4.5:1 (got ${contrast(tint, ink).toFixed(2)})`);
    }
  }
});

test('the footer tint and ink follow the wallpaper phase and crossfade with it', () => {
  for (const name of ['start-footer-tint', 'start-footer-ink']) {
    assert.match(css, new RegExp(`@property --${name} \\{[^}]*syntax: '<color>';[^}]*inherits: true;`, 's'));
  }
  for (const [phase, art, ink] of [['day', 'day', 'day'], ['dusk', 'dusk', 'evening'], ['night', 'night', 'evening']]) {
    const rule = block(new RegExp(`\\n\\.ledger-body\\[data-wallpaper-phase="${phase}"\\] \\{`));
    assert.match(rule, new RegExp(`--start-footer-tint: var\\(--start-footer-tint-${art}\\);`));
    assert.match(rule, new RegExp(`--start-footer-ink: var\\(--start-footer-ink-${ink}\\);`));
    assert.match(css, new RegExp(`\\.start-wallpaper-layer\\[data-wallpaper-phase="${phase}"\\] \\{\\s*--start-wallpaper-scrim: var\\(--start-footer-tint-${art}\\);`));
  }
  assert.match(css, /\.ledger-body \{[^}]*transition: --start-footer-tint 2s ease, --start-footer-ink 2s ease;/s);
});

test('the scrim is part of every wallpaper paint', () => {
  for (const [theme, body] of Object.entries(themes)) {
    assert.match(body, /background-image: var\(--start-wallpaper-scrim-image\), var\(--start-wallpaper-overlay\), url\("start-page-sunrise\.png"\);/,
      `${theme} paints the scrim over the static wallpaper`);
  }
  assert.match(block(/\*\/\n\.start-wallpaper-layer \{/),
    /background-image: var\(--start-wallpaper-scrim-image\), var\(--start-wallpaper-overlay\), var\(--wallpaper-image\);/);
  assert.match(css, /\.ledger-body,\s*\.start-wallpaper-layer \{\s*--start-wallpaper-scrim-image: linear-gradient\(to top,/);
});

test('the footer has no band at rest and a feathered frost over content', () => {
  const footer = block(/\/\* One straight footer divider[^*]*\*\/\s*\.ledger-footer,\s*body:not\(\[data-layout="ledger"\]\) \.ledger-footer \{/);
  assert.doesNotMatch(footer, /background|backdrop-filter/, 'the resting footer paints nothing of its own');
  assert.match(footer, /color: var\(--start-footer-ink\);/);
  const frost = block(/\n\.ledger-footer::before \{/);
  assert.match(frost, /background: color-mix\(in srgb, var\(--start-footer-tint\) 72%, transparent\);/);
  assert.match(frost, /backdrop-filter: blur\(14px\);/);
  assert.match(frost, /mask-image: linear-gradient\(to bottom, transparent 0, #000 28px\);/);
  assert.match(frost, /opacity: 0;/);
  assert.match(css, /body\.has-underflow \.ledger-footer::before \{ opacity: 1; \}/);
  assert.doesNotMatch(css, /--start-footer:|var\(--start-footer\)/, 'the flat footer color is gone');
});
