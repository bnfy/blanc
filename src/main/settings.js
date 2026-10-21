const { JsonStore } = require('./store');
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isValidDohTemplate, reconcileSecureDnsWrite, coerceSecureDnsRead } = require('./network-privacy');
const {
  VERTICAL_TABS_DEFAULT_WIDTH,
  normalizeVerticalTabsWidth,
} = require('./chrome-layout');
const APP_ICON_ASSETS = require('./app-icon-assets');
const { normalizeHomepage } = require('./top-level-url-policy');
const { normalizeWash, normalizeWashStyle } = require('./wallpaper-model');
const { normalizePreset, normalizeFill } = require('./start-page-paint');
const clockRules = require('./start-clock-style');
const { AUTO_HIDE_STYLES, normalizeAutoHideStyle } = require('./island-autohide');
const { migrateSupporter, downgradeMirror, isRecordActive } = require('./patron-model');
const { DEFAULT_MAPPING, mappingOrDefault, validMapping } = require('./mouse-gestures');
const { normalizeDeviceNames, setDeviceNameEntry, mergeDeviceNames, deviceNamesEqual } = require('./device-names');
const {
  isValidSearchTemplate,
  searchUrlFromTemplate,
  searchTemplateLabel,
  reconcileSearchEngineWrite,
} = require('./search-engine-template');
// The pure bang grammar, shared with the overlay (src/renderer/pages/bangs.js).
const Bangs = require('../renderer/pages/bangs');

const SEARCH_ENGINES = {
  duckduckgo: { label: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  google: { label: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  bing: { label: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  brave: { label: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}` },
  kagi: { label: 'Kagi', url: (q) => `https://kagi.com/search?q=${encodeURIComponent(q)}` },
  // The user's own address (searchEngineTemplate). No url here: every search
  // goes through currentSearchEngine(), which builds it from the template.
  custom: { label: 'Custom' },
};
// Own keys only: SEARCH_ENGINES.constructor is truthy, but not an engine.
const isSearchEngineId = (id) => typeof id === 'string' && Object.hasOwn(SEARCH_ENGINES, id);

const THEMES = ['system', 'light', 'dark'];
const TAB_LAYOUTS = ['island', 'vertical'];
// Start-page layouts (Bowser Design System, "New tab v2" handoff). Same class
// of preference as the theme — it describes the browser you want, so it syncs.
const NEWTAB_LAYOUTS = ['ledger', 'billboard', 'shelf', 'tally'];
// Device-local Quiet Tabs memory policy; deliberately not in SYNCED_KEYS.
const TAB_SLEEP_DELAYS = ['off', '30m', '1h', '6h'];
// Device-local Tab Archive delay (F52); off by default, never in SYNCED_KEYS.
const TAB_ARCHIVE_DELAYS = ['off', '12h', '1d', '7d', '30d'];
// Interface language: 'system' or a BCP 47 language code. Device-local (never
// in SYNCED_KEYS) and written ONLY by setUiLanguage(): the generic whitelist
// has no entry, so pages:settings:set cannot bypass the relaunch flow.
// An app version as package.json writes it (lastRunVersion, whatsNewVersion,
// whatsNewPageVersion).
const APP_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
// A feature release, major.minor (whatsNewTabRelease).
const FEATURE_RELEASE_RE = /^\d+\.\d+$/;
const UI_LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const isFraction = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
/** A remembered Glance card frame: four fractions of the page area. */
const isGlanceFrame = (value) => !!value && typeof value === 'object'
  && ['x', 'y', 'width', 'height'].every((key) => isFraction(value[key]));
const isUiLanguageValue = (value) => value === 'system' || (typeof value === 'string' && UI_LANGUAGE_CODE.test(value));
// Unix milliseconds beyond this point are corrupted sync metadata, not a
// plausible device clock. The bound also leaves ample safe-integer headroom
// for the Lamport increment applied after a future-dated write is observed.
const MAX_SYNC_TIMESTAMP = Date.UTC(3000, 0, 1);

// Network-privacy enums (bare arrays, like THEMES — build.mjs parses them by name).
const WEBRTC_POLICIES = ['standard', 'compatibility', 'strict'];
// WebRTC audio playout policy. Stable targets 400 ms and Resilient 1000 ms in
// the receiver jitter buffer; Automatic leaves Chromium's tradeoff untouched.
const WEBRTC_AUDIO_BUFFERS = ['automatic', 'stable', 'resilient'];
const SECURE_DNS_OPTIONS = ['auto', 'off', 'cloudflare', 'quad9', 'mullvad', 'custom'];
const FIRST_RUN_VERSION = 1;
// One deliberate reset for the release that establishes Sunrise + Billboard
// as Blanc's new presentation defaults. Existing profiles without this marker
// are reset once; choices made afterward survive every later update.
const PRESENTATION_DEFAULTS_RESET_VERSION = 1;
// Tab group names were saved lowercase until this marker's release; an
// existing profile gives them a capital first letter once (main.js
// recaseSavedGroupNamesOnce; spec 2026-10-16-island-lower-section §9.2).
const GROUP_NAMES_RECASE_VERSION = 1;

// Device-local moving-in checklist and default-browser reminder flags.
const CHECKLIST_FLAGS = [
  'migrationChecklistDismissed',
  'syncMigrationCompleted',
  'tabImportCompleted',
  'spaceMigrationCompleted',
  'spaceChecklistIntroduced',
  'defaultBrowserMigrationCompleted',
  'defaultChecklistIntroduced',
  'defaultBrowserReminderShown',
];

// Keys that sync across devices (see the profile-sync spec). Deliberately
// excludes tabLayout, verticalTabsWidth, appIcon, searchSuggestions, and the
// device's 1Password integration configuration
// (device-local), usagePing (per-install consent), and supporter (never —
// that would be license sharing).
// deviceNames is merged entry by entry (device-names.js), never as one
// last-writer-wins value, and only setDeviceName() writes it.
const SYNCED_KEYS = ['searchEngine', 'searchEngineTemplate', 'adblockEnabled', 'homePage', 'theme', 'adblockExceptions', 'newtabLayout', 'newtabDynamicWallpaper', 'newtabColorWallpaper', 'newtabWallpaperColor', 'newtabWallpaperFill', 'newtabFollowSpaceColor', 'newtabClockFont', 'newtabClockWeight', 'newtabClockColor', 'newtabClockTone', 'newtabClockStyle', 'bangsEnabled', 'customBangs', 'deviceNames'];

// App icon variants — id maps to src/renderer/pages/icon-<id>.png; order here
// is also the tile order Settings renders.
const APP_ICON_LABELS = {
  sunrise: 'Sunrise',
  'sunrise-dark': 'Sunrise Dark',
  'sunrise-gold': 'Sunrise Gold',
};
const APP_ICONS = Object.keys(APP_ICON_LABELS);

// A selectable id without a packaged native stack would silently fall back to
// Sunrise on macOS 26+, so fail fast during startup if the two sources drift.
const missingNativeAppIcons = APP_ICONS
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

function normalizeHostnameList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeAdblockHostname).filter(Boolean))];
}

