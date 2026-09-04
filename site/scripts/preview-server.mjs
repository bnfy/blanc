import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml' };
const contained = (root, file) => file === root || file.startsWith(root + path.sep);

// Local screenshot tooling only. Resolve both URL traversal and symlinks before
// opening, then inspect/read the same handle instead of checking another file.
export async function servePreview(directory) {
  const root = await fs.realpath(directory);
  const server = http.createServer(async (req, res) => {
    let handle;
    try {
      let pathname;
      try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
      catch { res.writeHead(400); res.end(); return; }
      if (pathname.includes('\0') || pathname.includes('\\')) {
        res.writeHead(400); res.end(); return;
      }
      const relative = pathname.replace(/^\/+/, '');
      let candidate = path.resolve(root, relative.endsWith('/') || !relative ? relative + 'index.html' : relative);
      if (!contained(root, candidate)) { res.writeHead(403); res.end(); return; }
      let file;
      try { file = await fs.realpath(candidate); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        file = await fs.realpath(candidate + '.html');
      }
      if (!contained(root, file)) { res.writeHead(403); res.end(); return; }
      handle = await fs.open(file, 'r');
      if (!(await handle.stat()).isFile()) { res.writeHead(404); res.end(); return; }
      const body = await handle.readFile();
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    } finally {
      await handle?.close();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}
