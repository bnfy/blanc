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
  assert.match(mahjong, /--mj-face-font:\s*"Inter"/);
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
// Key caps need ⌘ ⌥ ⇧ ⌃ and arrows (missing from Instrument Sans), and these
// counters were tuned on Inter's tabular figures, so they keep Inter.
const KEEP_INTER = [
  '.settings-content #patronKey', '.migration-progress-ring', '.folder-count',
  '.shelf-count', '.tally-count', '.tally-caption',
  'body.sheet .row .meta, body.sheet .row .url, body.sheet kbd', '.shortcut-row kbd', '.ob-kbd',
];

test('Instrument Sans sets the page copy, headings and clock; Inter keeps figures, keys and Mahjong', () => {
  const pages = read('src/renderer/pages/pages.css');
  const handoff = read('src/renderer/pages/tab-handoff.css');
  const chrome = read('src/renderer/styles.css');
  const mahjong = read('src/renderer/pages/mahjong.css');

  // UI text is Instrument Sans (OFL, committed) at width 98, +0.01em (owner
  // choice, October 15). Blubird is not used anywhere in the app.
  assert.ok(cssRules(pages).some((rule) => rule.selector === '@font-face'
    && rule.body.includes('font-family: "Instrument Sans";')
    && rule.body.includes('src: url("instrument-sans-latin-wdth-normal.woff2") format("woff2");')
    && rule.body.includes('font-weight: 400 700;')
    && rule.body.includes('font-stretch: 75% 100%;')), 'Instrument Sans variable face');
  assert.doesNotMatch(pages, /Blubird|--font-display|"opsz"|Newsreader/);
  assert.equal(fs.existsSync(path.join(root, 'src/renderer/pages/newsreader-condensed-latin-opsz-normal.woff2')), false);
  assert.ok(pages.includes(`--font-text: "Instrument Sans", ${INTER_STACK};`));
  assert.ok(pages.includes(`--font-ui: ${INTER_STACK};`));
  assert.ok(pages.includes('--text-width: 98;'));
  assert.ok(pages.includes('--text-word-spacing: normal;'));
  assert.ok(pages.includes('--text-tracking: 0.01em;'));
  // Form controls do not inherit font-variation-settings and every `font:`
  // shorthand resets it, so one universal rule pins the width (Inter has no
  // wdth axis).
  const wdth = rulesFor(pages, '*, *::before, *::after').find((rule) => rule.body.includes('font-variation-settings'));
  assert.ok(wdth, 'a universal rule carries the width');
  assert.match(wdth.body, /font-variation-settings: "wdth" var\(--text-width\) !important;/);

  // Headings and the Billboard clock use the same face; heading tracking is set
  // to 0 explicitly so base rules (.group-title's 0.08em) cannot leak through.
  for (const selector of [
    'body.sheet .group-title, body.sheet .shortcut-section .section-title',
    '.migration-checklist-heading h2', 'body.sheet .page h1', '.ob-content h1',
  ]) {
    const rules = rulesFor(pages, selector);
    const primary = rules.find((rule) => rule.body.includes('font-family: var(--font-text)'));
    assert.ok(primary, `${selector} uses --font-text`);
    assert.match(primary.body, /letter-spacing: 0;/, `${selector} sets 0 tracking`);
    for (const rule of rules) assert.doesNotMatch(rule.body, /letter-spacing: -|font-optical-sizing/);
  }
  const clock = rulesFor(pages, '.bb-clock').find((rule) => rule.body.includes('font-size: clamp(80px, 12vw, 148px)'));
  assert.ok(clock, 'the Billboard clock rule exists');
  assert.match(clock.body, /font-family: var\(--font-text\);/, 'the clock is Instrument Sans (owner choice, October 15)');
  assert.match(clock.body, /font-weight: 500;/);
  // The two large lines tighten slightly at display size (owner, October 15).
  assert.match(clock.body, /letter-spacing: -0\.02em;/, 'the clock tightens to -0.02em');
  const where = rulesFor(pages, '.ledger-where').find((rule) => rule.body.includes('font-family: var(--font-text)'));
  assert.ok(where, '"Where to?" uses --font-text');
  assert.match(where.body, /letter-spacing: -0\.015em;/, '"Where to?" tightens to -0.015em');

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
  const body = rulesFor(pages, 'html, body')[0].body;
  assert.match(body, /font-family: var\(--font-text\);/);
  assert.match(body, /word-spacing: var\(--text-word-spacing\);/);
  assert.match(body, /letter-spacing: var\(--text-tracking\);/);
  // Chromium's own stylesheet resets letter- and word-spacing on form controls,
  // so buttons (Island rows, sheet buttons) must inherit them explicitly.
  assert.ok(rulesFor(pages, 'button, input, select, textarea').some((rule) =>
    /letter-spacing: inherit;/.test(rule.body) && /word-spacing: inherit;/.test(rule.body)), 'form controls inherit the page spacing');
  const reset = cssRules(pages).find((rule) => /letter-spacing: normal;/.test(rule.body)
    && /word-spacing: normal;/.test(rule.body) && rule.selector.includes('.shortcut-row kbd'));
  assert.ok(reset, 'one rule returns the Inter keep-list to normal spacing');
  for (const selector of KEEP_INTER) {
    assert.ok(reset.selector.split(', ').join('\n').includes(selector.split(', ')[0]), `${selector} opts out of the page spacing`);
  }
  const resetIndex = cssRules(pages).indexOf(reset);
  for (const selector of ['.shelf-count', '.tally-count', '.tally-caption']) {
    const explicit = cssRules(pages).findIndex((rule) => rule.selector.split(', ').includes(selector) && /letter-spacing: -?0\.0/.test(rule.body));
    if (explicit >= 0) assert.ok(explicit > resetIndex, `${selector}'s own tracking still wins over the reset`);
  }

  assert.doesNotMatch(chrome, /Blubird|--font-display|Newsreader/);
  assert.doesNotMatch(mahjong, /Blubird|--font-display/);
  const mahjongBody = mahjong.match(/\.mahjong-body \{([^}]*)\}/)[1];
  assert.doesNotMatch(mahjongBody, /--font-text\s*:|--text-tracking\s*:/, 'Mahjong uses the shared Instrument Sans text face (owner choice, October 17)');
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
