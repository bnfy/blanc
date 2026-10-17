// Finding one host's icon: the site's own declared icon, then its
// /favicon.ico, then DuckDuckGo's icon service. Every request follows the
// app's favicon rules (rules.js): no cookies or referrer, redirects checked
// hop by hop, a time limit and a size cap.

import { LIMITS, iconCandidates, isPublicUrl, sniffImageType } from './rules.js';

const USER_AGENT = 'BlancIconFetcher/1.0 (+https://blanc.day/bangs)';
const MAX_SITE_IMAGES = 4;
const duckDuckGo = (host) => `https://icons.duckduckgo.com/ip3/${host}.ico`;

// The body up to `limit` bytes. Past it: null, or with `truncate` the first
// `limit` bytes (a homepage's head is all the server reads).
async function readCapped(response, limit, truncate) {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      if (!truncate) return null;
      break;
    }
  }
  const body = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, body.length - offset);
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}

/** One capped GET with its redirects followed by hand, or null if refused. */
export async function fetchCapped(url, { limit, truncate = false, fetchImpl = fetch, accept = '*/*' }) {
  let current = new URL(url);
  for (let hop = 0; hop <= LIMITS.redirects; hop += 1) {
    if (!isPublicUrl(current)) return null;
    try {
      const response = await fetchImpl(current.href, {
        redirect: 'manual',
        headers: { Accept: accept, 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(LIMITS.timeoutMs),
      });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
      if (location) {
        await response.body?.cancel();
        current = new URL(location, current);
        continue;
      }
      const bytes = await readCapped(response, limit, truncate);
      return bytes && { status: response.status, bytes, finalUrl: current.href };
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchImage(url, fetchImpl) {
  const result = await fetchCapped(url, { limit: LIMITS.imageBytes, fetchImpl, accept: 'image/*' });
  const type = result?.status === 200 ? sniffImageType(result.bytes) : null;
  return type && { bytes: result.bytes, type };
}

/** The best icon for `host`, or null when neither the site nor DuckDuckGo has one. */
export async function findIcon(host, fetchImpl = fetch) {
  const home = `https://${host}/`;
  const page = await fetchCapped(home, { limit: LIMITS.htmlBytes, truncate: true, fetchImpl, accept: 'text/html' });
  const candidates = page?.status === 200
    ? iconCandidates(new TextDecoder().decode(page.bytes), page.finalUrl)
    : [new URL('/favicon.ico', home).href];
  for (const url of candidates.slice(0, MAX_SITE_IMAGES)) {
    const icon = await fetchImage(url, fetchImpl);
    if (icon) return { ...icon, source: 'site' };
  }
  const icon = await fetchImage(duckDuckGo(host), fetchImpl);
  return icon && { ...icon, source: 'duckduckgo' };
}
