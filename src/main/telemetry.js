const { randomInt, randomUUID } = require('crypto');
const { bananifyServiceAllowed } = require('./bananify-services');

// The collector Worker in cloudflare/ping-worker — accepts a JSON POST,
// returns 204.
const PING_ENDPOINT = 'https://blanc-ping.bnfy-441.workers.dev/ping';
const EVENT_ENDPOINT = 'https://blanc-ping.bnfy-441.workers.dev/event';

// A stable, random per-install id — generated once, stored device-locally in
// install.json, and sent with the launch ping so the collector can dedupe
// repeat launches into distinct active users (DAU/WAU/MAU + growth). It is
// NOT part of settings, so it never crosses Profile Sync, and it identifies
// an install, never a person: no name, account, IP, or browsing data rides
// along with it. The worker stores/forwards it only as a keyed hash — see
// cloudflare/ping-worker. Its own store means clearing it (privacy reset) is
// a single file delete, independent of settings.
//
// electron/store requires are lazy so this module loads under plain
// `node --test` — the reset test injects a fake store instead.
//
// install.json also records when this install's id was minted, for the
// first-day signals (docs/superpowers/specs/2026-10-09-first-day-retention-
// signals-design.md). createdAt never leaves the device. Flat fields because
// JsonStore merges defaults shallowly; an install that already had an id
// before this field existed reads createdAt as null and is marked 'legacy',
// which never sends a first-day signal.
const DAY_ONE_FIELDS = Object.freeze({ default: 'day1Default', browsed: 'day1Browsed' });
const DAY_ONE_SIGNALS = Object.freeze(Object.keys(DAY_ONE_FIELDS));

// A fresh identity: new id, new first-day window, neither signal sent.
function startFreshInstall(d, now) {
  d.id = randomUUID();
  d.createdAt = now;
  d.day1Default = false;
  d.day1Browsed = false;
}

let installStore = null;
function ensureInstallStore() {
  if (!installStore) {
    const { JsonStore } = require('./store');
    installStore = new JsonStore('install', {
      id: null, createdAt: null, day1Default: false, day1Browsed: false,
    });
  }
  return installStore;
}

function installMeta(store = ensureInstallStore(), now = Date.now()) {
  if (!store.data.id) {
    store.update((d) => startFreshInstall(d, now));
    store.flush(); // persist now so a crash before the debounce can't lose (and thus re-mint) the id
  } else if (store.data.createdAt === null || store.data.createdAt === undefined) {
    store.update((d) => { d.createdAt = 'legacy'; });
    store.flush();
  }
  return {
    createdAt: store.data.createdAt,
    sent: { default: store.data.day1Default === true, browsed: store.data.day1Browsed === true },
  };
}

function installId() {
  const store = ensureInstallStore();
  installMeta(store);
  return store.data.id;
}

// Success is the WRITE succeeding: the flag must be on disk before the event
// leaves, so a crash or restart can never send it twice.
function markDayOneSent(signal, store = ensureInstallStore()) {
  if (!Object.hasOwn(DAY_ONE_FIELDS, signal)) return false;
  const field = DAY_ONE_FIELDS[signal];
  store.update((d) => { d[field] = true; });
  return store.flush() === true;
}

// Settings → "Reset install ID": mint a fresh id immediately (rather than
// nulling and lazily re-minting) so the store never holds a "no id" state a
// crash could resurrect. Success is the WRITE succeeding, not the attempt —
// the settings page tells the user the reset stuck, so a swallowed disk
// error must not read as done (the old id would come back next launch).
// From the collector's perspective the install simply counts as brand new,
// so the first-day window restarts with it.
function resetInstallId(store = ensureInstallStore(), now = Date.now()) {
  store.update((d) => startFreshInstall(d, now));
  return store.flush() === true;
}

// Coarsen the OS version to a single major number before it ever leaves the
// device. `platform` alone can't answer "how many installs could run a
// macOS-26-only feature", but a full version string ("27.0.1", "10.0.26100")
// is a finer fingerprint than counting audiences needs. Major-only is enough
// to gate capabilities and size a rollout, and nothing more.
//
// Pure and exported so the mapping is unit-tested rather than only observed in
// production, where a wrong bucket is invisible.
function coarseOsVersion(platform, systemVersion) {
  const parts = String(systemVersion ?? '').split('.').map((n) => parseInt(n, 10));
  if (!Number.isFinite(parts[0])) return 'unknown';
  if (platform === 'win32') {
    // Windows reports 10.0.<build> for BOTH 10 and 11 — the major is useless
    // on its own and only the build number tells them apart (11 starts at
    // 22000). Map to the marketing number users and docs actually mean.
    if (parts[0] === 10) return (Number.isFinite(parts[2]) ? parts[2] : 0) >= 22000 ? '11' : '10';
    return String(parts[0]);
  }
  // macOS reports the marketing version here (26, 27…), not the Darwin build.
  // Linux reports a kernel major, which is weak signal but harmless.
  return String(parts[0]);
}

