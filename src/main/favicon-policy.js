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

/** Read only the page's declared icon URLs, in document order. This is a
 * compatibility fallback for pages where Chromium never emits its event; it
 * deliberately does no size ranking or touch-icon guessing. */
async function declaredPageFavicons(webContents) {
  try {
    const sources = await webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('link[rel~="icon"]'))
        .slice(0, 20)
        .map((link) => link.href)
    `, true);
    return Array.isArray(sources) ? sources.slice(0, 20) : [];
  } catch {
    return [];
  }
}

/** Some long-running pages never make Chromium emit page-favicon-updated.
 * At DOM readiness, use their declared icons when no event has already
 * supplied pixels or started an attempt. */
async function updateFaviconAfterDomReady(tab, webContents, deps) {
  if (!tab || tab.favicon) return false;
  // Chromium can emit page-favicon-updated just before dom-ready. Let that
  // bounded attempt finish; if transient load pressure made it fail, the
  // declared-link path below becomes one clean retry instead of standing down
  // forever because faviconSource happened to be non-null at this instant.
  const pending = tab.faviconPending;
  if (pending) await pending.catch(() => false);
  if (tab.favicon || tab.faviconSource) return false;
  const urlAtStart = tab.url;
  const favicons = await declaredPageFavicons(webContents);
  if (tab.url !== urlAtStart || tab.favicon || tab.faviconSource) return false;
  return updateFaviconFromPage(tab, favicons, deps);
}

module.exports = {
  declaredPageFavicons,
  pageFaviconSources,
  resolvedFavicon,
  shouldClearFaviconOnNavigate,
  updateFaviconAfterDomReady,
  updateFaviconFromPage,
};
