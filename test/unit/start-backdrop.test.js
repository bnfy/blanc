'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBackdrop, backdropBand } = require('../../src/main/start-backdrop');

const PHOTO = 'blanc://newtab/user-wallpaper-0123456789abcdef0123456789abcdef.jpg?v=0123456789abcdef';
const sunrise = {
  zoom: 1, width: 1280, height: 732,
  layers: [
    { color: 'rgb(250, 247, 242)', image: 'none', size: 'auto', position: '0% 0%', repeat: 'repeat', opacity: 1, fade: false },
    { color: 'rgba(0, 0, 0, 0)', image: 'url("blanc://newtab/start-page-day.png")', size: 'cover', position: '50% 50%', repeat: 'no-repeat', opacity: 1, fade: true },
  ],
};
const photo = {
  ...sunrise,
  layers: [sunrise.layers[0], {
    ...sunrise.layers[1],
    image: `linear-gradient(rgba(250, 247, 242, 0.42), rgba(250, 247, 242, 0)), url("${PHOTO}")`,
  }],
};

test('a Sunrise and a photo spec pass unchanged', () => {
  assert.deepEqual(normalizeBackdrop(sunrise, { wallpaperUrl: PHOTO }), sunrise);
  assert.deepEqual(normalizeBackdrop(photo, { wallpaperUrl: PHOTO }), photo);
});

test('a bad field refuses the whole spec', () => {
  const bad = [
    { ...sunrise, zoom: 0.1 }, { ...sunrise, zoom: 6 }, { ...sunrise, zoom: '1' },
    { ...sunrise, width: 0 }, { ...sunrise, height: 20001 }, { ...sunrise, width: 1.5 },
    { ...sunrise, layers: [] }, { ...sunrise, layers: Array(5).fill(sunrise.layers[0]) }, { ...sunrise, layers: 'x' },
    { ...sunrise, layers: [{ ...sunrise.layers[0], opacity: 2 }] },
    { ...sunrise, layers: [{ ...sunrise.layers[0], color: 'x'.repeat(4097) }] },
    { ...sunrise, layers: [{ ...sunrise.layers[0], size: 7 }] },
    { ...sunrise, layers: [{ ...sunrise.layers[0], image: 'url("blanc://newtab/a.png") \\9' }] },
    null, 'spec', [],
  ];
  for (const spec of bad) assert.equal(normalizeBackdrop(spec, { wallpaperUrl: PHOTO }), null, JSON.stringify(spec)?.slice(0, 80));
});

test('only Blanc\'s own page images and the current photo are drawn', () => {
  const withImage = (image) => ({ ...sunrise, layers: [{ ...sunrise.layers[1], image }] });
  for (const image of [
    'url("https://example.com/a.png")',
    'url("blanc://settings/a.png")',
    'url("blanc://newtab/sub/a.png")',
    'url("blanc://newtab/../a.png")',
    'url("javascript:alert(1)")',
    'url(blanc://newtab/a.png)',
    `url("${PHOTO.replace('0123456789abcdef.jpg', 'ffffffffffffffff.jpg')}")`,
  ]) assert.equal(normalizeBackdrop(withImage(image), { wallpaperUrl: PHOTO }), null, image);
  assert.equal(normalizeBackdrop(photo, { wallpaperUrl: null }), null, 'no photo is current');
  assert.ok(normalizeBackdrop(withImage('radial-gradient(rgb(1, 2, 3), transparent)'), { wallpaperUrl: null }));
});

const showing = {
  isActive: true, isPrivate: false, splitVisible: false, glanceOpen: false,
  autoHide: false, fullScreen: false, siteColors: true, pageTop: 68,
};

test('the band continues the page with the strip\'s height', () => {
  assert.equal(backdropBand(showing), 68);
});

test('it stands aside wherever the band does not sit above this page alone', () => {
  for (const [key, value] of [['isActive', false], ['isPrivate', true], ['splitVisible', true], ['glanceOpen', true],
    ['autoHide', true], ['fullScreen', true], ['siteColors', false], ['pageTop', 0], ['pageTop', NaN]]) {
    assert.equal(backdropBand({ ...showing, [key]: value }), 0, key);
  }
});
