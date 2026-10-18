'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SOURCES, MAX_EDGE, effectiveSource, settingsForSource, scaledSize, normalizeMeta,
  readJpegOrientation, withOrientation,
} = require('../../src/main/wallpaper-model');

test('wallpaper-model stays free of Electron so the fork can port it', () => {
  const source = require('fs').readFileSync(require.resolve('../../src/main/wallpaper-model'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]electron['"]\)/);
});

test('effective source: custom needs an image and never reaches a private tab', () => {
  const cases = [
    [{ dynamic: false, custom: false, hasImage: false, isPrivate: false }, 'sunrise'],
    [{ dynamic: true, custom: false, hasImage: true, isPrivate: false }, 'time-of-day'],
    [{ dynamic: false, custom: true, hasImage: true, isPrivate: false }, 'custom'],
    [{ dynamic: true, custom: true, hasImage: true, isPrivate: false }, 'custom'],
    // Synced elsewhere, or the file was deleted: the bundled artwork.
    [{ dynamic: true, custom: true, hasImage: false, isPrivate: false }, 'time-of-day'],
    [{ dynamic: false, custom: true, hasImage: false, isPrivate: false }, 'sunrise'],
    [{ dynamic: false, custom: true, hasImage: true, isPrivate: true }, 'sunrise'],
    [{ dynamic: true, custom: true, hasImage: true, isPrivate: true }, 'time-of-day'],
  ];
  for (const [input, expected] of cases) assert.equal(effectiveSource(input), expected, JSON.stringify(input));
});

test('choosing a source writes only the settings it needs', () => {
  assert.deepEqual(SOURCES, ['sunrise', 'time-of-day', 'custom']);
  assert.deepEqual(settingsForSource('custom'), { newtabCustomWallpaper: true });
  assert.deepEqual(settingsForSource('time-of-day'), { newtabDynamicWallpaper: true, newtabCustomWallpaper: false });
  assert.deepEqual(settingsForSource('sunrise'), { newtabDynamicWallpaper: false, newtabCustomWallpaper: false });
  for (const bad of [undefined, null, '', 'Custom', 'night', 1, {}]) assert.equal(settingsForSource(bad), null);
});

test('images are fitted inside the long-edge limit and never enlarged', () => {
  assert.deepEqual(scaledSize({ width: 8000, height: 6000 }), { width: MAX_EDGE, height: 2880 });
  assert.deepEqual(scaledSize({ width: 3000, height: 9000 }), { width: 1280, height: MAX_EDGE });
  assert.deepEqual(scaledSize({ width: 1200, height: 800 }), { width: 1200, height: 800 });
  assert.deepEqual(scaledSize({ width: 0, height: 0 }), { width: 1, height: 1 });
});

test('stored records are validated, never trusted as written', () => {
  const good = { version: 1, hash: '0123456789abcdef', width: 1920, height: 1080, updatedAt: 5 };
  assert.deepEqual(normalizeMeta(good), good);
  assert.deepEqual(normalizeMeta({ ...good, updatedAt: 'x' }), { ...good, updatedAt: 0 });
  for (const bad of [null, 'x', {}, { ...good, hash: '' }, { ...good, hash: '../etc' }, { ...good, width: 0 },
    { ...good, height: MAX_EDGE + 1 }, { ...good, width: 1.5 }]) {
    assert.equal(normalizeMeta(bad), null, JSON.stringify(bad));
  }
});

// A JPEG skeleton: SOI, optional segments, then SOS and EOI.
const jpeg = (...segments) => Buffer.concat([Buffer.from([0xff, 0xd8]), ...segments, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
function exifSegment(orientation, little = false) {
  const tiff = Buffer.alloc(26);
  const w16 = (v, at) => (little ? tiff.writeUInt16LE(v, at) : tiff.writeUInt16BE(v, at));
  const w32 = (v, at) => (little ? tiff.writeUInt32LE(v, at) : tiff.writeUInt32BE(v, at));
  tiff.write(little ? 'II' : 'MM', 0, 'latin1');
  w16(42, 2); w32(8, 4); w16(1, 8); w16(0x0112, 10); w16(3, 12); w32(1, 14); w16(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
const app0 = Buffer.from([0xff, 0xe0, 0, 4, 0, 0]);

test('reads EXIF orientation in either byte order, after other segments', () => {
  assert.equal(readJpegOrientation(jpeg(exifSegment(6))), 6);
  assert.equal(readJpegOrientation(jpeg(app0, exifSegment(8, true))), 8);
  assert.equal(readJpegOrientation(jpeg(app0)), 1);
  assert.equal(readJpegOrientation(jpeg(exifSegment(9))), 1);
  assert.equal(readJpegOrientation(Buffer.from('not a jpeg')), 1);
  // A truncated segment length never reads past the buffer.
  assert.equal(readJpegOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45])), 1);
});

test('the re-encoded copy carries only the orientation, so it still draws upright', () => {
  const plain = jpeg(app0);
  assert.equal(withOrientation(plain, 1), plain);
  const rotated = withOrientation(plain, 6);
  assert.equal(readJpegOrientation(rotated), 6);
  assert.equal(rotated.length, plain.length + 36);
  // Nothing but Exif header + one IFD entry: no room for location or camera tags.
  assert.equal(rotated.indexOf(Buffer.from('GPS')), -1);
  assert.equal(withOrientation(Buffer.from('png?'), 6).toString(), 'png?');
});
