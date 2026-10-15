'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { withoutInterfaceKeys } = require('../support/without-interface-keys');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('product UI uses Inter while Mahjong tile faces retain their separate font', () => {
  const pages = read('src/renderer/pages/pages.css');
  const chrome = read('src/renderer/styles.css');
  const handoff = read('src/renderer/pages/tab-handoff.css');
  const mahjong = read('src/renderer/pages/mahjong.css');
  const newtab = withoutInterfaceKeys(read('src/renderer/pages/newtab.html'));
  const game = read('src/renderer/pages/mahjong.html');

  for (const css of [pages, chrome, handoff, mahjong]) {
    assert.doesNotMatch(css, /--font-mono|--font-kbd/);
  }
  assert.match(mahjong, /--mj-face-font:\s*"JetBrains Mono"/);
  assert.match(newtab, /<body class="ledger-body"/);
  assert.match(game, /<body class="mahjong-body"/);
});

function cssRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body }));
}
const rulesFor = (css, selector) => cssRules(css).filter((rule) => rule.selector === selector);
const INTER_STACK = '"Inter", -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
// Blubird has no tabular figures and lacks ⌘ ⌥ ⇧ ⌃ and arrows, so these keep Inter.
const KEEP_INTER = [
  '.settings-content #patronKey', '.migration-progress-ring', '.folder-count',
  '.shelf-count', '.tally-count', '.tally-caption',
  'body.sheet .row .meta, body.sheet .row .url, body.sheet kbd', '.shortcut-row kbd', '.ob-kbd',
];

