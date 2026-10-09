'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromeResourcePath, createChromeProtocolHandler, STRINGS_VIRTUAL_PATH } = require('../../src/main/chrome-protocol');

const pages = path.resolve(__dirname, '../../src/renderer/pages');

test('chrome hosts map strings.js to the virtual path and i18n.js to the shared formatter', () => {
  for (const host of ['index', 'overlay', 'permission', 'fill-status', 'display-capture-helper']) {
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/strings.js`), STRINGS_VIRTUAL_PATH);
    assert.equal(chromeResourcePath(`blanc-chrome://${host}/i18n.js`), path.join(pages, 'i18n.js'));
  }
  assert.equal(STRINGS_VIRTUAL_PATH, path.join(pages, 'strings.js'));
  assert.equal(fs.existsSync(STRINGS_VIRTUAL_PATH), false, 'the virtual strings path must never exist on disk');
});

test('query strings, hashes, unknown hosts and generated-file paths around strings.js fail', () => {
  for (const url of [
    'blanc-chrome://index/strings.js?x=1', 'blanc-chrome://index/strings.js#x',
    'blanc-chrome://index/pages/strings.de.js', 'blanc-chrome://nope/strings.js',
  ]) assert.equal(chromeResourcePath(url), null, url);
  // The URL parser removes dot segments, so this is the same safe virtual path.
  assert.equal(chromeResourcePath('blanc-chrome://index/../strings.js'), STRINGS_VIRTUAL_PATH);
});

test('the chrome handler serves the injected strings script as JavaScript', async () => {
  const handler = createChromeProtocolHandler({ net: { fetch: () => { throw new Error('unexpected file fetch'); } }, stringsScript: () => 'S;' });
  const response = await handler({ url: 'blanc-chrome://overlay/strings.js' });
  assert.equal(await response.text(), 'S;');
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
});

test('without a hook the chrome handler serves English with an en formatting locale', async () => {
  const handler = createChromeProtocolHandler({ net: { fetch: () => { throw new Error('unexpected'); } } });
  const text = await (await handler({ url: 'blanc-chrome://display-capture-helper/strings.js' })).text();
  assert.match(text, /"locale":"en"/);
  assert.match(text, /self\.blancStrings\.formatLocale="en";/);
});

test('blanc:// pages resolve strings.js specially and every other name as before', () => {
  const { resolvePagesAsset } = require('../../src/main/pages-assets');
  assert.deepEqual(resolvePagesAsset('settings', '/'), { kind: 'file', name: 'settings.html' });
  assert.deepEqual(resolvePagesAsset('settings', '/strings.js'), { kind: 'strings' });
  assert.deepEqual(resolvePagesAsset('settings', '/nested/strings.js'), { kind: 'strings' });
  assert.deepEqual(resolvePagesAsset('settings', '/i18n.js'), { kind: 'file', name: 'i18n.js' });
  assert.deepEqual(resolvePagesAsset('settings', '/strings.de.js'), { kind: 'file', name: 'strings.de.js' });
  // Fail-closed contract unchanged from before strings.js: unknown host → 404,
  // malformed name on a known host → 400.
  assert.deepEqual(resolvePagesAsset('settings', '/bad name.js'), { kind: 'error', status: 400 });
  assert.deepEqual(resolvePagesAsset('not-a-page', '/strings.js'), { kind: 'error', status: 404 });
  assert.deepEqual(resolvePagesAsset('not-a-page', '/'), { kind: 'error', status: 404 });
});
