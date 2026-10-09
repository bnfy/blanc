'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage, createTranslator,
} = require('../../src/renderer/pages/i18n');

const tr = (messages, extra = {}) => createTranslator({ locale: 'en', messages, ...extra });

test('plain text and placeholders', () => {
  const t = tr({ hello: 'Hi {name}, you have {count} new' });
  assert.equal(t('hello', { name: 'Ada', count: 3 }), 'Hi Ada, you have 3 new');
});

test('a missing placeholder value stays visible instead of vanishing', () => {
  assert.equal(tr({ a: 'Open {site}' })('a'), 'Open {site}');
});

test("'' is a literal apostrophe and a single ' stays as typed", () => {
  assert.equal(tr({ a: "Blanc''s tabs aren't lost" })('a'), "Blanc's tabs aren't lost");
});

test('English plural categories and # formatting', () => {
  const t = tr({ n: '{count, plural, one {# tab} other {# tabs}}' });
  assert.equal(t('n', { count: 1 }), '1 tab');
  assert.equal(t('n', { count: 2 }), '2 tabs');
  assert.equal(t('n', { count: 1200 }), '1,200 tabs');
});

test('German plural categories and German number formatting', () => {
  const t = createTranslator({ locale: 'de', formatLocale: 'de-DE',
    messages: { n: '{count, plural, one {# Tab} other {# Tabs}}' } });
  assert.equal(t('n', { count: 1 }), '1 Tab');
  assert.equal(t('n', { count: 1200 }), '1.200 Tabs');
});

test('an exact =0 branch wins over the category', () => {
  const t = tr({ n: '{count, plural, =0 {no tabs} one {# tab} other {# tabs}}' });
  assert.equal(t('n', { count: 0 }), 'no tabs');
});

test('tags render as plain text through t() and as parts through t.parts()', () => {
  const t = tr({ a: 'Turn on <0>Fill logins</0> in Settings' });
  assert.equal(t('a'), 'Turn on Fill logins in Settings');
  assert.deepEqual(t.parts('a'), [
    { text: 'Turn on ' }, { tag: 0, text: 'Fill logins' }, { text: ' in Settings' },
  ]);
});

test('fallback is used for keys the locale lacks, with English plural rules', () => {
  const t = createTranslator({ locale: 'de', messages: {},
    fallback: { n: '{count, plural, one {# tab} other {# tabs}}' } });
  assert.equal(t('n', { count: 1 }), '1 tab');
});

test('a missing key reports once and renders the key', () => {
  const missing = [];
  const t = tr({}, { onMissing: (key) => missing.push(key) });
  assert.equal(t('nope'), 'nope');
  assert.equal(t('nope'), 'nope');
  assert.deepEqual(missing, ['nope']);
});

test('onMissing may throw (strict test mode)', () => {
  const t = tr({}, { onMissing: (key) => { throw new Error(`missing ${key}`); } });
  assert.throws(() => t('nope'), /missing nope/);
});

test('syntax errors are rejected', () => {
  for (const bad of [
    'Unclosed {name', 'Stray } brace', '{n, plural, one {x}}', '{n, plural, other {a} other {b}}',
    '<0>open', '<0>a <1>b</1></0>', '<0>a</0> and <0>b</0>', '{n, select, a {x} other {y}}',
    '{a, plural, other {#}} {b, plural, other {#}}',
  ]) assert.throws(() => parseMessage(bad), SyntaxError, bad);
});

test('analyzeMessage reports args, plural selectors, tags and plural count', () => {
  assert.deepEqual(
    analyzeMessage(parseMessage('{host} has <0>{count, plural, =0 {none} one {# tab} other {# tabs}}</0>')),
    { args: ['count', 'host'], plurals: { count: ['=0', 'one', 'other'] }, tags: [0], pluralCount: 1 },
  );
});

test('maxLiteralLength counts literal text only, taking the longest branch', () => {
  assert.equal(maxLiteralLength(parseMessage('{count, plural, one {# tab} other {# tabs}}')), 5);
  assert.equal(maxLiteralLength(parseMessage('Open {site}')), 5);
});

test('stringifyMessage round-trips', () => {
  for (const s of [
    "Blanc''s {name}", '{count, plural, =0 {none} one {# tab} other {# tabs}}', 'A <0>b {c}</0> d',
  ]) assert.equal(stringifyMessage(parseMessage(s)), s);
});
