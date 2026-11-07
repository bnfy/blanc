'use strict';

// Every tab's zoom. Tabs run in Chromium's `isolated` zoom mode, so nothing here
// reads or writes Chromium's per-host map: that map can't hold 100% under
// another default, can't be listed, and would keep a list of every site
// visited. Blanc decides each page's zoom when it commits instead.
// See docs/superpowers/specs/2026-11-06-default-page-zoom-design.md.

const { DEFAULT_PROFILE_ID } = require('./local-profile-model');
const {
  ACTUAL_SIZE, percentToLevel, levelToPercent, nextZoomPercent,
  siteKeyFor, usesDefaultZoom, resolveZoomPercent,
} = require('./page-zoom');

const SAME_LEVEL = 0.001; // Chromium's own epsilon for equal zoom levels
const profileOf = (tab) => tab.profileId ?? DEFAULT_PROFILE_ID;

function createTabZoom({
  tabs, liveContents, defaultPercent, siteZoom, withLocalProfile, activeProfileId,
  readPreferences, internalHosts,
}) {
  // Zoom from private tabs: memory only, per profile, gone at quit like the
  // private session itself.
  const privateSites = new Map();
  const privateSitesOf = (profileId) => privateSites.get(profileId)
    ?? privateSites.set(profileId, {}).get(profileId);

  const savedSites = (profileId) => withLocalProfile(profileId, () => {
    siteZoom.migrate(() => readPreferences(activeProfileId()), internalHosts);
    return siteZoom.sites();
  });

  const percentFor = (tab, url) => resolveZoomPercent({
    url,
    privateSites: tab.private ? privateSitesOf(profileOf(tab)) : null,
    savedSites: savedSites(profileOf(tab)),
    defaultPercent: defaultPercent(),
  });

  const setPercent = (wc, percent) => {
    const level = percentToLevel(percent);
    if (Math.abs(wc.getZoomLevel() - level) >= SAME_LEVEL) wc.setZoomLevel(level);
  };

  // The PDF viewer switches its tab to `manual` and manages its own zoom.
  const inPdfViewer = (wc) => wc.getZoomMode() === 'manual';

  function refresh(tab, wc) {
    if (!inPdfViewer(wc)) setPercent(wc, percentFor(tab, wc.getURL()));
  }

  /** Every open tab of a profile, optionally on one site. Private tabs are
   * included: they read the same saved sites. */
  function refreshProfile(profileId, key = null) {
    for (const tab of tabs.values()) {
      if (profileOf(tab) !== profileId) continue;
      const wc = liveContents(tab);
      if (wc && (!key || siteKeyFor(wc.getURL()) === key)) refresh(tab, wc);
    }
  }

  const nextPercent = (wc, direction) => nextZoomPercent(levelToPercent(wc.getZoomLevel()), direction);
  const unzoomedPercent = (url) => (usesDefaultZoom(url) ? defaultPercent() : ACTUAL_SIZE);

  function step(tab, wc, direction) {
    const percent = nextPercent(wc, direction);
    const url = wc.getURL();
    const key = siteKeyFor(url);
    if (inPdfViewer(wc) || !key) {
      setPercent(wc, percent);
      return;
    }
    if (tab.private) privateSitesOf(profileOf(tab))[key] = percent;
    else withLocalProfile(profileOf(tab), () => {
      if (percent === unzoomedPercent(url)) siteZoom.removeSite(key);
      else siteZoom.setSite(key, percent);
    });
    refreshProfile(profileOf(tab), key);
  }

  function reset(tab, wc) {
    const url = wc.getURL();
    const key = siteKeyFor(url);
    if (inPdfViewer(wc)) {
      setPercent(wc, ACTUAL_SIZE);
    } else if (!key) {
      setPercent(wc, unzoomedPercent(url));
    } else {
      // A private tab can't forget a saved site, so it shadows it instead.
      if (tab.private) privateSitesOf(profileOf(tab))[key] = unzoomedPercent(url);
      else withLocalProfile(profileOf(tab), () => siteZoom.removeSite(key));
      refreshProfile(profileOf(tab), key);
    }
  }

  return {
    prepare(wc) { wc.setZoomMode('isolated'); },

    /** A main-frame commit: the only moment a tab's page can change. */
    applyToTab(tab, wc, url) {
      if (wc.getZoomMode() !== 'isolated') wc.setZoomMode('isolated');
      setPercent(wc, percentFor(tab, url));
    },

    refresh,
    step,
    reset,

    applyAll() {
      for (const tab of tabs.values()) {
        const wc = liveContents(tab);
        if (wc) refresh(tab, wc);
      }
    },

    /** The utility sheet and Reader: zoom for this view alone, saved nowhere. */
    stepDirect(wc, direction) { wc.setZoomLevel(percentToLevel(nextPercent(wc, direction))); },

    // Settings acts on the profile of the window that asked.
    list() {
      return Object.entries(savedSites(activeProfileId()))
        .map(([site, percent]) => ({ site, percent }))
        .sort((a, b) => a.site.localeCompare(b.site));
    },
    remove(key) {
      siteZoom.removeSite(key);
      refreshProfile(activeProfileId(), key);
    },
    clear() {
      siteZoom.clearSites();
      refreshProfile(activeProfileId());
    },
  };
}

module.exports = { createTabZoom };
