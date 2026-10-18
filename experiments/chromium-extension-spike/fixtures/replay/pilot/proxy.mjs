import http from 'node:http';
import tls from 'node:tls';

export const urls = {
  page: 'http://page.blanc-fixture.test/pilot.html',
  script: 'http://asset.blanc-fixture.test/control.js',
  blockedScript: 'http://ad.doubleclick.net/advertisement.js',
  data: 'http://asset.blanc-fixture.test/data.json',
  noReferrerData: 'http://asset.blanc-fixture.test/no-referrer.json',
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
  fetch(${JSON.stringify(urls.noReferrerData)}, {referrerPolicy:'no-referrer'}).then(r => r.text()).then(t => pilot.outcomes.noReferrerData = t, () => pilot.outcomes.noReferrerData = 'error'),
  fetch(${JSON.stringify(urls.blockedData)}).then(r => r.text()).then(t => pilot.outcomes.blockedData = t, () => pilot.outcomes.blockedData = 'error')
]).then(() => pilot.done = true);
</script>`;
export const fixtures = new Map([
  [urls.page, ['text/html', html]],
  [urls.script, ['text/javascript', 'window.pilot.allowedScript = true;']],
  [urls.blockedScript, ['text/javascript', 'window.pilot.blockedScriptExecuted = true;']],
  [urls.data, ['application/json', '{"fixture":"allowed"}']],
  [urls.noReferrerData, ['application/json', '{"fixture":"no-referrer"}']],
  [urls.blockedData, ['application/json', '{"fixture":"should-not-arrive"}']],
]);

export function fixtureSet(scheme = 'http') {
  if (!['http','https'].includes(scheme)) throw new Error('Unsupported fixture scheme');
  const convert = value => value.replaceAll('http://', scheme+'://');
  return {urls:Object.fromEntries(Object.entries(urls).map(([k,v])=>[k,convert(v)])),
    fixtures:new Map([...fixtures].map(([url,[type,body]])=>[convert(url),[type,convert(body)]]))};
}

// Offline HTTP forward-proxy interface: preserves absolute browser URLs, does
// not resolve or forward any request. Optional CONNECT terminates fixture TLS locally.
export async function startProxy({scheme='http', tlsMaterial} = {}) {
  const {fixtures: served} = fixtureSet(scheme);
  if (scheme === 'https' && !tlsMaterial) throw new Error('Fixture TLS material required');
  const requests = [], sockets = new Set();
  const authorities = new Set([...served.keys()].map(u=>new URL(u).hostname+':443'));
  const respond = (req, res) => {
    const encrypted = !!req.socket.encrypted;
    const url = encrypted ? 'https://'+req.headers.host+req.url : req.url;
    const authority = req.socket.fixtureAuthority;
    const validTunnel = !encrypted || (authorities.has(authority) &&
      req.headers.host === authority.slice(0,-4) && req.socket.servername === authority.slice(0,-4));
    const known = (scheme !== 'https' || encrypted) && validTunnel && served.has(url) && new URL(url).host === req.headers.host;
    const row = {method:req.method,url,host:req.headers.host,known,encrypted};
    if (encrypted) row.connectAuthority=authority;
    requests.push(row);
    const fixture = known && served.get(url);
    if (!fixture || req.method !== 'GET') {
      res.writeHead(502, {'Cache-Control':'no-store'});
      res.end('No fixture; external forwarding is disabled'); return;
    }
    res.writeHead(200, {'Content-Type':fixture[0],'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':'*'}); res.end(fixture[1]);
  };
  const server = http.createServer(respond);
  const inside = http.createServer(respond);
  server.on('connection', socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const context = tlsMaterial && tls.createSecureContext({key:tlsMaterial.key,cert:tlsMaterial.cert});
  server.on('connect', (req, socket, head) => {
    const allowed = scheme === 'https' && authorities.has(req.url) && head.length === 0;
    requests.push({method:'CONNECT',url:req.url,known:allowed});
    if (!allowed) {
      socket.end('HTTP/1.1 502 Fixture TLS not implemented for this authority\r\nConnection: close\r\n\r\n'); return;
    }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const secure = new tls.TLSSocket(socket,{isServer:true,secureContext:context});
    secure.fixtureAuthority = req.url;
    secure.on('error',()=>secure.destroy());
    inside.emit('connection',secure);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {server,requests,port:server.address().port,
    close:()=>new Promise(resolve=>{server.close(resolve);for(const socket of sockets)socket.destroy();})};
}
