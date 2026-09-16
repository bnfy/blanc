// A tiny local HTTP server so tab URLs load reliably offline (no external
// network in tests). Any /site/<name> path returns a minimal page whose title
// is <name> and whose body contains the word "widget" three times (used by the
// find-in-page scenario when that step is implemented).
const http = require('node:http');
const https = require('node:https');
const { escapeHtml } = require('../../helpers/html-encoding');

function pageBody(req) {
  const raw = req.url || '/';
  // Escape the request-derived fixture name server-side so a probe URL cannot
  // inject markup into the served page (CodeQL: reflected request content).
  let name;
  try { name = decodeURIComponent(raw.replace(/^\/site\//, '').split('?')[0]) || 'page'; }
  catch { name = 'invalid path'; }
  name = escapeHtml(name);
  // Some history/wake scenarios suppress the load counter so pageState stays
  // deterministic. Ordinary site-owned sessionStorage is not unsaved user
  // work and therefore does not prevent this page from becoming quiet.
  const store = raw.includes('nostore=1')
    ? ''
    : `<script>` +
      `const key='acceptance-load-count';` +
      `sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key)||0)+1));` +
      `</script>`;
  // 1Password ambient-hint fixtures (F38): a login form variant selected by
  // ?loginform= — authoritative hints, contradicted/invisible must not.
  const loginVariant = /[?&]loginform=([a-z]+)/.exec(raw)?.[1];
  const loginForm = loginVariant === 'authoritative'
    ? '<form><input type="text" autocomplete="username"><input type="password" autocomplete="current-password"></form>'
    : loginVariant === 'contradicted'
      ? '<form><input type="password" autocomplete="current-password new-password"></form>'
      : loginVariant === 'invisible'
        ? '<form><input type="password" autocomplete="current-password" style="opacity:0"></form>'
        : '';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head>` +
    `<body><h1>${name}</h1><p>widget widget widget</p>` +
    loginForm +
    `<input id="acceptance-draft" aria-label="Unsaved draft">` +
    `<input id="acceptance-check" type="checkbox" aria-label="Unsaved checkbox">` +
    `<form id="acceptance-post" method="post"><button type="submit">Post</button></form>` +
    `<div id="acceptance-tall" style="height:5000px"></div>` +
    store +
    `</body></html>`
  );
}

function workspaceResponse(req, res) {
  if (req.url === '/workspace-auth') {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Workspace fixture"' });
    res.end('Authentication required');
    return true;
  }
  if (req.url === '/workspace-download') {
    res.writeHead(200, { 'Content-Disposition': 'attachment; filename="workspace-fixture.txt"' });
    res.end('Disposable workspace download fixture');
    return true;
  }
  return false;
}
// HTTP authentication fixtures (F20). A fixed test credential exists only so
// the routes can prove that Blanc never supplies one: the app must let the
// 401/407 reach the page instead of opening its own credentials dialog.
const AUTH_ACCEPTED = `Basic ${Buffer.from('user:pass').toString('base64')}`;

function challenge(res, path, { proxy = false } = {}) {
  res.writeHead(proxy ? 407 : 401, {
    [proxy ? 'Proxy-Authenticate' : 'WWW-Authenticate']: `Basic realm="${path}"`,
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(`${proxy ? 407 : 401} body for ${path}`);
}

function authProbePage(host) {
  // insecure.test resolves to this same server (harness --host-resolver-rules),
  // so it is a genuinely different origin without a second listener.
  const crossOrigin = `http://insecure.test:${host.split(':')[1]}`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>auth-probe</title></head>` +
    `<body><h1>auth-probe</h1>` +
    `<img id="same-img" src="/auth/protected.png" alt="">` +
    `<img id="cross-img" src="${crossOrigin}/auth/protected.png" alt="">` +
    `<script>` +
    `window.__authResults = {};` +
    `const imgDone = (id) => new Promise((resolve) => { const i = document.getElementById(id); i.onload = () => resolve({ loaded: true }); i.onerror = () => resolve({ loaded: false }); if (i.complete) resolve({ loaded: i.naturalWidth > 0 }); });` +
    `Promise.all([` +
    `fetch('/auth/api').then((r) => r.text().then((body) => ({ status: r.status, wwwAuthenticate: r.headers.get('www-authenticate'), body }))).catch((e) => ({ error: String(e) })).then((r) => { window.__authResults.sameOriginFetch = r; }),` +
    `new Promise((resolve) => { const x = new XMLHttpRequest(); x.open('POST', '/auth/api'); x.setRequestHeader('Authorization', 'Bearer not-a-real-token'); x.onloadend = () => resolve({ status: x.status }); x.send('{}'); }).then((r) => { window.__authResults.bearerXhr = r; }),` +
    `imgDone('same-img').then((r) => { window.__authResults.sameOriginImage = r; }),` +
    `imgDone('cross-img').then((r) => { window.__authResults.crossOriginImage = r; }),` +
    `]).then(() => { window.__authResults.done = true; });` +
    `</script></body></html>`
  );
}

const SIGN_IN_PAGE =
  `<!doctype html><html><head><meta charset="utf-8"><title>sign-in</title></head>` +
  `<body><h1>sign-in</h1>` +
  `<form id="signin" method="post" action="/auth/login">` +
  `<input id="signin-user" name="username" autocomplete="username">` +
  `<input id="signin-pass" name="password" type="password" autocomplete="current-password">` +
  `<button type="submit">Sign in</button></form></body></html>`;

/** @returns {boolean} true when the request was an auth fixture and is answered. */
function handleAuthFixture(req, res) {
  const raw = req.url || '/';
  // Absolute-form request line = we are being used as an HTTP proxy.
  if (/^https?:\/\//i.test(raw)) {
    challenge(res, 'fixture-proxy', { proxy: true });
    return true;
  }
  const url = new URL(raw, 'http://fixture.invalid');
  const path = url.pathname;
  if (!path.startsWith('/auth/')) return false;
  const authorized = req.headers.authorization === AUTH_ACCEPTED;
  if (path === '/auth/protected' || path === '/auth/api' || path === '/auth/protected.png') {
    if (!authorized) { challenge(res, path); return true; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>protected</title><h1>PROTECTED-CONTENT</h1>`);
    return true;
  }
  if (path === '/auth/page') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(authProbePage(req.headers.host || '127.0.0.1:0'));
    return true;
  }
  if (path === '/auth/signin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SIGN_IN_PAGE);
    return true;
  }
  if (path === '/auth/login' && req.method === 'POST') {
    let bytes = 0;
    req.on('data', (chunk) => { bytes += chunk.length; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>signed-in</title><p>form-login-received ${bytes} bytes</p>`);
    });
    return true;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('unknown auth fixture');
  return true;
}

function start() {
  const server = http.createServer((req, res) => {
    if (workspaceResponse(req, res)) return;
    if (handleAuthFixture(req, res)) return;
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
    if (workspaceResponse(req, res)) return;
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
