'use strict';

const crypto = require('node:crypto');
const {
  DEFAULT_PROFILE_ID,
  normalizeProfileName,
  readLocalProfiles,
  addLocalProfile,
  renameLocalProfile: renameLocalProfileRecord,
  removeLocalProfile: removeLocalProfileRecord,
} = require('./local-profile-model');

const MAX_LOCAL_PROFILES = 16;

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
    return parsed.supported
      ? parsed.registry.profiles.map((profile) => ({ ...profile }))
      : [];
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
    const opaque = String(makeId()).replace(/[^a-zA-Z0-9_-]/g, '');
    const profile = {
      id: `profile_${opaque}`.slice(0, 64),
      name: normalizeProfileName(name, `Profile ${ordinal}`),
      createdAt: now(),
    };
    const next = addLocalProfile(registry, profile);
    store.update((data) => Object.assign(data, next));
    return next.profiles.find((candidate) => candidate.id === profile.id);
  }

  function rename(id, name) {
    const next = renameLocalProfileRecord(supportedRegistry(), id, name);
    store.update((data) => Object.assign(data, next));
    return next.profiles.find((profile) => profile.id === id) ?? null;
  }

  function remove(id, { flush = false } = {}) {
    const registry = supportedRegistry();
    const removed = registry.profiles.find((profile) => profile.id === id) ?? null;
    const next = removeLocalProfileRecord(registry, id);
    const apply = (data) => Object.assign(data, next);
    if (flush) {
      if (typeof store.updateAndFlush !== 'function' || !store.updateAndFlush(apply)) {
        throw new Error('Couldn’t persist the profile deletion.');
      }
    } else {
      store.update(apply);
    }
    return removed;
  }

  return { list, get, create, rename, remove };
}

let manager = null;
function ensureManager() {
  const { JsonStore } = require('./store');
  return (manager ??= createLocalProfileManager({
    store: new JsonStore('profiles', { version: 0, profiles: [] }),
  }));
}

const listLocalProfiles = () => ensureManager().list();
const getLocalProfile = (id = DEFAULT_PROFILE_ID) => ensureManager().get(id);
const createLocalProfile = (name) => ensureManager().create(name);
const renameLocalProfile = (id, name) => ensureManager().rename(id, name);
const removeLocalProfile = (id, options) => ensureManager().remove(id, options);

module.exports = {
  MAX_LOCAL_PROFILES,
  createLocalProfileManager,
  listLocalProfiles,
  getLocalProfile,
  createLocalProfile,
  renameLocalProfile,
  removeLocalProfile,
};
