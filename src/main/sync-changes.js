'use strict';
// The change check (design 2026-11-02): which fixed stores to fetch, given
// the versions the Worker named and the ones this device last read or wrote.
// Pure: the iPhone replays the same cases from the shared sync vectors.
const FIXED_STORES = ['bookmarks', 'settings', 'session', 'icons', 'sends', 'closed', 'shared', 'spaces'];
const OPEN_TABS = new Set(['session', 'icons']);
const CHECK_MS = 15000;            // while a Blanc window is focused (iPhone: in front)
const BACKGROUND_CHECK_MS = 60000; // desktop, no Blanc window focused
const FULL_PASS_MS = 300000;       // every store and class R, while the check works
const RETRY_PASS_MS = 60000;       // pending and failed uploads
const CHECK_RETRY_AFTER_MS = 600000; // after a fallback to the minute pass
const OPEN_TABS_MS = 60000;        // session and icons at most once a minute
const R_PER_PASS = 5;              // class R re-reads per full pass

/** A store is fetched when its named version differs from the one seen
 * (a store never seen counts as absent). Open tabs that moved wait until a
 * minute after their last fetch. */
function changedStores({ named, seen, now, lastOpenTabsFetch }) {
  const fetch = [], deferred = [];
  for (const store of FIXED_STORES) {
    if ((named[store] ?? null) === (seen[store] ?? null)) continue;
    (OPEN_TABS.has(store) && now - lastOpenTabsFetch < OPEN_TABS_MS ? deferred : fetch).push(store);
  }
  return { fetch, deferred };
}

/** A fetch that read another version than the check named (a read that raced
 * a newer write) leaves the store changed for the next check. */
const confirmFetched = ({ named, store, fetchedVersion }) => (named[store] ?? null) === (fetchedVersion ?? null);

module.exports = { FIXED_STORES, CHECK_MS, BACKGROUND_CHECK_MS, FULL_PASS_MS, RETRY_PASS_MS, CHECK_RETRY_AFTER_MS, OPEN_TABS_MS, R_PER_PASS, changedStores, confirmFetched };
