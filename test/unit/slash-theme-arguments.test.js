'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// /theme accepts only these words (chrome:cycle-theme in main.js); any other
// argument is a silent no-op. Every language must show them untranslated.
const ARGUMENTS = ['system', 'light', 'dark'];
const root = path.join(__dirname, '../..');

test('chrome:cycle-theme accepts exactly the documented /theme arguments', () => {
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.match(main, /chromeHandle\('chrome:cycle-theme'[\s\S]{0,200}const order = \['system', 'light', 'dark'\];/);
});

test('every language keeps the /theme arguments in English', () => {
  const dir = path.join(root, 'copy/messages');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const key of ['slash.theme.hint', 'slash.theme.doc']) {
      for (const word of ARGUMENTS) {
        assert.match(catalog[key].message, new RegExp(`\\b${word}\\b`), `${file} ${key} must contain "${word}"`);
      }
    }
  }
});
