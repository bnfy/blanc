'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// The brand palette (owner, October 15, 2026; docs/brand-usage.md on #828):
// Blanc White is the page colour, and the light surfaces follow the website.
const LIGHT = {
  'sunrise-bg': '#f8f2e8',
  'sunrise-surface': '#f2eade',
  'sunrise-surface-raised': '#ffffff',
  'sunrise-border': '#e1d7c9',
};

test('light Sunrise tokens are the Blanc White brand palette in tokens.json and both stylesheets', () => {
  const tokens = JSON.parse(read('tokens/tokens.json')).tokens;
  for (const [name, value] of Object.entries(LIGHT)) {
    const token = tokens.find((entry) => entry.name === name);
    assert.equal(token.values.light, value, `${name} in tokens.json`);
    for (const file of ['src/renderer/styles.css', 'src/renderer/pages/pages.css']) {
      assert.match(read(file), new RegExp(`^  --${name}: ${value};$`, 'm'), `${name} in ${file}`);
    }
  }
  assert.equal(tokens.find((entry) => entry.name === 'sunrise-bg').values.dark, '#17130f', 'dark mode is unchanged');
});

test('the Start Page palette sits on Blanc White', () => {
  const pages = read('src/renderer/pages/pages.css');
  const start = pages.indexOf('.ledger-body {', pages.indexOf('Sunrise start-page presentation'));
  const ledger = pages.slice(start, pages.indexOf('}', start));
  assert.match(ledger, /--bg: #f8f2e8;/);
  assert.match(ledger, /--surface: rgba\(242, 234, 222, 0\.78\);/);
  assert.match(ledger, /--surface-raised: rgba\(255, 255, 255, 0\.88\);/);
  assert.match(ledger, /--onboarding-surface: #ffffff;/);
  assert.match(ledger, /--border: #e1d7c9;/);
  assert.match(ledger, /--start-footer-tint-sunrise: #f8ede2;/);
});
