'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PRESETS } = require('../../src/renderer/space-identity');

const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../../tokens/tokens.json'), 'utf8')).tokens;

test('the space palette is defined once: tokens.json mirrors the identity module', () => {
  const space = tokens.filter((t) => t.name.startsWith('space-'));
  assert.deepEqual(space.map((t) => [t.name, t.values.common]), PRESETS.map((p) => [`space-${p.id}`, p.hex]));
  for (const t of space) {
    assert.equal(t.group, 'color', t.name);
    assert.deepEqual(t.consumers, ['chrome'], t.name);
  }
});
