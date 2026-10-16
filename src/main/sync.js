const crypto = require('crypto');
const { app, net, safeStorage, dialog, clipboard } = require('electron');
const { JsonStore } = require('./store');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const tabsync = require('./tabsync');
const tabicons = require('./tabicons');
const { deviceName } = require('./device-name');
const { deriveKeys, encrypt, decrypt } = require('./sync-crypto');
const pairingCodes = require('./sync-pairing');
const { wipeDecision } = require('./sync-wipe');
const {
  SyncKeyStorageError,
  protectSyncKey,
  unprotectSyncKey,
} = require('./sync-key-storage');
const {
  withLocalProfile,
  isDefaultLocalProfile,
} = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');
const { bananifyServiceAllowed } = require('./bananify-services');

// Blanc-hosted E2EE profile sync. This module holds the only network calls;
// the Worker (cloudflare/sync-worker) stores AES-GCM ciphertext keyed by an
// opaque accountId and can't read anything. See the design spec.
const SYNC_ENDPOINT = 'https://blanc-sync.bnfy-441.workers.dev'; // wrangler dev -> http://127.0.0.1:8787
// A renamed build may not store data on Bananify's server (bananify-services.js).
// disable() still lets it erase a copy that is already there.
// Errors are codes (`error` in replies, `lastError` in the store); pages.js
// turns them into interface text with sync-messages.js.
const SERVICE_UNAVAILABLE = 'service-unavailable';

let store = null;
let keyProtectionError = null;
// Session/icon sync must not run until main has restored the real tab set and
// registered snapshot providers — except consent-off retractions, which are
// safe and required without a live snapshot (spec §3 / §5).
let tabStateReady = false;
function setTabStateReady(ready) {
  tabStateReady = !!ready;
}
function tabSyncStoreReady(name) {
  if (name !== 'session' && name !== 'icons') return true;
  // Sharing disabled: publish the retraction even before restore finishes.
  if (!ensureStore().data.syncTabs) return true;
  return tabStateReady;
}
function ensureStore() {
  if (store) return store;
  store = new JsonStore('sync', {
    enabled: false, handle: '', accountId: '', protectedKey: '', key: '',
    lastSyncedAt: 0, lastError: null,
    deviceId: '', syncTabs: false,
  });
  // One-time migration from pre-hardening profiles. The old field is erased
  // only after the wrapped replacement has reached disk; otherwise sync stays
  // fail-closed and retries the migration on the next launch.
  if (store.data.key) {
    const legacyKey = store.data.key;
    try {
      const protectedKey = protectSyncKey(
        safeStorage,
        Buffer.from(legacyKey, 'base64')
      );
      store.data.protectedKey = protectedKey;
      store.data.key = '';
      if (!store.flush()) {
        store.data.protectedKey = '';
        store.data.key = legacyKey;
        throw new SyncKeyStorageError('Could not persist protected sync key', 'persist-failed');
      }
    } catch (error) {
      keyProtectionError = error instanceof SyncKeyStorageError ? `key:${error.code}` : 'local-key-protect';
    }
  }
  return store;
}

/** What tabsync needs from this device's identity on every export/merge.
 * deviceId is a random UUID minted here once — deliberately NOT the
 * telemetry installId (nothing may attach to that). */
function tabSyncContext() {
  const s = ensureStore();
  if (!s.data.deviceId) s.update((d) => { d.deviceId = crypto.randomUUID(); });
  const d = s.data;
  return {
    accountId: d.accountId, deviceId: d.deviceId, syncTabs: !!d.syncTabs,
    deviceName: deviceName(), platform: process.platform,
  };
}

// Order doesn't matter; each store syncs independently.
const STORES = [
  { name: 'bookmarks', export: bookmarks.exportForSync, merge: bookmarks.mergeFromSync },
  { name: 'settings', export: settings.exportForSync, merge: settings.mergeFromSync },
  {
    name: 'session',
    // ctx is the run-scoped context syncNow snapshotted — NOT re-resolved
    // here, so a credential change during the network round-trip can't leak
    // one account's devices into another (PR #41 review, P1).
    export: (ctx) => tabsync.exportForSync(ctx),
    merge: (remote, ctx) => tabsync.mergeFromSync(remote, ctx),
    // Repair comparison (spec §6): a true no-op skips the PUT; anything else
    // — including a remote blob that lost our unchanged entry — uploads.
    equals: (exported, remote) => tabsync.equalsRemote(exported, remote),
  },
  {
    // Optional sidecar: older deployed Workers return 404 on PUT, which the
    // sync pipeline treats as a quiet no-op until the store is available.
    // Keeping this separate preserves the mixed-version `session` schema.
    name: 'icons',
    optional: true,
    // A newly joining device can observe Cloudflare KV's short missing-read
    // window after another device creates this optional store. Never answer
    // that transient 404 by creating an EMPTY sidecar: doing so can replace
    // the sender's not-yet-visible icon map. A device with real pixels may
    // still create/repair the store normally.
    hasPublishableContent: (payload) => Object.values(payload?.devices ?? {}).some(
      (entry) => !entry?.retracted && Array.isArray(entry.icons) && entry.icons.length > 0
    ),
    export: (ctx) => tabicons.exportForSync(ctx),
    merge: (remote, ctx) => tabicons.mergeFromSync(remote, ctx),
    equals: (exported, remote) => tabicons.equalsRemote(exported, remote),
  },
];

