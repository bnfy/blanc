'use strict';

// D1 (owner, 2026-09-26): keyboard focus on blanc:// pages is one 1px ring in
// --text-dim. Mahjong keeps its own rings in mahjong.css, which this test
// deliberately does not read. Selection rings (a chosen app icon, an open
// menu) are state, not focus, and live in selectors without :focus.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/pages.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));
const widthPx = (body) => {
  const declared = body.match(/outline-width:\s*([^;]+)/)?.[1] ?? body.match(/outline:\s*([^;]+)/)?.[1];
  if (!declared) return null;
  if (/^\s*(none|0)\b/.test(declared)) return 0;
  const keyword = declared.match(/\b(thin|medium|thick)\b/)?.[1];
  if (keyword) return { thin: 1, medium: 3, thick: 5 }[keyword];
  return Number(declared.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? NaN);
};

test('every focus outline on blanc:// pages is a hairline', () => {
  const focus = rules.filter((rule) => /:focus/.test(rule.selector) && widthPx(rule.body) !== null);
  assert.ok(focus.length >= 5, 'expected the page focus rules — update this test');
  const thick = focus.filter((rule) => !(widthPx(rule.body) <= 1))
    .map((rule) => `${rule.selector} → ${rule.body.trim()}`);
  assert.deepEqual(thick, []);
});

test('the shared control ring is 1px --text-dim with no gap', () => {
  const shared = rules.find((rule) => rule.selector.startsWith('input:focus-visible, select:focus-visible'));
  assert.ok(shared, 'shared focus rule not found');
  assert.match(shared.body, /outline:\s*1px solid var\(--text-dim\);/);
  assert.match(shared.body, /outline-offset:\s*0;/);
});
