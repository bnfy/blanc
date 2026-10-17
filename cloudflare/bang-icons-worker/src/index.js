// blanc.day/bang-icons/<host>: the icon for one host in Blanc's bang list,
// for the /bangs page. Visitors only ever talk to blanc.day; this Worker
// fetches each icon from the site, or from DuckDuckGo's icon service, keeps
// it in KV and serves only sniffed raster bytes. Hosts outside the list, and
// the reviewed held-back hosts, always get a 404 and nothing is fetched.

import heldBackList from './held-back.json' with { type: 'json' };
import { findIcon } from './find-icon.js';
import { allowedHosts } from './hosts.js';
import { hostFromPath } from './rules.js';

const HIT_TTL = 2592000;
const MISS_TTL = 86400;
const HIT_CACHE = 'public, max-age=604800';
const MISS_CACHE = 'public, max-age=86400';
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-site',
};

function reply(request, status, cacheControl, body = null, type = null) {
  const headers = { ...SECURITY_HEADERS, 'Cache-Control': cacheControl };
  if (type) headers['Content-Type'] = type;
  if (status === 405) headers.Allow = 'GET, HEAD';
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}

/** The Worker, with its held-back hosts and icon finder replaceable for tests. */
export function createWorker({ heldBack = heldBackList.hosts, findIconImpl = findIcon } = {}) {
  const held = new Set(heldBack);
  return {
    async fetch(request, env, ctx) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return reply(request, 405, 'no-store');
      const host = hostFromPath(new URL(request.url).pathname);
      if (!host || held.has(host)) return reply(request, 404, MISS_CACHE);
      let hosts;
      try {
        hosts = await allowedHosts(env);
      } catch {
        return reply(request, 503, 'no-store');
      }
      if (!hosts.has(host)) return reply(request, 404, MISS_CACHE);

      const key = `icon:${host}`;
      const kept = await env.ICONS.getWithMetadata(key, { type: 'arrayBuffer' });
      if (kept.metadata?.type) return reply(request, 200, HIT_CACHE, kept.value, kept.metadata.type);
      if (kept.metadata?.miss) return reply(request, 404, MISS_CACHE);

      const icon = await findIconImpl(host);
      if (!icon) {
        ctx.waitUntil(env.ICONS.put(key, '', { expirationTtl: MISS_TTL, metadata: { miss: true } }));
        return reply(request, 404, MISS_CACHE);
      }
      ctx.waitUntil(env.ICONS.put(key, icon.bytes, {
        expirationTtl: HIT_TTL,
        metadata: { type: icon.type, source: icon.source, fetchedAt: new Date().toISOString() },
      }));
      return reply(request, 200, HIT_CACHE, icon.bytes, icon.type);
    },
  };
}

export default createWorker();
