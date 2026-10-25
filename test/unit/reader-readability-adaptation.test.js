'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { adaptReadability } = require('../../src/main/reader-readability-adaptation');
const upstream = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
const adapted = adaptReadability(upstream);
const context = { URL };
vm.runInNewContext(`${adapted}\nthis.readerPrototype = Readability.prototype;`, context);
const prototype = context.readerPrototype;

test('Readability recognizes complete article types without prefix/suffix matches', () => {
  const types = prototype.REGEXPS.jsonLdArticleTypes;
  for (const type of ['Article', 'NewsArticle', 'BlogPosting', 'APIReference']) assert.equal(types.test(type), true, type);
  for (const type of ['ArticleSuffix', 'prefixNewsArticle', 'NewsArticleSuffix', 'prefixAPIReference', 'Other']) assert.equal(types.test(type), false, type);
});

function resolveLink(href) {
  let replacement = null;
  const link = {
    childNodes: [{ nodeType: 3 }], textContent: 'Keep the article link text',
    getAttribute: () => href, setAttribute: (_name, value) => { href = value; },
    parentNode: { replaceChild: value => { replacement = value; } },
  };
  const reader = Object.create(prototype);
  reader._doc = { baseURI: 'https://publisher.example/article', documentURI: 'https://publisher.example/article',
    createTextNode: text => ({ text }) };
  reader._getAllNodesWithTag = (_article, tags) => tags.includes('a') ? [link] : [];
  reader._fixRelativeUris({});
  return { href, replacement };
}

test('Readability retains resolved HTTP(S) and fragment links', () => {
  for (const [input, expected] of [['/next', 'https://publisher.example/next'], ['#footnote', '#footnote'],
    ['https://other.example/story', 'https://other.example/story'], ['http://other.example/story', 'http://other.example/story']]) {
    const result = resolveLink(input);
    assert.equal(result.href, expected); assert.equal(result.replacement, null);
  }
});

test('Readability removes every other scheme while retaining link text', () => {
  for (const input of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\nscript:alert(1)',
    'data:text/html,unsafe', 'vbscript:unsafe', 'file:///tmp/private', 'mailto:user@example.com', 'blob:https://publisher.example/id']) {
    assert.equal(resolveLink(input).replacement?.text, 'Keep the article link text', input);
  }
});

test('Readability adaptation refuses upstream drift rather than silently skipping a fix', () => {
  assert.throws(() => adaptReadability(upstream.replace('APIReference$/', 'APIReference|Other$/')), /input changed/);
  assert.throws(() => adaptReadability(adapted), /input changed/);
});
