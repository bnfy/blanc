'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../../src/renderer/space-identity');

const THEMES = ['light', 'dark', 'private'];

test('every preset is a fixed point of the light guard and readable everywhere', () => {
  assert.equal(identity.PRESETS.length, 8);
  for (const { id, hex } of identity.PRESETS) {
    assert.equal(identity.inkFor(hex, 'light'), hex, `${id} is drawn as stored in light mode`);
    for (const theme of THEMES) {
      assert.ok(identity.worstContrast(identity.inkFor(hex, theme), theme) >= 4.5, `${id} on ${theme}`);
    }
  }
});

test('contrast is measured against the painted wash, not only the bare surface', () => {
  // #767676 passes on white (4.54:1) but not on its own 15% wash (3.78:1).
  assert.ok(identity.contrast('#767676', '#ffffff') >= 4.5);
  assert.ok(identity.contrast('#767676', identity.composite('#767676', 0.15, '#ffffff')) < 4.5);
  assert.equal(identity.inkFor('#767676', 'light'), '#636363');
  assert.equal(identity.inkFor('#F5E663', 'light'), '#6d6400');
  assert.equal(identity.inkFor('#f5e663', 'dark'), '#f5e663', 'a colour that already passes is unchanged');
});

test('any colour comes back as a valid hex that clears 4.5:1 in every theme', () => {
  for (let h = 0; h < 360; h += 15) {
    for (const s of [0, 0.35, 0.7, 1]) {
      for (const v of [0.05, 0.35, 0.65, 0.95, 1]) {
        const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        const hex = `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
        for (const theme of THEMES) {
          const ink = identity.inkFor(hex, theme);
          assert.match(ink, /^#[0-9a-f]{6}$/, `${hex} ${theme}`);
          assert.ok(identity.worstContrast(ink, theme) >= 4.5, `${hex} on ${theme} -> ${ink}`);
        }
      }
    }
  }
});

test('paint returns the ink and a theme-weighted wash', () => {
  assert.deepEqual(identity.paint('#426c4c', 'light'), { ink: '#426c4c', wash: 'rgba(66, 108, 76, 0.15)' });
  assert.equal(identity.paint('#426c4c', 'dark').wash.endsWith(', 0.2)'), true);
  assert.equal(identity.paint('nope', 'light'), null);
  assert.equal(identity.paint('#426c4c', 'sepia'), null);
});

test('hex input is normalized and anything else is rejected', () => {
  assert.equal(identity.normalizeHex('#ABCDEF'), '#abcdef');
  assert.equal(identity.normalizeHex(' abcdef '), '#abcdef');
  for (const bad of ['#abc', 'abcdeg', '#abcdef0', '', null, 42, '#ab cdef']) assert.equal(identity.normalizeHex(bad), null, String(bad));
});

test('defaults take the first unused preset and symbol in list order, then cycle', () => {
  assert.deepEqual(identity.defaultsFor([]), { color: '#426c4c', symbol: 'briefcase' });
  assert.deepEqual(identity.defaultsFor([{ color: '#426c4c', symbol: 'briefcase' }, { color: '#ff0000', symbol: 'house' }]), { color: '#376694', symbol: 'code' });
  const full = identity.PRESETS.map((p, i) => ({ color: p.hex, symbol: identity.SYMBOL_IDS[i] }));
  assert.equal(identity.defaultsFor(full).color, identity.PRESETS[0].hex, 'every preset used: cycle');
  assert.equal(identity.defaultsFor([{ color: 'bad', symbol: 'nope' }]).symbol, 'briefcase', 'invalid values do not count as used');
});

test('symbols are the 16 approved ids, each with drawable geometry', () => {
  assert.deepEqual(identity.SYMBOL_IDS, ['briefcase', 'house', 'code', 'flask', 'book', 'music', 'camera', 'plane', 'heart', 'star', 'leaf', 'coffee', 'cap', 'gamepad', 'wallet', 'sun']);
  for (const id of identity.SYMBOL_IDS) {
    assert.ok(identity.SYMBOLS[id].length > 0, id);
    for (const [tag] of identity.SYMBOLS[id]) assert.ok(['path', 'rect', 'circle'].includes(tag), `${id} ${tag}`);
  }
  assert.equal(identity.isSymbol('house'), true);
  assert.equal(identity.isSymbol('toString'), false, 'inherited keys are not symbols');
});
