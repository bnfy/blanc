const assert = require('node:assert/strict');
const test = require('node:test');

const PNG_32 = (() => {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(32, 16);
  bytes.writeUInt32BE(32, 20);
  return bytes;
})();

const calls = [];
const image = (width, height) => ({
  isEmpty: () => false,
  getSize: () => ({ width, height }),
  resize: (options) => {
    calls.push(['resize', options]);
    return image(options.width, options.height);
  },
  toBitmap: () => Buffer.alloc(width * height * 4, 0xff),
  toPNG: () => PNG_32,
});
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {
      createFromBitmap: (bitmap, size) => {
        calls.push(['createFromBitmap', bitmap.length, size]);
        return image(size.width, size.height);
      },
    },
  },
};

const { squarePngData } = require('../../src/main/icon-square');

test('a square favicon is resized straight to the icon square', () => {
  calls.length = 0;
  assert.ok(squarePngData(image(64, 64)));
  assert.deepEqual(calls, [['resize', { width: 32, height: 32, quality: 'best' }]]);
});

test('a wide favicon keeps its shape and is centered, not stretched', () => {
  calls.length = 0;
  assert.ok(squarePngData(image(48, 32)));
  assert.deepEqual(calls, [
    ['resize', { width: 32, height: 21, quality: 'best' }],
    ['createFromBitmap', 32 * 32 * 4, { width: 32, height: 32 }],
  ]);
});

test('an empty image yields no icon', () => {
  assert.equal(squarePngData(null), null);
  assert.equal(squarePngData({ isEmpty: () => true }), null);
});
