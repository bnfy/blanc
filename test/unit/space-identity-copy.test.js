'use strict';

// workspace-ui.js names each colour and symbol with a runtime key
// (`spaces.color.${preset.id}`, `spaces.symbol.${id}`), which copy:check can
// only allowlist, not verify. This test is that verification: every preset and
// every symbol has its English label, so no swatch or symbol is ever unnamed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PRESETS, SYMBOL_IDS } = require('../../src/renderer/space-identity');

const root = path.resolve(__dirname, '../..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages/en.json'), 'utf8'));
const scope = JSON.parse(fs.readFileSync(path.join(root, 'copy/i18n-scope.json'), 'utf8'));

test('every space colour and symbol has a label', () => {
  for (const { id } of PRESETS) assert.ok(en[`spaces.color.${id}`]?.message, `spaces.color.${id}`);
  for (const id of SYMBOL_IDS) assert.ok(en[`spaces.symbol.${id}`]?.message, `spaces.symbol.${id}`);
});

test('the menu allowlists exactly the two runtime key families it uses', () => {
  const source = fs.readFileSync(path.join(root, 'src/renderer/workspace-ui.js'), 'utf8');
  const used = [...source.matchAll(/\bt\(`([^`]*\$\{[^`]*)`/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, ['spaces.color.${preset.id}', 'spaces.symbol.${id}']);
  assert.deepEqual([...scope.files['src/renderer/workspace-ui.js'].allow].sort(), used);
});