let syncing = false, timer = null, sessionTimer = null, iconTimer = null;
/** Tab-driven publishes are trailing debounces, re-armed on every change —
 * but bounded: a tab whose title changes more often than the delay (a ticker,
 * a timer, a flashing unread title) would otherwise postpone the publish
 * forever. Each store remembers its first unpublished change and never waits
 * longer than the ceiling past it (tab-sync spec §6). */
const TAB_PUBLISH_DEBOUNCE_MS = 15_000;
const TAB_PUBLISH_MAX_WAIT_MS = 60_000;
let sessionPendingSince = 0, iconPendingSince = 0;
function boundedDelay(delay, pendingSince, now = Date.now()) {
  return Math.max(0, Math.min(delay, pendingSince + TAB_PUBLISH_MAX_WAIT_MS - now));
}
const OPTIONAL_MISSING_RETRY_MS = 65_000;
// One bounded retry per account/store generation. This covers KV propagation
// without turning an older Worker (where `icons` genuinely does not exist)
// into an endless background poll.
const optionalMissingRetries = new Set();
const optionalMissingRetryTimers = new Map();
function clearOptionalMissingRetries() {
  for (const retryTimer of optionalMissingRetryTimers.values()) clearTimeout(retryTimer);
  optionalMissingRetryTimers.clear();
  optionalMissingRetries.clear();
}
function scheduleOptionalMissingRetry(accountId, storeName) {
  const retryKey = `${accountId}:${storeName}`;
  if (optionalMissingRetries.has(retryKey)) return;
  optionalMissingRetries.add(retryKey);
  const retryTimer = setTimeout(() => withLocalProfile(
    DEFAULT_PROFILE_ID,
    () => {
      optionalMissingRetryTimers.delete(retryKey);
      syncNow([storeName]).catch(() => {});
    }
  ), OPTIONAL_MISSING_RETRY_MS);
  optionalMissingRetryTimers.set(retryKey, retryTimer);
}
function noteOptionalStorePresent(accountId, storeName) {
  const retryKey = `${accountId}:${storeName}`;
  const retryTimer = optionalMissingRetryTimers.get(retryKey);
  if (retryTimer) clearTimeout(retryTimer);
  optionalMissingRetryTimers.delete(retryKey);
  optionalMissingRetries.delete(retryKey);
}
/** Coalesced re-run request while a sync is in flight: undefined = none,
 * null = all stores, array = just those names. */
let pendingNames;
const unionNames = (a, b) => (a === null || b === null ? null : [...new Set([...a, ...b])]);
/** Credential/consent generation. Bumped whenever the account identity or
 * the tab-share consent changes (enable, disable, setSyncTabs); every sync
 * run snapshots it and aborts at its next checkpoint once it's stale, so an
 * in-flight response from the OLD account can never be merged or re-uploaded
 * under the NEW one (or recreate a just-wiped account's blob). */
let syncGen = 0;
/** Resolves when the currently-running pass has fully settled — dispatched
 * network requests included. `disable()` awaits it before wiping: a PUT
 * already on the wire can't be recalled, so the DELETE must not race it. */
let passSettled = Promise.resolve();
/** True while disable() drains and wipes: no new pass may start, or the
 * drain barrier would be meaningless. */
let suspended = false;
// True only while a pull's merge() applies remote data, so the local-change
// triggers can distinguish a sync-induced settings change from a genuine user
// edit and not schedule a redundant follow-up sync.
let applyingRemote = false;

class SyncError extends Error {}

function status() {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, status);
  const d = ensureStore().data;
  return {
    enabled: d.enabled, handle: d.handle, lastSyncedAt: d.lastSyncedAt,
    lastError: keyProtectionError || d.lastError, syncTabs: !!d.syncTabs,
  };
}

// length OR variety — a client-side nudge (spec §14), not a security boundary
// (the Worker's per-IP rate limit is that). No dependency.
function passphraseStrong(p) {
  if (p.length >= 16) return true;
  if (p.length < 10) return false;
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length >= 2;
}

