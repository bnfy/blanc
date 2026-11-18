// Over your image (owner, 2026-11-13): the widgets' glass tray and the
// footer's fade keep their ink at 4.5:1 or more over pure black and over pure
// white behind them, the two extremes any image can put there. Blur only
// averages the image, so it never makes the backdrop more extreme than these.
// Ported from the fork's chromium/tools/start-plates.test.mjs; it reads the
// Sunrise schemes in pages.css and the Neutral ones in pages-neutral.css.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '../../src/renderer/pages', name), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('pages.css') + '\n' + read('pages-neutral.css');
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = v => { const m = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/.exec(v ?? ''); return m && [+m[1], +m[2], +m[3], +m[4]]; };
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = ([r, g, b, a], back) => [r, g, b].map((c, i) => c * a + back[i] * (1 - a));
const BACKS = [[0, 0, 0], [255, 255, 255]];

// Every block that sets a tray scheme.
const schemes = [...css.matchAll(/([^{}]+)\{([^{}]*--start-tray:[^{}]*)\}/g)].map(([, selector, body]) => {
  const get = name => new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
  return {selector: selector.trim(), tray: rgba(get('start-tray')),
    fade: get('start-footer-fade')?.split(/\s+/).map(Number),
    inks: ['start-tray-ink', 'start-tray-ink-dim', 'start-tray-accent'].map(n => [n, get(n)])};
});
// The fade's weakest point under the footer's text.
const FADE_UNDER_TEXT = Number(/rgb\(var\(--start-footer-fade\) \/ ([\d.]+)\) var\(--start-footer-h/.exec(css)?.[1]);

test('every tray scheme is defined', () => {
  assert.ok(schemes.length >= 8, `found ${schemes.length} tray schemes`);
  for (const s of schemes) {
    assert.ok(s.tray, `${s.selector}: tray color`);
    assert.equal(s.fade?.length, 3, `${s.selector}: footer fade color`);
    for (const [name, value] of s.inks) assert.match(value ?? '', /^#[0-9a-f]{6}$/i, `${s.selector}: ${name}`);
  }
  assert.ok(FADE_UNDER_TEXT >= 0.5, `footer fade under its text: ${FADE_UNDER_TEXT}`);
});

test('tray inks keep 4.5:1 over any backdrop', () => {
  const failures = [];
  for (const s of schemes) for (const back of BACKS) for (const [name, value] of s.inks) {
    const ratio = contrast(hex(value), over(s.tray, back));
    if (ratio < 4.5) failures.push(`${s.selector} ${name} over ${back[0] ? 'white' : 'black'}: ${ratio.toFixed(2)}`);
  }
  assert.deepEqual(failures, []);
});

test('the footer fade keeps its ink at 4.5:1 over any backdrop', () => {
  const failures = [];
  for (const s of schemes) for (const back of BACKS) for (const [where, alpha] of [['footer', FADE_UNDER_TEXT]]) {
    const ink = s.inks.find(([name]) => name === 'start-tray-ink-dim')[1];
    const ratio = contrast(hex(ink), over([...s.fade, alpha], back));
    if (ratio < 4.5) failures.push(`${s.selector} ${where} over ${back[0] ? 'white' : 'black'}: ${ratio.toFixed(2)}`);
  }
  assert.deepEqual(failures, []);
});

test('the Start Page loads the ink sampler, which reads only its four kinds of small text', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab.html'), 'utf8');
  const ink = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/newtab-ink.js'), 'utf8');
  assert.ok(html.indexOf('<script src="newtab-ink.js"></script>') > html.indexOf('<script src="newtab.js"></script>'));
  assert.match(ink, /const TARGETS = '\.start-brand-date, #bbBlocked, \.bb-fav \.label, \.bb-groups \.group-chip';/);
  assert.match(ink, /if \(!document\.body\.dataset\.wallpaperStyle \|\| !url\) \{ for \(const el of targets\) delete el\.dataset\.ink; return; \}/);
  assert.match(ink, /window\.blancStartInk = \{update, explain\};/);
  // The whole file parses (an earlier copy lost its closing line).
  assert.doesNotThrow(() => new Function(ink));
});
