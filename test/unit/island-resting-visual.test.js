'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens/tokens.json'), 'utf8'));
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');
const overlay = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');

function token(name) {
  return tokens.tokens.find((entry) => entry.name === name)?.values;
}

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `missing CSS block for ${selector}`);
  return match[1];
}

test('resting island tokens preserve the website material and canonical geometry', () => {
  assert.deepEqual(token('island-resting-surface'), {
    light: 'rgba(255,255,255,.94)',
    dark: 'rgba(31,31,31,.94)',
    private: 'rgba(25,25,25,.94)',
  });
  assert.deepEqual(token('shadow-island-resting'), {
    common: 'inset 0 1px 0 rgba(255,255,255,.72), inset 0 -1px 0 rgba(14,14,14,.035), 0 5px 18px -12px rgba(14,14,14,.24)',
  });
  assert.deepEqual(token('island-resting-height'), { common: '44px' });
  assert.deepEqual(token('island-resting-radius'), { common: '17px' });
  assert.deepEqual(token('strip-h'), { common: '68px' });
});

test('resting island counter-scales fixed geometry and grows every element together', () => {
  const pill = cssBlock('#islandPill');
  const face = cssBlock('#islandPill::after');
  assert.match(pill, /height:\s*calc\(var\(--island-resting-height\) \/ var\(--pill-zoom\)\)/);
  assert.match(pill, /padding:\s*0 14px/);
  assert.match(pill, /border-radius:\s*calc\(var\(--island-resting-radius\) \/ var\(--pill-zoom\)\)/);
  assert.match(pill, /transform:\s*none/);
  assert.match(face, /background:\s*var\(--island-resting-surface\)/);
  assert.match(face, /backdrop-filter:\s*blur\(16px\)/);
  assert.match(face, /box-shadow:\s*var\(--shadow-island-resting\)/);
  assert.doesNotMatch(face, /box-shadow:[^;]*--island-k/);
  assert.match(styles, /#islandPill\.proximity-active\s*\{[^}]*translateY\([^}]*scale\(/);
  assert.doesNotMatch(styles, /#islandPill\.proximity-active::after/);
  assert.match(renderer, /const ISLAND_SCALE = 0\.02/);
  assert.match(renderer, /const scale = 1 \+ ISLAND_SCALE \* k/);
  assert.match(renderer, /classList\.toggle\('proximity-active', next > 0\)/);
  assert.match(styles, /#islandPill,\s*#islandPill\.proximity-active\s*\{\s*transform:\s*none;\s*transition:\s*none;/);
});

test('expanded input and morph use the selected compact geometry', () => {
  const input = cssBlock('#addressInput');
  assert.match(input, /height:\s*36px/);
  assert.match(input, /border-radius:\s*14px/);
  assert.match(input, /font-family:\s*var\(--font-ui\)/);
  assert.doesNotMatch(overlay, /pill(?:Rect)?\.height \/ 2/);
  assert.equal(
    overlay.match(/style\.borderRadius = 'var\(--island-resting-radius\)'/g)?.length,
    2,
  );
});