function errorCode(err) {
  const code = err instanceof SyncError ? err.message : '';
  if (['bad-passphrase', 'rate-limited', 'conflict', 'server', 'pair-not-found', 'pair-unavailable', 'pair-invalid'].includes(code)) return code;
  if (/^http-4/.test(code)) return `rejected:${code.slice(5)}`;
  if (/^http-5/.test(code)) return 'server-error';
  return 'offline';
}

async function enable({ handle, passphrase }) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => enable({ handle, passphrase }));
  }
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, error: SERVICE_UNAVAILABLE, status: status() };
  const h = String(handle ?? '').trim();
  const p = String(passphrase ?? '');
  if (h.length < 2) return { ok: false, error: 'name-too-short', status: status() };
  if (!passphraseStrong(p)) return { ok: false, error: 'weak-passphrase', status: status() };
  const { accountId, key } = deriveKeys(h, p);
  const adopted = adoptCredentials({ handle: h, accountId, key });
  if (!adopted.ok) {
    key.fill(0);
    return { ...adopted, status: status() };
  }
  // Joining existing data, or starting fresh? A mistyped passphrase derives a
  // *different* accountId → 404 → a silent new account, so the UI warns when
  // nothing was found. null = couldn't tell (offline).
  let created = null;
  try {
    const probe = await net.fetch(`${SYNC_ENDPOINT}/v1/blob/${accountId}/settings`);
    if (probe.status === 200 || probe.status === 404) created = probe.status === 404;
  } catch { /* offline — leave created null */ }
  key.fill(0);
  const res = await syncNow();
  return { ok: res.ok, error: res.error, created, status: status() };
}

/** The part of enable() every credential source shares — the passphrase
 * path, a pairing code, a recovery code: protect the key, become this
 * identity, persist, and refresh icons. The caller still owns `key` and
 * zero-fills it. */
function protectKey(key) {
  try {
    return { protectedKey: protectSyncKey(safeStorage, key) };
  } catch (error) {
    return { error: error instanceof SyncKeyStorageError ? `key-store:${error.code}` : 'key-protect-failed' };
  }
}

function adoptCredentials({ handle, accountId, key, protectedKey }) {
  if (!protectedKey) {
    const protectedResult = protectKey(key);
    if (protectedResult.error) return { ok: false, error: protectedResult.error };
    ({ protectedKey } = protectedResult);
  }
  syncGen += 1; // new identity — strand any in-flight run from the old one
  clearOptionalMissingRetries();
  tabicons.cancelCaptures();
  const syncStore = ensureStore();
  syncStore.update((d) => {
    d.enabled = true; d.handle = handle; d.accountId = accountId;
    d.protectedKey = protectedKey; d.key = ''; d.lastError = null;
  });
  if (!syncStore.flush()) {
    syncStore.data.enabled = false;
    syncStore.data.handle = '';
    syncStore.data.accountId = '';
    syncStore.data.protectedKey = '';
    return { ok: false, error: 'credentials-save-failed' };
  }
  keyProtectionError = null;
  refreshTabIcons().catch(() => {});
  return { ok: true };
}

// ---- Device pairing (design 2026-10-16 §5.4 / §5.4a) ----
// A device that already syncs parks its wrapped secret on the Worker under a
// code-derived id for ten minutes; the new device fetches it once. The code
// lives in memory here and nowhere else — never the store, logs or IPC
// beyond the Settings page that displays it.
const PAIR_ATTEMPTS = 3;
let pairing = null; // { code, pairId, expiresAt }

const pairUrl = (pairId) => `${SYNC_ENDPOINT}/v1/pair/${pairId}`;

/** A 404 from the pair route is JSON on a current Worker and plain text on
 * one that predates the route: the two mean different things to the person. */
async function pairNotFoundCode(res) {
  try {
    const body = await res.json();
    return body?.error === 'not-found' ? 'pair-not-found' : 'pair-unavailable';
  } catch {
    return 'pair-unavailable';
  }
}

