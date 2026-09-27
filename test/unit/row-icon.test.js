'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fallbackLetter, rowIcon } = require('../../src/renderer/pages/row-icon');

test('the fallback letter matches the Island: first letter of the host without www', () => {
  assert.equal(fallbackLetter('https://www.github.com/bnfy'), 'G');
  assert.equal(fallbackLetter('https://Example.org/'), 'E');
  assert.equal(fallbackLetter('https://ñandú.example/'), 'X'); // punycode host, as in the Island
  assert.equal(fallbackLetter('not a url'), '•');
});

function fakeDocument() {
  const make = (tag) => {
    const el = {
      tag, className: '', textContent: '', children: [], attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      append(child) { this.children.push(child); },
    };
    el.classList = { add(name) { el.className = `${el.className} ${name}`.trim(); } };
    return el;
  };
  return { createElement: make };
}

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('a stored PNG favicon renders as a decorative image', () => {
  const el = rowIcon(fakeDocument(), 'https://github.com/', PNG);
  assert.equal(el.className, 'row-icon');
  assert.equal(el.attributes['aria-hidden'], 'true');
  assert.equal(el.children[0].tag, 'img');
  assert.equal(el.children[0].src, PNG);
  assert.equal(el.children[0].alt, '');
});

test('anything that is not a PNG data URL falls back to the letter tile', () => {
  for (const favicon of [null, '', 'https://github.com/favicon.ico', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const el = rowIcon(fakeDocument(), 'https://github.com/', favicon);
    assert.equal(el.className, 'row-icon fallback');
    assert.equal(el.textContent, 'G');
    assert.equal(el.children.length, 0);
  }
});
