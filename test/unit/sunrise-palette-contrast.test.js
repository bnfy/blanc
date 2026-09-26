'use strict';

// Every Sunrise text colour must stay readable on every Sunrise background
// (WCAG 4.5:1), in all three themes. Values are read from the token source,
// so a later palette edit that breaks contrast fails here.
const assert = require('node:assert/strict');
const test = require('node:test');
const tokens = require('../../tokens/tokens.json');

const value = (name, theme) => tokens.tokens.find((t) => t.name === name)?.values?.[theme];
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const theme of ['light', 'dark', 'private']) {
  test(`Sunrise text is readable on every Sunrise background (${theme})`, () => {
    for (const fg of ['sunrise-text', 'sunrise-text-dim', 'sunrise-accent']) {
      for (const bg of ['sunrise-bg', 'sunrise-surface', 'sunrise-surface-raised']) {
        const [a, b] = [value(fg, theme), value(bg, theme)];
        assert.ok(a && b, `${fg} or ${bg} missing for ${theme}`);
        assert.ok(contrast(a, b) >= 4.5, `${fg} on ${bg} (${theme}) is ${contrast(a, b).toFixed(2)}:1`);
      }
    }
  });
}
