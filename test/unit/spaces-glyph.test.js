'use strict';
// The Spaces glyph: a ringed planet, so people coming from Arc recognise
// Spaces. One definition (space-identity.js) for the Island's quiet mark; the
// ⌘L footer button keeps a static copy for its first paint, pinned here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Identity = require('../../src/renderer/space-identity');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
const asStrings = (attrs) => Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)]));

test('the Spaces glyph is a ringed planet, defined once', () => {
  const glyph = Identity.SPACES_GLYPH;
  assert.ok(Array.isArray(glyph), 'SpaceIdentity.SPACES_GLYPH exists');
  assert.deepEqual(glyph.map(([tag]) => tag), ['circle', 'path']);
  const [[, planet], [, ring]] = glyph;
  assert.deepEqual(planet, { cx: 12, cy: 12, r: 7 });
  assert.match(ring.d, /^M[\d.]+ [\d.]+A11\.3 3\.1 27 1 1 [\d.]+ [\d.]+$/, 'one open, tilted elliptical ring');
});

test('the Island draws its quiet mark from that glyph', () => {
  const src = read('src/renderer/renderer.js');
  assert.match(src, /symbolSvg\(bound \? SpaceIdentity\.SYMBOLS\[symbol\] : SpaceIdentity\.SPACES_GLYPH\)/);
  assert.doesNotMatch(src, /NEUTRAL_SPACE_GLYPH/, 'no second copy in the strip');
});

test("the ⌘L footer's button draws exactly the same glyph", () => {
  const html = read('src/renderer/overlay.html');
  const button = html.match(/<button\s+id="footerWorkspace"[\s\S]*?<\/button>/);
  assert.ok(button, 'the footer button');
  const svg = button[0].match(/<svg[^>]*viewBox="0 0 24 24"[^>]*>([\s\S]*?)<\/svg>/);
  assert.ok(svg, 'a 24-grid svg');
  const shapes = [...svg[1].matchAll(/<(circle|path)\s([^>]*?)\/>/g)]
    .map(([, tag, attrs]) => [tag, Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]))]);
  assert.deepEqual(shapes, Identity.SPACES_GLYPH.map(([tag, attrs]) => [tag, asStrings(attrs)]));
});

test('the planet is drawn a little larger than the other glyphs, at the footer line weight', () => {
  const css = read('src/renderer/styles.css');
  assert.match(css, /#footerWorkspace svg \{[^}]*width: 17px;[^}]*height: 17px;[^}]*stroke-width: 2;/);
  assert.match(css, /\.space-mark\[data-state="neutral"\] \.space-mark-symbol svg \{[^}]*width: 16px;[^}]*height: 16px;[^}]*stroke-width: 2;/);
});
