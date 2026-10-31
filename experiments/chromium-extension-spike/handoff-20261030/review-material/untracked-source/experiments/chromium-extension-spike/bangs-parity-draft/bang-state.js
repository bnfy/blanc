'use strict';
// An isolated state-transition model. Native ownership, persistence, trusted
// context, navigation, notifications and sync are required before integration.
const Bangs = require('./shipping/bangs');
const catalog = require('./shipping/bangs-catalog');
const { createBangResolver } = require('./shipping/bang-resolution');
const { normalizeCustomBangs, normalizeRecentBangs } = require('./shipping-normalizers');

function normalizeSnapshot(snapshot) {
  const input = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    bangsEnabled: typeof input.bangsEnabled === 'boolean' ? input.bangsEnabled : true,
    customBangs: normalizeCustomBangs(input.customBangs),
    recentBangs: normalizeRecentBangs(input.recentBangs),
  };
}

// Pure calculation only: it never navigates or persists. The native owner must
// resolve again against its current snapshot, derive privacy from the target
// tab itself, and commit recents only through its profile-owned storage.
function resolveRequest(snapshot, input, isPrivate) {
  if (typeof input !== 'string' || typeof isPrivate !== 'boolean')
    throw new TypeError('typed text and native privacy state required');
  const state = normalizeSnapshot(snapshot);
  const old = [...state.recentBangs];
  const settings = {
    getSettings: () => state,
    recordRecentBang: code => {
      state.recentBangs = normalizeRecentBangs([code, ...state.recentBangs]);
    },
  };
  const resolver = createBangResolver({ settings, catalog, Bangs });
  const resolved = resolver.resolveTyped(input, { private: isPrivate });
  return {
    resolved,
    bangShaped: resolver.hasBangToken(input),
    recentsChanged: JSON.stringify(old) !== JSON.stringify(state.recentBangs),
    nextRecents: [...state.recentBangs],
    view: resolver.state(),
  };
}
module.exports = { normalizeSnapshot, resolveRequest };
