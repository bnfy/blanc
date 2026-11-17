'use strict';

// The Favorites layout record's store (F63): the order chosen inside each
// folder and the folders that exist empty, one per local profile like
// bookmarks.json. Profile Sync carries the Personal profile's record inside
// the settings payload as `favoritesLayout` (sync.js), the way Start Page
// pins ride there. Rules live in favorites-layout-model.js.
// See docs/superpowers/specs/2026-11-16-favorites-manager-design.md.

const crypto = require('node:crypto');
const { JsonStore } = require('./store');
const { syncClock } = require('./settings');
const { normalizeLayout, mergeLayouts, boundLayout, layoutsEqual } = require('./favorites-layout-model');

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'favorites-layout', { version: 1, layout: { version: 1, folders: {} }, clock: 0, tie: '' }, { scope: 'profile' }
));

// Two listener sets, as in bookmarks.js: a local edit schedules a sync push;
// a merge refreshes open pages without scheduling another sync.
const changeListeners = new Set();
const mergeListeners = new Set();
const onChanged = (fn) => changeListeners.add(fn);
const onMerged = (fn) => mergeListeners.add(fn);

// Each profile's saved record is normalized once, when first read; every
// write and merge stores an already-normalized record.
const normalized = new WeakSet();
function getLayout() {
  const d = ensureStore().data;
  if (!normalized.has(d)) {
    d.layout = normalizeLayout(d.layout);
    normalized.add(d);
  }
  return d.layout;
}

/** A local change: store the record within its size limit and stamp the
 * whole value's clock past any seen, so it wins its next sync. Returns
 * whether anything changed. */
function setLayout(layout) {
  const next = boundLayout(normalizeLayout(layout)).layout;
  if (layoutsEqual(next, getLayout())) return false;
  ensureStore().update((d) => {
    d.version = 1;
    d.layout = next;
    d.clock = syncClock.nextSyncWriteTimestamp(d.clock);
    d.tie = crypto.randomUUID();
  });
  for (const fn of changeListeners) fn();
  return true;
}

/** What Sync sends: the record with the whole value's clock, or null before
 * the first change (an unstamped value tells peers nothing). */
function exportForSync() {
  const d = ensureStore().data;
  if (!syncClock.validSyncTimestamp(d.clock) || d.clock === 0) return null;
  return { value: getLayout(), at: d.clock, tie: syncClock.normalizeSyncTieBreaker(d.tie) };
}

/** Merge a peer's record entry by entry. The settings payload gives the
 * value one clock, and the iPhone and the fork keep an unknown value whole
 * by that clock. So when the merge produces something the peer doesn't have,
 * the clock must pass both sides, or those clients keep a stale copy and the
 * two upload against each other on every pass. When the merge equals the
 * peer's value, its clock is adopted and nothing more is sent. */
function mergeFromSync(remote) {
  if (!remote || !syncClock.validSyncTimestamp(remote.at) || remote.at === 0) return false;
  const d = ensureStore().data;
  const current = getLayout();
  const localAt = syncClock.validSyncTimestamp(d.clock) ? d.clock : 0;
  const theirs = normalizeLayout(remote.value);
  const merged = boundLayout(mergeLayouts(current, theirs, { now: Date.now() })).layout;
  const changed = !layoutsEqual(merged, current);
  const matchesRemote = layoutsEqual(merged, theirs) && remote.value && typeof remote.value === 'object';
  if (matchesRemote && remote.at <= localAt && !changed) return false;
  ensureStore().update((data) => {
    data.version = 1;
    data.layout = merged;
    if (matchesRemote) {
      if (remote.at > localAt) {
        data.clock = remote.at;
        data.tie = syncClock.normalizeSyncTieBreaker(remote.tie);
      }
    } else {
      data.clock = syncClock.nextSyncWriteTimestamp(Math.max(localAt, remote.at));
      data.tie = crypto.randomUUID();
    }
  });
  normalized.add(ensureStore().data);
  if (changed) for (const fn of mergeListeners) fn();
  return changed;
}

module.exports = { getLayout, setLayout, exportForSync, mergeFromSync, onChanged, onMerged };
