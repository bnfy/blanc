'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const {
  hasHtmlExtension,
  isSupportedLocalHtmlUrl,
  localHtmlUrlFromPath,
  restorableLocalHtmlUrl,
} = require('../../src/main/local-html-files');

test('declared HTML and XHTML extensions are accepted case-insensitively', () => {
  for (const name of ['page.htm', 'page.html', 'page.xht', 'page.xhtm', 'page.xhtml', 'PAGE.HTML']) {
    assert.equal(hasHtmlExtension(name), true, name);
  }
  for (const name of ['page.txt', 'page.svg', 'page.html.txt', '', null]) {
    assert.equal(hasHtmlExtension(name), false, String(name));
  }
});

test('a saved local document must still be the same canonical HTML file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-restore-html-'));
  const file = path.join(dir, 'opened.html');
  const alias = path.join(dir, 'alias.html');
  try {
    fs.writeFileSync(file, '<title>Opened</title>');
    fs.symlinkSync(file, alias);
    const canonical = pathToFileURL(fs.realpathSync(file)).href;
    assert.equal(restorableLocalHtmlUrl(canonical), canonical);
    assert.equal(restorableLocalHtmlUrl(pathToFileURL(alias).href), null);
    assert.equal(restorableLocalHtmlUrl('file:///etc/passwd'), null);
    assert.equal(restorableLocalHtmlUrl('file:///tmp/missing.html'), null);
    fs.unlinkSync(file);
    assert.equal(restorableLocalHtmlUrl(canonical), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
