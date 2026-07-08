const { app, net } = require('electron');
const { randomUUID } = require('crypto');
const { JsonStore } = require('./store');

// The collector Worker in cloudflare/ping-worker — accepts a JSON POST,
// returns 204.
const PING_ENDPOINT = 'https://blanc-ping.bnfy-441.workers.dev/ping';

// A stable, random per-install id — generated once, stored device-locally in
// install.json, and sent with the launch ping so the collector can dedupe
// repeat launches into distinct active users (DAU/WAU/MAU + growth). It is
// NOT part of settings, so it never crosses Profile Sync, and it identifies
// an install, never a person: no name, account, IP, or browsing data rides
// along with it. Its own store means clearing it (privacy reset) is a single
// file delete, independent of settings.
let installStore = null;
function installId() {
  installStore ??= new JsonStore('install', { id: null });
  if (!installStore.data.id) {
    installStore.update((d) => { d.id = randomUUID(); });
    installStore.flush(); // persist now so a crash before the debounce can't lose (and thus re-mint) the id
  }
  return installStore.data.id;
}

// On by default (Settings → usagePing, opt-out). Fire-and-forget: a failed or
// blocked ping must never affect startup or show the user anything. Carries
// only version/platform/arch plus the anonymous install id above — enough to
// count active users and bucket by version/platform, nothing that identifies
// a person.
function sendLaunchPing() {
  if (!app.isPackaged) return; // dev runs shouldn't inflate counts

  const payload = JSON.stringify({
    installId: installId(),
    // Each app launch is a GA4 session; session_id is a random positive
    // 32-bit integer per the Measurement Protocol spec.
    sessionId: (Math.random() * 0x7FFFFFFF) >>> 0,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });

  net.fetch(PING_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch((err) => {
    console.warn('[telemetry] launch ping failed:', err.message);
  });
}

module.exports = { sendLaunchPing };
