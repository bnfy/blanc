'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    readIconBytes: async (source) => {
      if (source.includes('mislabeled')) {
        return { contentType: 'image/x-icon', bytes: pngBytes };
      }
      if (source.includes('browser-fallback') || source.includes('cross-origin')) return null;
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
  let browserFetches = 0;
  assert.equal(
    await sanitizeFavicon(
      'https://private-icons.example/favicon.png',
      undefined,
      {
        allowNetwork: false,
        pageUrl: 'https://private-icons.example/',
        browsingSession: { fetch: async () => { browserFetches++; } },
      }
    ),
    null
  );
  assert.equal(attempts, before);
  assert.equal(browserFetches, 0);
});

test('PNG signature wins when a server mislabels PNG bytes as an ICO', async () => {
  assert.equal(
    await sanitizeFavicon('https://www.gstatic.example/mislabeled-favicon.ico'),
    PNG_DATA
  );
});

const response = ({ status, url, contentType, location, bytes = pngBytes }) => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  headers: {
    get: (name) => ({
      'content-length': String(bytes.length),
      'content-type': contentType,
      location,
    })[name] ?? null,
  },
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
});

test('same-origin browser fallback fetches the exact candidate without cookies or referrer', async () => {
  const requests = [];
  const browsingSession = {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response({ status: 200, url, contentType: 'image/png' });
    },
  };
  assert.equal(await sanitizeFavicon(
    'https://browser-fallback.example/favicon.ico',
    undefined,
    { browsingSession, pageUrl: 'https://browser-fallback.example/questions' },
  ), PNG_DATA);
  assert.deepEqual(requests.map(({ url }) => url), ['https://browser-fallback.example/favicon.ico']);
  for (const { options } of requests) {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
  }
});

test('browser fallback refuses a cross-origin candidate before requesting it', async () => {
  const requests = [];
  const browsingSession = {
    fetch: async (url) => {
      requests.push(url);
      return response({ status: 200, url, contentType: 'image/png' });
    },
  };
  assert.equal(await sanitizeFavicon(
    'https://cdn.cross-origin.example/favicon.ico',
    undefined,
    { browsingSession, pageUrl: 'https://cross-origin.example/' },
  ), null);
  assert.deepEqual(requests, []);
});

test('main supplies only the current tab session to the same-origin fallback', () => {
  const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const setter = main.match(/async function setTabFavicon\(tab, source\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(setter, 'setTabFavicon not found in main.js');
  assert.match(setter, /browsingSession:/);
  assert.match(setter, /pageUrl: tab\.url/);
});
