const assert = require('node:assert/strict');
const test = require('node:test');

// The renderer canvas path needs a live WebContentsView, which node --test
// can't provide. Stub the class so its construction is observable: reaching it
// would throw, proving the input guards short-circuit first.
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    WebContentsView: class {
      constructor() {
        throw new Error('WebContentsView should not be constructed for guarded input');
      }
    },
  },
};

const iconRaster = require('../../src/main/icon-raster');

test('rasterize rejects invalid or cancelled input without spawning a renderer', async () => {
  assert.equal(await iconRaster.rasterize(null), null);
  assert.equal(await iconRaster.rasterize(123), null);
  assert.equal(await iconRaster.rasterize('data:image/svg+xml,<svg/>', { aborted: true }), null);
});

test('dispose is a safe no-op when no view has been created', () => {
  assert.doesNotThrow(() => iconRaster.dispose());
});
