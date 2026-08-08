const { randomUUID } = require('crypto');

// The collector Worker in cloudflare/ping-worker — accepts a JSON POST,
// returns 204.
const PING_ENDPOINT = 'https://blanc-ping.bnfy-441.workers.dev/ping';

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
let installStore = null;
function ensureInstallStore() {
  if (!installStore) {
    const { JsonStore } = require('./store');
    installStore = new JsonStore('install', { id: null });
  }
  return installStore;
}

function installId() {
  const store = ensureInstallStore();
  if (!store.data.id) {
    store.update((d) => { d.id = randomUUID(); });
    store.flush(); // persist now so a crash before the debounce can't lose (and thus re-mint) the id
  }
  return store.data.id;
}

// Settings → "Reset install ID": mint a fresh id immediately (rather than
// nulling and lazily re-minting) so the store never holds a "no id" state a
// crash could resurrect. Success is the WRITE succeeding, not the attempt —
// the settings page tells the user the reset stuck, so a swallowed disk
// error must not read as done (the old id would come back next launch).
// From the collector's perspective the install simply counts as brand new.
function resetInstallId(store = ensureInstallStore()) {
  store.update((d) => { d.id = randomUUID(); });
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

// On by default (Settings → usagePing, opt-out). Fire-and-forget: a failed or
// blocked ping must never affect startup or show the user anything. Carries
// only version/platform/arch/osVersion plus the pseudonymous install id above
// — enough to count active users and bucket by version and OS, nothing that
// identifies a person.
function sendLaunchPing() {
  const { app, net } = require('electron');
  if (!app.isPackaged) return; // dev runs shouldn't inflate counts

  const payload = JSON.stringify({
    installId: installId(),
    // Each app launch is a GA4 session; session_id is a random positive
    // 32-bit integer per the Measurement Protocol spec.
    sessionId: (Math.random() * 0x7FFFFFFF) >>> 0,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    // getSystemVersion() is the OS's own version (macOS marketing number,
    // Windows 10.0.<build>) — os.release() would give the Darwin build on mac,
    // which is not what anyone means by "macOS 26".
    osVersion: coarseOsVersion(process.platform, process.getSystemVersion()),
  });

  net.fetch(PING_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch((err) => {
    console.warn('[telemetry] launch ping failed:', err.message);
  });
}

module.exports = { sendLaunchPing, resetInstallId, coarseOsVersion };
