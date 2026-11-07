'use strict';

// The rules for page zoom, with no Electron in them: the step ladder, percent
// and level conversion, which pages have a site key, and what zoom a page
// should have. See docs/superpowers/specs/2026-11-06-default-page-zoom-design.md.

// Chrome's steps. Every default option sits on the ladder, so ⌘+ and ⌘− can
// always land exactly on 100% from any default.
const ZOOM_STEPS = Object.freeze([25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500]);
const DEFAULT_ZOOM_OPTIONS = Object.freeze([50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]);
const ACTUAL_SIZE = 100;
const MIN_PERCENT = ZOOM_STEPS[0];
const MAX_PERCENT = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const ZOOM_BASE = 1.2; // Chromium: factor = 1.2 ^ level

const normalizePageZoom = (value) => (DEFAULT_ZOOM_OPTIONS.includes(value) ? value : ACTUAL_SIZE);
const validPercent = (value) => Number.isInteger(value) && value >= MIN_PERCENT && value <= MAX_PERCENT;
const percentToLevel = (percent) => Math.log(percent / 100) / Math.log(ZOOM_BASE);
const levelToPercent = (level) => Math.round(100 * ZOOM_BASE ** level);

/** The next step from `percent`, which may sit between steps. */
function nextZoomPercent(percent, direction) {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > percent) ?? MAX_PERCENT;
  return ZOOM_STEPS.findLast((step) => step < percent) ?? MIN_PERCENT;
}

const parseUrl = (url) => {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
};

/** What a page's zoom is saved under. Internal pages keep their scheme so
 * they can't collide with a web host; anything host-less has no key. */
function siteKeyFor(url) {
  const parsed = parseUrl(url);
  if (!parsed?.hostname) return null;
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.hostname;
  return parsed.protocol === 'blanc:' ? `blanc://${parsed.hostname}` : null;
}

function usesDefaultZoom(url) {
  const protocol = parseUrl(url)?.protocol;
  return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
}

function resolveZoomPercent({ url, privateSites, savedSites, defaultPercent }) {
  const key = siteKeyFor(url);
  return (key && (privateSites?.[key] ?? savedSites?.[key]))
    ?? (usesDefaultZoom(url) ? defaultPercent : ACTUAL_SIZE);
}

/** Zoom saved by earlier versions, from a parsed Chromium Preferences file.
 * Chromium keys hosts without a scheme, so `internalHosts` names the ones that
 * were Blanc's own pages. Levels it would show as 100% or outside the steps'
 * range are left behind. */
function legacyZoomSites(preferences, internalHosts = []) {
  const partitions = preferences?.partition?.per_host_zoom_levels;
  if (!partitions || typeof partitions !== 'object') return {};
  const sites = {};
  for (const hosts of Object.values(partitions)) {
    if (!hosts || typeof hosts !== 'object') continue;
    for (const [host, entry] of Object.entries(hosts)) {
      const level = typeof entry === 'number' ? entry : entry?.zoom_level;
      if (typeof level !== 'number' || !Number.isFinite(level)) continue;
      const percent = levelToPercent(level);
      if (percent === ACTUAL_SIZE || !validPercent(percent)) continue;
      sites[internalHosts.includes(host) ? `blanc://${host}` : host] = percent;
    }
  }
  return sites;
}

module.exports = {
  ZOOM_STEPS,
  DEFAULT_ZOOM_OPTIONS,
  ACTUAL_SIZE,
  normalizePageZoom,
  validPercent,
  percentToLevel,
  levelToPercent,
  nextZoomPercent,
  siteKeyFor,
  usesDefaultZoom,
  resolveZoomPercent,
  legacyZoomSites,
};
