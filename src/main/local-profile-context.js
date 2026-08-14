'use strict';

// A module-global current profile races as soon as two windows receive async
// callbacks together. AsyncLocalStorage follows the same ownership boundary
// as window runtimes, with the focused profile only as a legacy root fallback.

const { AsyncLocalStorage } = require('node:async_hooks');
const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

const context = new AsyncLocalStorage();
let focusedProfileId = DEFAULT_PROFILE_ID;

const normalizedProfileId = (value) =>
  validProfileId(value) ? value : DEFAULT_PROFILE_ID;

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
