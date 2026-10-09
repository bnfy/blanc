'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = path.resolve(__dirname, '../../src/renderer');
const documents = [
  ...fs.readdirSync(renderer).filter((f) => f.endsWith('.html')).map((f) => path.join(renderer, f)),
  ...fs.readdirSync(path.join(renderer, 'pages')).filter((f) => f.endsWith('.html')).map((f) => path.join(renderer, 'pages', f)),
];

test('every chrome and internal document exists in the expected count', () => {
  assert.equal(documents.length, 15, documents.join('\n'));
});

// The display-capture helper is pinned by src/main/capture-runtime-lock.json
// and validated per platform; it joins in phase 2 together with its strings
// and the broker's locale. Until then it must stay untouched.
const DEFERRED = new Set(['display-capture-helper.html']);

test('the capture helper stays deferred until phase 2', () => {
  const html = fs.readFileSync(path.join(renderer, 'display-capture-helper.html'), 'utf8');
  assert.doesNotMatch(html, /strings\.js|i18n\.js/);
});

for (const file of documents.filter((f) => !DEFERRED.has(path.relative(renderer, f)))) {
  test(`${path.relative(renderer, file)} loads strings.js then i18n.js before any other script`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts.slice(0, 2), ['strings.js', 'i18n.js']);
    assert.ok(head.includes('<script src="strings.js"></script>'), 'in <head>');
    assert.match(html, /<html lang="en">/, 'source keeps lang="en"; i18n.js sets the runtime language');
  });
}
