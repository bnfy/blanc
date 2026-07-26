// Pure logic behind the address-bar menu's "Copy Clean Link" item — extracted
// so it's unit-testable without Electron, same pattern as view-source.js.
//
// The list is deliberately conservative and curated (see the design spec):
// over-stripping silently breaks links, which is worse than leaving a tracker
// on one. Brave's own clean-link guidelines make the same call — generic
// parameters aren't stripped globally without domain scoping, machinery this
// v1 doesn't need.

const TRACKING_EXACT = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid',
  'twclid', 'igshid', 'yclid', 'mc_eid', '_openstat', 'vero_id', 's_cid',
]);

function isTrackingParam(rawName) {
  const name = rawName.toLowerCase();
  return name.startsWith('utm_') || TRACKING_EXACT.has(name);
}

/**
 * Strip known tracking parameters from an http(s) URL.
 *
 * Operates on the RAW string, never a URL/URLSearchParams round-trip:
 * surviving parameters must keep their original order and their original
 * encoding byte-for-byte (URLSearchParams re-encodes `%20`↔`+` and
 * normalizes unreserved characters, which corrupts signed URLs). new URL()
 * is used only to validate the scheme.
 *
 * @param {string} text - the address bar's visible text
 * @returns {string|null} cleaned URL, or null when text isn't an http(s) URL
 */
function cleanLink(text) {
  const trimmed = String(text ?? '').trim();
  let protocol;
  try {
    ({ protocol } = new URL(trimmed));
  } catch {
    return null;
  }
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  // Split raw string: fragment starts at the first '#'; the query is between
  // the first '?' BEFORE that and the fragment. A '?' inside the fragment is
  // fragment text, not a query.
  const hashIndex = trimmed.indexOf('#');
  const beforeFragment = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : trimmed.slice(hashIndex);
  const queryIndex = beforeFragment.indexOf('?');
  if (queryIndex === -1) return trimmed;

  const base = beforeFragment.slice(0, queryIndex);
  const kept = beforeFragment
    .slice(queryIndex + 1)
    .split('&')
    .filter((segment) => !isTrackingParam(segment.split('=', 1)[0]));

  return base + (kept.length ? `?${kept.join('&')}` : '') + fragment;
}

module.exports = { cleanLink };
