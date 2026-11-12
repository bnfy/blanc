'use strict';

// User mute and the one-time background-autoplay guard are deliberately
// separate. The guard suppresses media that starts for the first time while a
// tab is hidden, but it must not paint the tab as user-muted or stop audio the
// user already started before switching tabs.
// A site mute (Mute Site, until Blanc quits) mutes every tab on that host
// unless the person unmuted that one tab (siteUnmuted).
const siteMutedTab = (tab) => !!(tab?.siteMuted && !tab?.siteUnmuted);

function effectiveTabMuted(tab) {
  return !!(tab?.muted || tab?.backgroundAutoplayMuted || siteMutedTab(tab));
}

/** What the tab shows as muted: the person's mute or a site mute, never the
 * temporary autoplay guard. */
function shownMuted(tab) {
  return !!(tab?.muted || siteMutedTab(tab));
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

module.exports = { effectiveTabMuted, shownMuted, noteMediaStarted, revealTabAudio };
