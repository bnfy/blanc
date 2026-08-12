'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isForbiddenTopLevelUrl,
  normalizeHomepage,
} = require('../../src/main/top-level-url-policy');

test('active and local top-level schemes fail closed', () => {
  for (const url of [
    'blanc-chrome://index/',
    'file:///etc/passwd',
    'data:text/html,hello',
    'javascript:alert(1)',
    'vbscript:msgbox(1)',
  ]) assert.equal(isForbiddenTopLevelUrl(url), true, url);

  for (const url of ['https://example.com/', 'http://localhost/', 'blanc://newtab/']) {
    assert.equal(isForbiddenTopLevelUrl(url), false, url);
  }
});

test('homepage accepts only web URLs and the exact start-page surface', () => {
  assert.equal(normalizeHomepage(''), '');
  assert.equal(normalizeHomepage('https://example.com/a'), 'https://example.com/a');
  assert.equal(normalizeHomepage('http://localhost:3000'), 'http://localhost:3000/');
  assert.equal(normalizeHomepage('blanc://newtab/'), 'blanc://newtab/');
  for (const value of [
    'file:///tmp/start.html',
    'data:text/html,hello',
    'javascript:alert(1)',
    'blanc://settings/',
    'not a URL',
  ]) assert.equal(normalizeHomepage(value), 'blanc://newtab/', value);
});
