'use strict';
// Start-page sync card policy (design 2026-09-17 §5.2). Pure: no electron.
//
// shouldShowSyncNudge feeds the SHARED startPageStatus() object. The
// persistent flag is what makes the card one-time; `syncEnabled` stays as a
// defensive check for the window before the startup setter runs and for a
// flag write that failed to persist. Personal-only and private exclusions
// are deliberately NOT here: the status object is broadcast to every open
// start page, so each recipient tab applies syncNudgeForTab at the send site.

function shouldShowSyncNudge({ firstRunComplete, syncEnabled, dismissed } = {}) {
  return firstRunComplete === true && syncEnabled !== true && dismissed !== true;
}

function syncNudgeForTab(shared, tab, defaultProfileId) {
  return shared === true && !!tab && tab.profileId === defaultProfileId && !tab.private;
}

module.exports = { shouldShowSyncNudge, syncNudgeForTab };
