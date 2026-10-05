'use strict';

// Main-process stylesheet fetch for Dark websites. Dark Reader must read the
// text of cross-origin stylesheets that a page cannot read itself without
// CORS. It asks through a bridge exposed only to its own isolated world, but
// a compromised renderer could call the channel directly, so every request
// is treated as hostile:
//
// - http(s) only, no URL credentials, at most MAX_STYLESHEET_URL_LENGTH;
// - no loopback, private, link-local or other non-public address, checked
//   on the IP literal or on every address the host resolves to;
// - the page's blocker (Blanc Blocker or uBO) must allow the stylesheet, so
//   a request it blocked for the page is never fetched here instead;
// - an isolated in-memory session: no cookies, cache or credentials;
// - no redirects, a timeout, `text/css` only, and a byte cap;
// - per-page rate and concurrency limits.
//
// DNS can change between the address check and the fetch (rebinding). The
// window is small, the target must answer an attacker-chosen Host with a
// text/css 200, and the page only ever sees the colour overrides Dark Reader
// derives from the text. Closing it fully needs the fetch to connect to the
// checked address, which Electron's fetch does not offer.

const {
  MAX_STYLESHEET_BYTES,
  STYLESHEET_TIMEOUT_MS,
  MAX_STYLESHEET_FETCHES_PER_MINUTE,
  MAX_CONCURRENT_STYLESHEET_FETCHES,
  isPublicAddress,
  parseStylesheetUrl,
} = require('./dark-websites');

async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/**
 * @param {{ getSession: () => Electron.Session, now?: () => number }} deps
 * @returns {((key: number, rawUrl: unknown, allow: (url: string) => Promise<boolean>) => Promise<string|null>)
 *   & { forget(key: number): void }}
 */
function createStylesheetFetcher({ getSession, now = Date.now }) {
  const budgets = new Map();

  function admit(key) {
    const t = now();
    let budget = budgets.get(key);
    if (!budget) {
      budget = { windowStart: t, count: 0, active: 0 };
      budgets.set(key, budget);
    } else if (t - budget.windowStart >= 60_000) {
      // Reset in place: in-flight requests still release this same record.
      budget.windowStart = t;
      budget.count = 0;
    }
    if (budget.count >= MAX_STYLESHEET_FETCHES_PER_MINUTE) return null;
    if (budget.active >= MAX_CONCURRENT_STYLESHEET_FETCHES) return null;
    budget.count += 1;
    budget.active += 1;
    return budget;
  }

  // `allow(url)` is the page's blocker decision; it must resolve to true.
  async function fetchStylesheet(key, rawUrl, allow) {
    const parsed = parseStylesheetUrl(rawUrl);
    if (!parsed || typeof allow !== 'function') return null;
    const budget = admit(key);
    if (!budget) return null;
    try {
      if (await allow(parsed.url.href) !== true) return null;
      const ses = getSession();
      if (!parsed.literal) {
        const resolved = await ses.resolveHost(parsed.host);
        const addresses = (resolved?.endpoints || []).map((endpoint) => endpoint.address);
        if (!addresses.length || !addresses.every(isPublicAddress)) return null;
      }
      const response = await ses.fetch(parsed.url.href, {
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'text/css' },
        signal: AbortSignal.timeout(STYLESHEET_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (type !== 'text/css') return null;
      return await readCapped(response, MAX_STYLESHEET_BYTES);
    } catch {
      return null;
    } finally {
      budget.active -= 1;
    }
  }
  // Call when the page's WebContents is destroyed.
  fetchStylesheet.forget = (key) => budgets.delete(key);
  return fetchStylesheet;
}

module.exports = { createStylesheetFetcher, readCapped };
