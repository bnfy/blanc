'use strict';

// A div or span has the generic role, which may not carry an accessible name:
// screen readers treat the label inconsistently, and Chromium's debug builds
// stop on it in web UI (the Android lane's Mahjong page hit that DCHECK on
// Chrome 159). Every labelled div or span in Blanc's own documents names a role.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../src/renderer');

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(file);
    return entry.name.endsWith('.html') ? [file] : [];
  });
}

test('labelled divs and spans in Blanc documents name a role', () => {
  const offenders = [];
  for (const file of htmlFiles(ROOT)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<(div|span)\b[^>]*>/g)) {
      const tag = match[0];
      if (/\saria-label(ledby)?=/.test(tag) && !/\srole=/.test(tag)) {
        const line = html.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the Start Page draws its shortcut key as a named image', () => {
  const source = fs.readFileSync(path.join(ROOT, 'pages/newtab.js'), 'utf8');
  assert.match(source, /key\.setAttribute\('role', 'img'\);\n\s*key\.setAttribute\('aria-label'/);
});
