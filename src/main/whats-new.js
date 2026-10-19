'use strict';

// After an update, the start page shows a "What's new in <version>" pill. It
// stays for 7 days, or until it is opened or closed. While it is live, main
// asks blanc.day once per launch whether the feature release's What's New page
// (/whats-new/<major>.<minor>) exists; once it does, the pill links there and,
// after an update that changed major.minor, the page opens once in a new tab
// (docs/superpowers/specs/2026-10-19-whats-new-page-design.md). Until then the
// pill links to the release on the changelog. All state is device-local and
// never synced: settings.lastRunVersion (the version that last launched here),
// settings.whatsNewVersion (the update whose pill is showing, '' for none),
// settings.whatsNewSince (when that update first launched),
// settings.whatsNewPageVersion (the running version whose page was found) and
// settings.whatsNewTabRelease (the feature release, major.minor, that no
// longer owes a tab: its tab opened, or it arrived as a fresh install or a
// bug-fix update).
const WHATS_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RELEASE_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const CHANGELOG_URL = 'https://blanc.day/changelog';
const WHATS_NEW_PAGE_ORIGIN = 'https://blanc.day';

function releaseParts(version) {
  const match = RELEASE_VERSION_RE.exec(typeof version === 'string' ? version : '');
  return match ? match.slice(1).map(Number) : null;
}

// The feature release a version belongs to: '1.39.2' → '1.39'.
function featureRelease(version) {
  const parts = releaseParts(version);
  return parts ? `${parts[0]}.${parts[1]}` : null;
}

function whatsNewPageUrl(version) {
  return `${WHATS_NEW_PAGE_ORIGIN}/whats-new/${featureRelease(version)}`;
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
// pill and clears one left over from a later version. Every new version needs
// its own page check. Only an update that changes major.minor leaves a tab
// owed; a fresh install or a bug-fix update settles it at once.
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
  patch.whatsNewPageVersion = '';
  const release = featureRelease(version);
  const freshInstall = !previous && firstRunComplete !== true;
  const bugFix = updated && !!previous && featureRelease(previous) === release;
  if (release && (freshInstall || bugFix)) patch.whatsNewTabRelease = release;
  return patch;
}

// Whether to ask blanc.day for the page this launch: only while the pill is
// live, and while the page has not been found for this version or its
// feature release still owes a tab (found, but no window could take it).
function whatsNewCheckDue(settings = {}, { version, now } = {}) {
  if (!pillLive(settings, { version, now })) return false;
  return settings.whatsNewPageVersion !== version || settings.whatsNewTabRelease !== featureRelease(version);
}

// What the answer changes: { patch, openUrl }. A found page points the pill
// at it, and opens once when its feature release still owes a tab and a
// window can take it (canOpen); otherwise the tab stays owed for a later launch.
function whatsNewAfterCheck(settings = {}, { version, found, canOpen } = {}) {
  if (!found) return { patch: null, openUrl: null };
  const patch = { whatsNewPageVersion: version };
  const release = featureRelease(version);
  if (!canOpen || !release || settings.whatsNewTabRelease === release) return { patch, openUrl: null };
  patch.whatsNewTabRelease = release;
  patch.whatsNewVersion = '';
  return { patch, openUrl: whatsNewPageUrl(version) };
}

function pillLive(settings, { version, now }) {
  if (!releaseParts(version) || settings.whatsNewVersion !== version) return false;
  const since = settings.whatsNewSince;
  if (!Number.isFinite(since) || since <= 0) return false;
  // A time more than one window ahead of the clock is corrupt, not a reason
  // to keep the pill.
  return !(since - now > WHATS_NEW_WINDOW_MS || now - since >= WHATS_NEW_WINDOW_MS);
}

// What the start page shows: { version, url } while the pill is live, or null.
function whatsNewState(settings = {}, { version, now } = {}) {
  if (!pillLive(settings, { version, now })) return null;
  const url = settings.whatsNewPageVersion === version
    ? whatsNewPageUrl(version)
    : `${CHANGELOG_URL}#v${version.replace(/\./g, '-')}`;
  return { version, url };
}

module.exports = {
  WHATS_NEW_WINDOW_MS,
  WHATS_NEW_PAGE_ORIGIN,
  featureRelease,
  isNewerRelease,
  whatsNewPageUrl,
  whatsNewOnLaunch,
  whatsNewCheckDue,
  whatsNewAfterCheck,
  whatsNewState,
};