function productUsageAllowed({ firstRunComplete, usagePing, privateTab }) {
  return firstRunComplete === true && usagePing === true && privateTab !== true;
}

// Build one process-lifetime sender so the launch and bounded product-use
// events share a GA session id. Every event is attempted at most once per app
// session; the Worker separately dedupes and counts distinct installs by day,
// week, and month. Consent/private-tab policy stays in main.js, at the trusted
// event boundary. This layer independently refuses development builds,
// renamed builds (bananify-services.js), and unknown layout values.
function createTelemetrySender({
  isPackaged,
  fetchImpl,
  getInstallId,
  getVersion,
  platform,
  arch,
  getSystemVersion,
  makeSessionId = () => randomInt(1, 0x80000000),
  newtabLayouts,
  serviceAllowed = bananifyServiceAllowed,
  warn = console.warn,
}) {
  const allowedLayouts = new Set(newtabLayouts ?? []);
  const sent = new Set();
  let sessionId = null;

  function commonPayload() {
    if (sessionId === null) {
      // GA4 requires a positive 32-bit session id. Use cryptographic randomness
      // because the Worker also relies on this value for replay deduplication.
      sessionId = makeSessionId();
    }
    return {
      installId: getInstallId(),
      sessionId,
      version: getVersion(),
      platform,
      arch,
      // getSystemVersion() is the OS's own version (macOS marketing number,
      // Windows 10.0.<build>) — os.release() would give Darwin on macOS.
      osVersion: coarseOsVersion(platform, getSystemVersion()),
    };
  }

  function postOnce(key, endpoint, payload, label) {
    if (!isPackaged() || !serviceAllowed(endpoint) || sent.has(key)) return false;
    sent.add(key);
    try {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      };
      Promise.resolve(fetchImpl(endpoint, options)).catch((err) => {
        warn(`[telemetry] ${label} failed: ${err?.message ?? err}`);
      });
    } catch (err) {
      warn(`[telemetry] ${label} failed: ${err?.message ?? err}`);
    }
    return true;
  }

  function sendLaunchPing() {
    return postOnce('app_launch', PING_ENDPOINT, commonPayload, 'launch ping');
  }

  function sendMahjongPlay() {
    return postOnce(
      'mahjong_play',
      EVENT_ENDPOINT,
      () => ({ ...commonPayload(), event: 'mahjong_play' }),
      'Mahjong usage event',
    );
  }

  function sendNewtabLayoutUsed(layout) {
    if (!allowedLayouts.has(layout)) return false;
    return postOnce(
      `newtab_layout:${layout}`,
      EVENT_ENDPOINT,
      () => ({ ...commonPayload(), event: 'newtab_layout', layout }),
      'new-tab layout event',
    );
  }

  function sendDayOneSignal(signal) {
    if (!DAY_ONE_SIGNALS.includes(signal)) return false;
    return postOnce(
      `day1:${signal}`,
      EVENT_ENDPOINT,
      () => ({ ...commonPayload(), event: `day1_${signal}` }),
      'first-day event',
    );
  }

  return { sendLaunchPing, sendMahjongPlay, sendNewtabLayoutUsed, sendDayOneSignal };
}

let defaultSender = null;
function ensureDefaultSender() {
  if (!defaultSender) {
    const { app, net } = require('electron');
    // Lazy to keep telemetry.js loadable under plain node --test.
    const { NEWTAB_LAYOUTS } = require('./settings');
    defaultSender = createTelemetrySender({
      isPackaged: () => app.isPackaged,
      fetchImpl: net.fetch.bind(net),
      getInstallId: installId,
      getVersion: () => app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      getSystemVersion: () => process.getSystemVersion(),
      newtabLayouts: NEWTAB_LAYOUTS,
    });
  }
  return defaultSender;
}

function sendLaunchPing() { return ensureDefaultSender().sendLaunchPing(); }
function sendMahjongPlay() { return ensureDefaultSender().sendMahjongPlay(); }
function sendNewtabLayoutUsed(layout) {
  return ensureDefaultSender().sendNewtabLayoutUsed(layout);
}
function sendDayOneSignal(signal) { return ensureDefaultSender().sendDayOneSignal(signal); }

module.exports = {
  PING_ENDPOINT,
  EVENT_ENDPOINT,
  DAY_ONE_SIGNALS,
  createTelemetrySender,
  productUsageAllowed,
  sendLaunchPing,
  sendMahjongPlay,
  sendNewtabLayoutUsed,
  sendDayOneSignal,
  installMeta,
  markDayOneSent,
  resetInstallId,
  coarseOsVersion,
};
