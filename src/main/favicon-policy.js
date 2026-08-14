'use strict';

// When a tab navigates, main.js used to blank `tab.favicon` on every URL change
// and rely on Chromium re-firing `page-favicon-updated` to restore it. That
// event is NOT guaranteed: Chromium skips it on a same-origin navigation whose
// favicon is unchanged/already cached (e.g. apple.com/ -> apple.com/mac/). For a
// site with no declared `<link rel="icon">` (favicon.ico-only), there may be no
// later event to restore it, so the icon is cleared and never comes back — a
// permanent gray box in the pill and the panel rows.
//
// Fix: only clear on a genuine CROSS-ORIGIN navigation. Cross-origin reliably
// re-fires `page-favicon-updated`; same-origin keeps the (correct) current icon
// rather than risking a permanent blank. An identical-URL soft reload (some
// sites fire a second did-navigate for the same URL) also keeps the icon — the
// same case commit 2c1da79 first guarded, now a subset of this rule.

/**
 * A tab's *comparable* web origin, or null when it has none. Only a real
 * tuple origin (http/https/etc.) is comparable; opaque-origin schemes
 * (`blanc://`, `data:`, `about:`) all serialize to the string "null" and
 * must NOT be treated as a shared origin, and an unparseable URL has none.
 */
function webOrigin(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Whether navigating from `fromUrl` to `toUrl` should clear the tab's favicon.
 * Keep it only across a same-origin change (incl. identical-URL soft reloads),
 * where Chromium may not re-fire page-favicon-updated and a favicon.ico-only
 * site would otherwise blank permanently. Clear on a cross-origin change, and
 * on any change involving an opaque/unparseable origin (blanc://, data:,
 * about:) — matching the old clear-on-any-change behavior for those.
 *
 * @param {string} fromUrl - the tab's current (pre-navigation) URL
 * @param {string} toUrl   - the URL being navigated to
 * @returns {boolean}
 */
function shouldClearFaviconOnNavigate(fromUrl, toUrl) {
  if (fromUrl === toUrl) return false; // identical URL: soft reload, keep icon
  const from = webOrigin(fromUrl);
  const to = webOrigin(toUrl);
  if (!from || !to) return true; // opaque/unparseable on either side: clear
  return from !== to; // same web origin keeps; cross-origin clears
}

/**
 * Resolve an asynchronous favicon attempt without letting a failed cosmetic
 * upgrade erase pixels that were already proven safe. A null candidate is an
 * explicit navigation/page clear; a non-null candidate that failed to fetch
 * or decode keeps the currently displayed icon.
 */
function resolvedFavicon(current, candidate, sanitized) {
  if (!candidate) return null;
  return sanitized || current || null;
}

/** Keep the supplied page order, then add the conventional same-origin icon
 * as one boring compatibility fallback. No sharpness ranking: basic
 * availability matters more than guessing which touch asset looks best at
 * 14 CSS pixels. */
function pageFaviconSources(pageUrl, favicons) {
  const sources = [];
  const seen = new Set();
  for (const source of Array.isArray(favicons) ? favicons.slice(0, 20) : []) {
    if (typeof source !== 'string' || source.length > 2048) continue;
    if (!/^(https?:|data:image\/)/i.test(source) || seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
  }
  try {
    const page = new URL(pageUrl);
    if (page.protocol === 'http:' || page.protocol === 'https:') {
      const fallback = new URL('/favicon.ico', page.origin).href;
      if (!seen.has(fallback)) sources.push(fallback);
    }
  } catch {
    // No conventional fallback for an opaque or malformed page URL.
  }
  return sources;
}

/** Try Chromium's choices in order, then the single conventional fallback. */
async function updateFaviconFromPage(
  tab,
  favicons,
  { setTabFavicon }
) {
  const sources = pageFaviconSources(tab?.url, favicons);
  if (sources.length === 0) return setTabFavicon(tab, null);
  for (const source of sources) {
    const current = await setTabFavicon(tab, source);
    if (current === false) return false;
    if (tab.favicon && tab.faviconSource === source) return true;
  }
  return true;
}

function declaredFaviconCandidate(raw) {
  const candidate = typeof raw === 'string' ? { href: raw, rel: 'icon' } : raw;
  if (!candidate || typeof candidate.href !== 'string' || candidate.href.length > 2048) return null;
  if (!/^(https?:|data:image\/)/i.test(candidate.href)) return null;
  return {
    href: candidate.href,
    rel: typeof candidate.rel === 'string' ? candidate.rel.slice(0, 100) : '',
    sizes: typeof candidate.sizes === 'string' ? candidate.sizes.slice(0, 100) : '',
    type: typeof candidate.type === 'string' ? candidate.type.slice(0, 100).toLowerCase() : '',
  };
}

function declaredFaviconSize(sizes) {
  let largest = 0;
  for (const match of String(sizes).matchAll(/(\d+)[x×](\d+)/gi)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width === height && width > largest) largest = width;
  }
  return largest;
}

/** Prefer an explicit vector, then a regular icon with enough source pixels
 * for the 32px Retina raster. Document order breaks equal-quality ties. The
 * generic `sizes="any"` hint is not proof that an ICO is scalable — Blanc's
 * own site exposed exactly that mistake — so only an SVG URL/MIME earns the
 * vector score. */
function pickBestDeclaredFavicon(rawCandidates) {
  const candidates = (Array.isArray(rawCandidates) ? rawCandidates.slice(0, 20) : [])
    .map(declaredFaviconCandidate)
    .filter(Boolean);
  // Apple touch icons are home-screen artwork and frequently have a different
  // crop or background from the site's desktop mark. They remain a useful
  // availability fallback, but must never displace an ordinary rel=icon.
  const ordinary = candidates.filter(({ rel }) => !rel || /(?:^|\s)icon(?:\s|$)/i.test(rel));
  const eligible = ordinary.length
    ? ordinary
    : candidates.filter(({ rel }) => /(?:^|\s)apple-touch-icon(?:\s|$)/i.test(rel));
  let best = null;
  let bestScore = -1;
  for (const candidate of eligible) {
    const vector = candidate.type === 'image/svg+xml' ||
      /(?:\.svg(?:[?#]|$)|^data:image\/svg\+xml[;,])/i.test(candidate.href);
    const size = declaredFaviconSize(candidate.sizes);
    let score;
    if (vector) score = 1_000_000;
    else if (size >= 32) score = 100_000 + (10_000 - Math.abs(size - 64));
    else if (size > 0) score = size;
    else if (candidate.type === 'image/png' || /\.png(?:[?#]|$)/i.test(candidate.href)) score = 1_000;
    else if (/\.ico(?:[?#]|$)/i.test(candidate.href)) score = 100;
    else score = 500;
    if (score > bestScore) {
      best = candidate.href;
      bestScore = score;
    }
  }
  return best;
}

/** Read the page's bounded declared icon metadata. This powers both the
 * no-event availability fallback and a later quality refinement. */
async function declaredPageFaviconCandidates(webContents) {
  try {
    const candidates = await webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"]'))
        .slice(0, 20)
        .map((link) => ({
          href: link.href,
          rel: link.rel,
          sizes: link.getAttribute('sizes') || '',
          type: link.getAttribute('type') || ''
        }))
    `, true);
    return Array.isArray(candidates)
      ? candidates.slice(0, 20).map(declaredFaviconCandidate).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/** Read only ordinary `rel=icon` URLs, in document order, for callers that
 * need the availability list rather than touch-icon quality metadata. */
async function declaredPageFavicons(webContents) {
  const candidates = await declaredPageFaviconCandidates(webContents);
  return candidates
    .filter(({ rel }) => /(?:^|\s)icon(?:\s|$)/i.test(rel))
    .map(({ href }) => href);
}

/** Once Chromium has finished processing a favicon event, upgrade a low-detail
 * static choice only when the source it actually left behind belongs to this
 * document's declared icon set. Unlike event-time bookkeeping, this remains
 * correct when DOM readiness and the favicon network request race. A later
 * page-owned URL or data icon is not declared static and therefore wins. */
async function refineDeclaredStaticFavicon(tab, webContents, deps) {
  if (!tab?.favicon || !tab.faviconSource) return false;
  const urlAtStart = tab.url;
  const sourceAtStart = tab.faviconSource;
  const candidates = await declaredPageFaviconCandidates(webContents);
  if (
    tab.url !== urlAtStart ||
    !tab.favicon ||
    tab.faviconSource !== sourceAtStart
  ) return false;
  const staticSources = new Set(
    pageFaviconSources(tab.url, candidates.map(({ href }) => href))
  );
  if (!staticSources.has(sourceAtStart)) return false;
  const best = pickBestDeclaredFavicon(candidates);
  if (!best || best === sourceAtStart) return false;
  return deps.setTabFavicon(tab, best);
}

/** At DOM readiness, fill pages whose Chromium event never arrived and refine
 * an already-working low-resolution choice. Availability remains fail-safe:
 * the best declared candidate is tried first, then original document order,
 * while setTabFavicon preserves existing pixels when an upgrade fails. */
async function updateFaviconAfterDomReady(tab, webContents, deps) {
  if (!tab) return false;
  // Chromium can emit page-favicon-updated just before dom-ready. Let that
  // bounded attempt finish; if transient load pressure made it fail, the
  // declared-link path below becomes one clean retry instead of standing down
  // forever because faviconSource happened to be non-null at this instant.
  const pending = tab.faviconPending;
  if (pending) await pending.catch(() => false);
  // A source with no pixels and no tracked promise is still an in-flight or
  // externally-owned attempt. Do not compete with it.
  if (!tab.favicon && tab.faviconSource) return false;
  const urlAtStart = tab.url;
  const faviconAtStart = tab.favicon;
  const sourceAtStart = tab.faviconSource ?? null;
  const candidates = await declaredPageFaviconCandidates(webContents);
  if (
    tab.url !== urlAtStart ||
    tab.favicon !== faviconAtStart ||
    (tab.faviconSource ?? null) !== sourceAtStart
  ) return false;
  if (tab.favicon) {
    const best = pickBestDeclaredFavicon(candidates);
    if (!best || best === tab.faviconSource) return false;
    return deps.setTabFavicon(tab, best);
  }
  const preferred = pickBestDeclaredFavicon(candidates);
  const favicons = candidates
    .filter(({ rel }) => /(?:^|\s)icon(?:\s|$)/i.test(rel))
    .map(({ href }) => href);
  if (preferred) favicons.unshift(preferred);
  return updateFaviconFromPage(tab, favicons, deps);
}

module.exports = {
  declaredPageFaviconCandidates,
  declaredPageFavicons,
  pageFaviconSources,
  pickBestDeclaredFavicon,
  refineDeclaredStaticFavicon,
  resolvedFavicon,
  shouldClearFaviconOnNavigate,
  updateFaviconAfterDomReady,
  updateFaviconFromPage,
};
