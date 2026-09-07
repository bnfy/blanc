'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const renderers = [
  ['island', read('src/renderer/renderer.js')],
  ['overlay', read('src/renderer/overlay.js')],
  ['vertical rail', read('src/renderer/vertical-tabs.js')],
];

function fallbackFunction(source) {
  const body = source.match(/function faviconFallbackLabel\(tab\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(body, 'faviconFallbackLabel must remain liftable');
  const sandbox = { URL };
  vm.runInNewContext(`${body}\nthis.fallback = faviconFallbackLabel;`, sandbox);
  return sandbox.fallback;
}

test('every tab surface derives the same domain initial when pixels are unavailable', () => {
  for (const [name, source] of renderers) {
    const fallback = fallbackFunction(source);
    assert.equal(fallback({ url: 'https://www.nfl.com/news' }), 'N', name);
    assert.equal(fallback({ url: 'not a url' }), '•', name);
    assert.match(source, /classList\.add\('fallback'\)/, `${name} must paint the fallback`);
  }
});

test('fallback identity is styled in ordinary slots and island dot peeks', () => {
  const styles = read('src/renderer/styles.css');
  assert.match(styles, /\.favicon\.fallback\s*\{/);
  assert.match(styles, /\.dot-peek\.fallback\s*\{/);
});
