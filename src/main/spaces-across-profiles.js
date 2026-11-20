'use strict';

// Spaces across profiles (spec docs/superpowers/specs/2026-11-19-spaces-
// across-profiles-design.md §5.2). The part of the Spaces payload that
// crosses into a window of ANOTHER profile. Pure: main injects the readers.
// Only the allowlisted fields below may cross: a Space's id, name, colour,
// symbol, tab count and whether a window shows it. Never its URLs, titles,
// favicons, groups or sync state, which belong to its own profile.

const { MAX_WORKSPACES } = require('./workspaces-model');

const UNREADABLE_STATUSES = ['read-failed', 'future-format', 'repair-failed'];

/** Every live profile other than `currentProfileId`, in `profiles` order,
 * with its Spaces; [] unless at least two live profiles exist. A profile
 * with no Spaces is kept (the New Space editor's Profile choice lists it);
 * the menu decides which groups to draw. */
function otherProfileSpaces({ profiles, currentProfileId, isLive, readProfile }) {
  const live = (Array.isArray(profiles) ? profiles : []).filter((profile) => isLive(profile.id));
  if (live.length < 2) return [];
  return live.filter((profile) => profile.id !== currentProfileId).map((profile) => {
    const { status, spaces, shownIds } = readProfile(profile.id);
    const readable = !UNREADABLE_STATUSES.includes(status);
    const records = readable && Array.isArray(spaces) ? spaces : [];
    return {
      id: profile.id,
      name: profile.name,
      status,
      // The store refuses a new Space at MAX_WORKSPACES records of any kind
      // (workspaces-model.js createWorkspace), so the picker agrees with it.
      full: records.length >= MAX_WORKSPACES,
      items: records.map((space) => ({
        id: space.id,
        name: space.name,
        color: space.color,
        symbol: space.symbol,
        tabCount: Array.isArray(space.urls) ? space.urls.length : 0,
        openElsewhere: shownIds?.has(space.id) === true,
      })),
    };
  });
}

module.exports = { otherProfileSpaces, UNREADABLE_STATUSES };
