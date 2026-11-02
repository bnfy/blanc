'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

// Only for paths already resolved by a browser-owned asset allowlist. Do not
// send recovery UI back through net.fetch/file webRequest: a failed extension
// can leave that request pending and prevent its own Retry UI from loading.
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
async function internalFileResponse(filename) {
  try {
    return new Response(await fs.readFile(filename), { headers: {
      'content-type': TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    } });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return new Response('Not found', { status: 404 });
    throw error;
  }
}
module.exports = { internalFileResponse };
