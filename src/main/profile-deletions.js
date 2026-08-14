'use strict';

const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

const DELETE_MARKER_VERSION = 1;

function normalizePending(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const ids = Array.isArray(source.profileIds) ? source.profileIds : [];
  return [...new Set(ids.filter((id) =>
    validProfileId(id) && id !== DEFAULT_PROFILE_ID))];
}

// The durable marker is stored outside the profile data directory. Once it is
// flushed, that identity is terminal: startup suppresses its workspaces and a
// retry can finish cleanup after a crash or a transient filesystem failure.
function createProfileDeletionManager({ store }) {
  if (!store || typeof store.updateAndFlush !== 'function') {
    throw new Error('A durable profile-deletion store is required');
  }

  const pending = () => normalizePending(store.data);
  const has = (profileId) => pending().includes(profileId);

  function mark(profileId) {
    if (!validProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) {
      throw new Error('Only a named local profile can be deleted');
    }
    if (has(profileId)) return true;
    const saved = store.updateAndFlush((data) => {
      data.version = DELETE_MARKER_VERSION;
      data.profileIds = [...pending(), profileId];
    });
    if (!saved) {
      throw new Error('Couldn’t safely start profile deletion. Check disk space and try again.');
    }
    return true;
  }

  function clear(profileId) {
    if (!has(profileId)) return true;
    const saved = store.updateAndFlush((data) => {
      data.version = DELETE_MARKER_VERSION;
      data.profileIds = pending().filter((id) => id !== profileId);
    });
    if (!saved) throw new Error('Couldn’t finish profile deletion bookkeeping.');
    return true;
  }

  return { pending, has, mark, clear };
}

let manager = null;
function ensureManager() {
  if (manager) return manager;
  const { JsonStore } = require('./store');
  manager = createProfileDeletionManager({
    store: new JsonStore('profile-deletions', {
      version: DELETE_MARKER_VERSION,
      profileIds: [],
    }),
  });
  return manager;
}

const pendingProfileDeletions = () => ensureManager().pending();
const hasPendingProfileDeletion = (profileId) => ensureManager().has(profileId);
const markProfileDeletion = (profileId) => ensureManager().mark(profileId);
const clearProfileDeletion = (profileId) => ensureManager().clear(profileId);

module.exports = {
  DELETE_MARKER_VERSION,
  normalizePending,
  createProfileDeletionManager,
  pendingProfileDeletions,
  hasPendingProfileDeletion,
  markProfileDeletion,
  clearProfileDeletion,
};
