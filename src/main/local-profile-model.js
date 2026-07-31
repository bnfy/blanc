// Pure model for named, on-device browser profiles. It intentionally has no
// Electron or filesystem dependency: profile registry migration and workspace
// validation need the same deterministic behavior in production and tests.

const LOCAL_PROFILE_VERSION = 1;
const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = 'Personal';

function validProfileId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function normalizeProfileName(value, fallback = DEFAULT_PROFILE_NAME) {
  if (typeof value !== 'string') return fallback;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 40);
  return name || fallback;
}

function normalizeProfile(input = {}, fallbackId = DEFAULT_PROFILE_ID) {
  const id = validProfileId(input.id) ? input.id : fallbackId;
  return {
    id,
    name: normalizeProfileName(input.name, id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : 'Profile'),
    createdAt: Number.isFinite(input.createdAt) && input.createdAt >= 0 ? input.createdAt : 0,
  };
}

function emptyLocalProfiles() {
  return {
    version: LOCAL_PROFILE_VERSION,
    profiles: [normalizeProfile({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME })],
  };
}

// The root profiles registry is forward-compatible in the same way as the
// workspace: an older Blanc must leave an unrecognized newer registry alone.
function readLocalProfiles(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (Number.isInteger(source.version) && source.version > LOCAL_PROFILE_VERSION) {
    return { supported: false, migrated: false, registry: emptyLocalProfiles() };
  }
  if (source.version === LOCAL_PROFILE_VERSION && Array.isArray(source.profiles)) {
    const seen = new Set();
    const profiles = source.profiles
      .map((profile, index) => normalizeProfile(
        profile,
        index === 0 ? DEFAULT_PROFILE_ID : `profile-${index + 1}`
      ))
      .filter((profile) => {
        if (seen.has(profile.id)) return false;
        seen.add(profile.id);
        return true;
      });
    if (!profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
      profiles.unshift(normalizeProfile({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }));
    }
    return {
      supported: true,
      migrated: false,
      registry: { version: LOCAL_PROFILE_VERSION, profiles },
    };
  }
  return { supported: true, migrated: true, registry: emptyLocalProfiles() };
}

function addLocalProfile(registry, profile) {
  const parsed = readLocalProfiles(registry);
  if (!parsed.supported) return parsed.registry;
  const next = normalizeProfile(profile, '');
  if (!validProfileId(next.id) || next.id === DEFAULT_PROFILE_ID) {
    throw new Error('A non-default profile id is required');
  }
  if (parsed.registry.profiles.some((existing) => existing.id === next.id)) {
    throw new Error('Profile id already exists');
  }
  return {
    version: LOCAL_PROFILE_VERSION,
    profiles: [...parsed.registry.profiles, next],
  };
}

module.exports = {
  LOCAL_PROFILE_VERSION,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  validProfileId,
  normalizeProfileName,
  normalizeProfile,
  emptyLocalProfiles,
  readLocalProfiles,
  addLocalProfile,
};
