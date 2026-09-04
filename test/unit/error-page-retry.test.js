const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/error.js'), 'utf8');
function render(target) {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', href: 'blanc://newtab/' });
    return elements.get(id);
  } };
  vm.runInNewContext(source, {
    URL, document,
    location: { href: 'blanc://error/?' + new URLSearchParams({ url: target, desc: '<img src=x onerror=alert(1)>', code: '-1' }) },
  });
  return document.getElementById('retryLink');
}

test('error retry rejects executable and malformed scheme prefixes', () => {
  for (const target of [
    'javascript:alert(1)', 'JaVaScRiPt://alert(1)', 'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)', '//example.com', '\nhttps://example.com',
    'https:\\example.com', 'https:%2f%2fexample.com', 'java\nscript:alert(1)',
    'blanc://settings', 'httpsjavascript://example.com',
  ]) assert.equal(render(target).href, 'blanc://newtab/', target);
});

test('error retry preserves ordinary web and local-file destinations', () => {
  for (const target of ['https://example.com/path?q=1', 'http://example.com/', 'file:///tmp/example.html', 'HTTPS://example.com/']) {
    assert.equal(render(target).href, target);
  }
});
