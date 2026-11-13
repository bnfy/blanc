// Readable on any wallpaper (owner, 2026-11-13): every Start Page plate's ink
// keeps 4.5:1 or more against the plate composited over pure black and over
// pure white, the two extremes any image can put behind it. Blur only averages
// the image, so it can never make the backdrop more extreme than these.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../blanc/island/pages/newtab-prototype.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgba = v => { const m = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/.exec(v); return m && [+m[1], +m[2], +m[3], +m[4]]; };
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = ([r, g, b, a], back) => [r, g, b].map((c, i) => c * a + back[i] * (1 - a));

// Every block that sets a plate.
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*--start-plate:[^{}]*)\}/g)].map(([, selector, body]) => {
  const get = name => new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
  return {selector: selector.trim(), plate: rgba(get('start-plate')), inks: ['start-plate-ink', 'start-plate-ink-dim', 'start-plate-accent'].map(n => [n, get(n)])};
});

test('every plate scheme is defined', () => {
  assert.ok(blocks.length >= 4, `found ${blocks.length} plate schemes`);
  for (const b of blocks) {
    assert.ok(b.plate, `${b.selector}: plate color`);
    for (const [name, value] of b.inks) assert.match(value ?? '', /^#[0-9a-f]{6}$/i, `${b.selector}: ${name}`);
  }
});

test('plate inks keep 4.5:1 over any backdrop', () => {
  const failures = [];
  for (const b of blocks) for (const back of [[0, 0, 0], [255, 255, 255]]) {
    const surface = over(b.plate, back);
    for (const [name, value] of b.inks) {
      const ratio = contrast(hex(value), surface);
      if (ratio < 4.5) failures.push(`${b.selector} ${name} over ${back[0] ? 'white' : 'black'}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the clock halo keeps a near-black or near-white clock at 3:1 over any backdrop', () => {
  const light = rgba(/\.bb-clock-row::before \{[^}]*--clock-halo:\s*(rgba\([^)]*\))/.exec(css)?.[1] ?? '');
  const dark = rgba(/data-halo="dark"\]::before \{ --clock-halo:\s*(rgba\([^)]*\))/.exec(css)?.[1] ?? '');
  assert.ok(light && dark, 'both halos are defined');
  const failures = [];
  for (const back of [[0, 0, 0], [255, 255, 255]]) {
    const darkInk = contrast(hex('#12100b'), over(light, back));
    const lightInk = contrast(hex('#f7f0e5'), over(dark, back));
    if (darkInk < 3) failures.push(`dark clock on the light halo over ${back[0] ? 'white' : 'black'}: ${darkInk.toFixed(2)}`);
    if (lightInk < 3) failures.push(`light clock on the dark halo over ${back[0] ? 'white' : 'black'}: ${lightInk.toFixed(2)}`);
  }
  assert.deepEqual(failures, []);
});
