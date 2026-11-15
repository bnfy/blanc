'use strict';

// The error page names its tab after the site that failed, so several failed
// tabs can be told apart in the tab list (they all used to read "Page failed
// to load").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/error.js'), 'utf8');
const STATIC_TITLE = 'Page failed to load';

function titleFor(query) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, hidden: false, textContent: '', href: '', dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, append() {}, appendChild() {}, after() {}, before() {}, replaceWith() {},
        setAttribute() {}, focus() {},
      });
    }
    return elements.get(id);
  };
  const document = {
    title: STATIC_TITLE,
    getElementById: element,
    querySelector: () => null,
    createElement: () => element(`created-${elements.size}`),
    addEventListener() {},
  };
  const sandbox = {
    URL, URLSearchParams,
    location: { href: `blanc://error/?${query}` },
    blancI18n: { t: (key) => `[${key}]`, formatLocale: () => 'en' },
    document,
    window: {},
  };
  vm.runInNewContext(SOURCE, sandbox);
  return document.title;
}

const query = (params) => new URLSearchParams(params).toString();

test('a failed page is titled with the site that failed', () => {
  assert.equal(titleFor(query({ url: 'https://example.com/some/page', code: '-105', desc: 'ERR_NAME_NOT_RESOLVED' })), 'example.com');
  assert.equal(titleFor(query({ url: 'https://www.example.com/', code: '-106' })), 'example.com');
  assert.equal(titleFor(query({ url: 'http://127.0.0.1:9/', code: '-312' })), '127.0.0.1:9');
});

test('a certificate warning and a crashed page are titled with their site too', () => {
  assert.equal(titleFor(query({ kind: 'certificate', url: 'https://expired.example.org/', certMessage: 'expired' })), 'expired.example.org');
  assert.equal(titleFor(query({ url: 'https://app.example.net/board', code: 'crashed', desc: 'crashed' })), 'app.example.net');
});

test('with no site to name, the page keeps its general title', () => {
  assert.equal(titleFor(query({ code: '-3' })), STATIC_TITLE);
  assert.equal(titleFor(query({ url: 'not a url', code: '-3' })), STATIC_TITLE);
  assert.equal(titleFor(query({ url: 'file:///tmp/page.html', code: 'local-file' })), STATIC_TITLE);
});

test('an inert page keeps the title it was saved with', () => {
  assert.equal(titleFor(query({ kind: 'inert', url: 'https://example.com/a', title: 'A saved page' })), 'A saved page');
});
