// Process-local profile context for code that runs on behalf of a browser
// window. Electron has one main process, so a plain module-global "current
// profile" would race whenever two windows load or receive IPC together.

const { AsyncLocalStorage } = require('async_hooks');
const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

const context = new AsyncLocalStorage();
let focusedProfileId = DEFAULT_PROFILE_ID;

function normalizedProfileId(value) {
  return validProfileId(value) ? value : DEFAULT_PROFILE_ID;
}

function withLocalProfile(profileId, work) {
  return context.run(normalizedProfileId(profileId), work);
}

function activeLocalProfileId() {
  return context.getStore() ?? focusedProfileId;
}

function setFocusedLocalProfile(profileId) {
  focusedProfileId = normalizedProfileId(profileId);
}

function isDefaultLocalProfile() {
  return activeLocalProfileId() === DEFAULT_PROFILE_ID;
}

module.exports = {
  withLocalProfile,
  activeLocalProfileId,
  setFocusedLocalProfile,
  isDefaultLocalProfile,
};
