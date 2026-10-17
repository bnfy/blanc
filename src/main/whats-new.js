'use strict';

// After an update, the start page shows a "What's new in <version>" pill that
// links to that release on the canonical changelog. It stays for 7 days, or
// until it is opened or closed. All state is device-local and never synced:
// settings.lastRunVersion (the version that last launched here),
// settings.whatsNewVersion (the update whose pill is showing, '' for none) and
// settings.whatsNewSince (when that update first launched).
const WHATS_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RELEASE_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const CHANGELOG_URL = 'https://blanc.day/changelog';

function releaseParts(version) {
  const match = RELEASE_VERSION_RE.exec(typeof version === 'string' ? version : '');
  return match ? match.slice(1).map(Number) : null;
}

function isNewerRelease(version, previous) {
  const a = releaseParts(version);
  const b = releaseParts(previous);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// The settings patch to apply once per launch, or null when nothing changed.
// A profile with no lastRunVersion predates this feature: it counts as an
// update when first-run setup was already finished, and as a fresh install
// (no pill) when it was not. A pre-release or a downgrade never shows the
// pill and clears one left over from a later version.
function whatsNewOnLaunch(settings = {}, { version, now, firstRunComplete } = {}) {
  const previous = settings.lastRunVersion;
  if (previous === version) return null;
  const patch = { lastRunVersion: version };
  const updated = previous ? isNewerRelease(version, previous) : firstRunComplete === true && !!releaseParts(version);
  if (updated) {
    patch.whatsNewVersion = version;
    patch.whatsNewSince = now;
  } else if (settings.whatsNewVersion) {
    patch.whatsNewVersion = '';
  }
  return patch;
}

// What the start page shows: { version, url } while the pill is live, or null.
function whatsNewState(settings = {}, { version, now } = {}) {
  if (!releaseParts(version) || settings.whatsNewVersion !== version) return null;
  const since = settings.whatsNewSince;
  if (!Number.isFinite(since) || since <= 0) return null;
  // A time more than one window ahead of the clock is corrupt, not a reason
  // to keep the pill.
  if (since - now > WHATS_NEW_WINDOW_MS || now - since >= WHATS_NEW_WINDOW_MS) return null;
  return { version, url: `${CHANGELOG_URL}#v${version.replace(/\./g, '-')}` };
}

module.exports = { WHATS_NEW_WINDOW_MS, isNewerRelease, whatsNewOnLaunch, whatsNewState };
