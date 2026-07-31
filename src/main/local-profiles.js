const crypto = require('crypto');
const {
  DEFAULT_PROFILE_ID,
  normalizeProfileName,
  readLocalProfiles,
  addLocalProfile,
  renameLocalProfile: renameLocalProfileRecord,
  removeLocalProfile: removeLocalProfileRecord,
} = require('./local-profile-model');

const MAX_LOCAL_PROFILES = 16;

// This manager is deliberately separate from Chromium Session creation. The
// registry records a small, human-readable identity; main owns when that
// identity becomes a window and which Electron policies attach to it.
function createLocalProfileManager({ store, makeId = crypto.randomUUID, now = Date.now }) {
  function read() {
    return readLocalProfiles(store.data);
  }

  function supportedRegistry() {
    const parsed = read();
    if (!parsed.supported) {
      throw new Error('This Blanc build cannot modify a newer local-profile registry');
    }
    return parsed.registry;
  }

  function list() {
    const parsed = read();
    return parsed.supported ? parsed.registry.profiles.map((profile) => ({ ...profile })) : [];
  }

  function get(id) {
    return list().find((profile) => profile.id === id) ?? null;
  }

  function create(name) {
    const registry = supportedRegistry();
    if (registry.profiles.length >= MAX_LOCAL_PROFILES) {
      throw new Error(`Blanc supports up to ${MAX_LOCAL_PROFILES} local profiles`);
    }
    const ordinal = registry.profiles.length + 1;
    const profile = {
      id: `profile-${String(makeId()).replace(/[^a-zA-Z0-9_-]/g, '')}`,
      name: normalizeProfileName(name, `Profile ${ordinal}`),
      createdAt: now(),
    };
    const next = addLocalProfile(registry, profile);
    store.update((data) => Object.assign(data, next));
    return next.profiles.find((candidate) => candidate.id === profile.id);
  }

  function rename(id, name) {
    const registry = supportedRegistry();
    const next = renameLocalProfileRecord(registry, id, name);
    store.update((data) => Object.assign(data, next));
    return next.profiles.find((profile) => profile.id === id) ?? null;
  }

  function remove(id) {
    const registry = supportedRegistry();
    const removed = registry.profiles.find((profile) => profile.id === id) ?? null;
    const next = removeLocalProfileRecord(registry, id);
    store.update((data) => Object.assign(data, next));
    return removed;
  }

  return { list, get, create, rename, remove };
}

let manager = null;
function ensureManager() {
  // Keep the pure registry transform usable under node --test. Electron-backed
  // persistence is only needed by the production singleton.
  const { JsonStore } = require('./store');
  return (manager ??= createLocalProfileManager({
    store: new JsonStore('profiles', { version: 0, profiles: [] }),
  }));
}

const listLocalProfiles = () => ensureManager().list();
const getLocalProfile = (id = DEFAULT_PROFILE_ID) => ensureManager().get(id);
const createLocalProfile = (name) => ensureManager().create(name);
const renameLocalProfile = (id, name) => ensureManager().rename(id, name);
const removeLocalProfile = (id) => ensureManager().remove(id);

module.exports = {
  MAX_LOCAL_PROFILES,
  createLocalProfileManager,
  listLocalProfiles,
  getLocalProfile,
  createLocalProfile,
  renameLocalProfile,
  removeLocalProfile,
};
