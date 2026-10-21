'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sanitizeGroupColor, groupRecord } = require('../../src/main/group-color');
const { PRESETS } = require('../../src/renderer/space-identity');

// Tab group colors (spec 2026-10-17-tab-group-colors-design.md): only the
// eight Spaces presets, or none.
test('setGroupColor refuses anything but a preset', () => {
  for (const preset of PRESETS) assert.equal(sanitizeGroupColor(preset.hex), preset.hex);
  assert.equal(sanitizeGroupColor(PRESETS[1].hex.toUpperCase()), PRESETS[1].hex, 'case is normalized');
  for (const bad of ['#123456', 'sky', '', '#37669', null, undefined, 42, {}]) {
    assert.equal(sanitizeGroupColor(bad), null, String(bad));
  }
});

test('a group saved without a color loads uncolored', () => {
  assert.deepEqual(groupRecord({ id: 'g', name: 'Work', collapsed: 1 }), { id: 'g', name: 'Work', collapsed: true, color: null });
  assert.deepEqual(groupRecord({ id: 'g', name: 'Work', color: '#376694' }), { id: 'g', name: 'Work', collapsed: false, color: '#376694' });
  assert.equal(groupRecord({ id: 'g', name: 'Work', color: '#ffffff' }).color, null);
});

test('session restore, Space apply, Space capture and reopen all copy groups through groupRecord', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  assert.doesNotMatch(main, /\(\{ id: group\.id, name: group\.name, collapsed: !!group\.collapsed \}\)/,
    'a group copy that drops the color');
  assert.ok((main.match(/[.(]map\(groupRecord\)|= groupRecord\(/g) ?? []).length >= 4, "four copies go through groupRecord");
});
