'use strict';
// Models v1.44.1 listStartPagePins: first canonical-URL Favorite wins;
// otherwise a cached site icon may be used. Callbacks must be local-cache-only.
// Private windows deliberately never request either cache.
function identity(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { url: u.href, site: u.hostname.toLowerCase().replace(/^www\./, '') };
  } catch { return null; }
}
function enrichPinFavicons(pins, { isPrivate, favorites, siteIcon }) {
  if (!Array.isArray(pins)) throw new TypeError('pins must be an array');
  if (isPrivate) return pins.map(pin => ({ ...pin, favicon: null }));
  const icons = new Map();
  for (const favorite of favorites()) {
    const key = identity(favorite.url)?.url;
    if (key && !icons.has(key)) icons.set(key, favorite.favicon);
  }
  return pins.map(pin => {
    const key = identity(pin.url);
    return { ...pin, favicon: (key ? icons.get(key.url) ?? siteIcon(key.site) : null) ?? null };
  });
}
module.exports = { identity, enrichPinFavicons };
