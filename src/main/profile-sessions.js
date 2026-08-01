const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

// Chromium's default Session is the long-lived store Blanc already shipped.
// Every named profile gets a stable persistent partition, while private tabs
// get an isolated in-memory partition for that profile and this app launch.
const NORMAL_PARTITION_PREFIX = 'persist:blanc-profile-';
const PRIVATE_PARTITION_PREFIX = 'private-browsing-';
const DEFAULT_PRIVATE_PARTITION = 'private-browsing';

function normalizedProfileId(profileId) {
  return validProfileId(profileId) ? profileId : DEFAULT_PROFILE_ID;
}

function normalPartitionFor(profileId) {
  const id = normalizedProfileId(profileId);
  return id === DEFAULT_PROFILE_ID ? null : `${NORMAL_PARTITION_PREFIX}${id}`;
}

function privatePartitionFor(profileId) {
  const id = normalizedProfileId(profileId);
  return id === DEFAULT_PROFILE_ID
    ? DEFAULT_PRIVATE_PARTITION
    : `${PRIVATE_PARTITION_PREFIX}${id}`;
}

function createProfileSessionRegistry({ defaultSession, fromPartition }) {
  if (!defaultSession || typeof fromPartition !== 'function') {
    throw new Error('A default session and partition factory are required');
  }

  const normalByProfile = new Map([[DEFAULT_PROFILE_ID, defaultSession]]);
  const privateByProfile = new Map();

  function normal(profileId = DEFAULT_PROFILE_ID) {
    const id = normalizedProfileId(profileId);
    if (!normalByProfile.has(id)) {
      normalByProfile.set(id, fromPartition(normalPartitionFor(id)));
    }
    return normalByProfile.get(id);
  }

  function privateSession(profileId = DEFAULT_PROFILE_ID) {
    const id = normalizedProfileId(profileId);
    if (!privateByProfile.has(id)) {
      privateByProfile.set(id, fromPartition(privatePartitionFor(id)));
    }
    return privateByProfile.get(id);
  }

  function forProfile(profileId = DEFAULT_PROFILE_ID) {
    const id = normalizedProfileId(profileId);
    return { profileId: id, normal: normal(id), private: privateSession(id) };
  }

  function all() {
    const unique = new Set([...normalByProfile.values(), ...privateByProfile.values()]);
    return [...unique];
  }

  // Partitions cannot be destroyed while Electron is running, but after a
  // named profile is deleted they must no longer be reachable through the
  // registry (or be included in future policy/apply-all loops). Its opaque id
  // is never reused, so a later create cannot inherit these Session objects.
  function remove(profileId) {
    const id = normalizedProfileId(profileId);
    if (id === DEFAULT_PROFILE_ID) return false;
    const hadNormal = normalByProfile.delete(id);
    const hadPrivate = privateByProfile.delete(id);
    return hadNormal || hadPrivate;
  }

  return { normal, private: privateSession, forProfile, all, remove };
}

module.exports = {
  NORMAL_PARTITION_PREFIX,
  PRIVATE_PARTITION_PREFIX,
  DEFAULT_PRIVATE_PARTITION,
  normalPartitionFor,
  privatePartitionFor,
  createProfileSessionRegistry,
};
