'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_TAB_NAME, normalizeTabName, displayTitle, resolveTabRename } = require('../../src/main/tab-name');

test('normalizeTabName trims and folds whitespace, including pasted line breaks', () => {
  assert.equal(normalizeTabName('  Cloudflare   DNS  '), 'Cloudflare DNS');
  assert.equal(normalizeTabName('Line one\nLine\ttwo\r\n'), 'Line one Line two');
  assert.equal(normalizeTabName('a  b'), 'a b');
});

test('normalizeTabName drops control characters without leaving double spaces', () => {
  assert.equal(normalizeTabName('a \u0001 b\u007f\u0085c'), 'a b c');
});

test('normalizeTabName returns null for empty, blank or non-string input', () => {
  for (const raw of ['', '   ', '\n\t', '\u0001', null, undefined, 42, {}, ['x']]) {
    assert.equal(normalizeTabName(raw), null, JSON.stringify(raw));
  }
});

test('normalizeTabName keeps at most 100 code points and never splits an emoji', () => {
  assert.equal(MAX_TAB_NAME, 100);
  assert.equal(normalizeTabName('x'.repeat(300)).length, 100);
  const name = normalizeTabName(`${'x'.repeat(99)}😀tail`);
  assert.equal(Array.from(name).length, 100);
  assert.ok(name.endsWith('😀'));
  // A cut that lands after a space must not leave it dangling.
  assert.equal(normalizeTabName(`${'x'.repeat(99)} yz`), 'x'.repeat(99));
});

test('displayTitle prefers the custom name, then the page title', () => {
  assert.equal(displayTitle({ customTitle: 'Budget', title: 'Sheets' }), 'Budget');
  assert.equal(displayTitle({ customTitle: null, title: 'Sheets' }), 'Sheets');
  assert.equal(displayTitle({ customTitle: '', title: 'Sheets' }), 'Sheets');
  assert.equal(displayTitle({}), '');
  assert.equal(displayTitle(null), '');
});

test('resolveTabRename sets, changes and clears a name', () => {
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: null }, ' Budget '), 'Budget');
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Q4'), 'Q4');
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, ''), null);
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, null), null);
});

test('resolveTabRename changes nothing for an unchanged name or the untouched prefill', () => {
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Budget'), undefined);
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: null }, ''), undefined);
  // Enter on the prefilled page title must not freeze it as a name.
  assert.equal(resolveTabRename({ title: 'DNS  |  Records', customTitle: null }, 'DNS | Records'), undefined);
  // A renamed tab may deliberately take its page title's text as its name.
  assert.equal(resolveTabRename({ title: 'Sheets', customTitle: 'Budget' }, 'Sheets'), 'Sheets');
});
