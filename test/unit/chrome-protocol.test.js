'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {
  CHROME_PARTITION,
  CHROME_INDEX_URL,
  CHROME_OVERLAY_URL,
  CHROME_FILL_STATUS_URL,
  CHROME_DISPLAY_CAPTURE_HELPER_URL,
  chromeResourcePath,
} = require('../../src/main/chrome-protocol');

const renderer = path.resolve(__dirname, '../../src/renderer');
const { captureRuntimeForPlatform } = require('../../src/main/capture-platform');

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
    chromeResourcePath('blanc-chrome://overlay/pages/inter-latin.woff2'),
    path.join(renderer, 'pages/inter-latin.woff2'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://overlay/pages/sunrise-favicon-mark.png'),
    path.join(renderer, 'pages/sunrise-favicon-mark.png'),
  );
});

test('the blocker Sunrise is the canonical gold artwork and only the overlay can load it', () => {
  const asset = path.join(renderer, 'sunrise-hero-mark.png');
  assert.equal(chromeResourcePath('blanc-chrome://overlay/sunrise-hero-mark.png'), asset);
  assert.deepEqual(
    fs.readFileSync(asset),
    fs.readFileSync(path.resolve(__dirname, '../../site/public/sunrise-hero-mark.png')),
  );
  for (const url of [
    'blanc-chrome://index/sunrise-hero-mark.png',
    'blanc-chrome://permission/sunrise-hero-mark.png',
    'blanc-chrome://fill-status/sunrise-hero-mark.png',
    'blanc-chrome://display-capture-helper/sunrise-hero-mark.png',
    'blanc-chrome://overlay/sunrise-hero-mark.png?cache=1',
    'blanc-chrome://overlay/sunrise-hero-mark.png#mark',
    'blanc-chrome://overlay/%73unrise-hero-mark.png',
    'blanc-chrome://overlay/site/public/sunrise-hero-mark.png',
  ]) assert.equal(chromeResourcePath(url), null, url);
});

test('fill-status host serves its document, script, copy, and shared styles only', () => {
  assert.equal(CHROME_FILL_STATUS_URL, 'blanc-chrome://fill-status/');
  assert.equal(chromeResourcePath(CHROME_FILL_STATUS_URL), path.join(renderer, 'fill-status.html'));
  assert.equal(
    chromeResourcePath('blanc-chrome://fill-status/fill-status.js'),
    path.join(renderer, 'fill-status.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://fill-status/fill-status-copy.js'),
    path.join(renderer, 'fill-status-copy.js'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://fill-status/styles.css'),
    path.join(renderer, 'styles.css'),
  );
  assert.equal(chromeResourcePath('blanc-chrome://fill-status/renderer.js'), null);
  assert.equal(chromeResourcePath('blanc-chrome://fill-status/../preload.js'), null);
  // The capsule's copy module belongs to the fill-status host alone.
  assert.equal(chromeResourcePath('blanc-chrome://index/fill-status-copy.js'), null);
});

test('display-capture-helper host serves only its document and script', () => {
  assert.equal(CHROME_DISPLAY_CAPTURE_HELPER_URL, 'blanc-chrome://display-capture-helper/');
  assert.equal(
    chromeResourcePath(CHROME_DISPLAY_CAPTURE_HELPER_URL),
    path.join(renderer, 'display-capture-helper.html'),
  );
  assert.equal(
    chromeResourcePath('blanc-chrome://display-capture-helper/display-capture-helper.js'),
    path.join(renderer, captureRuntimeForPlatform().helper),
  );
  assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/renderer.js'), null);
  assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/../preload.js'), null);
  assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/?x=1'), null);
  assert.equal(chromeResourcePath('blanc-chrome://index/display-capture-helper.js'), null);
});

test('chrome protocol rejects cross-host scripts and path tricks', () => {
  for (const url of [
    'blanc-chrome://index/overlay.js',
    'blanc-chrome://overlay/renderer.js',
    'blanc-chrome://index/pages/settings.html',
    'blanc-chrome://index/pages/icon.svg',
    'blanc-chrome://overlay/pages/icon.svg',
    'blanc-chrome://index/../main/main.js',
    'blanc-chrome://index/%2e%2e/main/main.js',
    'blanc-chrome://index/styles.css?cache=1',
    // Deleted with the Zzz glyph (quiet is now a row-level dim). The allowlist
    // fails closed, so its path must stop resolving the moment it leaves
    // SHARED_ASSETS — a stale entry would keep serving a file that is gone.
    'blanc-chrome://index/quiet-glyph.js',
    'blanc-chrome://overlay/quiet-glyph.js',
    'blanc-chrome://user@index/',
    'blanc-chrome://unknown/',
    'file:///etc/passwd',
    'not a url',
  ]) assert.equal(chromeResourcePath(url), null, url);
});
