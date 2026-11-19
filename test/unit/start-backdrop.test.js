'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBackdrop, backdropBand, backdropPayload } = require('../../src/main/start-backdrop');

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

test('the strip gets the spec and the band, or null', () => {
  assert.deepEqual(backdropPayload('t1', sunrise, 68), { id: 't1', ...sunrise, band: 68 });
  assert.equal(backdropPayload('t1', sunrise, 0), null);
  assert.equal(backdropPayload('t1', null, 68), null);
});

// The strip runs in Blanc's chrome session, which has no blanc:// handler on
// purpose; it reads the band's images from its own scheme instead.
const { stripImages, START_ART } = require('../../src/main/start-backdrop');
test('the strip reads the art and the photo from its own scheme', () => {
  const hash = '0123456789abcdef';
  const out = stripImages(photo, { wallpaperUrl: PHOTO, wallpaperHash: hash });
  assert.match(out.layers[1].image, /url\("blanc-chrome:\/\/index\/start-art\/wallpaper-0123456789abcdef\.jpg"\)$/);
  assert.doesNotMatch(JSON.stringify(out), /blanc:\/\/newtab/);
  const art = stripImages(sunrise, { wallpaperUrl: null, wallpaperHash: null });
  assert.equal(art.layers[1].image, 'url("blanc-chrome://index/start-art/start-page-day.png")');
  assert.deepEqual(START_ART, ['start-page-sunrise.png', 'start-page-day.png', 'start-page-dusk.png', 'start-page-night.png']);
});
test('any other page file, or a photo without its hash, is refused', () => {
  const withImage = (image) => ({ ...sunrise, layers: [{ ...sunrise.layers[1], image }] });
  assert.equal(stripImages(withImage('url("blanc://newtab/newtab.js")'), { wallpaperUrl: PHOTO, wallpaperHash: 'ab' }), null);
  assert.equal(stripImages(photo, { wallpaperUrl: PHOTO, wallpaperHash: null }), null);
  assert.equal(stripImages(null, {}), null);
});

// The launch Sunrise (#1179) draws a flat animated sky over the page; the
// band plays the same sky, in step, from the time the page started it.
test('a recent Sunrise start passes through; anything else is dropped, not refused', () => {
  const now = 1_800_000_000_000;
  const started = normalizeBackdrop({ ...sunrise, sunriseAt: now - 500 }, { now });
  assert.equal(started.sunriseAt, now - 500);
  for (const sunriseAt of [now - 20_000, now + 5_000, 'soon', 1.5, null]) {
    const spec = normalizeBackdrop({ ...sunrise, sunriseAt }, { now });
    assert.ok(spec, 'the spec still passes');
    assert.equal('sunriseAt' in spec, false, String(sunriseAt));
  }
  assert.equal(backdropPayload('t1', started, 68).sunriseAt, now - 500);
  assert.equal('sunriseAt' in backdropPayload('t1', sunrise, 68), false);
  assert.equal(stripImages(started, {}).sunriseAt, now - 500);
});

test('the band plays the page\'s own Sunrise keyframes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.join(__dirname, '../../src/renderer', file), 'utf8');
  const frames = (css, name) => css.match(new RegExp(`@keyframes ${name} \\{(.*)\\}\\n`))?.[1];
  const pages = read('pages/pages.css');
  const strip = read('styles.css');
  assert.ok(frames(pages, 'launch-sunrise-sky'));
  assert.equal(frames(strip, 'band-sunrise-sky'), frames(pages, 'launch-sunrise-sky'));
  assert.equal(frames(strip, 'band-sunrise-out'), frames(pages, 'launch-sunrise-out'));
  // The same timing: 2.6s after 0.15s, with the same curve.
  assert.match(pages, /animation-duration: 2\.6s;\s*animation-delay: 0\.15s;\s*animation-timing-function: cubic-bezier\(0\.33, 0, 0\.2, 1\);/);
  assert.match(strip, /\.band-sunrise \{[^}]*animation-duration: 2\.6s;[^}]*animation-timing-function: cubic-bezier\(0\.33, 0, 0\.2, 1\);/);
  assert.match(read('renderer.js'), /const SUNRISE_DELAY_MS = 150, SUNRISE_MS = 2600;/);
});
