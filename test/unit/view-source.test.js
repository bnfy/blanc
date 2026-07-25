const assert = require('node:assert/strict');
const test = require('node:test');

const { VIEW_SOURCE_PREFIX, canViewSource } = require('../../src/main/view-source');

test('canViewSource: ordinary web pages qualify', () => {
  assert.equal(canViewSource('https://example.com/'), true);
  assert.equal(canViewSource('http://example.com/'), true);
  assert.equal(canViewSource('https://example.com/a/b?c=d#e'), true);
  assert.equal(canViewSource('http://127.0.0.1:8080/x'), true);
  assert.equal(canViewSource('http://localhost:3000/'), true);
});

// The http(s) restriction is a real boundary, not tidiness: a main-process
// `view-source:file:///…` navigation loads successfully, so admitting file:
// here would surface local files from any page Blanc opened off disk.
test('canViewSource: local and privileged schemes are refused', () => {
  assert.equal(canViewSource('file:///etc/passwd'), false);
  assert.equal(canViewSource('file:///Users/me/notes.html'), false);
  assert.equal(canViewSource('blanc://settings/'), false);
  assert.equal(canViewSource('blanc://newtab/'), false);
  assert.equal(canViewSource('blanc://newtab/?private=1'), false);
});

test('canViewSource: script-executing and opaque schemes are refused', () => {
  assert.equal(canViewSource('javascript:alert(1)'), false);
  assert.equal(canViewSource('data:text/html,<b>x'), false);
  assert.equal(canViewSource('vbscript:x'), false);
  assert.equal(canViewSource('about:blank'), false);
  assert.equal(canViewSource('mailto:a@b.c'), false);
});

test('canViewSource: cannot nest on an existing view-source page', () => {
  assert.equal(canViewSource('view-source:https://example.com/'), false);
  assert.equal(canViewSource(`${VIEW_SOURCE_PREFIX}http://127.0.0.1:8080/`), false);
});

test('canViewSource: unparseable input falls through to false', () => {
  assert.equal(canViewSource('not a url'), false);
  assert.equal(canViewSource('example.com'), false); // scheme-less, not yet normalized
  assert.equal(canViewSource(''), false);
  assert.equal(canViewSource(undefined), false);
  assert.equal(canViewSource(null), false);
});

test('VIEW_SOURCE_PREFIX composes a URL Chromium accepts', () => {
  assert.equal(VIEW_SOURCE_PREFIX, 'view-source:');
  assert.equal(
    `${VIEW_SOURCE_PREFIX}https://example.com/`,
    'view-source:https://example.com/'
  );
});
