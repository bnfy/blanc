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

// The display-capture helper loads in a never-shown BrowserWindow and has no
// user-visible text (its strings are internal signals and DOMException
// messages returned to web pages). It is out of localization scope, and it is
// pinned by src/main/capture-runtime-lock.json, so it must stay untouched.
const DEFERRED = new Set(['display-capture-helper.html']);

test('the never-shown capture helper does not load the interface catalog', () => {
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

test('standalone formatting sites pass the runtime formatting locale', () => {
  const sites = {
    'overlay.js': 2, 'pages/newtab.js': 4, 'pages/error.js': 1, 'pages/bookmarks.js': 1,
    'pages/settings-sync-setup-model.js': 1, 'pages/settings.js': 1, 'pages/mahjong.js': 3,
  };
  for (const [rel, count] of Object.entries(sites)) {
    const js = fs.readFileSync(path.join(renderer, rel), 'utf8');
    const found = (js.match(/formatLocale\??\.?\(\)/g) ?? []).length;
    assert.ok(found >= count, `${rel}: expected ${count} formatting-locale uses, found ${found}`);
    assert.doesNotMatch(js, /toLocaleDateString\(\)|Intl\.(DateTimeFormat|NumberFormat)\(undefined|Intl\.NumberFormat\(\)/, rel);
  }
});
