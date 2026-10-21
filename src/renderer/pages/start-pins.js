// Pinned sites and favorites for the start page. Kept pure (no DOM, no
// storage, no IPC) and served flat from this directory, so test/unit can run
// it in a vm, the same way start-site-name.js is shared and tested.
(() => {
  'use strict';

  // A pin keeps a site in the Billboard's single row of six, so there are
  // never more site pins than the row has tiles.
  const MAX_SITE_PINS = 6;
  // Favorites pins are shared by Ledger (6), Shelf (8) and Tally (5); Shelf
  // shows the most, so it sets the cap.
  const MAX_FAVORITE_PINS = 8;
  // A favorite pin is only a lookup key for a favorite main already serves,
  // never a link target, so a bound is all it needs.
  const MAX_FAVORITE_URL = 8192;

  /** A stored site pin: the site's hostname key, keyed the way main's
   * top-sites.js keys sites, and its http(s) origin. Never a path, query or
   * title, so a pin keeps no more of the user's browsing than the hidden-site
   * list does. */
  function pinFor(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      const key = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (!key || key.length > 255) return null;
      return { key, url: `${parsed.origin}/` };
    } catch {
      return null;
    }
  }

  /** Saved site pins, re-derived from their URLs: an entry whose key doesn't
   * match its own origin, a repeat, or anything past the row is dropped. */
  function readPins(saved) {
    const pins = [];
    const seen = new Set();
    for (const entry of Array.isArray(saved) ? saved : []) {
      const pin = pinFor(entry?.url);
      if (!pin || pin.key !== entry.key || seen.has(pin.key)) continue;
      seen.add(pin.key);
      pins.push(pin);
      if (pins.length === MAX_SITE_PINS) break;
    }
    return pins;
  }

  /** The pins with this site added last, or the same pins when it is already
   * pinned, can't be pinned, or the row is full. */
  function addPin(pins, site) {
    const pin = pinFor(site?.url);
    if (!pin || pin.key !== site.key) return pins;
    if (pins.some((existing) => existing.key === pin.key) || pins.length >= MAX_SITE_PINS) return pins;
    return [...pins, pin];
  }

  function removePin(pins, key) {
    return pins.filter((pin) => pin.key !== key);
  }

  /** The Billboard row: pinned sites first, in the order they were pinned,
   * then the ranked sites that are neither pinned nor hidden. A pinned site
   * that is still ranked shows its ranked page, title and icon like any other
   * tile; one that history no longer holds opens its origin under the domain's
   * name. */
  function billboardSites(pins, ranked, hidden, limit = MAX_SITE_PINS) {
    const byKey = new Map(ranked.map((site) => [site.key, site]));
    const pinnedKeys = new Set(pins.map((pin) => pin.key));
    const pinned = pins.map((pin) => ({
      ...(byKey.get(pin.key) ?? { key: pin.key, url: pin.url, title: '', favicon: null }),
      pinned: true,
    }));
    const rest = ranked
      .filter((site) => !pinnedKeys.has(site.key) && !hidden.has(site.key))
      .map((site) => ({ ...site, pinned: false }));
    return [...pinned, ...rest].slice(0, limit);
  }

  /** Saved favorite pins: favorite URLs, de-duplicated and bounded. */
  function readFavoritePins(saved) {
    const pins = [];
    for (const url of Array.isArray(saved) ? saved : []) {
      if (typeof url !== 'string' || !url || url.length > MAX_FAVORITE_URL || pins.includes(url)) continue;
      pins.push(url);
      if (pins.length === MAX_FAVORITE_PINS) break;
    }
    return pins;
  }

  /** The pins with this favorite added last, or the same pins when it is
   * already pinned or every pin is taken. */
  function addFavoritePin(pins, url) {
    if (typeof url !== 'string' || !url || url.length > MAX_FAVORITE_URL) return pins;
    if (pins.includes(url) || pins.length >= MAX_FAVORITE_PINS) return pins;
    return [...pins, url];
  }

  function removeFavoritePin(pins, url) {
    return pins.filter((pin) => pin !== url);
  }

  /** Only the pins whose favorite still exists, so deleting a favorite drops
   * its pin. */
  function livingFavoritePins(pins, favorites) {
    const urls = new Set(favorites.map((favorite) => favorite.url));
    return pins.filter((url) => urls.has(url));
  }

  /** A favorites layout's tiles: pinned favorites first, in the order they
   * were pinned, then the rest in their Favorites order. */
  function favoriteTiles(pins, favorites, limit) {
    const byUrl = new Map(favorites.map((favorite) => [favorite.url, favorite]));
    const pinned = pins.filter((url) => byUrl.has(url)).map((url) => ({ ...byUrl.get(url), pinned: true }));
    const pinnedUrls = new Set(pins);
    const rest = favorites
      .filter((favorite) => !pinnedUrls.has(favorite.url))
      .map((favorite) => ({ ...favorite, pinned: false }));
    return [...pinned, ...rest].slice(0, limit);
  }

  globalThis.blancStartPins = Object.freeze({
    MAX_SITE_PINS,
    MAX_FAVORITE_PINS,
    pinFor,
    readPins,
    addPin,
    removePin,
    billboardSites,
    readFavoritePins,
    addFavoritePin,
    removeFavoritePin,
    livingFavoritePins,
    favoriteTiles,
  });
})();
