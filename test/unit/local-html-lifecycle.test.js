'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { isSupportedLocalHtmlUrl } = require('../../src/main/local-html-files');
const { isForbiddenTopLevelUrl } = require('../../src/main/top-level-url-policy');

const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const duplicateSource = source.match(/function duplicateTab\(id\) \{[\s\S]*?\n\}/)?.[0];

test('Duplicate Tab retains a granted local HTML URL, but cannot grant an arbitrary file URL', () => {
  assert.ok(duplicateSource);
  const tabs = new Map([
    ['granted', { url: 'file:///tmp/opened.html', localFile: true, private: false }],
    ['ungranted', { url: 'file:///tmp/typed.html', localFile: false, private: false }],
  ]);
  const created = [];
  const runtime = { tabOrder: ['granted', 'ungranted'] };
  const sandbox = {
    tabs, rt: () => runtime, sleepSnapshots: new Map(),
    liveContents: () => ({ navigationHistory: { getAllEntries: () => [], getActiveIndex: () => 0 } }),
    createTab: (url, options) => {
      const admitted = options.allowLocalFile && isSupportedLocalHtmlUrl(url);
      created.push(isForbiddenTopLevelUrl(url) && !admitted ? 'blanc://newtab/' : url);
      return String(created.length);
    },
    reorderTab: () => {},
  };
  vm.runInNewContext(`${duplicateSource}\nthis.duplicate = duplicateTab;`, sandbox);
  sandbox.duplicate('granted');
  sandbox.duplicate('ungranted');
  assert.deepEqual(created, ['file:///tmp/opened.html', 'blanc://newtab/']);
});

test('startup and named-workspace restore require an explicit persisted grant', () => {
  assert.match(source, /localFiles: entries\.map\(\(item\) => tabs\.get\(item\.id\)\?\.localFile === true\)/);
  assert.match(source, /localFile && restorableLocalHtmlUrl\(url\)/g);
  assert.match(source, /allowLocalFile: saved\.localFiles\?\.\[index\] === true/);
  assert.match(source, /allowLocalFile: cleaned\.localFiles\?\.\[index\] === true/);
  assert.match(source, /if \(!isSupportedLocalHtmlUrl\(url\)\) tab\.localFile = false/);
});
