'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// The website's own lighter cream (owner, November 23, 2026;
// docs/superpowers/plans/2026-11-23-lighter-site-cream.md). Blanc White,
// #F8F2E8, stays the brand and app color; only the website moved.
const SITE = {
  'site-bg': '#fbf7f0',
  'site-bg-rgb': '251, 247, 240',
  'site-surface': '#f5efe5',
  'site-border': '#e6ddd0',
};

function token(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `--${name} is declared`);
  return match[1].trim().toLowerCase();
}

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} exists`);
  return css.slice(start, css.indexOf('}', start));
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('site cream tokens are the lighter website palette', () => {
  const site = read('site/src/styles/site.css');
  for (const [name, value] of Object.entries(SITE)) {
    assert.equal(token(site, name), value, `--${name} in site.css`);
  }
});

test('revamp.css and the homepage repeat the same values', () => {
  const site = read('site/src/styles/site.css');
  const revamp = read('site/src/styles/revamp.css');
  for (const name of Object.keys(SITE)) {
    assert.equal(token(revamp, name), token(site, name), `--${name} in revamp.css`);
  }
  const home = block(read('site/src/styles/home.css'), '.home-cinema');
  assert.equal(token(home, 'paper'), token(site, 'site-bg'), '--paper on .home-cinema');
  assert.equal(token(home, 'surface'), token(site, 'site-surface'), '--surface on .home-cinema');
  assert.equal(token(home, 'line'), token(site, 'site-border'), '--line on .home-cinema');
});

test('the homepage sunrise ends on the page color', () => {
  const home = read('site/src/styles/home.css');
  const keyframes = home.match(/@keyframes sun-sky \{(.*)\}\s*$/m);
  assert.ok(keyframes, '@keyframes sun-sky exists');
  const end = keyframes[1].slice(keyframes[1].indexOf('100%'));
  assert.match(end, /background-color:\s*var\(--paper\)/);
  assert.doesNotMatch(end, /#[0-9a-f]{3,8}\b/i);
});

test('muted text and gold meet 4.5:1 on the page and sections', () => {
  const site = read('site/src/styles/site.css');
  const backgrounds = { page: token(site, 'site-bg'), section: token(site, 'site-surface') };
  const inks = { muted: token(site, 'site-text-dim'), gold: token(site, 'site-gold') };
  for (const [where, bg] of Object.entries(backgrounds)) {
    for (const [what, ink] of Object.entries(inks)) {
      assert.ok(contrast(ink, bg) >= 4.5, `${what} on ${where}: ${contrast(ink, bg).toFixed(2)}:1`);
    }
  }
});

test('Blanc White stays the brand and app color', () => {
  const tokens = JSON.parse(read('tokens/tokens.json')).tokens;
  assert.equal(tokens.find((entry) => entry.name === 'sunrise-bg').values.light, '#f8f2e8');
});
