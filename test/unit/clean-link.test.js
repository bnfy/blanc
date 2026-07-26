const assert = require('node:assert/strict');
const test = require('node:test');

const { cleanLink } = require('../../src/main/clean-link');

test('cleanLink: strips utm_* by prefix, case-insensitively', () => {
  assert.equal(
    cleanLink('https://ex.com/p?utm_source=nl&a=1&UTM_Campaign=x&b=2'),
    'https://ex.com/p?a=1&b=2'
  );
});

test('cleanLink: strips each exact tracking parameter, case-insensitively', () => {
  const names = ['fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid',
    'ttclid', 'twclid', 'igshid', 'yclid', 'mc_eid', '_openstat', 'vero_id', 's_cid'];
  for (const name of names) {
    assert.equal(cleanLink(`https://ex.com/?${name}=abc&keep=1`), 'https://ex.com/?keep=1', name);
    assert.equal(cleanLink(`https://ex.com/?${name.toUpperCase()}=abc&keep=1`), 'https://ex.com/?keep=1', name);
  }
});

test('cleanLink: non-tracking params keep original order and original encoding', () => {
  // %20, +, and a double-encoded value must survive byte-for-byte —
  // URLSearchParams round-tripping would rewrite them.
  assert.equal(
    cleanLink('https://ex.com/s?q=a%20b&fbclid=x&r=c+d&sig=ab%252Fcd'),
    'https://ex.com/s?q=a%20b&r=c+d&sig=ab%252Fcd'
  );
});

test('cleanLink: fragment is untouched, even one containing a question mark', () => {
  assert.equal(
    cleanLink('https://ex.com/p?utm_source=x&a=1#sect?utm_source=keepme'),
    'https://ex.com/p?a=1#sect?utm_source=keepme'
  );
});

test('cleanLink: trailing bare "?" dropped when stripping empties the query', () => {
  assert.equal(cleanLink('https://ex.com/p?utm_source=x'), 'https://ex.com/p');
  assert.equal(cleanLink('https://ex.com/p?utm_source=x#frag'), 'https://ex.com/p#frag');
});

test('cleanLink: URL with no query returned unchanged (trimmed)', () => {
  assert.equal(cleanLink('  https://ex.com/path#frag  '), 'https://ex.com/path#frag');
  assert.equal(cleanLink('https://ex.com/'), 'https://ex.com/');
});

test('cleanLink: null for anything that is not an http(s) URL', () => {
  assert.equal(cleanLink('how tall is everest'), null);       // search query
  assert.equal(cleanLink('example.com/no-scheme'), null);     // scheme-less
  assert.equal(cleanLink('blanc://settings/'), null);
  assert.equal(cleanLink('file:///Users/x/notes.html'), null);
  assert.equal(cleanLink('view-source:https://ex.com/'), null);
  assert.equal(cleanLink(''), null);
  assert.equal(cleanLink(undefined), null);
});

test('cleanLink: valueless and empty-valued params are preserved when non-tracking', () => {
  assert.equal(cleanLink('https://ex.com/?flag&utm_source=x&empty='), 'https://ex.com/?flag&empty=');
});