async function beginPairing() {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, beginPairing);
  const d = ensureStore().data;
  if (!d.enabled || !d.accountId || !d.protectedKey) return { ok: false, error: keyProtectionError || 'sync-off' };
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, error: SERVICE_UNAVAILABLE };
  // One live code at a time: a previous entry is retracted before another is parked.
  if (pairing) await cancelPairing();
  const gen = syncGen;
  let key;
  try {
    try {
      key = unprotectSyncKey(safeStorage, d.protectedKey);
    } catch (error) {
      return { ok: false, error: error instanceof SyncKeyStorageError ? `key:${error.code}` : 'local-key-unlock' };
    }
    const payload = { v: 1, handle: d.handle, accountId: d.accountId, key: key.toString('base64') };
    for (let attempt = 0; attempt < PAIR_ATTEMPTS; attempt += 1) {
      const code = pairingCodes.generateCode();
      const { pairId, wrapKey } = pairingCodes.pairingMaterial(code);
      const blob = pairingCodes.wrapSecret(wrapKey, payload);
      wrapKey.fill(0);
      let res;
      try {
        res = await net.fetch(pairUrl(pairId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blob }),
        });
      } catch {
        return { ok: false, error: 'offline' };
      }
      if (res.status === 409) continue;
      if (res.status === 404) return { ok: false, error: 'pair-unavailable' };
      if (res.status === 429) return { ok: false, error: 'rate-limited' };
      if (!res.ok) return { ok: false, error: errorCode(new SyncError(`http-${res.status}`)) };
      // Sync turned off (or changed identity) while the POST was on the wire:
      // the parked secret belongs to a sync that no longer exists here.
      if (gen !== syncGen || !ensureStore().data.enabled) {
        try { await net.fetch(pairUrl(pairId), { method: 'DELETE' }); } catch { /* it expires on its own */ }
        return { ok: false, error: 'sync-off' };
      }
      const expiresAt = Date.now() + pairingCodes.PAIR_TTL_MS;
      pairing = { code, pairId, expiresAt };
      return { ok: true, code, expiresAt };
    }
    return { ok: false, error: 'server' };
  } finally {
    key?.fill(0);
  }
}

async function cancelPairing() {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, cancelPairing);
  const current = pairing;
  pairing = null;
  if (current) {
    try { await net.fetch(pairUrl(current.pairId), { method: 'DELETE' }); } catch { /* it expires on its own */ }
  }
  return { ok: true };
}

function pairingState() {
  if (!pairing) return { active: false };
  if (Date.now() >= pairing.expiresAt) {
    pairing = null;
    return { active: false };
  }
  return { active: true, code: pairing.code, expiresAt: pairing.expiresAt };
}

/** The secret behind a code: fetched once from the Worker for a pairing code,
 * decoded locally for a recovery code. Returns { payload, key } with `key`
 * a Buffer the caller zero-fills, or { error }. */
async function resolveCode(input) {
  let payload;
  if (pairingCodes.isRecoveryCode(input)) {
    try {
      payload = pairingCodes.decodeRecoveryCode(input);
    } catch {
      return { error: 'pair-invalid' };
    }
  } else {
    const code = pairingCodes.normalizeCode(input);
    if (!code) return { error: 'pair-invalid' };
    if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { error: SERVICE_UNAVAILABLE };
    const { pairId, wrapKey } = pairingCodes.pairingMaterial(code);
    try {
      let res;
      try {
        res = await net.fetch(pairUrl(pairId));
      } catch {
        return { error: 'offline' };
      }
      if (res.status === 404) return { error: await pairNotFoundCode(res) };
      if (res.status === 429) return { error: 'rate-limited' };
      if (!res.ok) return { error: errorCode(new SyncError(`http-${res.status}`)) };
      let body;
      try { body = await res.json(); } catch { return { error: 'server' }; }
      try {
        payload = pairingCodes.unwrapSecret(wrapKey, body?.blob);
      } catch {
        return { error: 'pair-invalid' };
      }
    } finally {
      wrapKey.fill(0);
    }
  }
  return { payload, key: Buffer.from(payload.key, 'base64') };
}

async function joinWithCode(input) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => joinWithCode(input));
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, error: SERVICE_UNAVAILABLE, status: status() };
  if (ensureStore().data.enabled) return { ok: false, error: 'sync-on', status: status() };
  const resolved = await resolveCode(input);
  if (resolved.error) return { ok: false, error: resolved.error, status: status() };
  try {
    const adopted = adoptCredentials({ handle: resolved.payload.handle, accountId: resolved.payload.accountId, key: resolved.key });
    if (!adopted.ok) return { ...adopted, status: status() };
  } finally {
    resolved.key.fill(0);
  }
  const res = await syncNow();
  return { ok: res.ok, error: res.error, status: status() };
}

/** Leave the current sync for the one behind a code, in one step (§5.4a).
 * The code is resolved first so a bad code changes nothing; then disable()'s
 * barrier drains any in-flight pass and performs the optional wipe, and a
 * failed wipe keeps the old credentials exactly as disable() would. */
async function switchWithCode(input, { wipeRemote = false } = {}) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => switchWithCode(input, { wipeRemote }));
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, error: SERVICE_UNAVAILABLE, status: status() };
  const resolved = await resolveCode(input);
  if (resolved.error) return { ok: false, error: resolved.error, status: status() };
  try {
    // Everything that can fail locally happens before the old sync is left,
    // so a keychain refusal never strands the device with no credentials.
    const protectedResult = protectKey(resolved.key);
    if (protectedResult.error) return { ok: false, error: protectedResult.error, status: status() };
    // Joining the sync this device already uses is a no-op switch: never
    // erase the account being joined, whatever the box says.
    const sameAccount = resolved.payload.accountId === ensureStore().data.accountId;
    const left = await disable({ wipeRemote: wipeRemote && !sameAccount });
    if (!left.ok) return left;
    const adopted = adoptCredentials({
      handle: resolved.payload.handle, accountId: resolved.payload.accountId, protectedKey: protectedResult.protectedKey,
    });
    if (!adopted.ok) return { ...adopted, status: status() };
  } finally {
    resolved.key.fill(0);
  }
  const res = await syncNow();
  return { ok: res.ok, error: res.error, status: status() };
}

