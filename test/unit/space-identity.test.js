'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../../src/renderer/space-identity');

const THEMES = ['light', 'dark', 'private'];

const WHITE = '#ffffff', BLACK = '#000000';
// A sweep of hues × saturation × brightness, as hex.
function sweep() {
  const out = [];
  for (let h = 0; h < 360; h += 15) {
    for (const s of [0, 0.35, 0.7, 1]) {
      for (const v of [0.05, 0.35, 0.5, 0.65, 0.95, 1]) {
        const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
        out.push(`#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`);
      }
    }
  }
  return out;
}

test('a space is drawn in exactly its colour, in every theme', () => {
  for (const hex of [...sweep(), ...identity.PRESETS.map((p) => p.hex)]) {
    for (const theme of THEMES) assert.equal(identity.paint(hex, theme).fill, hex, `${hex} on ${theme}`);
  }
  assert.equal(identity.paint('#F5E663', 'light').fill, '#f5e663', 'normalized, never adjusted');
});

test('the symbol and name on a colour are white or black, whichever contrasts more, and always readable', () => {
  let worst = Infinity;
  for (const hex of sweep()) {
    const { on } = identity.paint(hex, 'light');
    assert.ok(on === WHITE || on === BLACK, `${hex} -> ${on}`);
    const other = on === WHITE ? BLACK : WHITE;
    assert.ok(identity.contrast(hex, on) >= identity.contrast(hex, other), `${hex}: ${on} is the stronger choice`);
    assert.ok(identity.contrast(hex, on) >= identity.MIN_CONTRAST, `${hex} -> ${on}: ${identity.contrast(hex, on).toFixed(2)}:1`);
    for (const theme of THEMES) assert.equal(identity.paint(hex, theme).on, on, 'the theme does not change it');
    worst = Math.min(worst, identity.contrast(hex, on));
  }
  // Every grey, too: the worst case is a mid-tone, at about 4.58:1.
  for (let v = 0; v < 256; v++) {
    const grey = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
    worst = Math.min(worst, identity.contrast(grey, identity.paint(grey, 'dark').on));
  }
  assert.ok(worst >= 4.5, `worst ${worst.toFixed(2)}:1`);
  assert.equal(identity.paint('#ff3b30', 'light').on, BLACK, 'white on this red is only about 3.6:1');
  assert.equal(identity.paint('#0a1f44', 'light').on, WHITE);
});

test('a colour too close to the surface behind it gets an edge, on that theme only', () => {
  const edge = (hex, theme) => identity.paint(hex, theme).edge;
  assert.equal(edge('#ffffff', 'light'), true);
  assert.equal(edge('#ffffff', 'dark'), false);
  assert.equal(edge('#000000', 'light'), false);
  assert.equal(edge('#000000', 'dark'), true);
  assert.equal(edge('#000000', 'private'), true);
  for (const { id, hex } of identity.PRESETS) assert.equal(edge(hex, 'light'), false, `${id} stands out on light`);
  for (const hex of sweep()) {
    for (const theme of THEMES) {
      const close = identity.SURFACES[theme].some((surface) => identity.contrast(hex, surface) < identity.EDGE_CONTRAST);
      assert.equal(edge(hex, theme), close, `${hex} on ${theme}`);
    }
  }
});

test("presets are the spec's table: stored and drawn as these hexes, with this colour on them", () => {
  const spec = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../docs/superpowers/specs/2026-10-13-blanc-spaces-redesign-design.md'), 'utf8');
  assert.equal(identity.PRESETS.length, 8);
  for (const { id, hex } of identity.PRESETS) {
    const name = id[0].toUpperCase() + id.slice(1);
    const row = spec.match(new RegExp(`^\\| ${name} \\| \`(#[0-9a-f]{6})\` \\| (white|black) \\|$`, 'm'));
    assert.ok(row, `${name} is in the spec's preset table`);
    assert.equal(row[1], hex, `${name}'s hex`);
    assert.equal(identity.paint(hex, 'light').on, row[2] === 'white' ? WHITE : BLACK, `${name}'s symbol colour`);
  }
});

test('paint rejects junk; wash is the faint band tint for the dev-only tint switch', () => {
  assert.deepEqual(identity.paint('#426c4c', 'light'), { fill: '#426c4c', on: WHITE, edge: false });
  assert.equal(identity.paint('nope', 'light'), null);
  assert.equal(identity.paint('#426c4c', 'sepia'), null);
  assert.equal(identity.wash('#426c4c', 'light'), 'rgba(66, 108, 76, 0.15)');
  assert.equal(identity.wash('#426c4c', 'dark'), 'rgba(66, 108, 76, 0.2)');
  assert.equal(identity.wash('nope', 'dark'), null);
  assert.equal(identity.inkFor, undefined, 'no colour is adjusted any more');
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
