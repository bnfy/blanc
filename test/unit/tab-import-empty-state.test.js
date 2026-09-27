'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BROWSERS } = require('../../src/main/browser-data-import');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/tab-import-open-tabs.js'), 'utf8');

test('the empty state names exactly the browsers Blanc can read, in the same order', () => {
  const declared = source.match(/const SUPPORTED_BROWSER_NAMES = (\[[^\]]*\]);/);
  assert.ok(declared, 'SUPPORTED_BROWSER_NAMES not found');
  assert.deepEqual(JSON.parse(declared[1].replace(/'/g, '"')), BROWSERS.map((browser) => browser.name));
});
