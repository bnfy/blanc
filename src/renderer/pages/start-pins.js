// How the start page lays out its pins. The pins themselves live in main
// (start-page-pins.js), shared with the Favorites page and the tab menu; this
// file only decides where they go. Kept pure (no DOM, no storage, no IPC) and
// served flat from this directory, so test/unit can run it in a vm, the same
// way start-site-name.js is shared and tested.
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

  /** What pinning a Billboard tile pins: the site, not whichever of its pages
   * was visited last. Null for anything but http(s). */
  function siteOrigin(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return `${parsed.origin}/`;
    } catch {
      return null;
    }
  }

  /** The Billboard row: every pin first, in pin order, then the ranked sites
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

  /** A favorites layout's tiles: every pin first, in pin order, then the
   * Favorites that aren't pinned, in their own order. A pinned page that is a
   * Favorite draws as that Favorite. */
  function favoriteTiles(pins, favorites, limit) {
    const byUrl = new Map(favorites.map((favorite) => [favorite.url, favorite]));
    const pinned = pins.map((pin) => {
      const favorite = byUrl.get(pin.url);
      return favorite
        ? { ...favorite, favicon: favorite.favicon ?? pin.favicon ?? null, pinned: true }
        : { url: pin.url, title: pin.title, favicon: pin.favicon ?? null, pinned: true };
    });
    const pinnedUrls = new Set(pins.map((pin) => pin.url));
    const rest = favorites
      .filter((favorite) => !pinnedUrls.has(favorite.url))
      .map((favorite) => ({ ...favorite, pinned: false }));
    return [...pinned, ...rest].slice(0, limit);
  }

  /** Whether two pin lists would draw the same, so a change notice that
   * brings nothing new leaves the page (and its focus) alone. */
  function samePins(a, b) {
    return a.length === b.length && a.every((pin, index) =>
      pin.url === b[index].url && pin.title === b[index].title && (pin.favicon ?? null) === (b[index].favicon ?? null));
  }

  globalThis.blancStartPins = Object.freeze({
    siteKey,
    siteOrigin,
    billboardSites,
    favoriteTiles,
    samePins,
  });
})();
