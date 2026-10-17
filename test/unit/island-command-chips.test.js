'use strict';
// Slash commands and bang codes in the ⌘L panel read as small chips with
// semi-rounded corners, not plain accent text. Every such code is a
// `.row-cmd` (commandRow, bangRow, bangPickRow in overlay.js).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('slash commands and bang codes share one class', () => {
  const overlay = read('src/renderer/overlay.js');
  for (const fn of ['commandRow', 'bangRow', 'bangPickRow']) {
    const body = overlay.match(new RegExp(`function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`))?.[0];
    assert.ok(body, `${fn} not found in overlay.js`);
    assert.match(body, /className = 'row-cmd'/, `${fn} draws its code as .row-cmd`);
  }
});

test('a code is a chip: tinted fill, semi-rounded corners, its own padding', () => {
  const styles = read('src/renderer/styles.css');
  const rule = styles.match(/^\.island-row \.row-cmd \{([^}]*)\}/m)?.[1] ?? '';
  assert.ok(rule, '.island-row .row-cmd rule exists');
  assert.match(rule, /background:\s*color-mix\(in srgb, var\(--text\) \d+%, transparent\);/);
  assert.match(rule, /border-radius:\s*6px;/);
  assert.match(rule, /padding:\s*0 7px;/);
  assert.match(rule, /font-family:\s*var\(--font-text\);/, 'Instrument Sans, not the key-cap face');
  assert.doesNotMatch(rule, /--sunrise-/, 'the Island stays neutral');
});

test('the selected row’s chip is a step stronger', () => {
  const styles = read('src/renderer/styles.css');
  const rules = [...styles.matchAll(/^\.island-row\.active \.row-cmd \{([^}]*)\}/gm)].map((m) => m[1]);
  assert.ok(rules.some((rule) => /background:\s*color-mix\(in srgb, var\(--text\) \d+%, transparent\);/.test(rule)));
});