/** The recovery code goes straight from main to the clipboard behind a
 * native dialog (§4.3). `texts` is the interface copy pages.js resolves at
 * the Settings boundary; the reply carries no code. */
async function copyRecoveryCode({ texts } = {}) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => copyRecoveryCode({ texts }));
  const d = ensureStore().data;
  if (!d.enabled || !d.accountId || !d.protectedKey) return { ok: false, error: keyProtectionError || 'sync-off' };
  let key;
  try {
    try {
      key = unprotectSyncKey(safeStorage, d.protectedKey);
    } catch (error) {
      return { ok: false, error: error instanceof SyncKeyStorageError ? `key:${error.code}` : 'local-key-unlock' };
    }
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: texts?.message ?? 'Copy your sync recovery code?',
      detail: texts?.detail ?? 'Anyone with this code can read and change your synced data. Paste it into your password manager now, and nowhere else.',
      buttons: [texts?.copy ?? 'Copy to Clipboard', texts?.cancel ?? 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return { ok: false, error: 'cancelled' };
    clipboard.writeText(pairingCodes.encodeRecoveryCode({ v: 1, handle: d.handle, accountId: d.accountId, key: key.toString('base64') }));
    return { ok: true };
  } finally {
    key?.fill(0);
  }
}

// Join-path probe (design 2026-09-17 §4.3): does data already exist under
// these credentials? Reads ONE blob and writes nothing — no store update, no
// protectSyncKey, no syncNow, no syncGen bump — so a mistyped passphrase is
// caught before enable() would fork a silent empty account. The derived key
// is cleared in `finally` so every return and throw path zero-fills it.
async function preflight({ handle, passphrase }) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => preflight({ handle, passphrase }));
  }
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, outcome: 'error', error: SERVICE_UNAVAILABLE };
  const h = String(handle ?? '').trim();
  const p = String(passphrase ?? '');
  if (h.length < 2) return { ok: false, outcome: 'invalid', error: 'name-too-short' };
  if (!passphraseStrong(p)) return { ok: false, outcome: 'invalid', error: 'weak-passphrase' };
  const { accountId, key } = deriveKeys(h, p);
  try {
    const res = await net.fetch(`${SYNC_ENDPOINT}/v1/blob/${accountId}/settings`);
    if (res.status === 200) return { ok: true, outcome: 'found' };
    if (res.status === 404) return { ok: true, outcome: 'notFound' };
    if (res.status === 429) {
      return { ok: false, outcome: 'rateLimited', error: errorCode(new SyncError('rate-limited')) };
    }
    return { ok: false, outcome: 'error', error: errorCode(new SyncError(`http-${res.status}`)) };
  } catch {
    return { ok: false, outcome: 'offline', error: errorCode(new Error('offline')) };
  } finally {
    key.fill(0);
  }
}

async function disable({ wipeRemote = false } = {}) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => disable({ wipeRemote }));
  }
  clearTimeout(timer);
  timer = null;
  clearTimeout(sessionTimer);
  sessionTimer = null;
  sessionPendingSince = 0;
  clearTimeout(iconTimer);
  iconTimer = null;
  iconPendingSince = 0;
  // Barrier (PR #41 re-review): a dispatched PUT can't be recalled, and a
  // stale check after its response can't undo the server mutation. So before
  // touching the server or the credentials: (1) block new passes, (2) strand
  // the active one at its next checkpoint, (3) WAIT for it to settle —
  // network included. Only then is the DELETE (or the credential clear) safe.
  suspended = true;
  syncGen += 1;
  clearOptionalMissingRetries();
  tabicons.cancelCaptures();
  if (pairing) cancelPairing().catch(() => {});
  try {
    await passSettled;
    const d = ensureStore().data;
    if (wipeRemote && d.accountId) {
      // The wipe must be confirmed before the credentials are erased: the
      // accountId is the only handle on the server copy, so clearing it after
      // a failed DELETE would strand unreachable ciphertext while telling the
      // user it's gone. On failure, keep the record intact (sync stays enabled)
      // and report, so "erase server copy" can be retried — or the user can
      // turn sync off without the wipe. The clear-vs-keep rule is pinned by
      // sync-wipe.js and its unit test.
      let outcome;
      try {
        const res = await net.fetch(`${SYNC_ENDPOINT}/v1/blob/${d.accountId}`, { method: 'DELETE' });
        outcome = { status: res.status };
      } catch {
        outcome = { error: true };
      }
      const decision = wipeDecision(outcome);
      if (!decision.clearCredentials) {
        return { ok: false, error: decision.error, status: status() };
      }
    }
    ensureStore().update((s) => {
      s.enabled = false; s.handle = ''; s.accountId = '';
      s.protectedKey = ''; s.key = ''; s.lastError = null;
    });
    keyProtectionError = null;
    // The cached device map must not outlive the account it came from — and
    // the UI must stop listing other devices the moment sync is off.
    // (syncTabs and deviceId survive: consent and identity are per-device,
    // not per-account.)
    tabsync.onSyncDisabled();
    tabicons.onSyncDisabled();
    return { ok: true, status: status() };
  } finally {
    suspended = false; // a failed wipe keeps sync enabled — future passes must run
  }
}

