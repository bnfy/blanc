'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  hasHtmlExtension,
  isSupportedLocalHtmlUrl,
  localHtmlUrlFromPath,
} = require('../../src/main/local-html-files');

test('declared HTML and XHTML extensions are accepted case-insensitively', () => {
  for (const name of ['page.htm', 'page.html', 'page.xht', 'page.xhtm', 'page.xhtml', 'PAGE.HTML']) {
    assert.equal(hasHtmlExtension(name), true, name);
  }
  for (const name of ['page.txt', 'page.svg', 'page.html.txt', '', null]) {
    assert.equal(hasHtmlExtension(name), false, String(name));
  }
});

test('macOS document paths must be absolute existing regular HTML files', () => {
  const target = path.resolve('/tmp/blanc local page.html');
  const deps = {
    realpath: (value) => value,
    stat: () => ({ isFile: () => true }),
  };
  assert.equal(localHtmlUrlFromPath(target, deps), pathToFileURL(target).href);
  assert.equal(localHtmlUrlFromPath('relative.html', deps), null);
  assert.equal(localHtmlUrlFromPath('/tmp/not-html.txt', deps), null);
  assert.equal(localHtmlUrlFromPath('/tmp/missing.html', {
    ...deps,
    realpath: () => { throw new Error('ENOENT'); },
  }), null);
  assert.equal(localHtmlUrlFromPath('/tmp/folder.html', {
    ...deps,
    stat: () => ({ isFile: () => false }),
  }), null);
});

test('createTab defense admits only local HTML file URLs', () => {
  assert.equal(isSupportedLocalHtmlUrl('file:///tmp/page.html'), true);
  assert.equal(isSupportedLocalHtmlUrl('file://localhost/tmp/page.xhtml'), true);
  for (const value of [
    'file:///tmp/page.txt',
    'file://remote-host/tmp/page.html',
    'https://example.com/page.html',
    'data:text/html,hello',
    'not a URL',
  ]) assert.equal(isSupportedLocalHtmlUrl(value), false, value);
});
