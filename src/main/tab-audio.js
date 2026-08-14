'use strict';

// User mute and the one-time background-autoplay guard are deliberately
// separate. The guard suppresses media that starts for the first time while a
// tab is hidden, but it must not paint the tab as user-muted or stop audio the
// user already started before switching tabs.
function effectiveTabMuted(tab) {
  return !!(tab?.muted || tab?.backgroundAutoplayMuted);
}

function noteMediaStarted(tab, isActive) {
  if (!tab) return false;
  const shouldGuard = !tab.usedMedia && !isActive && !tab.muted;
  tab.usedMedia = true;
  if (shouldGuard) tab.backgroundAutoplayMuted = true;
  return shouldGuard;
}

function revealTabAudio(tab) {
  if (!tab?.backgroundAutoplayMuted) return false;
  tab.backgroundAutoplayMuted = false;
  return true;
}

module.exports = { effectiveTabMuted, noteMediaStarted, revealTabAudio };
