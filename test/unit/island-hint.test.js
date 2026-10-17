'use strict';
// The ⌘L panel's hint line keeps only the private-tab note and the site-info
// notes (spec 2026-10-16-island-lower-section-design.md §8).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the resting hint is only the private-tab note; a typed bang has its own', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.doesNotMatch(overlay, /hint\.default/);
  assert.doesNotMatch(overlay, /hint\.groups/);
  assert.match(overlay, /islandHint\.textContent = bang\s*\? blancI18n\.t\('hint\.bang'\)\s*: activeTab\(\)\?\.private \? blancI18n\.t\('hint\.private'\) : '';/);
});

test('the hint reads at full strength and takes no space when empty', () => {
  const styles = read('src/renderer/styles.css');
  const rule = styles.match(/^#islandHint \{([^}]*)\}/m)?.[1] ?? '';
  assert.ok(rule, '#islandHint rule exists');
  assert.doesNotMatch(rule, /opacity/);
  assert.match(rule, /font-size:\s*11\.5px;/);
  assert.match(styles, /^#islandHint:empty \{\s*display:\s*none;\s*\}/m);
});

test('the retired hints are gone from every language', () => {
  for (const locale of ['en', 'de', 'es', 'fr', 'pt-BR', 'it']) {
    const messages = JSON.parse(read(`copy/messages/${locale}.json`));
    assert.equal('hint.default' in messages, false, `${locale} hint.default`);
    assert.equal('hint.groups' in messages, false, `${locale} hint.groups`);
  }
});
