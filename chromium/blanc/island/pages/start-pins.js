// How the start page and the Favorites page lay out pins. The pins themselves
// live in main (start-page-pins.js), shared with the tab menu; this file only
// decides where they go and draws their glyph. Kept pure (no storage, no IPC,
// and DOM only through the document a caller passes in) and served flat from
// this directory, so test/unit can run it in a vm, the same way
// start-site-name.js is shared and tested.
(() => {
  'use strict';

  /** The hostname key main's top-sites.js gives a site (lowercase, no
   * "www."), or null for anything but http(s). */
  function siteKey(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed.hostname.toLowerCase().replace(/^www\./, '') || null;
    } catch {
      return null;
    }
  }

  /** A URL in its standard form, the form main stores pins in (an imported
   * Favorite can keep "https://example.com" without its slash, say), so the
   * two compare equal. Anything that doesn't parse stays as it is. */
  function canonicalUrl(url) {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  }

  /** The Billboard row: every pin first (main keeps them newest first), then the ranked sites
   * that are neither hidden nor already a pin's site. */
  function billboardSites(pins, ranked, hidden, limit = 6) {
    const pinned = pins.map((pin) => ({
      key: siteKey(pin.url),
      url: pin.url,
      title: pin.title,
      favicon: pin.favicon ?? null,
      pinned: true,
    }));
    const pinnedKeys = new Set(pinned.map((site) => site.key));
    const rest = ranked
      .filter((site) => !pinnedKeys.has(site.key) && !hidden.has(site.key))
      .map((site) => ({ ...site, pinned: false }));
    return [...pinned, ...rest].slice(0, limit);
  }

  /** A favorites layout's tiles: every pin first (main keeps them newest first), then the
   * Favorites that aren't pinned, in their own order. A pinned page that is a
   * Favorite draws as that Favorite. */
  function favoriteTiles(pins, favorites, limit) {
    const byUrl = new Map();
    for (const favorite of favorites) {
      const url = canonicalUrl(favorite.url);
      if (!byUrl.has(url)) byUrl.set(url, favorite);
    }
    const pinned = pins.map((pin) => {
      const favorite = byUrl.get(pin.url);
      return favorite
        ? { ...favorite, favicon: favorite.favicon ?? pin.favicon ?? null, pinned: true }
        : { url: pin.url, title: pin.title, favicon: pin.favicon ?? null, pinned: true };
    });
    const pinnedUrls = new Set(pins.map((pin) => pin.url));
    const rest = favorites
      .filter((favorite) => !pinnedUrls.has(canonicalUrl(favorite.url)))
      .map((favorite) => ({ ...favorite, pinned: false }));
    return [...pinned, ...rest].slice(0, limit);
  }

  /** Whether two pin lists would draw the same, so a change notice that
   * brings nothing new leaves the page (and its focus) alone. */
  function samePins(a, b) {
    return a.length === b.length && a.every((pin, index) =>
      pin.url === b[index].url && pin.title === b[index].title && (pin.favicon ?? null) === (b[index].favicon ?? null));
  }

  const GLYPHS = {
    // The ⌘L panel's pin.
    pin: ['M5 3h6l-1 5 2 2v1H4v-1l2-2z', 'M8 11v3'],
    // The × the start page's other close buttons draw.
    close: ['M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5'],
  };

  /** A 16px line glyph, drawn inline so it takes the theme's text color in
   * light, dark and private alike (an <img> can't follow currentColor). */
  function glyph(doc, name) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of GLYPHS[name]) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    return svg;
  }

  globalThis.blancStartPins = Object.freeze({
    siteKey,
    canonicalUrl,
    glyph,
    billboardSites,
    favoriteTiles,
    samePins,
  });
})();
