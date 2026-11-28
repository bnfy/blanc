'use strict';

// A bare domain typed into the address bar (keurig.com) is tried over HTTPS
// first. Some sites serve their bare domain only over plain HTTP, usually just
// to redirect to www, so the HTTPS attempt fails to connect. Chrome loads
// those through HTTPS-Upgrades, which drops back to HTTP once when the upgraded
// load fails; Electron has no such interceptor, so Blanc does the same here.
//
// Only an address the person typed falls back, bare (keurig.com) or with
// https:// (owner, November 28, 2026: https://keurig.com should reach the site
// too). A link, a redirect to another address, and a failure HTTP can't fix (a
// name that doesn't resolve, no network, a blocked or cancelled load) never
// do. HSTS still holds: Chromium upgrades an HSTS site's http:// load itself.

// Connection and TLS failures (net_error_list.h): the server didn't answer
// HTTPS, or answered it badly. Certificate errors (-200 to -299) count too, as
// in Chrome.
const FALLBACK_CODES = new Set([
  -7,   // TIMED_OUT
  -15,  // SOCKET_NOT_CONNECTED
  -100, // CONNECTION_CLOSED
  -101, // CONNECTION_RESET
  -102, // CONNECTION_REFUSED
  -103, // CONNECTION_ABORTED
  -104, // CONNECTION_FAILED
  -107, // SSL_PROTOCOL_ERROR
  -109, // ADDRESS_UNREACHABLE
  -113, // SSL_VERSION_OR_CIPHER_MISMATCH
  -118, // CONNECTION_TIMED_OUT
  -324, // EMPTY_RESPONSE
]);

function fallbackCode(code) {
  return FALLBACK_CODES.has(code) || (code <= -200 && code >= -299);
}

// The same address, compared the way Chromium reports it (a bare host gains a
// trailing slash, the host is lowercased).
function sameAddress(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.protocol === y.protocol && x.host === y.host && x.pathname === y.pathname && x.search === y.search;
  } catch {
    return false;
  }
}

// Hosts Chromium's HTTPS-Upgrades leaves alone (IP addresses, localhost,
// single-label and local-only names) never fall back here either, so the fork
// and Electron agree on which addresses can drop to HTTP.
const LOCAL_SUFFIXES = /\.(?:local|localhost|test|internal|home\.arpa|lan|example|invalid|onion)$/i;
function upgradableHost(hostname) {
  const host = String(hostname || '').replace(/\.$/, '');
  if (!host.includes('.') || LOCAL_SUFFIXES.test(host)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return false;
  return true;
}

/** The pending fallback for a typed address, or null. `target` is what
 * normalizeAddressInput made of `rawText`: a bare domain it upgraded to
 * https://, or an https:// address typed as such. Links and other pages'
 * navigations never get one; only what the person typed does. */
function typedHttpsFallback(rawText, target) {
  const text = String(rawText ?? '').trim();
  const typedScheme = text.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)?.[1]?.toLowerCase();
  if (typeof target !== 'string') return null;
  if (typedScheme ? typedScheme !== 'https' || target !== text : target !== `https://${text}`) return null;
  try {
    const url = new URL(target);
    if (url.username || url.password || url.port || !upgradableHost(url.hostname)) return null;
    url.protocol = 'http:';
    return { httpsUrl: target, httpUrl: url.href };
  } catch {
    return null;
  }
}

/** Whether a main-frame navigation starting at `url` keeps the pending
 * fallback alive: only the typed address itself does. */
function keepsFallback(pending, url) {
  return !!pending && sameAddress(pending.httpsUrl, url);
}

/** The HTTP address to load after the typed HTTPS address failed with `code`,
 * or null. */
function httpFallbackFor(pending, { code, url } = {}) {
  if (!pending || !fallbackCode(code) || !sameAddress(pending.httpsUrl, url)) return null;
  return pending.httpUrl;
}

module.exports = { typedHttpsFallback, keepsFallback, httpFallbackFor };
