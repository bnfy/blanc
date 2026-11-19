// Blanc's update server for the Windows beta (W3 Task C1): answers Chromium's
// updater (//chrome/updater, protocol 4.0) at POST /update/win/v4 and signs
// every answer with Blanc's CUP key (ML-DSA-44), as
// components/client_update_protocol/cup.cc checks it:
//   proof = sign( SHA-256( SHA-256(request) ‖ SHA-256(response) ‖ cup2key ) )
// sent as `X-Cup-Server-Proof: <signature hex>:<SHA-256(request) hex>`.
// It offers the current beta only to an older installed version, never a
// downgrade, and signs nothing unless its secret is the committed key.

export const UPDATER_APP_ID = '{4dbcbeee-9640-43b0-a87f-e679a3637712}';
const PATH = '/update/win/v4';
const CUP_KEY_ID = 'ML-DSA-44-1';
const MAX_BODY = 128 * 1024;
const VERSION = /^\d{1,9}(\.\d{1,9}){0,3}$/;
const NONCE = /^[A-Za-z0-9_=-]{1,128}$/;
const encoder = new TextEncoder();

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const plain = (status, text) => new Response(text, {status, headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store'}});

// Dotted versions, compared part by part (missing parts are 0).
export function compareVersions(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}

// The answer for one app of the request.
export function answerFor(app, release) {
  const id = String(app.appid).toLowerCase();
  const known = id === String(release.appId).toLowerCase() || id === UPDATER_APP_ID;
  if (!known) return {appid: app.appid, status: 'error-unknownApplication'};
  if (!app.updatecheck) return {appid: app.appid, status: 'ok'};
  const offer = id !== UPDATER_APP_ID && release.version && compareVersions(app.version, release.version) < 0;
  if (!offer) return {appid: app.appid, status: 'ok', updatecheck: {status: 'noupdate'}};
  return {appid: app.appid, status: 'ok', updatecheck: {status: 'ok', nextversion: release.version, pipelines: [{
    pipeline_id: 'full',
    operations: [
      {type: 'download', urls: [{url: release.url}], size: release.size, out: {sha256: release.sha256}},
      {type: 'crx3', in: {sha256: release.sha256}, path: release.run, arguments: release.arguments},
    ],
  }]}};
}

// The current release's package, from the PACKAGES bucket, by its SHA-256:
// GET (whole or one byte range) and HEAD. Nothing else is served, so a package
// no release names can't be fetched here.
const PACKAGE = /^\/update\/win\/pkg\/([0-9a-f]{64})\.crx3$/;
async function servePackage(request, env, release, digest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'GET or HEAD only');
  if (!release.version || release.sha256 !== digest) return plain(404, 'not found');
  const key = `${digest}.crx3`;
  const meta = await env.PACKAGES.head(key);
  if (!meta) return plain(404, 'not found');
  const headers = {'content-type': 'application/x-chrome-extension', 'accept-ranges': 'bytes', etag: meta.httpEtag,
    'cache-control': 'public, max-age=31536000, immutable'};
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range) {
    const start = Number(range[1]), end = range[2] === '' ? meta.size - 1 : Math.min(Number(range[2]), meta.size - 1);
    if (start > end || start >= meta.size) return new Response(null, {status: 416, headers: {'content-range': `bytes */${meta.size}`}});
    const length = end - start + 1;
    const body = request.method === 'HEAD' ? null : (await env.PACKAGES.get(key, {range: {offset: start, length}})).body;
    return new Response(body, {status: 206, headers: {...headers, 'content-length': String(length), 'content-range': `bytes ${start}-${end}/${meta.size}`}});
  }
  const body = request.method === 'HEAD' ? null : (await env.PACKAGES.get(key)).body;
  return new Response(body, {status: 200, headers: {...headers, 'content-length': String(meta.size)}});
}

export function makeWorker({publicSpkiHex, release, now = () => Date.now()}) {
  let signing = null;
  async function signingKey(seedBase64) {
    if (!signing) signing = (async () => {
      const seed = Uint8Array.from(atob(seedBase64 ?? ''), c => c.charCodeAt(0));
      if (seed.length !== 32) return null;
      const key = await crypto.subtle.importKey('raw-seed', seed, {name: 'ML-DSA-44'}, false, ['sign']);
      const spki = await crypto.subtle.exportKey('spki', await crypto.subtle.getPublicKey(key, ['verify']));
      return hex(spki) === publicSpkiHex ? key : null;
    })();
    return signing;
  }
  return {async fetch(request, env) {
    const url = new URL(request.url);
    const pkg = PACKAGE.exec(url.pathname);
    if (pkg) return servePackage(request, env, release, pkg[1]);
    if (url.pathname !== PATH) return plain(404, 'not found');
    if (request.method !== 'POST') return plain(405, 'POST only');
    const cup2key = url.searchParams.get('cup2key') ?? '', cup2hreq = url.searchParams.get('cup2hreq') ?? '';
    const [keyId, nonce] = [cup2key.slice(0, cup2key.indexOf(':')), cup2key.slice(cup2key.indexOf(':') + 1)];
    if (cup2key.indexOf(':') < 0 || keyId !== CUP_KEY_ID || !NONCE.test(nonce) || !/^[0-9a-f]{64}$/.test(cup2hreq))
      return plain(400, 'missing or unknown CUP parameters');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return plain(413, 'too large');
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > MAX_BODY) return plain(413, 'too large');
    const requestHash = await sha256(body);
    if (hex(requestHash) !== cup2hreq) return plain(400, 'cup2hreq does not match the body');
    let apps;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body))?.request;
      if (parsed?.protocol !== '4.0' || !Array.isArray(parsed.apps) || parsed.apps.length > 32) throw new Error('shape');
      apps = parsed.apps.map(app => {
        if (typeof app?.appid !== 'string' || !app.appid || app.appid.length > 64) throw new Error('appid');
        if (typeof app.version !== 'string' || !VERSION.test(app.version)) throw new Error('version');
        return app;
      });
    } catch { return plain(400, 'not a protocol 4.0 request'); }
    const key = await signingKey(env.CUP_SEED);
    if (!key) return plain(500, 'the signing key is not the committed key');
    const elapsedDays = Math.floor((now() - Date.UTC(2007, 0, 1)) / 86400000);
    const text = ")]}'\n" + JSON.stringify({response: {protocol: '4.0', daystart: {elapsed_days: elapsedDays},
      apps: apps.map(app => answerFor(app, release))}});
    const responseBytes = encoder.encode(text);
    const signed = new Uint8Array([...requestHash, ...(await sha256(responseBytes)), ...encoder.encode(cup2key)]);
    const signature = await crypto.subtle.sign({name: 'ML-DSA-44'}, key, await sha256(signed));
    return new Response(responseBytes, {status: 200, headers: {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-cup-server-proof': `${hex(signature)}:${hex(requestHash)}`,
    }});
  }};
}
