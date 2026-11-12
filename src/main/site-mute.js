'use strict';

// Mute Site (spec 2026-10-17-tab-menu-additions-design.md §4): the hosts a
// person muted, kept in memory until Blanc quits — never on disk, never
// synced. Each profile has its own set, and private tabs keep a separate one.

/** The exact web host of a URL, or null for anything that isn't http(s). */
function hostOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname || null : null;
  } catch {
    return null;
  }
}

/** Which set a tab's site mutes live in: its profile, private or not. */
function siteMuteKey(tab) {
  return `${tab?.profileId ?? ''}|${tab?.private ? 'private' : 'normal'}`;
}

function createSiteMutes() {
  const sets = new Map();
  return {
    has(key, host) { return !!host && !!sets.get(key)?.has(host); },
    /** Mute or unmute a host; returns whether it is muted now. */
    toggle(key, host) {
      if (!host) return false;
      const set = sets.get(key) ?? new Set();
      sets.set(key, set);
      if (set.delete(host)) return false;
      set.add(host);
      return true;
    },
  };
}

module.exports = { hostOf, siteMuteKey, createSiteMutes };
