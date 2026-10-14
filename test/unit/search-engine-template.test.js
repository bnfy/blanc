const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_TEMPLATE_LENGTH,
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
} = require('../../src/main/search-engine-template');

const SEARX = 'https://searx.example.org/search?q=%s';

test('accepts https addresses and http addresses on this computer or the home network', () => {
  const base = 'https://example.com/?q=%s';
  const longest = base.replace('?q=', `${'a'.repeat(MAX_TEMPLATE_LENGTH - base.length)}?q=`);
  assert.equal(longest.length, MAX_TEMPLATE_LENGTH);
  for (const template of [
    SEARX,
    'https://kagi.com/search?token=abc123&q=%s',
    'https://www.startpage.com/sp/search?query=%s',
    `  ${SEARX} \n`,
    'https://example.com/%s',
    'https://example.com/#q=%s',
    'https://example.com/search?q=%s&lang=en%20US',
    'http://localhost:8888/search?q=%s',
    'http://127.0.0.1:8080/search?q=%s',
    'http://[::1]:8888/search?q=%s',
    'http://192.168.1.5/search?q=%s',
    'http://10.0.0.2/search?q=%s',
    'http://100.101.102.103/search?q=%s',
    'http://searx/search?q=%s',
    'http://searx.local/search?q=%s',
    'http://searx.home.arpa/search?q=%s',
    longest,
  ]) {
    assert.equal(isValidSearchTemplate(template), true, template);
  }
});

test('refuses addresses that are malformed, ambiguous, or would leak the query', () => {
  for (const template of [
    '', '   ', null, undefined, 42, {},
    'https://example.com/search?q=',
    'https://example.com/search?q=%s&r=%s',
    'https://example.com/search?q=%S',
    'https://example.com/search?q={searchTerms}',
    'https://%s.example.com/',
    'https://ex%sample.com/',
    'https://example.com:%s/',
    'http://searx.example.org/search?q=%s',
    'http://8.8.8.8/search?q=%s',
    'http://[2606:4700::1111]/search?q=%s',
    'https://user:pass@example.com/search?q=%s',
    'https://%s@example.com/',
    'javascript:alert(1)//%s',
    'data:text/html,%s',
    'file:///tmp/%s',
    'blanc://newtab/?q=%s',
    'ftp://example.com/%s',
    'searx.example.org/search?q=%s',
    `https://example.com/?q=%s${'a'.repeat(MAX_TEMPLATE_LENGTH)}`,
  ]) {
    assert.equal(isValidSearchTemplate(template), false, String(template));
  }
});

test('builds the search address with the query encoded literally', () => {
  assert.equal(
    searchUrlFromTemplate(SEARX, 'how tall is everest'),
    'https://searx.example.org/search?q=how%20tall%20is%20everest',
  );
  assert.equal(
    searchUrlFromTemplate(SEARX, 'a&b=c#d?e/f'),
    'https://searx.example.org/search?q=a%26b%3Dc%23d%3Fe%2Ff',
  );
  // String.replace would expand $& and $1; a literal %s must not be re-filled.
  assert.equal(
    searchUrlFromTemplate(SEARX, '$& $1 %s'),
    'https://searx.example.org/search?q=%24%26%20%241%20%25s',
  );
  assert.equal(searchUrlFromTemplate(SEARX, 'café'), 'https://searx.example.org/search?q=caf%C3%A9');
  assert.equal(searchUrlFromTemplate(`  ${SEARX}  `, 'q'), 'https://searx.example.org/search?q=q');
  assert.equal(searchUrlFromTemplate('http://searx.example.org/?q=%s', 'q'), null);
});

test('names the engine by its server', () => {
  assert.equal(searchTemplateLabel('https://www.searx.example.org/search?q=%s'), 'searx.example.org');
  assert.equal(searchTemplateLabel('http://localhost:8888/search?q=%s'), 'localhost:8888');
  assert.equal(searchTemplateLabel('https://Example.COM:443/s?q=%s'), 'example.com');
  assert.equal(searchTemplateLabel('http://[::1]:8888/?q=%s'), '[::1]:8888');
  assert.equal(searchTemplateLabel('not an address'), '');
});

test('Custom can be selected only with a valid address, and refusals write nothing', () => {
  const fresh = { searchEngine: 'duckduckgo', searchEngineTemplate: '' };
  const custom = { searchEngine: 'custom', searchEngineTemplate: SEARX };
  const other = 'https://search.example.net/?q=%s';

  assert.deepEqual(reconcileSearchEngineWrite(fresh, {}), {});
  assert.deepEqual(reconcileSearchEngineWrite(fresh, { searchEngine: 'google' }), { searchEngine: 'google' });
  assert.deepEqual(reconcileSearchEngineWrite(fresh, { searchEngine: 'custom' }), {});
  assert.deepEqual(
    reconcileSearchEngineWrite(fresh, { searchEngine: 'custom', searchEngineTemplate: SEARX }),
    { searchEngine: 'custom', searchEngineTemplate: SEARX },
  );
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngineTemplate: other }), { searchEngineTemplate: other });
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngineTemplate: '' }), {});
  assert.deepEqual(
    reconcileSearchEngineWrite({ searchEngine: 'google', searchEngineTemplate: SEARX }, { searchEngineTemplate: '' }),
    { searchEngineTemplate: '' },
  );
  // Switching away keeps the stored address: it is not part of the write.
  assert.deepEqual(reconcileSearchEngineWrite(custom, { searchEngine: 'kagi' }), { searchEngine: 'kagi' });
  // An old profile has no stored address at all.
  assert.deepEqual(reconcileSearchEngineWrite({ searchEngine: 'bing' }, { searchEngine: 'custom' }), {});
});
