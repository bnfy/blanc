const { JsonStore } = require('./store');
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { isValidDohTemplate, reconcileSecureDnsWrite, coerceSecureDnsRead } = require('./network-privacy');
const {
  VERTICAL_TABS_DEFAULT_WIDTH,
  normalizeVerticalTabsWidth,
} = require('./chrome-layout');
const APP_ICON_ASSETS = require('./app-icon-assets');
const { normalizeHomepage } = require('./top-level-url-policy');
const { migrateSupporter, downgradeMirror, isRecordActive } = require('./patron-model');

const SEARCH_ENGINES = {
  duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  brave: { label: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
};

const THEMES = ['system', 'light', 'dark'];
const TAB_LAYOUTS = ['island', 'vertical'];
// Start-page layouts (Bowser Design System, "New tab v2" handoff). Same class
// of preference as the theme — it describes the browser you want, so it syncs.
const NEWTAB_LAYOUTS = ['ledger', 'billboard', 'shelf', 'tally'];
// Device-local Quiet Tabs memory policy; deliberately not in SYNCED_KEYS.
const TAB_SLEEP_DELAYS = ['off', '30m', '1h', '6h'];

// Network-privacy enums (bare arrays, like THEMES — build.mjs parses them by name).
const WEBRTC_POLICIES = ['standard', 'strict'];
const SECURE_DNS_OPTIONS = ['auto', 'off', 'cloudflare', 'quad9', 'mullvad', 'custom'];
const FIRST_RUN_VERSION = 1;

// Keys that sync across devices (see the profile-sync spec). Deliberately
// excludes tabLayout, verticalTabsWidth, appIcon, searchSuggestions, and the
// device's 1Password integration configuration
// (device-local), usagePing (per-install consent), and supporter (never —
// that would be license sharing).
const SYNCED_KEYS = ['searchEngine', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout'];

// App icon colorways — id maps to src/renderer/pages/icon-<id>.png; order
// here is also the tile order Settings renders. 'default' is the original
// green colorway — the id (and file name) is frozen for saved settings,
// only the label moved on when Paper became the default.
const APP_ICON_LABELS = {
  paper: 'Paper',
  ink: 'Ink',
  graphite: 'Graphite',
  default: 'Evergreen',
  midnight: 'Midnight',
  cream: 'Cream',
  forest: 'Forest',
  sage: 'Sage',
};
const APP_ICONS = Object.keys(APP_ICON_LABELS);

// Supporter-only colorways — same geometry, unlocked by a Polar license
// key (see main/supporter.js). Gated at validation time, not render time.
const SUPPORTER_ICON_LABELS = { ember: 'Ember', plum: 'Plum', gold: 'Gold' };
const SUPPORTER_ICONS = Object.keys(SUPPORTER_ICON_LABELS);

// A selectable id without a packaged native stack would silently fall back to
// Paper on macOS 26+, so fail fast during startup if the two sources drift.
const missingNativeAppIcons = [...APP_ICONS, ...SUPPORTER_ICONS]
  .filter((id) => !APP_ICON_ASSETS[id]);
if (missingNativeAppIcons.length) {
  throw new Error(`Missing native app-icon assets: ${missingNativeAppIcons.join(', ')}`);
}

function normalizeAdblockHostname(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input) return null;
  try {
    return new URL(input.includes('://') ? input : `https://${input}`).hostname
      .toLowerCase()
      .replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

const DEFAULTS = {
  searchEngine: 'duckduckgo',
  // Live address-bar prefixes are sent to the selected search provider.
  // Device-local and user-disableable; private tabs override it off.
  searchSuggestions: true,
  adblockEnabled: true,
  // Empty string = the built-in blanc://newtab page.
  homePage: '',
  theme: 'system',
  // How blanc://newtab arranges itself — the shipped ledger plus three
  // alternatives from the design system's "New tab v2" handoff.
  newtabLayout: 'ledger',
  // Device-local presentation preference; deliberately not Profile Synced.
  tabLayout: 'island',
  // Preferred rail width. The live layout may temporarily cap it to preserve
  // the minimum website pane, but that window-size cap is never persisted.
  verticalTabsWidth: VERTICAL_TABS_DEFAULT_WIDTH,
  // 'off' disables automatic quieting; the manual /sleep command still works.
  tabSleep: '1h',
  appIcon: 'paper',
  // Lowercased hostnames, no protocol/path/www. prefix.
  adblockExceptions: [],
  // Network privacy (device-local — deliberately NOT in SYNCED_KEYS).
  webrtcPolicy: 'standard',
  secureDns: 'auto',
  secureDnsTemplate: '',
  // Optional, device-local bridge to the user's installed 1Password app.
  // Off until explicitly enabled. The account name/id is routing metadata,
  // never a password or service-account token, and never Profile Synced.
  onePasswordEnabled: false,
  onePasswordAccount: '',
  // Anonymous "app launched" ping — see main/telemetry.js. On by default
  // (opt-out in Settings); no browsing data, only version/OS plus a random
  // per-install id used solely to count distinct active users.
  usagePing: true,
  // Device-local completion marker for the compact first-run privacy card.
  // Existing profiles are promoted to the current version when their
  // pre-existing settings file is first opened; only a truly missing
  // settings file starts at 0.
  onboardingVersion: 0,
  // Blanc Supporter license — null, or { key, activationId, activatedAt }.
  // Written only by setSupporter() (the Polar activation flow), never by
  // the generic setSettings() path. Once set, trusted forever — offline OK.
  // Superseded by `patron` below; kept as its founding/lifetime downgrade
  // mirror so pre-Patron builds reading this file still see a valid grant.
  supporter: null,
  // Blanc Patron entitlement record — null, or { kind, key, activationId,
  // benefitId, activatedAt, lastStatus?, lastValidatedAt?, lastAttemptedAt? }.
  // Written only by setPatron() (the activation/validation flow), never by
  // the generic setSettings() path. See patron-model.js for the state machine.
  patron: null,
  // Per-key last-write timestamps for sync's LWW merge; only SYNCED_KEYS are
  // ever stamped or transmitted. See exportForSync/mergeFromSync.
  _syncMeta: {},
};

let store = null;
let existingProfileHint = null;
const listeners = new Set();

function setExistingProfileHint(existed) {
  if (store) throw new Error('setExistingProfileHint must run before settings are loaded');
  existingProfileHint = !!existed;
}

function ensureStore() {
  if (!store) {
    const settingsFile = path.join(app.getPath('userData'), 'settings.json');
    const profileAlreadyExisted = existingProfileHint ?? fs.existsSync(settingsFile);
    let storedSettings = null;
    try {
      storedSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      // Missing/corrupt settings have no trustworthy onboarding marker.
    }
    const hasOnboardingMarker =
      storedSettings &&
      Object.prototype.hasOwnProperty.call(storedSettings, 'onboardingVersion');
    store = new JsonStore('settings', DEFAULTS);
    // Profiles created before the first-run card already made their privacy
    // choices through Settings (or accepted the then-current defaults).
    // An explicit marker — including version 0 — belongs to the new flow and
    // must survive a quit before the user decides.
    const legacyProfile =
      profileAlreadyExisted &&
      (!fs.existsSync(settingsFile) || (storedSettings && !hasOnboardingMarker));
    if (legacyProfile && store.data.onboardingVersion < FIRST_RUN_VERSION) {
      store.data.onboardingVersion = FIRST_RUN_VERSION;
      store.flush();
    } else if (!profileAlreadyExisted || !storedSettings) {
      // Persist version 0 immediately. Other stores (especially session.json)
      // may appear before the choice is made; this marker prevents the next
      // launch from mistaking that interrupted first run for a legacy profile.
      store.flush();
    }
    // A legacy settings.json carrying only `supporter` gains the equivalent
    // `patron` record on next launch. Mutates the persisted store directly
    // (not a getSettings() copy) so the migration survives every future
    // ensureStore() short-circuit, not just the current process.
    const migrated = migrateSupporter({ supporter: store.data.supporter, patron: store.data.patron, now: Date.now() });
    if (migrated) {
      store.data.patron = migrated.patron;      // supporter left intact — it is the downgrade mirror for founding
      store.flush();                            // synchronous, like the onboarding-marker flushes above
    }
  }
  return store;
}

// The appIcon read back is sanitized the same way setSettings() validates
// writes — a stale/hand-edited supporter icon id with no active license
// must never reach a renderer or applyAppIcon() as if it were still valid.
function getSettings() {
  const data = { ...ensureStore().data };
  if (typeof data.searchSuggestions !== 'boolean') {
    data.searchSuggestions = DEFAULTS.searchSuggestions;
  }
  if (!Number.isInteger(data.onboardingVersion) || data.onboardingVersion < 0) {
    data.onboardingVersion = DEFAULTS.onboardingVersion;
  }
  if (!TAB_LAYOUTS.includes(data.tabLayout)) data.tabLayout = DEFAULTS.tabLayout;
  if (!NEWTAB_LAYOUTS.includes(data.newtabLayout)) data.newtabLayout = DEFAULTS.newtabLayout;
  if (!TAB_SLEEP_DELAYS.includes(data.tabSleep)) data.tabSleep = DEFAULTS.tabSleep;
  if (typeof data.onePasswordEnabled !== 'boolean') {
    data.onePasswordEnabled = DEFAULTS.onePasswordEnabled;
  }
  if (typeof data.onePasswordAccount !== 'string' || data.onePasswordAccount.length > 200) {
    data.onePasswordAccount = DEFAULTS.onePasswordAccount;
  }
  data.homePage = normalizeHomepage(data.homePage, DEFAULTS.homePage);
  data.verticalTabsWidth = normalizeVerticalTabsWidth(data.verticalTabsWidth);
  if (!isAppIconAllowed(data.appIcon)) data.appIcon = DEFAULTS.appIcon;
  // Read coercion for a corrupted stored state (hand-edited settings.json): custom
  // without a valid template reads back as the default, never as plaintext-capable
  // custom. The setSettings guard prevents a valid user action from producing this.
  data.secureDns = coerceSecureDnsRead(data.secureDns, data.secureDnsTemplate, DEFAULTS.secureDns);
  return data;
}

function isAppIconAllowed(id) {
  return APP_ICONS.includes(id) || (SUPPORTER_ICONS.includes(id) && isPatronActive());
}

/** Validate a partial settings patch against the whitelist, returning only
 * the accepted keys. Shared by setSettings (user writes) and mergeFromSync
 * (remote writes) so a tampered sync blob can't inject unvalidated values.
 * `supporter` and `patron` are deliberately absent — both are activation-flow-only,
 * written solely by setSupporter()/setPatron(), never through this whitelist. */
function sanitize(partial) {
  const clean = {};
  if (typeof partial.searchEngine === 'string' && SEARCH_ENGINES[partial.searchEngine]) {
    clean.searchEngine = partial.searchEngine;
  }
  if (typeof partial.searchSuggestions === 'boolean') {
    clean.searchSuggestions = partial.searchSuggestions;
  }
  if (typeof partial.adblockEnabled === 'boolean') clean.adblockEnabled = partial.adblockEnabled;
  if (typeof partial.usagePing === 'boolean') clean.usagePing = partial.usagePing;
  if (typeof partial.homePage === 'string') {
    clean.homePage = normalizeHomepage(partial.homePage.trim(), DEFAULTS.homePage);
  }
  if (THEMES.includes(partial.theme)) clean.theme = partial.theme;
  if (NEWTAB_LAYOUTS.includes(partial.newtabLayout)) clean.newtabLayout = partial.newtabLayout;
  if (TAB_LAYOUTS.includes(partial.tabLayout)) clean.tabLayout = partial.tabLayout;
  if (TAB_SLEEP_DELAYS.includes(partial.tabSleep)) clean.tabSleep = partial.tabSleep;
  if (Number.isFinite(partial.verticalTabsWidth)) {
    clean.verticalTabsWidth = normalizeVerticalTabsWidth(partial.verticalTabsWidth);
  }
  if (WEBRTC_POLICIES.includes(partial.webrtcPolicy)) clean.webrtcPolicy = partial.webrtcPolicy;
  if (SECURE_DNS_OPTIONS.includes(partial.secureDns)) clean.secureDns = partial.secureDns;
  if (typeof partial.secureDnsTemplate === 'string') {
    // Accept only an empty string or a valid template. An invalid value is DROPPED
    // (key omitted from clean) so it can never overwrite a good stored template; the
    // cross-field guard in setSettings then decides the secureDns transition.
    const t = partial.secureDnsTemplate.trim();
    if (t === '' || isValidDohTemplate(t)) clean.secureDnsTemplate = t;
  }
  if (typeof partial.onePasswordEnabled === 'boolean') {
    clean.onePasswordEnabled = partial.onePasswordEnabled;
  }
  if (typeof partial.onePasswordAccount === 'string') {
    clean.onePasswordAccount = partial.onePasswordAccount.trim().slice(0, 200);
  }
  if (isAppIconAllowed(partial.appIcon)) clean.appIcon = partial.appIcon;
  if (Array.isArray(partial.adblockExceptions)) {
    clean.adblockExceptions = [
      ...new Set(
        partial.adblockExceptions
          .map(normalizeAdblockHostname)
          .filter(Boolean)
      ),
    ];
  }
  return clean;
}

function setSettings(partial) {
  const s = ensureStore();
  const clean = sanitize(partial);
  // Strict-custom invariant (F25): an invalid custom transition must not degrade to
  // plaintext-capable Automatic. reconcileSecureDnsWrite (unit-tested) rejects such a
  // change, preserving the last valid configuration.
  if ('secureDns' in clean || 'secureDnsTemplate' in clean) {
    const dns = reconcileSecureDnsWrite(
      { secureDns: s.data.secureDns, secureDnsTemplate: s.data.secureDnsTemplate },
      clean,
    );
    clean.secureDns = dns.secureDns;
    clean.secureDnsTemplate = dns.secureDnsTemplate;
  }
  const now = Date.now();
  s.update((data) => {
    Object.assign(data, clean);
    data._syncMeta ??= {};
    for (const k of Object.keys(clean)) if (SYNCED_KEYS.includes(k)) data._syncMeta[k] = now;
  });
  for (const fn of listeners) fn(getSettings());
  return getSettings();
}

function onSettingsChanged(fn) {
  listeners.add(fn);
}

function isFirstRunComplete() {
  return ensureStore().data.onboardingVersion >= FIRST_RUN_VERSION;
}

/**
 * Persist both network-affecting first-run choices and the completion marker
 * in one synchronous commit. Callers must not start suggestions or telemetry
 * unless `completed` is true.
 *
 * Runs on REPLAY too: the welcome tour re-opens the onboarding dialog after
 * first run, and its privacy step edits these same choices — an early return
 * on isFirstRunComplete() would silently discard them. Re-writing the
 * completion marker is idempotent; validation always comes first.
 */
function completeFirstRunPrivacyChoices(partial = {}) {
  if (
    typeof partial.searchSuggestions !== 'boolean' ||
    typeof partial.usagePing !== 'boolean'
  ) {
    return { completed: false, error: 'invalid-choices' };
  }

  const s = ensureStore();
  const previous = {
    searchSuggestions: s.data.searchSuggestions,
    usagePing: s.data.usagePing,
    onboardingVersion: s.data.onboardingVersion,
  };
  s.update((data) => {
    data.searchSuggestions = partial.searchSuggestions;
    data.usagePing = partial.usagePing;
    data.onboardingVersion = FIRST_RUN_VERSION;
  });
  if (!s.flush()) {
    Object.assign(s.data, previous);
    return { completed: false, error: 'write-failed' };
  }
  const next = getSettings();
  for (const fn of listeners) fn(next);
  return { completed: true, settings: next };
}

function isSupporterActive() {
  return !!ensureStore().data.supporter;
}

/** The activation flow's private write path — the generic setSettings()
 * whitelist deliberately has no `supporter` entry. */
function setSupporter(record) {
  ensureStore().update((data) => {
    data.supporter = record;
  });
  for (const fn of listeners) fn(getSettings());
}

function isPatronActive() {
  return isRecordActive(ensureStore().data.patron, Date.now());
}

// The activation flow's private write path — setSettings()'s whitelist has no `patron`.
function setPatron(record) {
  ensureStore().update((data) => {
    data.patron = record;
    data.supporter = downgradeMirror(record); // founding/lifetime mirror; subscription/null → null
  });
  for (const fn of listeners) fn(getSettings()); // reapplies applyAppIcon + live UI, like setSupporter
}

// Main-process only; NEVER exposed to a renderer (the settings-page IPC
// projection sends only derived booleans — see pages.js's clientSettings()).
function getPatronRecord() {
  return ensureStore().data.patron;
}

// Snapshot the synced keys plus their per-key timestamps for the sync engine
// to encrypt. Only SYNCED_KEYS cross the wire — supporter, tabLayout, appIcon,
// searchSuggestions, usagePing, and _syncMeta's non-synced entries never leave.
function exportForSync() {
  const d = ensureStore().data;
  const values = {}, meta = {};
  for (const k of SYNCED_KEYS) {
    if (d[k] !== undefined) values[k] = d[k];
    if (d._syncMeta?.[k]) meta[k] = d._syncMeta[k];
  }
  return { values, meta };
}

// Adopt any remote key whose last-write timestamp beats ours (per-key LWW).
// Values route through sanitize() — a tampered blob can't inject unvalidated
// settings — and meta is stamped to the REMOTE time so ordering is preserved
// across devices rather than reset to now.
function mergeFromSync(remote) {
  const s = ensureStore();
  const winners = {};
  for (const k of SYNCED_KEYS) {
    const rt = remote.meta?.[k] ?? 0;
    const lt = s.data._syncMeta?.[k] ?? 0;
    if (rt > lt && remote.values?.[k] !== undefined) winners[k] = rt;
  }
  const keys = Object.keys(winners);
  if (!keys.length) return;
  const clean = sanitize(Object.fromEntries(keys.map((k) => [k, remote.values[k]])));
  s.update((data) => {
    Object.assign(data, clean);
    data._syncMeta ??= {};
    // Advance the clock for EVERY conceded key — including ones sanitize
    // rejected (e.g. an enum value a newer app version introduced) — so a
    // value we can't apply can't re-win every sync and loop forever.
    for (const k of keys) data._syncMeta[k] = winners[k];
  });
  // Notify (→ app re-applies theme/adblock) only when something was adopted.
  if (Object.keys(clean).length) for (const fn of listeners) fn(getSettings());
}

function searchUrlFor(query) {
  const { searchEngine } = getSettings();
  const engine = SEARCH_ENGINES[searchEngine] ?? SEARCH_ENGINES.duckduckgo;
  return engine.url(query);
}

module.exports = {
  SEARCH_ENGINES,
  TAB_LAYOUTS,
  NEWTAB_LAYOUTS,
  TAB_SLEEP_DELAYS,
  APP_ICONS,
  APP_ICON_LABELS,
  SUPPORTER_ICONS,
  SUPPORTER_ICON_LABELS,
  getSettings,
  setExistingProfileHint,
  setSettings,
  onSettingsChanged,
  isFirstRunComplete,
  completeFirstRunPrivacyChoices,
  searchUrlFor,
  isSupporterActive,
  isAppIconAllowed,
  setSupporter,
  isPatronActive,
  setPatron,
  getPatronRecord,
  exportForSync,
  mergeFromSync,
};
