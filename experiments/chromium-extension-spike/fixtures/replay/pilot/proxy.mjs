import http from 'node:http';

export const urls = {
  page: 'http://page.blanc-fixture.test/pilot.html',
  script: 'http://asset.blanc-fixture.test/control.js',
  blockedScript: 'http://ad.doubleclick.net/advertisement.js',
  data: 'http://asset.blanc-fixture.test/data.json',
  blockedData: 'http://doubleclick.net/pagead/ads?client=fixture',
};
const html = `<!doctype html><meta charset="utf-8"><title>Blanc capture pilot</title>
<p>Disposable blocker capture fixture</p><script>
window.pilot = { allowedScript: false, outcomes: {}, done: false };
function script(url, name) { return new Promise(resolve => {
  const s = document.createElement('script'); s.src = url;
  s.onload = () => { pilot.outcomes[name] = 'loaded'; resolve(); };
  s.onerror = () => { pilot.outcomes[name] = 'error'; resolve(); };
  document.head.append(s);
}); }
Promise.all([
  script(${JSON.stringify(urls.script)}, 'allowedScript'),
  script(${JSON.stringify(urls.blockedScript)}, 'blockedScript'),
  fetch(${JSON.stringify(urls.data)}).then(r => r.text()).then(t => pilot.outcomes.data = t, () => pilot.outcomes.data = 'error'),
  fetch(${JSON.stringify(urls.blockedData)}).then(r => r.text()).then(t => pilot.outcomes.blockedData = t, () => pilot.outcomes.blockedData = 'error')
]).then(() => pilot.done = true);
</script>`;
export const fixtures = new Map([
  [urls.page, ['text/html', html]],
  [urls.script, ['text/javascript', 'window.pilot.allowedScript = true;']],
  [urls.blockedScript, ['text/javascript', 'window.pilot.blockedScriptExecuted = true;']],
  [urls.data, ['application/json', '{"fixture":"allowed"}']],
  [urls.blockedData, ['application/json', '{"fixture":"should-not-arrive"}']],
]);

// Offline HTTP forward-proxy interface: preserves absolute browser URLs, does
// not resolve or forward any request. HTTPS/CONNECT is deliberately unsupported.
export async function startProxy() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const row = { method: req.method, url: req.url, host: req.headers.host,
      known: fixtures.has(req.url) };
    requests.push(row);
    const fixture = fixtures.get(req.url);
    if (!fixture || req.method !== 'GET') {
      res.writeHead(502, { 'Cache-Control': 'no-store' });
      res.end('No fixture; external forwarding is disabled');
      return;
    }
    res.writeHead(200, { 'Content-Type': fixture[0], 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*' });
    res.end(fixture[1]);
  });
  server.on('connect', (req, socket) => {
    requests.push({ method: 'CONNECT', url: req.url, known: false });
    socket.end('HTTP/1.1 502 Fixture TLS not implemented\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  return { server, requests, port: server.address().port,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
