'use strict';
const http = require('node:http');

// Disposable, loopback-only fixtures. No real accounts or browsing content.
async function startWorkspaceFixtures() {
  const requests = { posts: 0, postBodies: [], gets: 0, pages: {} };
  let base;
  const send = (res, body) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><title>Workspace lifecycle fixture</title>${body}`);
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, base);
    requests.pages[url.pathname] = (requests.pages[url.pathname] || 0) + 1;
    if (url.pathname === '/form') return send(res, '<form action="/submitted" method="post"><input name="payload" value="workspace-post-sentinel"><button id="submit">Submit</button></form>');
    if (url.pathname === '/submitted') {
      if (req.method !== 'POST') { requests.gets++; return send(res, '<p id="get-response">Reloaded as GET</p>'); }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        requests.posts++; requests.postBodies.push(body);
        send(res, '<p id="post-response">workspace-response-sentinel</p><textarea id="draft"></textarea><script>window.documentIdentity = "post-document";</script>');
      });
      return;
    }
    if (url.pathname === '/relying') return send(res, `
      <button id="popup">Sign in with popup</button><button id="tab">Sign in with tab</button>
      <script>
        window.loginResults = [];
        window.addEventListener('message', event => {
          if (event.origin === location.origin && event.data?.kind === 'workspace-login') window.loginResults.push(event.data);
        });
        for (const mode of ['popup', 'tab']) document.getElementById(mode).onclick = () => window.open(
          ${JSON.stringify(base.replace('127.0.0.1', 'localhost'))} + '/provider?mode=' + mode,
          'workspace-auth-' + mode, mode === 'popup' ? 'popup,width=520,height=680' : undefined);
      </script>`);
    if (url.pathname === '/provider') return send(res, `
      <button id="complete">Complete fixture sign-in</button>
      <script>document.getElementById('complete').onclick = () => location.replace(${JSON.stringify(base + '/callback')} + location.search);</script>`);
    if (url.pathname === '/callback') return send(res, `
      <button id="close">Close sign-in</button>
      <script>
        window.opener?.postMessage({kind:'workspace-login', mode:new URLSearchParams(location.search).get('mode'), opener:!!window.opener}, location.origin);
        document.getElementById('close').onclick = () => window.close();
      </script>`);
    send(res, '<p id="ordinary">Ordinary restart fixture</p>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  return { base, requests, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startWorkspaceFixtures };
