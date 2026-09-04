const test = require('node:test');
const assert = require('node:assert/strict');

test('SEO internal links require exact origin, including protocol-relative links', async () => {
  const { internalPath } = await import('../../site/scripts/seo-url-utils.mjs');
  const origin = 'https://blancbrowser.com';
  for (const href of ['/about?q=1#x', origin + '/about', '//blancbrowser.com/about']) {
    assert.equal(internalPath(href, origin), '/about');
  }
  for (const href of [origin + '.evil.example/about', origin + '@evil.example/about', '//evil.example/about', 'http://blancbrowser.com/about', 'javascript:alert(1)', 'https://[bad']) {
    assert.equal(internalPath(href, origin), null, href);
  }
});

test('SEO attribute decoding does not recursively decode nested entities', async () => {
  const { decodeAttribute } = await import('../../site/scripts/seo-url-utils.mjs');
  assert.equal(decodeAttribute('&amp;quot;'), '&quot;');
  assert.equal(decodeAttribute('&amp;#39;'), '&#39;');
  assert.equal(decodeAttribute('a&amp;b&quot;c&#39;'), 'a&b"c\'');
});

test('Android copy escaping preserves literal backslashes before escaped quotes', async () => {
  const { xmlEsc } = await import('../../copy/string-escape.mjs');
  assert.equal(xmlEsc('\\'), '\\\\');
  assert.equal(xmlEsc('"'), '\\"');
  assert.equal(xmlEsc('\\"'), '\\\\\\"');
  assert.equal(xmlEsc('<a&b>'), '&lt;a&amp;b&gt;');
});
