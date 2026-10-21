'use strict';

// The homepage's first screen: a published v1.40.0 capture with the app's own
// Island floating over it (docs/superpowers/specs/2026-10-21-floating-island-homepage-hero-design.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the hero window draws the app’s own Island over a published capture', () => {
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /nativeIslandArt\(\{ styles, document, renderer \}\)/);
  assert.match(src, /var\(--shadow-island-float\)/); // the float view's own shadow
  assert.match(src, /float-island-hidden-v1\.40\.0/);
  assert.match(src, /float-island-lights-v1\.40\.0/);
  assert.doesNotMatch(src, /<svg[^>]*class="[^"]*island/); // no hand-drawn pill
});

test('the Island and buttons sit where the published app put them', () => {
  const { measured } = JSON.parse(read('docs/website-captures-float-island-v1.40.0.json'));
  const src = read('site/src/components/FloatingIslandWindow.astro');
  assert.match(src, /website-captures-float-island-v1\.40\.0\.json/); // positions come from the ledger, not typed in
  assert.ok(measured.islandRect.width > 300 && measured.islandRect.y >= 0);
  // The pill's sample state is the measured one, not typed in.
  for (const field of ['domain', 'dots', 'activeDot', 'shieldCount']) assert.match(src, new RegExp(`measured\\.pill\\.${field}`));
});