test('Blubird sets headings and page copy; Inter keeps figures, keys and Mahjong', () => {
  const pages = read('src/renderer/pages/pages.css');
  const handoff = read('src/renderer/pages/tab-handoff.css');
  const chrome = read('src/renderer/styles.css');
  const mahjong = read('src/renderer/pages/mahjong.css');
  const pinned = JSON.parse(read('fonts/blubird/pinned.json'));

  assert.ok(pinned.files.some((entry) => entry.name === 'Blubird-MediumDisplay.woff2'), 'the clock face is pinned');
  assert.ok(cssRules(pages).some((rule) => rule.selector === '@font-face'
    && rule.body.includes('font-family: "Blubird Display";')
    && rule.body.includes('src: url("Blubird-MediumDisplay.woff2") format("woff2");')
    && rule.body.includes('font-weight: 500;')), 'Blubird Medium Display for the Billboard clock');
  // UI text is Instrument Sans (OFL, committed) at width 98 (owner choice, October 15).
  assert.ok(cssRules(pages).some((rule) => rule.selector === '@font-face'
    && rule.body.includes('font-family: "Instrument Sans";')
    && rule.body.includes('src: url("instrument-sans-latin-wdth-normal.woff2") format("woff2");')
    && rule.body.includes('font-weight: 400 700;')
    && rule.body.includes('font-stretch: 75% 100%;')), 'Instrument Sans variable face');
  assert.ok(pages.includes('--text-width: 98;'));
  // Form controls do not inherit font-variation-settings and every `font:`
  // shorthand resets it, so one universal rule pins the width (Inter and the
  // Display file have no wdth axis).
  const wdth = rulesFor(pages, '*, *::before, *::after').find((rule) => rule.body.includes('font-variation-settings'));
  assert.ok(wdth, 'a universal rule carries the width');
  assert.match(wdth.body, /font-variation-settings: "wdth" var\(--text-width\) !important;/);
  assert.doesNotMatch(pages, /Blubird Text|Blubird-VF|Blubird-(Regular|Medium|SemiBold)Text|Blubird-RegularDisplay|"opsz"/);
  assert.ok(pages.includes(`--font-text: "Instrument Sans", ${INTER_STACK};`));
  assert.ok(pages.includes(`--font-display: "Blubird Display", ${INTER_STACK};`));
  assert.ok(pages.includes(`--font-ui: ${INTER_STACK};`));
  assert.doesNotMatch(pages, /Newsreader/);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2')), false);

  // Display only at 32px and up; smaller headings use the Text cut. Tracking is
  // set to 0 explicitly so base rules (.group-title's 0.08em) cannot leak through.
  const headings = {
    'body.sheet .group-title, body.sheet .shortcut-section .section-title': 'text',
    '.migration-checklist-heading h2': 'text',
    'body.sheet .page h1': 'text',
    '.ob-content h1': 'text',
    '.ledger-where': 'text',
  };
  for (const [selector, role] of Object.entries(headings)) {
    const rules = rulesFor(pages, selector);
    assert.ok(rules.length > 0, `${selector} exists`);
    const primary = rules.find((rule) => rule.body.includes(`font-family: var(--font-${role})`));
    assert.ok(primary, `${selector} uses --font-${role}`);
    assert.match(primary.body, /letter-spacing: 0;/, `${selector} sets Blubird at 0 tracking`);
    for (const rule of rules) {
      assert.doesNotMatch(rule.body, /letter-spacing: -|font-optical-sizing/, `${selector} carries no Newsreader tuning`);
    }
  }
  const clock = rulesFor(pages, '.bb-clock').find((rule) => rule.body.includes('var(--font-display)'));
  assert.ok(clock, 'the Billboard clock uses the Display cut');
  assert.match(clock.body, /font-weight: 500;/, 'the clock uses Medium Display (owner choice, October 15)');
  assert.match(clock.body, /letter-spacing: 0\.03em;/, 'the clock digits open up slightly (owner choice, October 15)');
  assert.doesNotMatch(clock.body, /font-optical-sizing/);

  // Every remaining Inter rule is on the keep-list, and every keep-list rule uses Inter.
  for (const rule of [...cssRules(pages), ...cssRules(handoff)]) {
    if (rule.body.includes('var(--font-ui)')) assert.ok(KEEP_INTER.includes(rule.selector), `${rule.selector} should use --font-text`);
  }
  for (const selector of KEEP_INTER) {
    const rules = rulesFor(pages, selector);
    assert.ok(rules.some((rule) => rule.body.includes('var(--font-ui)')), `${selector} keeps Inter`);
    for (const rule of rules) {
      if (/(?:^|[\s;])font(?:-family)?:/.test(rule.body)) assert.match(rule.body, /var\(--font-ui\)/, `every ${selector} rule that sets a family keeps Inter`);
    }
  }
  assert.match(rulesFor(pages, 'html, body')[0].body, /font-family: var\(--font-text\);/);

  // Blubird's word space is 25% narrower than Inter's, so page copy opens up
  // (owner choice D, October 15). Inter rules and Mahjong opt back out.
  assert.ok(pages.includes('--text-word-spacing: normal;'));
  assert.ok(pages.includes('--text-tracking: 0.01em;'), 'Instrument Sans at +0.01em (owner choice, October 15)');
  // Chromium's own stylesheet resets letter- and word-spacing on form controls,
  // so buttons (Island rows, sheet buttons) must inherit them explicitly.
  const controls = rulesFor(pages, 'button, input, select, textarea');
  assert.ok(controls.some((rule) => /letter-spacing: inherit;/.test(rule.body) && /word-spacing: inherit;/.test(rule.body)),
    'form controls inherit the page spacing');
  const body = rulesFor(pages, 'html, body')[0].body;
  assert.match(body, /word-spacing: var\(--text-word-spacing\);/);
  assert.match(body, /letter-spacing: var\(--text-tracking\);/);
  const reset = cssRules(pages).find((rule) => /letter-spacing: normal;/.test(rule.body)
    && /word-spacing: normal;/.test(rule.body) && rule.selector.includes('.shortcut-row kbd'));
  assert.ok(reset, 'one rule returns the Inter keep-list to normal spacing');
  for (const selector of KEEP_INTER) {
    assert.ok(reset.selector.split(', ').join('\n').includes(selector.split(', ')[0]), `${selector} opts out of the Blubird spacing`);
  }
  const resetIndex = cssRules(pages).indexOf(reset);
  for (const selector of ['.shelf-count', '.tally-count', '.tally-caption']) {
    const explicit = cssRules(pages).findIndex((rule) => rule.selector.split(', ').includes(selector) && /letter-spacing: -?0\.0/.test(rule.body));
    if (explicit >= 0) assert.ok(explicit > resetIndex, `${selector}'s own tracking still wins over the reset`);
  }
  assert.match(mahjong, /\.mahjong-body \{[^}]*--text-word-spacing: normal;[^}]*--text-tracking: normal;/,
    'Mahjong keeps Inter spacing');

  // The chrome sets copy in Instrument Sans too (test/unit/chrome-fonts.test.js); it
  // never uses the Display cut or Newsreader.
  assert.doesNotMatch(chrome, /--font-display|Newsreader/);
  assert.doesNotMatch(mahjong, /Blubird|--font-display/);
  assert.match(mahjong, /\.mahjong-body \{[^}]*--font-text: var\(--font-ui\);/,
    'Mahjong maps shared --font-text rules back to Inter');
});

test('Instrument Sans ships in the repository with its OFL license', () => {
  const { execFileSync } = require('node:child_process');
  const tracked = execFileSync('git', ['ls-files', 'src/renderer/pages'], { cwd: root, encoding: 'utf8' });
  assert.match(tracked, /^src\/renderer\/pages\/instrument-sans-latin-wdth-normal\.woff2$/m);
  assert.match(tracked, /^src\/renderer\/pages\/instrument-sans-OFL\.txt$/m);
  const font = fs.readFileSync(path.join(root, 'src/renderer/pages/instrument-sans-latin-wdth-normal.woff2'));
  assert.deepEqual([...font.subarray(0, 4)], [119, 79, 70, 50], 'font is WOFF2');
  assert.match(read('src/renderer/pages/instrument-sans-OFL.txt'), /SIL Open Font License, Version 1\.1/);
});
