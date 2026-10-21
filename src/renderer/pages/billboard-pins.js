// Pinned sites for the start page's Billboard row. Kept pure (no DOM, no
// storage, no IPC) and served flat from this directory, so test/unit can run
// it in a vm, the same way start-site-name.js is shared and tested.
(() => {
  'use strict';

  // A pin keeps a site in the Billboard's single row of six, so there are
  // never more pins than the row has tiles.
  const MAX_PINS = 6;

  /** A stored pin: the site's hostname key, keyed the way main's top-sites.js
   * keys sites, and its http(s) origin. Never a path, query or title, so a
   * pin keeps no more of the user's browsing than the hidden-site list does. */
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

  /** Saved pins, re-derived from their URLs: an entry whose key doesn't match
   * its own origin, a repeat, or anything past the row is dropped. */
  function readPins(saved) {
    const pins = [];
    const seen = new Set();
    for (const entry of Array.isArray(saved) ? saved : []) {
      const pin = pinFor(entry?.url);
      if (!pin || pin.key !== entry.key || seen.has(pin.key)) continue;
      seen.add(pin.key);
      pins.push(pin);
      if (pins.length === MAX_PINS) break;
    }
    return pins;
  }

  /** The pins with this site added last, or the same pins when it is already
   * pinned, can't be pinned, or the row is full. */
  function addPin(pins, site) {
    const pin = pinFor(site?.url);
    if (!pin || pin.key !== site.key) return pins;
    if (pins.some((existing) => existing.key === pin.key) || pins.length >= MAX_PINS) return pins;
    return [...pins, pin];
  }

  function removePin(pins, key) {
    return pins.filter((pin) => pin.key !== key);
  }

  /** The row: pinned sites first, in the order they were pinned, then the
   * ranked sites that are neither pinned nor hidden. A pinned site that is
   * still ranked shows its ranked page, title and icon like any other tile; one
   * that history no longer holds opens its origin under the domain's name. */
  function billboardSites(pins, ranked, hidden, limit = MAX_PINS) {
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

  globalThis.blancBillboardPins = Object.freeze({
    MAX_PINS,
    pinFor,
    readPins,
    addPin,
    removePin,
    billboardSites,
  });
})();