/** `run` is immutable for the whole sync pass: `run.ctx` is the tab-sync
 * context snapshotted when the pass began (never re-resolved after an await,
 * so a mid-flight credential change can't cross account boundaries), and
 * `run.stale()` is checked after every await so a stranded pass aborts
 * before it merges, exports, or writes anything. */
async function syncOne(accountId, key, desc, run, attempt = 0) {
  const url = `${SYNC_ENDPOINT}/v1/blob/${accountId}/${desc.name}`;
  const getRes = await net.fetch(url);
  if (run.stale()) throw new SyncError('stale');
  let version = null, remote = null, missing = false;
  if (getRes.status === 200) {
    let body;
    try { body = await getRes.json(); } catch { throw new SyncError('server'); }
    if (run.stale()) throw new SyncError('stale');
    version = body.version;
    try { remote = JSON.parse(decrypt(key, body.blob)); }
    catch { throw new SyncError('bad-passphrase'); }
  } else if (getRes.status === 429) {
    throw new SyncError('rate-limited');
  } else if (getRes.status === 404) {
    missing = true;
  } else {
    throw new SyncError(`http-${getRes.status}`);
  }
  if (remote) {
    applyingRemote = true;
    try { desc.merge(remote, run.ctx); } finally { applyingRemote = false; }
  }
  const payload = desc.export(run.ctx);
  if (
    missing &&
    desc.optional &&
    desc.hasPublishableContent &&
    !desc.hasPublishableContent(payload)
  ) {
    return { missing: true };
  }
  if (remote && desc.equals?.(payload, remote)) return; // true no-op — skip the PUT
  const blob = encrypt(key, JSON.stringify(payload));
  if (run.stale()) throw new SyncError('stale'); // last gate before the write
  const putRes = await net.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ifVersion: version, blob }),
  });
  if (putRes.status === 409 && attempt < 3) {
    if (run.stale()) throw new SyncError('stale');
    return syncOne(accountId, key, desc, run, attempt + 1); // re-pull-merge
  }
  if (putRes.status === 409) throw new SyncError('conflict');
  if (desc.optional && putRes.status === 404) return;
  if (!putRes.ok) throw new SyncError(`http-${putRes.status}`);
}

