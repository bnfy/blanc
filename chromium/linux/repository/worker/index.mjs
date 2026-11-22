import {isMetadataPath, packageInfo, poolCache} from '../paths.mjs';

const mirrorlist = /^(rpm\/stable\/(?:x86_64|aarch64))\/mirrorlist$/;

function miss(status = 404) {
  return new Response(null, {status, headers: {'Cache-Control': 'no-store'}});
}

async function objectResponse(bucket, key, request, cacheControl) {
  const head = request.method === 'HEAD';
  const obj = head && bucket.head ? await bucket.head(key) : await bucket.get(key);
  if (!obj) return miss();
  const headers = new Headers({'Cache-Control': cacheControl, 'Content-Length': String(obj.size)});
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag);
  if (key.endsWith('.xml')) headers.set('Content-Type', 'application/xml');
  return new Response(head ? null : obj.body, {headers});
}

export default {
  async fetch(request, {PACKAGES: bucket}) {
    if (!['GET', 'HEAD'].includes(request.method)) return miss(405);
    const url = new URL(request.url);
    let path = url.pathname.slice(1);
    if (packageInfo(path)) return objectResponse(bucket, path, request, poolCache);
    if (path === 'current.json') return objectResponse(bucket, path, request, 'no-cache');

    const pinned = /^generations\/([1-9]\d*)\/(.*)$/.exec(path);
    if (pinned) path = pinned[2];
    const mirror = !pinned && mirrorlist.exec(path);
    if (!mirror && !isMetadataPath(path) && !(pinned && packageInfo(path))) return miss();
    const current = await bucket.get('current.json');
    if (!current) return miss();
    const {generation, previous} = await current.json();
    const retained = [generation, ...previous];
    if (pinned) {
      if (!retained.includes(Number(pinned[1]))) return miss();
      if (packageInfo(path)) return objectResponse(bucket, path, request, poolCache);
      return objectResponse(bucket, `generations/${pinned[1]}/${path}`, request, 'no-cache');
    }
    if (mirror) {
      const address = `${url.origin}/generations/${generation}/${mirror[1]}/\n`;
      return new Response(request.method === 'HEAD' ? null : address,
        {headers: {'Cache-Control': 'no-cache', 'Content-Type': 'text/plain'}});
    }
    // Content-addressed indexes can still be requested after the apt InRelease fetch.
    const search = path.includes('/by-hash/') || /\/[a-f0-9]{64}-/.test(path) ? retained : [generation];
    for (const n of search) {
      const response = await objectResponse(bucket, `generations/${n}/${path}`, request, 'no-cache');
      if (response.ok) return response;
    }
    return miss();
  },
};

