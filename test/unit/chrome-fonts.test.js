'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromeResourcePath } = require('../../src/main/chrome-protocol');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function cssRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body }));
}
const rulesFor = (css, selector) => cssRules(css).filter((rule) => rule.selector === selector);
const INTER_STACK = '"Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
// Key caps (Instrument Sans lacks ⌘ ⌥ ⇧ ⌃ and arrows) and counters tuned on
// Inter's tabular figures keep Inter in the Island and overlay.
const CHROME_KEEP_INTER = [
  '.vertical-tabs-group-count', '.vertical-tabs-new kbd', '.pill-overflow', '#pillShieldCount',
  '.island-ghead .ghead-kbd', '.row-kbd', '.footer-kbd', '#findCount', '#shieldPopCount',
  '.ws-row-count', '.space-picker-hex', '.pill-slash, .pill-shortcut',
];

test('the Island and overlay set their copy in Instrument Sans, matching the pages', () => {
  const chrome = read('src/renderer/styles.css');
  assert.ok(cssRules(chrome).some((rule) => rule.selector === '@font-face'
    && rule.body.includes('font-family: "Instrument Sans";')
    && rule.body.includes('src: url("pages/instrument-sans-latin-wdth-normal.woff2") format("woff2");')
    && rule.body.includes('font-weight: 400 700;')
    && rule.body.includes('font-stretch: 75% 100%;')));
  assert.doesNotMatch(chrome, /Blubird/);
  assert.ok(chrome.includes(`--font-ui: ${INTER_STACK};`));
  assert.ok(chrome.includes(`--font-text: "Instrument Sans", ${INTER_STACK};`));
  assert.ok(chrome.includes('--text-word-spacing: normal;'));
  assert.ok(chrome.includes('--text-tracking: 0.01em;'));
  assert.ok(chrome.includes('--text-width: 98;'));
  const body = rulesFor(chrome, 'html, body')[0].body;
  assert.match(body, /font-family: var\(--font-text\);/);
  assert.match(body, /word-spacing: var\(--text-word-spacing\);/);
  assert.match(body, /letter-spacing: var\(--text-tracking\);/);
  const wdth = rulesFor(chrome, '*, *::before, *::after').find((rule) => rule.body.includes('font-variation-settings'));
  assert.ok(wdth, 'a universal rule carries the width');
  assert.match(wdth.body, /font-variation-settings: "wdth" var\(--text-width\) !important;/);
  assert.ok(rulesFor(chrome, 'button, input, select, textarea').some((rule) =>
    /letter-spacing: inherit;/.test(rule.body) && /word-spacing: inherit;/.test(rule.body)),
  'Island rows are buttons, which Chromium resets; they inherit the spacing');
});

test('counts and key caps in the chrome keep Inter and its spacing', () => {
  const chrome = read('src/renderer/styles.css');
  for (const rule of cssRules(chrome)) {
    if (rule.body.includes('var(--font-ui)')) assert.ok(CHROME_KEEP_INTER.includes(rule.selector), `${rule.selector} should use --font-text`);
  }
  for (const selector of CHROME_KEEP_INTER) {
    const rules = rulesFor(chrome, selector);
    assert.ok(rules.some((rule) => rule.body.includes('var(--font-ui)')), `${selector} keeps Inter`);
  }
  const reset = cssRules(chrome).find((rule) => /letter-spacing: normal;/.test(rule.body)
    && /word-spacing: normal;/.test(rule.body) && rule.selector.includes('.row-kbd'));
  assert.ok(reset, 'one rule returns the Inter keep-list to normal spacing');
  for (const selector of CHROME_KEEP_INTER) {
    for (const part of selector.split(', ')) assert.ok(reset.selector.split(', ').includes(part), `${part} opts out of the UI-text spacing`);
  }
});

test('the chrome scheme serves Instrument Sans and no Blubird file', () => {
  for (const host of ['index', 'overlay']) {
    assert.ok(chromeResourcePath(`blanc-chrome://${host}/pages/instrument-sans-latin-wdth-normal.woff2`), `${host} loads Instrument Sans`);
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/pages/Blubird-VF.ttf`), null);
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/pages/Blubird-MediumDisplay.woff2`), null);
  }
});
