'use strict';

// Each site's saved page zoom. One file per local profile, like Favorites;
// never synced and never sent anywhere. It stays when history is cleared, as
// remembered permissions do, because the person chose it, and Settings lists
// it with Remove and Clear all. Private tabs never reach this file.
// See docs/superpowers/specs/2026-11-06-default-page-zoom-design.md.

const { JsonStore } = require('./store');
const { validPercent, legacyZoomSites } = require('./page-zoom');

const MAX_KEY_LENGTH = 263; // a 253-character host plus `blanc://`, with room

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'site-zoom', { version: 1, sites: {}, migrated: false }, { scope: 'profile' }
));

const validKey = (key) => typeof key === 'string' && key.length > 0
  && key.length <= MAX_KEY_LENGTH && key !== '__proto__';

// Each profile's file is cleaned once, when first read; every write after that
// stores valid entries only.
const sanitized = new WeakSet();
function savedSites() {
  const data = ensureStore().data;
  if (!sanitized.has(data)) {
    const saved = data.sites && typeof data.sites === 'object' && !Array.isArray(data.sites) ? data.sites : {};
    data.sites = Object.fromEntries(Object.entries(saved)
      .filter(([key, percent]) => validKey(key) && validPercent(percent)));
    sanitized.add(data);
  }
  return data.sites;
}

const sites = () => ({ ...savedSites() });

function setSite(key, percent) {
  if (!validKey(key) || !validPercent(percent)) return;
  savedSites();
  ensureStore().update((data) => { data.sites[key] = percent; });
}

function removeSite(key) {
  if (!Object.hasOwn(savedSites(), key)) return;
  ensureStore().update((data) => { delete data.sites[key]; });
}

function clearSites() {
  savedSites();
  ensureStore().update((data) => { data.sites = {}; });
}

/** Copies zoom saved by earlier versions, once per profile. Those levels live
 * in Chromium's Preferences file, which tabs no longer read; Blanc never writes
 * to it. A missing or unreadable file means there is nothing to move. */
function migrate(readPreferences, internalHosts = []) {
  if (ensureStore().data.migrated) return;
  let legacy = {};
  try {
    legacy = legacyZoomSites(JSON.parse(readPreferences()), internalHosts);
  } catch {
    // Nothing to move.
  }
  const saved = savedSites();
  ensureStore().update((data) => {
    for (const [key, percent] of Object.entries(legacy)) {
      if (validKey(key) && !Object.hasOwn(saved, key)) data.sites[key] = percent;
    }
    data.migrated = true;
  });
}

module.exports = { sites, setSite, removeSite, clearSites, migrate };
