const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

test('screenshot preview confines requests to its root and listens only on loopback', async () => {
  const { servePreview } = await import('../../site/scripts/preview-server.mjs');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-preview-test-'));
  const root = path.join(temp, 'public');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'index.html'), 'homepage');
  await fs.writeFile(path.join(root, 'about.html'), 'about');
  await fs.writeFile(path.join(temp, 'private.txt'), 'must not be served');
  await fs.symlink(path.join(temp, 'private.txt'), path.join(root, 'escape.txt'));
  const server = await servePreview(root);
  const request = (url) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: url }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
  try {
    assert.equal(server.address().address, '127.0.0.1');
    assert.deepEqual(await request('/'), { status: 200, body: 'homepage' });
    assert.deepEqual(await request('/about?test=1'), { status: 200, body: 'about' });
    for (const url of ['/../private.txt', '/%2e%2e/private.txt', '/escape.txt']) {
      assert.equal((await request(url)).status, 403, url);
    }
    for (const url of ['/%zz', '/%00', '/..%5cprivate.txt']) {
      assert.equal((await request(url)).status, 400, url);
    }
    assert.equal((await request('/missing')).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
});
