'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Identity = require('../../src/renderer/space-identity');
const {
  FILLS, PRESET_IDS, DEFAULT_PRESET, DEFAULT_FILL, MIN_INK, SOFT,
  mix, colorPaint, colorWallpaper, normalizePreset, normalizeFill,
} = require('../../src/main/start-page-paint');

test('start-page-paint stays free of Electron so the fork can port it', () => {
  const source = fs.readFileSync(require.resolve('../../src/main/start-page-paint'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]electron['"]\)/);
});

test('the colors are exactly the Spaces presets, and the fills are fixed', () => {
  assert.deepEqual(PRESET_IDS, Identity.PRESETS.map((p) => p.id));
  assert.deepEqual(FILLS, ['soft', 'solid', 'gradient']);
  assert.equal(DEFAULT_PRESET, 'sage');
  assert.equal(DEFAULT_FILL, 'gradient');
  for (const bad of [undefined, null, '', 'Sage', 'teal', 1]) assert.equal(normalizePreset(bad), null);
  for (const bad of [undefined, null, '', 'Solid', 'noise']) assert.equal(normalizeFill(bad), null);
});

test('mix moves between two colors in sRGB', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

// Every stop a Solid or Gradient page draws keeps both inks readable, the
// header date over the glow included; Soft keeps the theme's dim ink readable.
test('every preset keeps its ink and dim ink at AA on every stop', () => {
  for (const { id, hex } of Identity.PRESETS) {
    const paint = colorPaint(hex);
    assert.equal(paint.base, hex, id);
    assert.equal(paint.ink, '#ffffff', id);
    for (const stop of [paint.base, paint.glow, paint.deep]) {
      assert.ok(Identity.contrast(paint.ink, stop) >= MIN_INK, `${id} ink on ${stop}`);
      assert.ok(Identity.contrast(paint.dim, stop) >= MIN_INK, `${id} dim on ${stop}`);
    }
    assert.notEqual(paint.glow, paint.base, `${id} has a visible glow`);
    assert.notEqual(paint.dim, paint.ink, `${id} has a quieter dim ink`);
    assert.ok(Identity.contrast(SOFT.light.dim, paint.softLight) >= MIN_INK, `${id} soft light`);
    assert.ok(Identity.contrast(SOFT.dark.dim, paint.softDark) >= MIN_INK, `${id} soft dark`);
    assert.notEqual(paint.softLight, SOFT.light.bg, `${id} soft light is tinted`);
  }
});

test('a pale custom Space color gets black ink and still clears AA', () => {
  const paint = colorPaint('#f2d16b');
  assert.equal(paint.ink, '#000000');
  for (const stop of [paint.base, paint.glow, paint.deep]) {
    assert.ok(Identity.contrast(paint.ink, stop) >= MIN_INK);
    assert.ok(Identity.contrast(paint.dim, stop) >= MIN_INK);
  }
  assert.equal(colorPaint('teal'), null);
});

test('the Color wallpaper follows the Space only when asked and in one', () => {
  const sky = Identity.presetFor('#376694').hex;
  assert.equal(colorWallpaper({ preset: 'sky', fill: 'solid' }).base, sky);
  assert.equal(colorWallpaper({ preset: 'sky', fill: 'solid' }).fill, 'solid');
  assert.equal(colorWallpaper({ preset: 'sky', followSpace: true, spaceColor: '#9b4761' }).base, '#9b4761');
  assert.equal(colorWallpaper({ preset: 'sky', followSpace: true, spaceColor: '#9b4761' }).fromSpace, true);
  assert.equal(colorWallpaper({ preset: 'sky', followSpace: false, spaceColor: '#9b4761' }).base, sky);
  assert.equal(colorWallpaper({ preset: 'sky', followSpace: true, spaceColor: null }).fromSpace, false);
  // Unknown values fall back to the defaults.
  const fallback = colorWallpaper({ preset: 'teal', fill: 'noise' });
  assert.equal(fallback.base, Identity.PRESETS[0].hex);
  assert.equal(fallback.fill, DEFAULT_FILL);
});
