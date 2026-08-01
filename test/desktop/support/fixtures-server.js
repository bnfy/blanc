// A tiny local HTTP server so tab URLs load reliably offline (no external
// network in tests). Any /site/<name> path returns a minimal page whose title
// is <name> and whose body contains the word "widget" three times (used by the
// find-in-page scenario when that step is implemented).
const http = require('node:http');

function start() {
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/download/acceptance.bin')) {
      const chunks = 12;
      const chunk = Buffer.alloc(32 * 1024, 0x61);
      let sent = 0;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="acceptance.bin"',
        'Content-Length': String(chunks * chunk.length),
      });
      const send = () => {
        if (res.destroyed) return;
        if (sent >= chunks) return res.end();
        sent += 1;
        res.write(chunk);
        setTimeout(send, 75);
      };
      send();
      return;
    }
    const requestUrl = new URL(req.url || '/', 'http://fixture.local');
    const name = decodeURIComponent(requestUrl.pathname.replace(/^\/site\//, '')) || 'page';
    const title = requestUrl.searchParams.get('title') || name;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body><h1>${name}</h1><p>widget widget widget</p>` +
      `<input id="acceptance-draft" aria-label="Unsaved draft">` +
      `<button id="acceptance-page-action" data-clicks="0" style="display:block;margin-top:260px">Page action</button>` +
      `<script>` +
      `const key='acceptance-load-count';` +
      `sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key)||0)+1));` +
      `document.getElementById('acceptance-page-action').addEventListener('click',(event)=>{event.currentTarget.dataset.clicks=String(Number(event.currentTarget.dataset.clicks||0)+1)});` +
      `</script></body></html>`
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start };
