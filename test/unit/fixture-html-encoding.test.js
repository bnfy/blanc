const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { escapeHtml, scriptJson } = require('../helpers/html-encoding');
const { start } = require('../desktop/support/fixtures-server');

test('fixture encoders preserve data without creating HTML or script boundaries', () => {
  const value = '</script><script>alert("x")</script>&\'';
  assert.equal(escapeHtml(value), '&lt;/script&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;');
  const encoded = scriptJson(value);
  assert.equal(encoded.includes('<'), false);
  assert.equal(JSON.parse(encoded), value);
  assert.equal(scriptJson(null), 'null');
});

test('actual HTTP fixture escapes request-derived title/body text and survives malformed encoding', async () => {
  const server = await start();
  const get = (suffix) => new Promise((resolve, reject) => {
    http.get(server.base + suffix, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  try {
    const body = await get('/site/' + encodeURIComponent('<img src=x onerror=alert(1)>'));
    assert.equal(body.includes('<img src=x'), false);
    assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(await get('/site/%zz'), /invalid path/);
  } finally {
    await server.close();
  }
});
