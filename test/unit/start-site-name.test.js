'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/start-site-name.js'), 'utf8');
const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const { shortSiteName, shortLabel } = sandbox.blancStartSiteName;

test('the page script exposes the short-name helpers', () => {
  assert.equal(typeof shortSiteName, 'function');
  assert.equal(typeof shortLabel, 'function');
});

test('a short first title segment names the site', () => {
  assert.equal(shortSiteName('YouTube – videos worth watching', 'https://www.youtube.com/'), 'YouTube');
  assert.equal(shortSiteName('Nintendo – Official Site', 'https://www.nintendo.com/'), 'Nintendo');
  assert.equal(shortSiteName('Inbox | Fastmail', 'https://app.fastmail.com/'), 'Inbox');
  assert.equal(shortSiteName('Docs · Blanc', 'https://blancbrowser.com/docs'), 'Docs');
  assert.equal(shortSiteName('Scroll — creative work', 'https://scroll.example/'), 'Scroll');
  assert.equal(shortSiteName('Scroll - creative work', 'https://scroll.example/'), 'Scroll');
  assert.equal(shortSiteName('The New York Times - Breaking News, US News', 'https://www.nytimes.com/'), 'The New York Times');
});

test('a short title without a separator is used whole', () => {
  assert.equal(shortSiteName('MDN Web Docs', 'https://developer.mozilla.org/'), 'MDN Web Docs');
  assert.equal(shortSiteName('  GitHub  ', 'https://github.com/'), 'GitHub');
});

test('the first separator wins, and hyphenated words are not separators', () => {
  assert.equal(shortSiteName('Read-only mode | Example – Docs', 'https://example.com/'), 'Read-only mode');
});

test('a long or empty first segment falls back to the domain label', () => {
  assert.equal(shortSiteName('Breaking News, US News, World News and Videos', 'https://www.nytimes.com/'), 'nytimes');
  assert.equal(shortSiteName('', 'https://news.bbc.co.uk/'), 'bbc');
  assert.equal(shortSiteName(' – leading separator', 'https://developer.mozilla.org/'), 'mozilla');
});

test('the domain label drops the TLD and a short second-level suffix', () => {
  assert.equal(shortLabel('https://github.com/'), 'github');
  assert.equal(shortLabel('https://developer.mozilla.org/'), 'mozilla');
  assert.equal(shortLabel('https://www.bbc.co.uk/'), 'bbc');
  assert.equal(shortLabel('not a url', 'Hello world'), 'hello');
  assert.equal(shortLabel('not a url', ''), '·');
});