const MAX_CUSTOM_BANGS = 100;
const MAX_RECENT_BANGS = 10;
const MAX_CUSTOM_BANG_NAME = 60;

/** A person's own bangs: { code, name, template } rows, code per the shared
 * grammar and lowercased, name trimmed to 1–60 characters, template valid
 * by the custom search address's rule. Junk rows are dropped, unknown keys
 * stripped, the first of a duplicate code kept, at most 100. */
function normalizeCustomBangs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const code = typeof row.code === 'string' ? row.code.trim().toLowerCase() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const template = typeof row.template === 'string' ? row.template.trim() : '';
    if (!Bangs.isBangCode(code) || seen.has(code)) continue;
    if (!name || name.length > MAX_CUSTOM_BANG_NAME) continue;
    if (!isValidSearchTemplate(template)) continue;
    seen.add(code);
    out.push({ code, name, template });
    if (out.length >= MAX_CUSTOM_BANGS) break;
  }
  return out;
}

function normalizeRecentBangs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const code of value) {
    if (!Bangs.isBangCode(code) || out.includes(code)) continue;
    out.push(code);
    if (out.length >= MAX_RECENT_BANGS) break;
  }
  return out;
}

const DEFAULTS = {
  searchEngine: 'duckduckgo',
  // The Custom engine's address, with %s where the query goes. Synced with
  // searchEngine; search-engine-template.js validates it on write and read.
  searchEngineTemplate: '',
  // Live address-bar prefixes are sent to the selected search provider.
  // Device-local and user-disableable; private tabs override it off.
  searchSuggestions: true,
  // Bangs (`!yt lofi`). The switch and the person's own bangs sync; the
  // recently used codes are usage data — device-local, deliberately NOT in
  // SYNCED_KEYS, never written from private tabs, cleared with history.
  bangsEnabled: true,
  customBangs: [],
  recentBangs: [],
  adblockEnabled: true,
  // Provider/configuration are device/profile local, outside Profile Sync.
  adblockProvider: 'blanc',
  // Empty string = the built-in blanc://newtab page.
  homePage: '',
  theme: 'system',
  // How blanc://newtab arranges itself — the shipped ledger plus three
  // alternatives from the design system's "New tab v2" handoff.
  newtabLayout: 'billboard',
  newtabDynamicWallpaper: false,
  // A Spaces preset color instead of the artwork, its fill, and whether a
  // window in a Space takes that Space's color. Synced like the layout.
  newtabColorWallpaper: false,
  newtabWallpaperColor: 'sage',
  newtabWallpaperFill: 'gradient',
  newtabFollowSpaceColor: false,
  // The Billboard clock's Font & Color (start-clock-style.js): a bundled face,
  // its weight, the page's ink or a Spaces preset at a tone, and Solid or
  // Glass. The defaults draw the clock as it was. Synced like the layout.
  newtabClockFont: 'instrument',
  newtabClockWeight: 500,
  newtabClockColor: 'auto',
  newtabClockTone: 50,
  newtabClockStyle: 'solid',
  // Show this device's own image on the Start Page when one is stored
  // (wallpaper.js). Device-local like the image itself, so not Profile Synced.
  newtabCustomWallpaper: false,
  // How much of the theme's wash covers that image (0–100). Device-local too.
  newtabWallpaperWash: 100,
  // Which wash: auto (theme), light, dark or spotlight. Device-local too.
  newtabWallpaperStyle: 'auto',
  // Device-local presentation preference; deliberately not Profile Synced.
  tabLayout: 'island',
  // Paint the Island strip with the active site's top-edge/theme color.
  // Off keeps it on the theme background. Device-local, not Profile Synced.
  islandSiteColors: true,
  islandHoverOpen: false,
  // Page fills the window; the Island strip returns at the top edge.
  // Device-local, not Profile Synced.
  islandAutoHide: false,
  islandAutoHideStyle: 'float',
  // Floating Glance: the card's remembered size and place, as fractions of
  // the page area ({x, y, width, height}, each 0..1), or null for the
  // first-open frame. Device-local, written ONLY by setGlanceFrame().
  glanceFrame: null,
  // Preferred rail width. The live layout may temporarily cap it to preserve
  // the minimum website pane, but that window-size cap is never persisted.
  verticalTabsWidth: VERTICAL_TABS_DEFAULT_WIDTH,
  // 'off' disables automatic quieting; the manual /sleep command still works.
  tabSleep: '1h',
  tabArchive: 'off',
  // 'system' follows the OS; a stored code that is no longer selectable is kept
  // and renders English (see src/main/i18n.js). Device-local, not Profile Synced.
  uiLanguage: 'system',
  mouseGesturesEnabled: false,
  mouseGestureMapping: { ...DEFAULT_MAPPING },
  appIcon: 'sunrise',
  // Device-local migration marker; never user-writable or Profile Synced.
  presentationDefaultsResetVersion: PRESENTATION_DEFAULTS_RESET_VERSION,
  // Device-local migration marker (group names keep case); never user-writable or synced.
  groupNamesRecasedVersion: GROUP_NAMES_RECASE_VERSION,
  // Lowercased hostnames, no protocol/path/www. prefix.
  adblockExceptions: [],
  // Dark websites: darken sites without their own dark mode while Blanc is
  // dark. Off until chosen. Device-local — deliberately NOT in SYNCED_KEYS.
  darkWebsites: false,
  // Sites left as drawn; same normalization as adblockExceptions.
  darkWebsitesExceptions: [],
  // Network privacy (device-local — deliberately NOT in SYNCED_KEYS).
  webrtcPolicy: 'standard',
  // Call playback continuity (device-local — deliberately NOT in SYNCED_KEYS).
  webrtcAudioBuffer: 'automatic',
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
  // When this device first saved its privacy choices (ms since the epoch;
  // 0 = before this field existed, or never). Written only by
  // completeFirstRunPrivacyChoices(); the default-browser reminder measures
  // install age from it, so it needs no telemetry state.
  firstRunCompletedAt: 0,
  // Device-local moving-in checklist state. Completion means the migration
  // action succeeded at least once; it is not cleared if the feature is later
  // turned off or used again. None of these keys are Profile Synced.
  migrationChecklistDismissed: false,
  syncMigrationCompleted: false,
  tabImportCompleted: false,
  // F41: "Make your first space" completed, and the one-time introduction of
  // that task (so a checklist that already retired stays retired).
  spaceMigrationCompleted: false,
  spaceChecklistIntroduced: false,
  // "Make Blanc your default" completed (Blanc was seen as the default at
  // least once), the one-time introduction of that task, and whether the
  // single later reminder (default-browser-reminder.js) was already shown.
  defaultBrowserMigrationCompleted: false,
  defaultChecklistIntroduced: false,
  defaultBrowserReminderShown: false,
  // When the start page's Patron upgrade pill was last closed (ms since the
  // epoch; 0 = never). It stays hidden for 90 days (patron-callout.js).
  // Device-local, never Profile Synced.
  patronCalloutDismissedAt: 0,
  // The start page's What's new pill after an update (whats-new.js): the
  // version that last launched on this device, the update whose pill is
  // showing ('' for none), and when that update first launched (ms since the
  // epoch). Device-local, never Profile Synced.
  lastRunVersion: '',
  whatsNewVersion: '',
  whatsNewSince: 0,
  // What's New page state (src/main/whats-new.js): the version whose page was
  // found, and the feature release that no longer owes a tab.
  whatsNewPageVersion: '',
  whatsNewTabRelease: '',
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
  // Names the user gave synced devices: deviceId → { name, at, tie }, a clock
  // per entry (device-names.js). Profile Synced; written only by
  // setDeviceName(), never by the Settings page.
  deviceNames: {},
  // Per-key last-write timestamps and equal-clock tie-breakers for sync's LWW
  // merge; only SYNCED_KEYS are ever stamped or transmitted. See
  // exportForSync/mergeFromSync.
  _syncMeta: {},
  // UUID tie-breakers make equal timestamp writes converge across devices.
  // Kept separate so older clients can continue reading the numeric meta map.
  _syncTieBreakers: {},
};

function validSyncTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < MAX_SYNC_TIMESTAMP;
}

// A device clock can be ahead of this one. Once we have observed that
// device's per-key timestamp, a later LOCAL choice must advance beyond it or
// the same remote value will win again on every pull until wall time catches
// up. Treat the saved timestamp as a Lamport-clock floor while retaining
// Date.now() for ordinary cross-device ordering.
function nextSyncWriteTimestamp(previous, now = Date.now()) {
  const observed = validSyncTimestamp(previous) ? previous : 0;
  return Math.max(now, observed + 1);
}

function normalizeSyncTieBreaker(value) {
  return typeof value === 'string' && value.length <= 128 ? value : '';
}

function canonicalSyncValue(value) {
  return JSON.stringify(value);
}

// Smaller tokens win so a missing token from an older Blanc version remains
// authoritative on an equal-clock conflict. If both tokens are legacy (or a
// copied profile duplicated one), the value itself supplies a final stable
// ordering. This makes the merge commutative instead of "local wins ties".
function remoteWinsSyncTie(remoteTie, localTie, remoteValue, localValue) {
  if (remoteTie !== localTie) return remoteTie < localTie;
  return canonicalSyncValue(remoteValue) < canonicalSyncValue(localValue);
}

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
    const storedPresentationResetVersion = Number.isInteger(
      storedSettings?.presentationDefaultsResetVersion,
    ) ? storedSettings.presentationDefaultsResetVersion : 0;
    const storedGroupNamesRecasedVersion = Number.isInteger(
      storedSettings?.groupNamesRecasedVersion,
    ) ? storedSettings.groupNamesRecasedVersion : 0;
    store = new JsonStore('settings', DEFAULTS);
    // DEFAULTS stamp a fresh profile as already recased; an existing profile
    // without the stamp still owes main its one pass over session.json.
    if (profileAlreadyExisted && storedGroupNamesRecasedVersion < GROUP_NAMES_RECASE_VERSION) {
      store.update((data) => { data.groupNamesRecasedVersion = storedGroupNamesRecasedVersion; });
    }
    // Remove the unreleased city preference from development profiles. The
    // wallpaper follows this machine's clock and retains no location choice.
    if (Object.prototype.hasOwnProperty.call(store.data, 'newtabWallpaperCity')) {
      store.updateAndFlush((data) => { delete data.newtabWallpaperCity; });
    }
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
    if (
      profileAlreadyExisted &&
      storedPresentationResetVersion < PRESENTATION_DEFAULTS_RESET_VERSION
    ) {
      const resetAt = Date.now();
      store.updateAndFlush((data) => {
        data.appIcon = DEFAULTS.appIcon;
        data.newtabLayout = DEFAULTS.newtabLayout;
        data.presentationDefaultsResetVersion = PRESENTATION_DEFAULTS_RESET_VERSION;
        // newtabLayout is synced. Give this deliberate local reset a fresh
        // clock so an older remote preference cannot immediately undo it.
        data._syncMeta ??= {};
        data._syncMeta.newtabLayout = nextSyncWriteTimestamp(
          data._syncMeta.newtabLayout,
          resetAt,
        );
        data._syncTieBreakers ??= {};
        data._syncTieBreakers.newtabLayout = crypto.randomUUID();
      });
    }
    // Mahjong is now a standalone game. Persist Billboard with a fresh Sync
    // clock so an old client cannot restore the retired layout on the next pull.
    if (store.data.newtabLayout === 'mahjong') {
      store.updateAndFlush((data) => {
        data.newtabLayout = DEFAULTS.newtabLayout;
        data._syncMeta ??= {};
        data._syncMeta.newtabLayout = nextSyncWriteTimestamp(data._syncMeta.newtabLayout);
        data._syncTieBreakers ??= {};
        data._syncTieBreakers.newtabLayout = crypto.randomUUID();
      });
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
// writes — a stale/hand-edited retired id must never reach a renderer or
// applyAppIcon() as if it were still valid.
function getSettings() {
  const data = { ...ensureStore().data };
  if (typeof data.searchSuggestions !== 'boolean') {
    data.searchSuggestions = DEFAULTS.searchSuggestions;
  }
  if (typeof data.bangsEnabled !== 'boolean') data.bangsEnabled = DEFAULTS.bangsEnabled;
  data.customBangs = normalizeCustomBangs(data.customBangs);
  data.recentBangs = normalizeRecentBangs(data.recentBangs);
  if (!Number.isInteger(data.onboardingVersion) || data.onboardingVersion < 0) {
    data.onboardingVersion = DEFAULTS.onboardingVersion;
  }
  for (const key of CHECKLIST_FLAGS) {
    if (typeof data[key] !== 'boolean') data[key] = DEFAULTS[key];
  }
  if (!Number.isFinite(data.patronCalloutDismissedAt) || data.patronCalloutDismissedAt < 0) {
    data.patronCalloutDismissedAt = DEFAULTS.patronCalloutDismissedAt;
  }
  for (const key of ['lastRunVersion', 'whatsNewVersion', 'whatsNewPageVersion']) {
    if (typeof data[key] !== 'string' || (data[key] && !APP_VERSION_RE.test(data[key]))) data[key] = DEFAULTS[key];
  }
  if (typeof data.whatsNewTabRelease !== 'string' || (data.whatsNewTabRelease && !FEATURE_RELEASE_RE.test(data.whatsNewTabRelease))) {
    data.whatsNewTabRelease = DEFAULTS.whatsNewTabRelease;
  }
  if (!Number.isFinite(data.whatsNewSince) || data.whatsNewSince < 0) data.whatsNewSince = DEFAULTS.whatsNewSince;
  if (!Number.isFinite(data.firstRunCompletedAt) || data.firstRunCompletedAt < 0) {
    data.firstRunCompletedAt = DEFAULTS.firstRunCompletedAt;
  }
  if (!TAB_LAYOUTS.includes(data.tabLayout)) data.tabLayout = DEFAULTS.tabLayout;
  if (typeof data.islandSiteColors !== 'boolean') data.islandSiteColors = DEFAULTS.islandSiteColors;
  if (typeof data.islandHoverOpen !== 'boolean') data.islandHoverOpen = DEFAULTS.islandHoverOpen;
  if (typeof data.islandAutoHide !== 'boolean') data.islandAutoHide = DEFAULTS.islandAutoHide;
  data.islandAutoHideStyle = normalizeAutoHideStyle(data.islandAutoHideStyle);
  if (!isGlanceFrame(data.glanceFrame)) data.glanceFrame = null;
  if (typeof data.darkWebsites !== 'boolean') data.darkWebsites = DEFAULTS.darkWebsites;
  data.darkWebsitesExceptions = normalizeHostnameList(data.darkWebsitesExceptions);
  if (typeof data.newtabDynamicWallpaper !== 'boolean') data.newtabDynamicWallpaper = false;
  if (typeof data.newtabCustomWallpaper !== 'boolean') data.newtabCustomWallpaper = false;
  if (typeof data.newtabColorWallpaper !== 'boolean') data.newtabColorWallpaper = false;
  if (normalizePreset(data.newtabWallpaperColor) === null) data.newtabWallpaperColor = DEFAULTS.newtabWallpaperColor;
  if (normalizeFill(data.newtabWallpaperFill) === null) data.newtabWallpaperFill = DEFAULTS.newtabWallpaperFill;
  if (typeof data.newtabFollowSpaceColor !== 'boolean') data.newtabFollowSpaceColor = false;
  if (clockRules.normalizeFont(data.newtabClockFont) === null) data.newtabClockFont = DEFAULTS.newtabClockFont;
  if (clockRules.normalizeWeight(data.newtabClockWeight) === null) data.newtabClockWeight = DEFAULTS.newtabClockWeight;
  if (clockRules.normalizeColor(data.newtabClockColor) === null) data.newtabClockColor = DEFAULTS.newtabClockColor;
  if (clockRules.normalizeTone(data.newtabClockTone) === null) data.newtabClockTone = DEFAULTS.newtabClockTone;
  if (clockRules.normalizeStyle(data.newtabClockStyle) === null) data.newtabClockStyle = DEFAULTS.newtabClockStyle;
  if (normalizeWash(data.newtabWallpaperWash) === null) data.newtabWallpaperWash = DEFAULTS.newtabWallpaperWash;
  if (normalizeWashStyle(data.newtabWallpaperStyle) === null) data.newtabWallpaperStyle = DEFAULTS.newtabWallpaperStyle;
  if (!NEWTAB_LAYOUTS.includes(data.newtabLayout)) data.newtabLayout = DEFAULTS.newtabLayout;
  if (!TAB_SLEEP_DELAYS.includes(data.tabSleep)) data.tabSleep = DEFAULTS.tabSleep;
  if (!TAB_ARCHIVE_DELAYS.includes(data.tabArchive)) data.tabArchive = DEFAULTS.tabArchive;
  if (!isUiLanguageValue(data.uiLanguage)) data.uiLanguage = DEFAULTS.uiLanguage;
  if (!['blanc', 'ublock-origin'].includes(data.adblockProvider)) data.adblockProvider = DEFAULTS.adblockProvider;
  if (typeof data.mouseGesturesEnabled !== 'boolean') data.mouseGesturesEnabled = false;
  data.mouseGestureMapping = mappingOrDefault(data.mouseGestureMapping);
  if (!WEBRTC_POLICIES.includes(data.webrtcPolicy)) data.webrtcPolicy = DEFAULTS.webrtcPolicy;
  if (!WEBRTC_AUDIO_BUFFERS.includes(data.webrtcAudioBuffer)) {
    data.webrtcAudioBuffer = DEFAULTS.webrtcAudioBuffer;
  }
  if (typeof data.onePasswordEnabled !== 'boolean') {
    data.onePasswordEnabled = DEFAULTS.onePasswordEnabled;
  }
  if (typeof data.onePasswordAccount !== 'string' || data.onePasswordAccount.length > 200) {
    data.onePasswordAccount = DEFAULTS.onePasswordAccount;
  }
  data.deviceNames = normalizeDeviceNames(data.deviceNames);
  data.homePage = normalizeHomepage(data.homePage, DEFAULTS.homePage);
  data.verticalTabsWidth = normalizeVerticalTabsWidth(data.verticalTabsWidth);
  if (!isAppIconAllowed(data.appIcon)) data.appIcon = DEFAULTS.appIcon;
  // Read coercion for a corrupted stored state (hand-edited settings.json): custom
  // without a valid template reads back as the default, never as plaintext-capable
  // custom. The setSettings guard prevents a valid user action from producing this.
  data.secureDns = coerceSecureDnsRead(data.secureDns, data.secureDnsTemplate, DEFAULTS.secureDns);
  // Read rule, like secureDns: an unknown id, or Custom without a valid
  // address (a hand-edited file, or a sync that delivered the engine before
  // an address this device accepts), reads as the default. A search never
  // goes to a broken address.
  if (typeof data.searchEngineTemplate !== 'string') data.searchEngineTemplate = DEFAULTS.searchEngineTemplate;
  if (!isSearchEngineId(data.searchEngine) ||
      (data.searchEngine === 'custom' && !isValidSearchTemplate(data.searchEngineTemplate))) {
    data.searchEngine = DEFAULTS.searchEngine;
  }
  return data;
}

function isAppIconAllowed(id) {
  return APP_ICONS.includes(id);
}

/** Validate a partial settings patch against the whitelist, returning only
 * the accepted keys. Shared by setSettings (user writes) and mergeFromSync
 * (remote writes) so a tampered sync blob can't inject unvalidated values.
 * `supporter` and `patron` are deliberately absent — both are activation-flow-only,
 * written solely by setSupporter()/setPatron(), never through this whitelist. */
function sanitize(partial) {
  const clean = {};
  if (isSearchEngineId(partial.searchEngine)) clean.searchEngine = partial.searchEngine;
  if (typeof partial.searchEngineTemplate === 'string') {
    // Like secureDnsTemplate: empty or valid, else DROPPED so a bad value can
    // never overwrite a good stored address. setSettings then decides whether
    // Custom may be selected.
    const t = partial.searchEngineTemplate.trim();
    if (t === '' || isValidSearchTemplate(t)) clean.searchEngineTemplate = t;
  }
  if (typeof partial.searchSuggestions === 'boolean') {
    clean.searchSuggestions = partial.searchSuggestions;
  }
  if (typeof partial.bangsEnabled === 'boolean') clean.bangsEnabled = partial.bangsEnabled;
  if (Array.isArray(partial.customBangs)) clean.customBangs = normalizeCustomBangs(partial.customBangs);
  // recentBangs is written only by recordRecentBang()/clearRecentBangs().
  if (typeof partial.adblockEnabled === 'boolean') clean.adblockEnabled = partial.adblockEnabled;
  if (['blanc', 'ublock-origin'].includes(partial.adblockProvider)) clean.adblockProvider = partial.adblockProvider;
  if (typeof partial.usagePing === 'boolean') clean.usagePing = partial.usagePing;
  for (const key of CHECKLIST_FLAGS) {
    if (typeof partial[key] === 'boolean') clean[key] = partial[key];
  }
  if (Number.isFinite(partial.patronCalloutDismissedAt) && partial.patronCalloutDismissedAt >= 0) {
    clean.patronCalloutDismissedAt = partial.patronCalloutDismissedAt;
  }
  for (const key of ['lastRunVersion', 'whatsNewVersion', 'whatsNewPageVersion']) {
    if (typeof partial[key] === 'string' && (partial[key] === '' || APP_VERSION_RE.test(partial[key]))) clean[key] = partial[key];
  }
  if (typeof partial.whatsNewTabRelease === 'string' && (partial.whatsNewTabRelease === '' || FEATURE_RELEASE_RE.test(partial.whatsNewTabRelease))) {
    clean.whatsNewTabRelease = partial.whatsNewTabRelease;
  }
  if (Number.isFinite(partial.whatsNewSince) && partial.whatsNewSince >= 0) clean.whatsNewSince = partial.whatsNewSince;
  if (typeof partial.homePage === 'string') {
    clean.homePage = normalizeHomepage(partial.homePage.trim(), DEFAULTS.homePage);
  }
  if (THEMES.includes(partial.theme)) clean.theme = partial.theme;
  if (typeof partial.newtabDynamicWallpaper === 'boolean') clean.newtabDynamicWallpaper = partial.newtabDynamicWallpaper;
  if (typeof partial.newtabCustomWallpaper === 'boolean') clean.newtabCustomWallpaper = partial.newtabCustomWallpaper;
  if (typeof partial.newtabColorWallpaper === 'boolean') clean.newtabColorWallpaper = partial.newtabColorWallpaper;
  if (normalizePreset(partial.newtabWallpaperColor) !== null) clean.newtabWallpaperColor = partial.newtabWallpaperColor;
  if (normalizeFill(partial.newtabWallpaperFill) !== null) clean.newtabWallpaperFill = partial.newtabWallpaperFill;
  if (typeof partial.newtabFollowSpaceColor === 'boolean') clean.newtabFollowSpaceColor = partial.newtabFollowSpaceColor;
  Object.assign(clean, clockRules.settingsForClock({
    font: partial.newtabClockFont,
    weight: partial.newtabClockWeight,
    color: partial.newtabClockColor,
    tone: partial.newtabClockTone,
    style: partial.newtabClockStyle,
  }));
  if (normalizeWash(partial.newtabWallpaperWash) !== null) clean.newtabWallpaperWash = partial.newtabWallpaperWash;
  if (normalizeWashStyle(partial.newtabWallpaperStyle) !== null) clean.newtabWallpaperStyle = partial.newtabWallpaperStyle;
  if (NEWTAB_LAYOUTS.includes(partial.newtabLayout)) clean.newtabLayout = partial.newtabLayout;
  if (TAB_LAYOUTS.includes(partial.tabLayout)) clean.tabLayout = partial.tabLayout;
  if (typeof partial.islandSiteColors === 'boolean') clean.islandSiteColors = partial.islandSiteColors;
  if (typeof partial.islandHoverOpen === 'boolean') clean.islandHoverOpen = partial.islandHoverOpen;
  if (typeof partial.islandAutoHide === 'boolean') clean.islandAutoHide = partial.islandAutoHide;
  if (AUTO_HIDE_STYLES.includes(partial.islandAutoHideStyle)) clean.islandAutoHideStyle = partial.islandAutoHideStyle;
  if (TAB_SLEEP_DELAYS.includes(partial.tabSleep)) clean.tabSleep = partial.tabSleep;
  if (TAB_ARCHIVE_DELAYS.includes(partial.tabArchive)) clean.tabArchive = partial.tabArchive;
  if (typeof partial.mouseGesturesEnabled === 'boolean') clean.mouseGesturesEnabled = partial.mouseGesturesEnabled;
  if (validMapping(partial.mouseGestureMapping)) clean.mouseGestureMapping = { ...partial.mouseGestureMapping };
  if (Number.isFinite(partial.verticalTabsWidth)) {
    clean.verticalTabsWidth = normalizeVerticalTabsWidth(partial.verticalTabsWidth);
  }
  if (WEBRTC_POLICIES.includes(partial.webrtcPolicy)) clean.webrtcPolicy = partial.webrtcPolicy;
  if (WEBRTC_AUDIO_BUFFERS.includes(partial.webrtcAudioBuffer)) {
    clean.webrtcAudioBuffer = partial.webrtcAudioBuffer;
  }
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
  if (typeof partial.darkWebsites === 'boolean') clean.darkWebsites = partial.darkWebsites;
  if (Array.isArray(partial.darkWebsitesExceptions)) {
    clean.darkWebsitesExceptions = normalizeHostnameList(partial.darkWebsitesExceptions);
  }
  return clean;
}

function setSettings(partial) {
  const s = ensureStore();
  const clean = sanitize(partial);
  // Strict-custom invariant (F25): an invalid custom transition must not degrade to
  // plaintext-capable Automatic. reconcileSecureDnsWrite (unit-tested) rejects such a
  // change, preserving the last valid configuration. sanitize() already dropped
  // a refused address, so drop the provider sent with it too: otherwise Custom
  // could switch on with an older stored address while Settings says the
  // previous provider is still in use.
  if (typeof partial.secureDnsTemplate === 'string' && !('secureDnsTemplate' in clean)) {
    delete clean.secureDns;
  }
  if ('secureDns' in clean || 'secureDnsTemplate' in clean) {
    const dns = reconcileSecureDnsWrite(
      { secureDns: s.data.secureDns, secureDnsTemplate: s.data.secureDnsTemplate },
      clean,
    );
    clean.secureDns = dns.secureDns;
    clean.secureDnsTemplate = dns.secureDnsTemplate;
  }
  // Custom needs a valid address. A change that would leave Custom selected
  // without one is refused, keeping the previous engine and address; keys
  // the write didn't touch are never re-stamped for sync. sanitize() already
  // dropped a refused address, so drop the engine sent with it too: otherwise
  // Custom could switch on with an older stored address, and the engine
  // would be re-stamped for sync on every refused edit.
  if (typeof partial.searchEngineTemplate === 'string' && !('searchEngineTemplate' in clean)) {
    delete clean.searchEngine;
  }
  if ('searchEngine' in clean || 'searchEngineTemplate' in clean) {
    const search = reconcileSearchEngineWrite(
      { searchEngine: s.data.searchEngine, searchEngineTemplate: s.data.searchEngineTemplate },
      clean,
    );
    delete clean.searchEngine;
    delete clean.searchEngineTemplate;
    Object.assign(clean, search);
  }
  const now = Date.now();
  s.update((data) => {
    Object.assign(data, clean);
    data._syncMeta ??= {};
    data._syncTieBreakers ??= {};
    for (const k of Object.keys(clean)) {
      if (SYNCED_KEYS.includes(k)) {
        data._syncMeta[k] = nextSyncWriteTimestamp(data._syncMeta[k], now);
        data._syncTieBreakers[k] = crypto.randomUUID();
      }
    }
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
    firstRunCompletedAt: s.data.firstRunCompletedAt,
  };
  s.update((data) => {
    data.searchSuggestions = partial.searchSuggestions;
    data.usagePing = partial.usagePing;
    data.onboardingVersion = FIRST_RUN_VERSION;
    if (!(data.firstRunCompletedAt > 0)) data.firstRunCompletedAt = Date.now();
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

// A bang used is usage data, not a settings change: it never wakes the
// generic listeners (theme, blocker, sync, every window's broadcast). Main
// subscribes here to push the Island's picker its new recents.
const recentListeners = new Set();
function onRecentBangsChanged(fn) { recentListeners.add(fn); }
function notifyRecentBangs() {
  const recent = getSettings().recentBangs;
  for (const fn of recentListeners) fn(recent);
}

/** A bang was used: remember its primary code, newest first, at most ten.
 * Private write path — the generic whitelist has no recentBangs entry.
 * Callers skip private tabs. Returns whether the list changed. */
function recordRecentBang(code) {
  if (!Bangs.isBangCode(code)) return false;
  const before = JSON.stringify(getSettings().recentBangs);
  ensureStore().update((data) => {
    data.recentBangs = normalizeRecentBangs([code, ...(Array.isArray(data.recentBangs) ? data.recentBangs : [])]);
  });
  if (JSON.stringify(getSettings().recentBangs) === before) return false;
  notifyRecentBangs();
  return true;
}

/** Clearing history also forgets which bangs were used. */
function clearRecentBangs() {
  if (getSettings().recentBangs.length === 0) return;
  ensureStore().update((data) => {
    data.recentBangs = [];
  });
  notifyRecentBangs();
}

/** The language-transition service's private write path (src/main/i18n.js
 * changeUiLanguage). Flushes synchronously so a relaunch reads the new value;
 * a failed flush restores the previous value. */
function setUiLanguage(code, selectable) {
  if (code !== 'system' && !(Array.isArray(selectable) && selectable.includes(code))) return false;
  const s = ensureStore();
  const previous = s.data.uiLanguage;
  s.update((data) => { data.uiLanguage = code; });
  if (!s.flush()) {
    s.data.uiLanguage = previous;
    return false;
  }
  for (const fn of listeners) fn(getSettings());
  return true;
}

/** The floating Glance's private write path: the card's remembered frame,
 * or null to forget it. setSettings()'s whitelist has no glanceFrame. */
function setGlanceFrame(frame) {
  if (frame !== null && !isGlanceFrame(frame)) return false;
  const next = frame === null ? null : { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  ensureStore().update((data) => { data.glanceFrame = next; });
  for (const fn of listeners) fn(getSettings());
  return true;
}

function isDynamicWallpaperEnabled() {
  return getSettings().newtabDynamicWallpaper === true;
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

// Snapshot the synced keys plus their per-key clocks for the sync engine to
// encrypt. Only SYNCED_KEYS cross the wire — supporter, tabLayout, appIcon,
// searchSuggestions, usagePing, and unrelated internal entries never leave.
function exportForSync() {
  const d = ensureStore().data;
  const values = {}, meta = {}, tieBreakers = {};
  for (const k of SYNCED_KEYS) {
    if (k === 'deviceNames') {
      const names = normalizeDeviceNames(d.deviceNames);
      if (Object.keys(names).length) values.deviceNames = names;
    } else if (d[k] !== undefined) {
      values[k] = d[k];
    }
    if (validSyncTimestamp(d._syncMeta?.[k]) && d._syncMeta[k] > 0) {
      meta[k] = d._syncMeta[k];
      const tieBreaker = normalizeSyncTieBreaker(d._syncTieBreakers?.[k]);
      if (tieBreaker) tieBreakers[k] = tieBreaker;
    }
  }
  return { values, meta, tieBreakers };
}

// Adopt any remote key whose per-key LWW clock beats ours. Values route through
// sanitize() — a tampered blob can't inject unvalidated settings — and the
// remote timestamp/tie-breaker are retained so ordering stays convergent.
function mergeFromSync(remote) {
  const s = ensureStore();
  const namesChanged = mergeDeviceNamesFromSync(s, remote);
  const winners = {};
  for (const k of SYNCED_KEYS) {
    if (k === 'deviceNames') continue; // merged entry by entry above
    const rt = remote.meta?.[k];
    if (!validSyncTimestamp(rt) || rt === 0 || remote.values?.[k] === undefined) continue;
    const storedLocalTimestamp = s.data._syncMeta?.[k];
    const lt = validSyncTimestamp(storedLocalTimestamp) ? storedLocalTimestamp : 0;
    const remoteTie = normalizeSyncTieBreaker(remote.tieBreakers?.[k]);
    const localTie = normalizeSyncTieBreaker(s.data._syncTieBreakers?.[k]);
    if (rt > lt) {
      winners[k] = { timestamp: rt, tieBreaker: remoteTie };
      continue;
    }
    if (rt !== lt) continue;

    // Only a valid setting participates in an equal-clock tie. A strictly
    // newer unknown enum still advances the clock below, preserving the
    // mixed-version loop protection, but invalid peers cannot win a tie.
    const remoteClean = sanitize({ [k]: remote.values[k] });
    if (!Object.prototype.hasOwnProperty.call(remoteClean, k)) continue;
    const localClean = sanitize({ [k]: s.data[k] });
    const localValue = Object.prototype.hasOwnProperty.call(localClean, k)
      ? localClean[k]
      : DEFAULTS[k];
    if (remoteWinsSyncTie(remoteTie, localTie, remoteClean[k], localValue)) {
      winners[k] = { timestamp: rt, tieBreaker: remoteTie };
    }
  }
  const keys = Object.keys(winners);
  if (!keys.length) {
    if (namesChanged) for (const fn of listeners) fn(getSettings());
    return;
  }
  const clean = sanitize(Object.fromEntries(keys.map((k) => [k, remote.values[k]])));
  s.update((data) => {
    Object.assign(data, clean);
    data._syncMeta ??= {};
    data._syncTieBreakers ??= {};
    // Advance the clock for EVERY conceded key — including ones sanitize
    // rejected (e.g. an enum value a newer app version introduced) — so a
    // value we can't apply can't re-win every sync and loop forever.
    for (const k of keys) {
      data._syncMeta[k] = winners[k].timestamp;
      data._syncTieBreakers[k] = winners[k].tieBreaker;
    }
  });
  // Notify (→ app re-applies theme/adblock) only when something was adopted.
  if (Object.keys(clean).length || namesChanged) for (const fn of listeners) fn(getSettings());
}

// Each device's name keeps its own clock, so two Macs renaming two devices
// both keep their renames. The key's clock is the larger of both sides.
function mergeDeviceNamesFromSync(s, remote) {
  const remoteNames = remote?.values?.deviceNames;
  if (remoteNames === undefined) return false;
  const local = normalizeDeviceNames(s.data.deviceNames);
  const merged = mergeDeviceNames(local, remoteNames);
  const rt = validSyncTimestamp(remote.meta?.deviceNames) ? remote.meta.deviceNames : 0;
  const lt = validSyncTimestamp(s.data._syncMeta?.deviceNames) ? s.data._syncMeta.deviceNames : 0;
  const changed = !deviceNamesEqual(local, merged);
  if (!changed && rt <= lt) return false;
  s.update((data) => {
    data.deviceNames = merged;
    data._syncMeta ??= {};
    data._syncMeta.deviceNames = Math.max(lt, rt);
  });
  return changed;
}

function getDeviceNames() {
  return normalizeDeviceNames(ensureStore().data.deviceNames);
}

/** Give a synced device a name; an empty name clears it, so the device's
 * published name shows again. The only writer of deviceNames. */
function setDeviceName(deviceId, rawName, now = Date.now()) {
  const s = ensureStore();
  const current = normalizeDeviceNames(s.data.deviceNames);
  const previous = Object.hasOwn(current, deviceId) ? current[deviceId] : null;
  const next = setDeviceNameEntry(current, deviceId, rawName, {
    at: nextSyncWriteTimestamp(previous?.at, now),
    tie: crypto.randomUUID(),
  });
  const entry = Object.hasOwn(next, deviceId) ? next[deviceId] : null;
  if (!entry || entry.name === (previous?.name ?? '')) return current;
  s.update((data) => {
    data.deviceNames = next;
    data._syncMeta ??= {};
    data._syncMeta.deviceNames = nextSyncWriteTimestamp(data._syncMeta.deviceNames, now);
  });
  for (const fn of listeners) fn(getSettings());
  return next;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// What a payload tells a peer: only clocked values are ever adopted
// (mergeFromSync), so a value saved before sync stamped settings carries
// nothing and two Macs that differ only there already agree.
function adoptableSyncPayload(payload) {
  const out = {};
  for (const [k, at] of Object.entries(payload?.meta ?? {})) {
    if (!validSyncTimestamp(at) || at === 0 || payload.values?.[k] === undefined) continue;
    out[k] = { value: payload.values[k], at, tie: normalizeSyncTieBreaker(payload.tieBreakers?.[k]) };
  }
  return out;
}

/** Sync's repair check: a remote blob that already tells peers everything
 * this device would upload needs no PUT; anything else (a Blanc that
 * predates a key dropped it, say) uploads again. The focus refresh pulls
 * settings once a minute, so this keeps it to a GET when nothing changed. */
function syncPayloadEquals(exported, remote) {
  if (!remote || typeof remote !== 'object') return false;
  return stableJson(adoptableSyncPayload(exported)) === stableJson(adoptableSyncPayload(remote));
}

/** The engine searches use now, after the read rule: { id, label, url(query) }.
 * The address bar, the ⌘L search row, Search for "…" and suggestions all go
 * through this, so a new engine type can't be missed in one of them. */
function currentSearchEngine() {
  const { searchEngine, searchEngineTemplate } = getSettings();
  if (searchEngine === 'custom') {
    return {
      id: 'custom',
      label: searchTemplateLabel(searchEngineTemplate),
      url: (query) => searchUrlFromTemplate(searchEngineTemplate, query),
    };
  }
  const { label, url } = SEARCH_ENGINES[searchEngine];
  return { id: searchEngine, label, url };
}

function searchUrlFor(query) {
  return currentSearchEngine().url(query);
}

/** Whether main still owes this profile its one capitalization of saved
 * group names. */
function groupNamesRecaseDue() {
  ensureStore();
  return !(store.data.groupNamesRecasedVersion >= GROUP_NAMES_RECASE_VERSION);
}

function markGroupNamesRecased() {
  ensureStore().updateAndFlush((data) => { data.groupNamesRecasedVersion = GROUP_NAMES_RECASE_VERSION; });
}

module.exports = {
  groupNamesRecaseDue,
  markGroupNamesRecased,
  SEARCH_ENGINES,
  TAB_LAYOUTS,
  NEWTAB_LAYOUTS,
  TAB_SLEEP_DELAYS,
  TAB_ARCHIVE_DELAYS,
  PRESENTATION_DEFAULTS_RESET_VERSION,
  APP_ICONS,
  APP_ICON_LABELS,
  getSettings,
  setExistingProfileHint,
  setSettings,
  flushSettings: () => ensureStore().flush(),
  onSettingsChanged,
  isFirstRunComplete,
  completeFirstRunPrivacyChoices,
  currentSearchEngine,
  searchUrlFor,
  isSupporterActive,
  isAppIconAllowed,
  setSupporter,
  setUiLanguage,
  setGlanceFrame,
  isPatronActive,
  isDynamicWallpaperEnabled,
  setPatron,
  getPatronRecord,
  exportForSync,
  mergeFromSync,
  syncPayloadEquals,
  getDeviceNames,
  setDeviceName,
  normalizeCustomBangs,
  recordRecentBang,
  clearRecentBangs,
  onRecentBangsChanged,
};