async function syncNow(names = null) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => syncNow(names));
  }
  const d = ensureStore().data;
  // `suspended` bars new passes while disable() drains and wipes — a fresh
  // pass dispatching requests mid-drain would defeat the barrier.
  if (suspended || !d.enabled || !d.accountId || !d.protectedKey) {
    return { ok: false, error: keyProtectionError || 'sync-off' };
  }
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return { ok: false, error: SERVICE_UNAVAILABLE };
  // Palette open / Sync Now / scheduled session churn can fire before restore
  // finishes. Skip only the tab-dependent stores; Favorites/settings still run.
  if (names && names.length > 0 && names.every((name) => !tabSyncStoreReady(name))) {
    return { ok: true };
  }
  if (syncing) { // coalesce concurrent triggers
    pendingNames = pendingNames === undefined ? names : unionNames(pendingNames, names);
    return { ok: true };
  }
  syncing = true;
  // Everything below — network requests included — settles before this
  // resolves; disable() awaits it as its drain barrier.
  let settle;
  let key;
  passSettled = new Promise((resolve) => { settle = resolve; });
  try {
    const accountId = d.accountId;          // snapshot so a mid-flight disable can't redirect writes
    try {
      key = unprotectSyncKey(safeStorage, d.protectedKey);
      keyProtectionError = null;
    } catch (error) {
      keyProtectionError = error instanceof SyncKeyStorageError ? `key:${error.code}` : 'local-key-unlock';
      return { ok: false, error: keyProtectionError };
    }
    // The whole pass runs under ONE generation and ONE tab-sync context; a
    // credential/consent change mid-flight strands it at the next checkpoint.
    const gen = syncGen;
    const run = { ctx: tabSyncContext(), stale: () => gen !== syncGen };
    let firstError = null, stranded = false, ranRequiredStore = false;
    // A readiness skip of session (required) must not look like a full refresh:
    // Favorites/settings alone must not clear lastError or advance lastSyncedAt.
    let skippedRequiredSelected = false;
    for (const desc of STORES) {
      if (names && !names.includes(desc.name)) continue;
      if (!tabSyncStoreReady(desc.name)) {
        if (!desc.optional) skippedRequiredSelected = true;
        continue;
      }
      if (!ensureStore().data.enabled) break; // disabled mid-flight — stop
      if (!desc.optional) ranRequiredStore = true;
      try {
        const outcome = await syncOne(accountId, key, desc, run);
        if (desc.optional) {
          if (outcome?.missing) {
            scheduleOptionalMissingRetry(accountId, desc.name);
          } else {
            noteOptionalStorePresent(accountId, desc.name);
          }
        }
      }
      catch (err) {
        if (err instanceof SyncError && err.message === 'stale') { stranded = true; break; }
        // Cosmetic sidecars degrade to fallback UI; they must never make
        // Favorites/settings/session sync report a failure.
        if (!desc.optional) firstError ??= err;
      }
    }
    // If sync was turned off mid-flight, don't stamp status onto a disabled store.
    if (!ensureStore().data.enabled) return { ok: false, error: 'sync-off' };
    // A stranded pass stamps nothing: its results belong to a dead generation.
    // Cosmetic-only passes must not erase a real required-store error or make
    // lastSyncedAt imply that Favorites/settings/session were refreshed.
    // Partial pre-restore passes (session gated) also must not stamp success.
    if (!stranded && ranRequiredStore) {
      ensureStore().update((s) => {
        if (firstError) s.lastError = errorCode(firstError);
        else if (!skippedRequiredSelected) {
          s.lastError = null;
          s.lastSyncedAt = Date.now();
        }
      });
    }
    if (pendingNames !== undefined) {
      const next = pendingNames;
      pendingNames = undefined;
      // Start the coalesced pass only after this pass's outer finally releases
      // the guard and drain barrier. Calling syncNow synchronously here would
      // observe syncing=true and merely coalesce itself again.
      return new Promise((resolve) => {
        queueMicrotask(() => resolve(syncNow(next)));
      });
    }
    if (stranded) return { ok: true };
    return firstError ? { ok: false, error: errorCode(firstError) } : { ok: true };
  } finally {
    // This guard owns the entire pass, including credential unlock. Reset it
    // here so every exit path can be retried; limiting the
    // reset to the network/store loop permanently wedged sync after an unlock
    // or credential-mismatch error.
    syncing = false;
    key?.fill(0);
    settle();
  }
}

function schedule(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => withLocalProfile(
    DEFAULT_PROFILE_ID,
    () => { syncNow().catch(() => {}); }
  ), delay);
}

/** Tab churn gets timers separate from both favorites/settings and cosmetic
 * icon work. A page rotating favicons must never postpone the primary session
 * snapshot (especially the prompt consent-change retraction/publication). */
function scheduleSession(delay = TAB_PUBLISH_DEBOUNCE_MS) {
  sessionPendingSince ||= Date.now();
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => withLocalProfile(
    DEFAULT_PROFILE_ID,
    () => { sessionPendingSince = 0; syncNow(['session']).catch(() => {}); }
  ), boundedDelay(delay, sessionPendingSince));
}

function scheduleIcons(delay = TAB_PUBLISH_DEBOUNCE_MS) {
  iconPendingSince ||= Date.now();
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => withLocalProfile(
    DEFAULT_PROFILE_ID,
    () => { iconPendingSince = 0; syncNow(['icons']).catch(() => {}); }
  ), boundedDelay(delay, iconPendingSince));
}

function scheduleTabs(delay = TAB_PUBLISH_DEBOUNCE_MS) {
  scheduleSession(delay);
  scheduleIcons(delay);
}

/** The per-device "share this device's open tabs" consent (spec §3). Turning
 * it off publishes a retraction on the prompt sync below. */
function setSyncTabs(on) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => setSyncTabs(on));
  }
  syncGen += 1; // consent changed — a stale in-flight export must not publish under the old setting
  tabicons.cancelCaptures();
  ensureStore().update((d) => { d.syncTabs = !!on; });
  if (ensureStore().data.enabled) scheduleTabs(1000);
  if (on) refreshTabIcons().catch(() => {});
  return status();
}

