'use strict';

// Quick Switcher Favorite results used to omit the Favorite record from
// `tab`, while resultRow only paints `result.tab` — so a stored 32×32 PNG
// rendered on every start-page layout but the matching Favorite result had
// no has-icon class. Positive-controlled: dropping `tab:` from the push
// fails the wiring assert.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const overlay = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/overlay.js'),
  'utf8',
);
const styles = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/styles.css'),
  'utf8',
);

const switcher = overlay.match(/function switcherResults\(query\) \{[\s\S]*?\n  \}/)?.[0];
const resultRow = overlay.match(/function resultRow\(result, isActive, isEnterTarget\) \{[\s\S]*?\n  \}/)?.[0];

test('switcherResults and resultRow could be lifted from overlay.js', () => {
  assert.ok(switcher, 'switcherResults not found');
  assert.ok(resultRow, 'resultRow not found');
});

test('a favorite result carries a tab-shaped record with its favicon', () => {
  // The Favorite store row is { url, title, favicon }; resultRow's setFavicon
  // only reads result.tab. Without this, the leading icon stays empty.
  assert.match(
    switcher,
    /kind:\s*'favorite'[\s\S]*?tab:\s*\{\s*url:\s*f\.url,\s*favicon:\s*f\.favicon/,
  );
});

test('resultRow supplies a URL-shaped fallback for history and other page-like results', () => {
  assert.match(
    resultRow,
    /setFavicon\(leading,\s*result\.tab\s*\?\?\s*\{\s*url:\s*result\.url\s*\|\|\s*''\s*\}\)/,
  );
});

test('switcher metadata and source labels use the Inter UI face', () => {
  assert.match(
    styles,
    /\.island-row \.row-sub\s*\{[^}]*font-family: var\(--font-ui\)/s,
  );
  assert.match(
    styles,
    /\.island-row \.row-tag\s*\{[^}]*font-family: var\(--font-ui\)/s,
  );
});
