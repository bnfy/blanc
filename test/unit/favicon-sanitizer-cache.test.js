'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const LEGACY_PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';
const pngBytes = Buffer.from(LEGACY_PNG_DATA.split(',')[1], 'base64');
pngBytes.writeUInt32BE(32, 16);
pngBytes.writeUInt32BE(32, 20);
const PNG_DATA = `data:image/png;base64,${pngBytes.toString('base64')}`;

const image = {
  isEmpty: () => false,
  resize: () => image,
  toPNG: () => pngBytes,
};
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { nativeImage: { createFromBuffer: () => image } },
};

let attempts = 0;
const networkId = require.resolve('../../src/main/favicon-network');
require.cache[networkId] = {
  id: networkId,
  filename: networkId,
  loaded: true,
  exports: {
    readIconBytes: async () => {
      attempts += 1;
      return attempts === 1 ? null : { contentType: 'image/png', bytes: pngBytes };
    },
  },
};

const { sanitizeFavicon } = require('../../src/main/favicon-sanitizer');

test('a transient favicon failure is not cached for the process lifetime', async () => {
  const source = 'https://icons.example/favicon.png';
  assert.equal(await sanitizeFavicon(source), null);
  assert.equal(await sanitizeFavicon(source), PNG_DATA);
  assert.equal(await sanitizeFavicon(source), PNG_DATA);
  assert.equal(attempts, 2, 'failure retries once; the successful sanitized PNG is cached');
});

test('private-tab sanitization never starts a remote favicon request', async () => {
  const before = attempts;
  assert.equal(
    await sanitizeFavicon(
      'https://private-icons.example/favicon.png',
      undefined,
      { allowNetwork: false }
    ),
    null
  );
  assert.equal(attempts, before);
});
