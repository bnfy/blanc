'use strict';

const NATIVE_MEDIA_TYPES = {
  audio: 'microphone',
  video: 'camera',
};

const terminalDenials = new Set(['denied', 'restricted']);

/**
 * Bridge Blanc's per-site media decision to the separate macOS TCC decision.
 * The returned surface is deliberately tiny so permission policy tests can
 * inject it without loading Electron under plain `node --test`.
 */
function createNativeMediaAccessGate({ platform = process.platform, systemPreferences } = {}) {
  if (platform !== 'darwin') {
    return {
      state: () => null,
      request: async () => true,
    };
  }

  const pending = new Map();

  const nativeTypeFor = (mediaType) => NATIVE_MEDIA_TYPES[mediaType] ?? null;
  const state = (mediaType) => {
    const nativeType = nativeTypeFor(mediaType);
    if (!nativeType || typeof systemPreferences?.getMediaAccessStatus !== 'function') {
      return 'unknown';
    }
    try {
      return systemPreferences.getMediaAccessStatus(nativeType);
    } catch {
      return 'unknown';
    }
  };

  const requestOne = async (mediaType) => {
    const nativeType = nativeTypeFor(mediaType);
    if (!nativeType) return false;

    const current = state(mediaType);
    if (current === 'granted') return true;
    if (terminalDenials.has(current)) return false;
    if (typeof systemPreferences?.askForMediaAccess !== 'function') return false;

    const existing = pending.get(nativeType);
    if (existing) return existing;

    const attempt = Promise.resolve()
      .then(() => systemPreferences.askForMediaAccess(nativeType))
      .then(Boolean, () => false)
      .finally(() => pending.delete(nativeType));
    pending.set(nativeType, attempt);
    return attempt;
  };

  const request = async (mediaTypes) => {
    const unique = [...new Set((mediaTypes ?? []).filter((type) => nativeTypeFor(type)))];
    if (unique.length === 0) return false;
    for (const mediaType of unique) {
      if (!await requestOne(mediaType)) return false;
    }
    return true;
  };

  return { state, request };
}

module.exports = { createNativeMediaAccessGate, NATIVE_MEDIA_TYPES };
