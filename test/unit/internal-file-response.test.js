'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { internalFileResponse } = require('../../src/main/internal-file-response');

test('internal recovery files have explicit MIME types and intact bytes without a network client', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-internal-response-'));
  try {
    for (const [ext, type] of [['html', 'text/html'], ['js', 'text/javascript'], ['css', 'text/css'], ['png', 'image/png'], ['woff2', 'font/woff2']]) {
      const file = path.join(root, `asset.${ext}`);
      const bytes = Buffer.from([0, 1, 128, 255]);
      await fs.writeFile(file, bytes);
      const response = await internalFileResponse(file);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type').split(';')[0], type);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    assert.equal((await internalFileResponse(path.join(root, 'missing.js'))).status, 404);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