let lastSessionRefresh = 0;
/** Freshness pull on window focus / panel open (spec §6), throttled to one
 * per minute. Session + icon-sidecar only: keeps it off favorites/settings
 * and inside the worker's per-account GET limit. Errors stay silent — this
 * is a background freshness path, not a user-initiated sync. */
function refreshSession() {
  if (!isDefaultLocalProfile()) return;
  if (!tabStateReady) return;
  const d = ensureStore().data;
  if (!d.enabled) return;
  const now = Date.now();
  if (now - lastSessionRefresh < 60_000) return;
  lastSessionRefresh = now;
  syncNow(['session', 'icons']).catch(() => {});
}

/** A generation-bound capture run. Favicon rasterization is asynchronous,
 * so credentials/consent must still match before its result enters a store. */
function iconCaptureRun() {
  if (!tabStateReady) return null;
  const d = ensureStore().data;
  if (!d.enabled || !d.syncTabs) return null;
  const gen = syncGen;
  const ctx = tabSyncContext();
  return {
    ctx,
    isCurrent: () => {
      const current = ensureStore().data;
      return gen === syncGen &&
        current.enabled &&
        current.syncTabs &&
        current.accountId === ctx.accountId &&
        current.deviceId === ctx.deviceId;
    },
  };
}

function captureTabIcon(tab) {
  if (!isDefaultLocalProfile()) return Promise.resolve(false);
  const run = iconCaptureRun();
  return run
    ? tabicons.captureTab(tab, run.ctx, { isCurrent: run.isCurrent })
    : Promise.resolve(false);
}

function refreshTabIcons() {
  if (!isDefaultLocalProfile()) return Promise.resolve(false);
  const run = iconCaptureRun();
  return run
    ? tabicons.refreshCurrent(run.ctx, { isCurrent: run.isCurrent })
    : Promise.resolve(false);
}

/** Other devices' tabs for the UI ([] whenever sync is off). The sidecar is
 * joined only for the trusted renderer projection; the session wire format
 * remains unchanged. */
function listRemoteDevices() {
  if (!isDefaultLocalProfile()) return [];
  const d = ensureStore().data;
  if (!d.enabled) return [];
  const ctx = tabSyncContext();
  return tabicons.attachToRemoteDevices(tabsync.getRemoteDevices(ctx), ctx);
}

function init() {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, init);
  if (ensureStore().data.enabled) schedule(2000); // sync-on-launch
  // React to LOCAL changes only. applyingRemote keeps a merge-applied settings
  // change (which fires settings' listeners so the app re-themes live) from
  // scheduling a redundant follow-up sync. Bookmarks merges never fire
  // onChanged (they use onMerged instead), so they're inherently safe.
  const onDefaultLocalChange = () => withLocalProfile(DEFAULT_PROFILE_ID, () => {
    if (ensureStore().data.enabled && !applyingRemote) schedule();
  });
  settings.onSettingsChanged(onDefaultLocalChange);
  bookmarks.onChanged(() => {
    if (isDefaultLocalProfile()) onDefaultLocalChange();
  });
  // Tab-driven publishes: fingerprint-gated upstream (tabsync.noteTabsChanged),
  // debounced 15s here, and only while this device actually shares its tabs.
  tabsync.onChanged(() => withLocalProfile(DEFAULT_PROFILE_ID, () => {
    const d = ensureStore().data;
    if (d.enabled && d.syncTabs) scheduleTabs();
  }));
  tabicons.onChanged(() => withLocalProfile(DEFAULT_PROFILE_ID, () => {
    const d = ensureStore().data;
    if (d.enabled && d.syncTabs) scheduleIcons();
  }));
  refreshTabIcons().catch(() => {});
  // A pairing code must not outlive the app that showed it (pairing design §5.4).
  app.on('before-quit', () => { if (pairing) cancelPairing().catch(() => {}); });
  // Heartbeat (spec §6): hourly check; republishes once our entry is 24h old
  // so a long-running device with stable tabs never ages past the 30-day
  // prune on other devices.
  // unref: the heartbeat must never be what keeps the process alive (it is
  // not in Electron, and under node --test it would hang the run).
  setInterval(() => withLocalProfile(DEFAULT_PROFILE_ID, () => {
    const d = ensureStore().data;
    if (!d.enabled || !d.syncTabs) return;
    const ctx = tabSyncContext();
    if (tabsync.heartbeatDue(ctx)) scheduleSession(5000);
    if (tabicons.heartbeatDue(ctx)) scheduleIcons(5000);
  }), 60 * 60 * 1000).unref?.();
}

module.exports = {
  init,
  enable,
  preflight,
  disable,
  beginPairing,
  cancelPairing,
  pairingState,
  joinWithCode,
  switchWithCode,
  copyRecoveryCode,
  syncNow,
  status,
  setSyncTabs,
  setTabStateReady,
  refreshSession,
  listRemoteDevices,
  captureTabIcon,
};
