'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  CHROME_PARTITION,
  CHROME_INDEX_URL,
  CHROME_OVERLAY_URL,
  chromeResourcePath,
} = require('../../src/main/chrome-protocol');

const renderer = path.resolve(__dirname, '../../src/renderer');

test('chrome protocol exposes only the reviewed resources for each host', () => {
  assert.equal(CHROME_PARTITION, 'blanc-chrome');
  assert.equal(CHROME_INDEX_URL, 'blanc-chrome://index/');
  assert.equal(CHROME_OVERLAY_URL, 'blanc-chrome://overlay/');
  assert.equal(chromeResourcePath(CHROME_INDEX_URL), path.join(renderer, 'index.html'));
  assert.equal(
    chromeResourcePath('blanc-chrome://index/vertical-tabs.js'),
    path.join(renderer, 'vertical-tabs.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://overlay/overlay.js'),
    path.join(renderer, 'overlay.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://index/quiet-glyph.js'),
    path.join(renderer, 'quiet-glyph.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://overlay/quiet-glyph.js'),
    path.join(renderer, 'quiet-glyph.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://overlay/pages/inter-latin.woff2'),
    path.join(renderer, 'pages/inter-latin.woff2'),
  );
});

test('chrome protocol rejects cross-host scripts and path tricks', () => {
  for (const url of [
    'blanc-chrome://index/overlay.js',
    'blanc-chrome://overlay/renderer.js',
    'blanc-chrome://index/pages/settings.html',
    'blanc-chrome://index/../main/main.js',
    'blanc-chrome://index/%2e%2e/main/main.js',
    'blanc-chrome://index/styles.css?cache=1',
    'blanc-chrome://user@index/',
    'blanc-chrome://unknown/',
    'file:///etc/passwd',
    'not a url',
  ]) assert.equal(chromeResourcePath(url), null, url);
});
