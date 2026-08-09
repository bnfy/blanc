// A tiny local HTTP server so tab URLs load reliably offline (no external
// network in tests). Any /site/<name> path returns a minimal page whose title
// is <name> and whose body contains the word "widget" three times (used by the
// find-in-page scenario when that step is implemented).
const http = require('node:http');
const https = require('node:https');

function pageBody(req) {
  const raw = req.url || '/';
  const name = decodeURIComponent(raw.replace(/^\/site\//, '').split('?')[0]) || 'page';
  // ?nostore=1 makes an otherwise ordinary fixture quietable. The default
  // remains deliberately dirty because all existing scenarios depend on its
  // sessionStorage load counter.
  const store = raw.includes('nostore=1')
    ? ''
    : `<script>` +
      `const key='acceptance-load-count';` +
      `sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key)||0)+1));` +
      `</script>`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head>` +
    `<body><h1>${name}</h1><p>widget widget widget</p>` +
    `<input id="acceptance-draft" aria-label="Unsaved draft">` +
    `<input id="acceptance-check" type="checkbox" aria-label="Unsaved checkbox">` +
    `<form id="acceptance-post" method="post"><button type="submit">Post</button></form>` +
    `<div id="acceptance-tall" style="height:5000px"></div>` +
    store +
    `</body></html>`
  );
}

function start() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://fixture.invalid');
    if (url.searchParams.has('redirect-start')) {
      url.searchParams.delete('redirect-start');
      url.searchParams.set('redirected', '1');
      res.writeHead(302, { Location: `${url.pathname}?${url.searchParams}` });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageBody(req));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/** The same fixture pages over TLS, for the F12-8 'Uses HTTPS' assertion.
 * The caller supplies a throwaway self-signed cert; the harness pins exactly
 * that cert's SPKI hash at launch, so nothing else gains trust. */
function startSecure({ key, cert }) {
  const server = https.createServer({ key, cert }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageBody(req));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start, startSecure };
