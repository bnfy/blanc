const crypto = require('crypto');
const { app, net, safeStorage, dialog, clipboard } = require('electron');
const { JsonStore } = require('./store');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const startPagePins = require('./start-page-pins');
const tabsync = require('./tabsync');
const tabicons = require('./tabicons');
const sends = require('./sends');
const sharedSpaces = require('./shared-spaces');
const syncedClosed = require('./synced-closed');
const { createScheduler } = require('./sync-scheduler');
const { createRequestQueue } = require('./sync-request-queue');
const { unsyncedTabIds } = require('./shared-spaces-adapter');
const { deviceName } = require('./device-name');
const { resolveDeviceName } = require('./device-names');
const { deriveKeys, encrypt, decrypt } = require('./sync-crypto');
const pairingCodes = require('./sync-pairing');
const { wipeDecision, responseCode } = require('./sync-wipe');
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
const SYNC_ENDPOINT = 'https://blanc-sync.bnfy-441.workers.dev';
const ACTIVE_SYNC_ENDPOINT = (()=>{
  if(!app.isPackaged && process.env.BLANC_TEST==='1' && process.env.BLANC_TEST_SYNC_ENDPOINT) {
    try {
      const url=new URL(process.env.BLANC_TEST_SYNC_ENDPOINT);
      if(url.protocol==='http:' && ['127.0.0.1','[::1]','localhost'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash && url.pathname==='/')return url.origin;
    } catch { /* invalid acceptance configuration never redirects production traffic */ }
  }
  return SYNC_ENDPOINT;
})();
// The client's rolling request window (10 requests per minute). Acceptance
// runs shorten it, gated like the endpoint above, so a scenario that turns
// sync on doesn't sit out a whole minute; the budget step checks the same
// window, so the limiter is still exercised.
const REQUEST_WINDOW_MS = (()=>{
  if(!app.isPackaged && process.env.BLANC_TEST==='1' && process.env.BLANC_TEST_SYNC_WINDOW_MS) {
    const ms=Number(process.env.BLANC_TEST_SYNC_WINDOW_MS);
    if(Number.isInteger(ms) && ms>=1000 && ms<=60000)return ms;
  }
  return 60000;
})();
// A renamed build may not store data on Bananify's server (bananify-services.js).
// disable() still lets it erase a copy that is already there.
// Errors are codes (`error` in replies, `lastError` in the store); pages.js
// turns them into interface text with sync-messages.js.
const SERVICE_UNAVAILABLE = 'service-unavailable';

let store = null;
const accountListeners=new Set();
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
    lastSyncedAt: 0, lastError: null, erasurePending: false,
    deviceId: '', syncTabs: false, syncSpaces: false,
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
  {
    // Start Page pins ride in the settings payload as one more clocked value
    // (startPagePins), so the Worker needs no new store. A Blanc that predates
    // it drops the value on upload; syncPayloadEquals then sees the blob
    // lacking it and the next newer device uploads it again.
    name: 'settings',
    export: () => withStartPagePins(settings.exportForSync()),
    merge: (remote) => {
      settings.mergeFromSync(remote);
      startPagePins.mergeFromSync({
        value: remote?.values?.startPagePins,
        at: remote?.meta?.startPagePins,
        tie: remote?.tieBreakers?.startPagePins,
      });
    },
    equals: settings.syncPayloadEquals,
  },
  {
    name: 'session',
    stored:(payload,ctx)=>{
      if(!sharedSpaces.isEnabled(ctx))return;
      const binding=tabsync.publishedSidecar(payload);if(binding)sharedSpaces.setOwnSidecar(binding,ctx);
    },
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
  {
    // Send to device (M7b addendum §3, §6): optional until the deployed
    // Worker serves it. Presence alone never creates the store; an item does.
    name: 'sends',
    optional: true,
    hasPublishableContent: (payload, ctx) => sends.hasOwnItems(payload, ctx),
    export: (ctx) => sends.exportForSync(ctx),
    merge: (remote, ctx) => sends.mergeFromSync(remote, ctx),
    equals: (exported, remote) => sends.equalsRemote(exported, remote),
  },
  { name:'spaces', class:'I', optional:true, spaces:true, export:sharedSpaces.exportIndex,
    merge:sharedSpaces.mergeIndex, equals:sharedSpaces.equals, hasPublishableContent:sharedSpaces.hasPublishableContent,
    stored:sharedSpaces.settleIndex },
  { name:'closed', optional:true, spaces:true, export:syncedClosed.exportForSync, merge:syncedClosed.mergeFromSync,
    equals:syncedClosed.equalsRemote, hasPublishableContent:syncedClosed.hasOwnItems },
  { name:'shared', optional:true, spaces:true, export:sharedSpaces.exportSidecar, merge:sharedSpaces.mergeSidecar,
    equals:sharedSpaces.equals, hasPublishableContent:payload=>Object.values(payload?.devices??{}).some(x=>x.tabs?.length) },
];

/** The settings payload plus the Personal profile's Start Page pins, when
 * they have ever changed. */
function withStartPagePins(payload) {
  const pins = startPagePins.exportForSync();
  if (!pins) return payload;
  const out = {
    values: { ...payload.values, startPagePins: pins.value },
    meta: { ...payload.meta, startPagePins: pins.at },
    tieBreakers: { ...payload.tieBreakers },
  };
  if (pins.tie) out.tieBreakers.startPagePins = pins.tie;
  return out;
}

let timer = null, sessionTimer = null, iconTimer = null;
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
/** Credential/consent generation. Bumped whenever the account identity or
 * the tab-share consent changes (enable, disable, setSyncTabs); every sync
 * run snapshots it and aborts at its next checkpoint once it's stale, so an
 * in-flight response from the OLD account can never be merged or re-uploaded
 * under the NEW one (or recreate a just-wiped account's blob). */
let syncGen = 0;
let requestQueue=null, requestScheduler=null, spacesUnavailable=false, spacesRetryAt=0;
function invalidateGeneration(reason='generation') {
  syncGen+=1;
  requestQueue?.cancelWhere(()=>true,reason);
}
function getRequestQueue() {
  if(requestQueue)return requestQueue;
  const data=sharedSpaces.rebind(ensureStore().data.accountId).data;
  requestScheduler=createScheduler({windowMs:REQUEST_WINDOW_MS,log:data.requestLog,nextClass:data.nextClass,cursors:data.cursors,
    windowLimit:data.windowLimit,backoffUntil:data.backoffUntil});
  requestQueue=createRequestQueue({scheduler:requestScheduler,makeError:message=>new SyncError(message),persist:state=>{
    const s=sharedSpaces.rebind(ensureStore().data.accountId);
    s.update(d=>{d.requestLog=state.log;d.nextClass=state.nextClass;d.cursors=state.cursors;d.windowLimit=state.windowLimit;d.backoffUntil=state.backoffUntil;});
    if(!s.flush())throw new SyncError('request-log-save-failed');
  }});
  return requestQueue;
}
function queueBarrier() {passSettled=getRequestQueue().settled();return passSettled;}
async function probeSettings(accountId) {
  const gen=syncGen;
  const promise=getRequestQueue().enqueue({class:'F',item:'settings',generation:'probe:'+gen+':'+accountId,
    cancelled:()=>suspended?'suspended':gen!==syncGen?'generation':null,
    run:async()=>{
      const response=await net.fetch(`${ACTIVE_SYNC_ENDPOINT}/v1/blob/${accountId}/settings`);
      if(response.status===429)throw new SyncError('rate-limited');
      return response;
    }});
  queueBarrier();const result=await promise;if(result.error)throw result.error;return result.outcome;
}
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
  const chosen = d.deviceId ? settings.getDeviceNames()[d.deviceId] : null;
  return {
    enabled: d.enabled, handle: d.handle, lastSyncedAt: d.lastSyncedAt,
    lastError: keyProtectionError || (d.erasurePending ? 'erasure-pending' : d.lastError), erasurePending: !!d.erasurePending, syncTabs: !!d.syncTabs,
    // What this device is called on the others ('' = no chosen name) and the
    // name it publishes, which stays the computer's (device-name.js).
    deviceName: chosen?.name ?? '', deviceNamePublished: deviceName(),
  };
}

/** Name this device as the others list it; '' restores the computer's name. */
function setThisDeviceName(name) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => setThisDeviceName(name));
  if (typeof name === 'string') settings.setDeviceName(tabSyncContext().deviceId, name);
  return status();
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
  if(code==='payload-too-large')return 'rejected:413';
  if (['bad-passphrase', 'rate-limited', 'conflict', 'server', 'account-quota', 'erasure-pending', 'pair-not-found', 'pair-unavailable', 'pair-invalid'].includes(code)) return code;
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
    const probe = await probeSettings(accountId);
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
  if(suspended)return {ok:false,error:'sync-off'};
  if (!protectedKey) {
    const protectedResult = protectKey(key);
    if (protectedResult.error) return { ok: false, error: protectedResult.error };
    ({ protectedKey } = protectedResult);
  }
  invalidateGeneration(); // strand queued and running work from the old identity
  spacesUnavailable=false;spacesRetryAt=0;
  clearOptionalMissingRetries();
  tabicons.cancelCaptures();
  const syncStore = ensureStore();
  const previousAccount=syncStore.data.accountId;
  syncStore.update((d) => {
    d.enabled = true; d.handle = handle; d.accountId = accountId;
    d.protectedKey = protectedKey; d.key = ''; d.lastError = null; d.erasurePending = false;
    if(previousAccount!==accountId)d.syncSpaces=false;
  });
  if (!syncStore.flush()) {
    syncStore.data.enabled = false;
    syncStore.data.handle = '';
    syncStore.data.accountId = '';
    syncStore.data.protectedKey = '';
    return { ok: false, error: 'credentials-save-failed' };
  }
  keyProtectionError = null;
  if(previousAccount!==accountId)for(const listener of accountListeners)listener();
  refreshTabIcons().catch(() => {});
  return { ok: true };
}

// ---- Device pairing (design 2026-10-16 §5.4 / §5.4a) ----
// A device that already syncs parks its wrapped secret on the Worker under a
// code-derived id for ten minutes; the new device fetches it once. The code
// lives in memory here and nowhere else — never the store, logs or IPC
// beyond the Settings page that displays it.
const PAIR_ATTEMPTS = 3;
const pairingShownListeners=new Set();
let pairing = null; // { code, pairId, expiresAt }

const pairUrl = (pairId) => `${ACTIVE_SYNC_ENDPOINT}/v1/pair/${pairId}`;

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
      for(const listener of pairingShownListeners)listener();
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
    const res = await probeSettings(accountId);
    if (res.status === 200) return { ok: true, outcome: 'found' };
    if (res.status === 404) return { ok: true, outcome: 'notFound' };
    if (res.status === 429) {
      return { ok: false, outcome: 'rateLimited', error: errorCode(new SyncError('rate-limited')) };
    }
    return { ok: false, outcome: 'error', error: errorCode(new SyncError(`http-${res.status}`)) };
  } catch(error) {
    if(error instanceof SyncError&&error.message==='rate-limited')return {ok:false,outcome:'rateLimited',error:'rate-limited'};
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
  invalidateGeneration('suspended');
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
        const res = await net.fetch(`${ACTIVE_SYNC_ENDPOINT}/v1/blob/${d.accountId}`, { method: 'DELETE' });
        outcome = { status: res.status, code: responseCode(res.status, await responseText(res)) };
      } catch {
        outcome = { error: true };
      }
      const decision = wipeDecision(outcome);
      if (!decision.clearCredentials) {
        if (decision.error === 'erasure-pending') ensureStore().update(s => { s.erasurePending = true; s.lastError = decision.error; });
        return { ok: false, error: decision.error, status: status() };
      }
    } else if (d.enabled && d.accountId && d.protectedKey) {
      await retractSends(d).catch(() => {});
      await retractSends(d,'closed',syncedClosed.retractedOwn).catch(() => {});
      // Every device announces itself in the open-tabs store, sharing or not,
      // so leaving takes this one off the others' device lists at once.
      await retractSends(d,'session',()=>({retracted:true,updatedAt:Date.now()})).catch(() => {});
    }
    ensureStore().update((s) => {
      s.enabled = false; s.handle = ''; s.accountId = '';
      s.protectedKey = ''; s.key = ''; s.lastError = null; s.erasurePending = false;
      s.syncSpaces = false;
    });
    keyProtectionError = null;
    // The cached device map must not outlive the account it came from — and
    // the UI must stop listing other devices the moment sync is off.
    // (syncTabs and deviceId survive: consent and identity are per-device,
    // not per-account.)
    tabsync.onSyncDisabled();
    tabicons.onSyncDisabled();
    sends.onSyncDisabled();
    sharedSpaces.onSyncDisabled();
    syncedClosed.onSyncDisabled();
    for(const listener of accountListeners)listener();
    return { ok: true, status: status() };
  } finally {
    suspended = false; // a failed wipe keeps sync enabled — future passes must run
  }
}

async function responseText(res) {
  try { return typeof res.text === 'function' ? await res.text() : ''; } catch { return ''; }
}

/** `run` is immutable for the whole sync pass: `run.ctx` is the tab-sync
 * context snapshotted when the pass began (never re-resolved after an await,
 * so a mid-flight credential change can't cross account boundaries), and
 * `run.stale()` is checked after every await so a stranded pass aborts
 * before it merges, exports, or writes anything. */
async function syncOne(accountId, key, desc, run, attempt = 0) {
  const url = `${ACTIVE_SYNC_ENDPOINT}/v1/blob/${accountId}/${desc.name}`;
  async function cleanupRetiredSpaces(payload) {
    // Earlier v1 Workers treated every DELETE, even one with a store suffix,
    // as an account wipe. A supported Spaces store alone is not sufficient.
    if(desc.name!=='spaces'||!canDeleteSpaceStores)return;
    for(const id of sharedSpaces.retiredSpaceIds(run.ctx))if(!payload.spaces?.[id]) {
      const removed=await net.fetch(`${ACTIVE_SYNC_ENDPOINT}/v1/blob/${accountId}/space-${id}`,{method:'DELETE'});
      if(run.stale())throw new SyncError('stale');
      if(!removed.ok)throw new SyncError(responseCode(removed.status, await responseText(removed)));
      requestQueue?.cancelWhere(op=>op.item==='space-'+id,'retired');
      sharedSpaces.forgetRetiredSpace(id,run.ctx);
    }
  }
  const getRes = await net.fetch(url);
  if (run.stale()) throw new SyncError('stale');
  const canDeleteSpaceStores=getRes.headers?.get?.('X-Blanc-Space-Delete')==='1';
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
    if (desc.optional && await responseText(getRes) === 'unknown store') return { unavailable: true };
    if (run.stale()) throw new SyncError('stale');
    missing = true;
  } else throw new SyncError(responseCode(getRes.status, await responseText(getRes)));
  let plan = null, stored = false;
  try {
    let payload;
    if (desc.spaceId) {
      if(sharedSpaces.deletedSpaceIds(run.ctx).includes(desc.spaceId)) {
        // Keep the encrypted index tombstone for 30 days, but release the
        // content bytes as soon as deletion is known. Never replay tab edits
        // from the deleted Space into this compact record.
        payload={v:1,spaceId:desc.spaceId,groups:{},tabs:{}};
        if(missing || sharedSpaces.equals(remote,payload))return {missing};
      } else {
        plan = sharedSpaces.exportSpace(desc.spaceId,remote,version,run.ctx,text=>encrypt(key,text));
        if (!plan.upload) return { missing, needsIndex: !!plan.indexEntry };
        payload = plan.upload.blob;
      }
    } else {
      // Rejecting an oversized sidecar for display must not let our smaller
      // cache overwrite its peer bindings. Hold publication in that case.
      if(desc.name==='shared'&&remote&&Buffer.byteLength(JSON.stringify(remote),'utf8')>65536)return {blocked:true};
      if (remote) {
        applyingRemote = true;
        try { desc.merge(remote, run.ctx); } finally { applyingRemote = false; }
      }
      payload = desc.export(run.ctx);
      if(desc.name==='shared'&&payload===null)return {blocked:true};
      if (missing && desc.optional && desc.hasPublishableContent && !desc.hasPublishableContent(payload, run.ctx)) {await cleanupRetiredSpaces(payload);return { missing: true };}
      if (remote && desc.equals?.(payload, remote)) { desc.stored?.(payload,run.ctx);await cleanupRetiredSpaces(payload);return; }
    }
    const blob = encrypt(key, JSON.stringify(payload));
    if (Buffer.byteLength(JSON.stringify(blob),'utf8') > 524288-4096) throw new SyncError('payload-too-large');
    if (run.stale()) throw new SyncError('stale');
    const putRes = await net.fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ifVersion: version, blob }),
    });
    if (run.stale()) throw new SyncError('stale');
    if (putRes.status === 409 && attempt < 3) return { retry: true };
    if (putRes.status === 409) throw new SyncError('conflict');
    if (putRes.status === 507) throw new SyncError('account-quota');
    if (desc.optional && putRes.status === 404) return { unavailable: true };
    if (!putRes.ok) throw new SyncError(responseCode(putRes.status, await responseText(putRes)));
    stored = true;
    desc.stored?.(payload,run.ctx);
    await cleanupRetiredSpaces(payload);
    return desc.spaceId ? { spaceStored: true } : null;
  } finally {
    if (plan) sharedSpaces.settleSpace(desc.spaceId,plan,{blobStored:stored},run.ctx);
  }
}

function spaceDescriptor(id,kind='S') {
  return {name:'space-'+id,class:kind,spaceId:id,optional:true,spaces:true};
}
function cancelledRequest(gen,ctx,desc) {
  if (suspended) return 'suspended';
  if (gen!==syncGen) return 'generation';
  if (!ensureStore().data.enabled) return 'disabled';
  if (desc.spaces && !sharedSpaces.isEnabled(ctx)) return 'consent-off';
  if(desc.spaceId&&!sharedSpaces.deletedSpaceIds(ctx).includes(desc.spaceId)&&(sharedSpaces.isDormant(desc.spaceId,ctx)||sharedSpaces.isDraft(desc.spaceId,ctx)))return 'consent-off';
  if (desc.spaces && spacesUnavailable && !desc.retryAvailability) return 'unavailable';
  return null;
}
function sharedStatus() {
  if(!isDefaultLocalProfile())return {enabled:false,available:false,spaces:0,spaceLimit:25,canAdd:false,waiting:0,running:0,windowFreesAt:0,backoff:false};
  const ctx={accountId:ensureStore().data.accountId};
  return {enabled:sharedSpaces.isEnabled(ctx),available:!spacesUnavailable,
    accountFull:ensureStore().data.lastError==='account-quota',
    spaces:sharedSpaces.spaceCount(ctx),spaceLimit:25,canAdd:sharedSpaces.canAddSpace(ctx),
    ...(requestQueue?.status()??{waiting:0,running:0,windowFreesAt:0,backoff:false})};
}
function spaceStatus(id) {
  if(!isDefaultLocalProfile())return {unsyncedTabIds:[],reason:null};
  const entry=sharedSpaces.rebind(ensureStore().data.accountId).data.blobs[id];
  const reason=['full','tombstones','tabs','remote-over-budget','required-state-over-budget'].includes(entry?.reason)?entry.reason:null;
  const pending=sharedSpaces.rebind(ensureStore().data.accountId).data.pending[id];
  return {unsyncedTabIds:unsyncedTabIds(entry),reason,lastSyncedAt:entry?.lastPublishedAt??entry?.failedAt??0,failed:!!entry?.failedAt,pending:!!pending&&Object.values(pending).some(value=>value&&Object.keys(value).length)};
}
function setSyncSpaces(on) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID,()=>setSyncSpaces(on));
  if(!sharedSpaces.setEnabled(on,tabSyncContext()))return {...sharedStatus(),error:'save-failed'};
  invalidateGeneration('consent-off');
  ensureStore().update(data=>{data.syncSpaces=!!on;});
  if (!on) requestQueue?.cancelWhere(op=>op.spaces,'consent-off');
  else {spacesUnavailable=false;spacesRetryAt=0;}
  if(ensureStore().data.enabled)schedule(1000);
  return sharedStatus();
}
async function sharedIndexPreview() {
  if(!isDefaultLocalProfile())return withLocalProfile(DEFAULT_PROFILE_ID,sharedIndexPreview);
  if(!bananifyServiceAllowed(SYNC_ENDPOINT))return {ok:false,error:SERVICE_UNAVAILABLE};
  const data=ensureStore().data,ctx=tabSyncContext(),gen=syncGen;
  if(!data.enabled||!data.protectedKey)return {ok:false,error:'sync-off'};
  const pending=getRequestQueue().enqueue({class:'I',item:'spaces',generation:'preview:'+gen,
    cancelled:()=>suspended||gen!==syncGen?'generation':null,
    run:async()=>{
      let key;
      try {
        key=unprotectSyncKey(safeStorage,data.protectedKey);
        const response=await net.fetch(`${ACTIVE_SYNC_ENDPOINT}/v1/blob/${ctx.accountId}/spaces`);
        if(gen!==syncGen||suspended)throw new SyncError('stale');
        if(response.status===429)throw new SyncError('rate-limited');
        if(response.status===404) {
          if(await responseText(response)==='unknown store')return {ok:false,error:'unavailable'};
          return {ok:true};
        }
        if(!response.ok)throw new SyncError('http-'+response.status);
        const payload=await response.json();if(gen!==syncGen)throw new SyncError('stale');
        sharedSpaces.mergeIndex(JSON.parse(decrypt(key,payload.blob)),ctx);return {ok:true};
      } finally {key?.fill(0);}
    }});
  queueBarrier();const result=await pending;return result.error?{ok:false,error:errorCode(result.error)}:result.outcome;
}
function sharedPayloadFits(blob) {
  let key;
  try {key=unprotectSyncKey(safeStorage,ensureStore().data.protectedKey);return Buffer.byteLength(JSON.stringify(encrypt(key,JSON.stringify(blob))),'utf8')<=524288-4096;}
  finally {key?.fill(0);}
}

/** Callers attach to queued operations, never to a stale in-flight fetch.
 * Only a waiting operation can coalesce: its export will see every mutation
 * that preceded dispatch. Running operations have their own immutable ctx. */
async function syncNow(names = null, { onOutcome } = {}) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID,()=>syncNow(names,{onOutcome}));
  const d=ensureStore().data;
  if (suspended || !d.enabled || !d.accountId || !d.protectedKey) return {ok:false,error:keyProtectionError||'sync-off'};
  if (!bananifyServiceAllowed(SYNC_ENDPOINT)) return {ok:false,error:SERVICE_UNAVAILABLE};
  const ctx=tabSyncContext(),gen=syncGen,queue=getRequestQueue(),jobs=[];
  const consent=sharedSpaces.isEnabled(ctx),retryAvailability=spacesUnavailable && Date.now()>=spacesRetryAt;
  let skippedRequiredSelected=false;
  function enqueue(desc) {
    const cancelled=()=>cancelledRequest(gen,ctx,desc);
    const record=sharedSpaces.rebind(ctx.accountId).data;
    const job=queue.enqueue({class:desc.class??'F',item:desc.name,generation:gen,spaces:!!desc.spaces,
      priority:desc.spaceId && Object.keys(record.pending[desc.spaceId]??{}).some(k=>k!=='index')?0:1,cancelled,
      run:async({attempt})=>{
        let key;
        try {
          try {key=unprotectSyncKey(safeStorage,d.protectedKey);keyProtectionError=null;}
          catch(error){keyProtectionError=error instanceof SyncKeyStorageError?`key:${error.code}`:'local-key-unlock';throw new SyncError(keyProtectionError);}
          if(cancelled())throw new SyncError('stale');
          return await syncOne(d.accountId,key,desc,{ctx,stale:()=>!!cancelled()},attempt);
        } finally {key?.fill(0);}
      },
      onOutcome:(outcome,error)=>{
        if(ensureStore().data.accountId===ctx.accountId&&desc.spaceId&&sharedSpaces.rebind(ctx.accountId).data.blobs[desc.spaceId])sharedSpaces.rebind(ctx.accountId).update(data=>{if(error)data.blobs[desc.spaceId].failedAt=Date.now();else delete data.blobs[desc.spaceId].failedAt;});
        if(desc.spaces && outcome?.unavailable) {
          spacesUnavailable=true;spacesRetryAt=Date.now()+OPTIONAL_MISSING_RETRY_MS;
          queue.cancelWhere(op=>op.spaces,'unavailable');scheduleOptionalMissingRetry(ctx.accountId,'spaces');
        } else if(!error && desc.optional) {
          if(desc.name==='spaces'){spacesUnavailable=false;spacesRetryAt=0;}
          if(outcome?.missing)scheduleOptionalMissingRetry(ctx.accountId,desc.name);
          else noteOptionalStorePresent(ctx.accountId,desc.name);
        }
        onOutcome?.(desc.name,outcome??null,error??null);
      }});
    const pending=job.then(result=>({desc,...result}));jobs.push(pending);queueBarrier();return pending;
  }
  for(const base of STORES) {
    if(names && !names.includes(base.name))continue;
    if(!tabSyncStoreReady(base.name)){if(!base.optional)skippedRequiredSelected=true;continue;}
    if(base.spaces && (!consent || (spacesUnavailable && !(base.name==='spaces'&&retryAvailability))))continue;
    enqueue({...base,retryAvailability:base.name==='spaces'&&retryAvailability});
  }
  const initialIds=new Set();
  function addSpaces(ids) {
    const state=sharedSpaces.rebind(ctx.accountId).data;
    for(const id of ids) {
      const name='space-'+id;
      if(names && !names.includes(name))continue;
      const pending=state.pending[id];
      if(names || state.index.spaces[id]?.deleted?.v===true || pending && Object.keys(pending).some(k=>k!=='index') || state.index.spaces[id]?.rev!==state.blobs[id]?.rev)enqueue(spaceDescriptor(id));
      if(!names)enqueue(spaceDescriptor(id,'R'));
      initialIds.add(id);
    }
  }
  if(consent && !spacesUnavailable) {
    const ids=[...new Set([...sharedSpaces.spaceIds(ctx),...sharedSpaces.deletedSpaceIds(ctx)])];
    if(names)for(const name of names)if(/^space-[0-9a-f]{32}$/.test(name)&&!ids.includes(name.slice(6)))ids.push(name.slice(6));
    addSpaces(ids);
  }
  let results=await Promise.all(jobs);
  if(gen===syncGen && ensureStore().data.enabled && consent && !spacesUnavailable && !suspended) {
    if(!names) {
      const more=[...new Set([...sharedSpaces.spaceIds(ctx),...sharedSpaces.deletedSpaceIds(ctx)])].filter(id=>!initialIds.has(id));const offset=jobs.length;
      addSpaces(more);results.push(...await Promise.all(jobs.slice(offset)));
    }
    if(results.some(x=>x.outcome?.spaceStored||x.outcome?.needsIndex))results.push(await enqueue({...STORES.find(x=>x.name==='spaces')}));
  }
  // A dead generation never stamps status onto its successor. Optional stores
  // still cannot conceal a required-store error or advance its freshness.
  if(gen!==syncGen || suspended)return {ok:true};
  if(!ensureStore().data.enabled)return {ok:false,error:'sync-off'};
  if(keyProtectionError)return {ok:false,error:keyProtectionError};
  const required=results.filter(x=>!x.desc.optional);
  const quotaError=(results.find(x=>x.error?.message==='erasure-pending')??results.find(x=>x.error?.message==='account-quota'))?.error;
  const firstError=required.find(x=>x.error && !x.error.message.startsWith('cancelled:'))?.error??quotaError;
  if(required.length||quotaError||ensureStore().data.lastError==='account-quota')ensureStore().update(state=>{
    if(firstError){state.lastError=errorCode(firstError);if(state.lastError==='erasure-pending')state.erasurePending=true;}
    else if(!skippedRequiredSelected){state.lastError=null;if(required.length)state.lastSyncedAt=Date.now();}
  });
  return firstError?{ok:false,error:keyProtectionError||errorCode(firstError)}:{ok:true};
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
  invalidateGeneration(); // queued and running work cannot publish under the old consent
  tabicons.cancelCaptures();
  ensureStore().update((d) => { d.syncTabs = !!on; });
  if (ensureStore().data.enabled) scheduleTabs(1000);
  if (on) refreshTabIcons().catch(() => {});
  return status();
}

let lastSessionRefresh = 0;
/** Freshness pull on window focus / panel open (spec §6), throttled to one
 * per minute. Session, the icon sidecar, settings, which carry device names
 * (island lower-section spec §7.2), and sends (M7b §7): four GETs a minute
 * stays inside the worker's per-account limit, and Favorites wait for a
 * full sync. Errors stay silent — this is a background freshness path, not a
 * user-initiated sync. */
function refreshSession() {
  if (!isDefaultLocalProfile()) return;
  if (!tabStateReady) return;
  const d = ensureStore().data;
  if (!d.enabled) return;
  const now = Date.now();
  if (now - lastSessionRefresh < 60_000) return;
  lastSessionRefresh = now;
  if(sharedSpaces.isEnabled(tabSyncContext())){getRequestQueue();requestScheduler.markIndexDue();}
  syncNow(sharedSpaces.isEnabled(tabSyncContext())?['spaces','session','icons','settings','sends']:['session','icons','settings','sends']).catch(() => {});
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
let sharedVisibility=()=>[];
function listRemoteDevices() {
  if (!isDefaultLocalProfile()) return [];
  const d = ensureStore().data;
  if (!d.enabled) return [];
  const ctx = tabSyncContext();
  const names = settings.getDeviceNames();
  const devices=tabicons.attachToRemoteDevices(tabsync.getRemoteDevices(ctx), ctx);
  const state=sharedSpaces.snapshot(ctx),visible=new Set(sharedSpaces.isEnabled(ctx)?sharedVisibility().filter(id=>state.blobs[id]?.blob&&state.index.spaces[id]&&!state.index.spaces[id].deleted.v&&!sharedSpaces.isDormant(id,ctx)&&!sharedSpaces.isDraft(id,ctx)):[]);
  return require('./shared-spaces-surfaces').hideOccurrences(devices,state.sidecar,visible)
    .map((device) => ({ ...device, name: resolveDeviceName(names, device.deviceId, device.name) }));
}

/** Rename a device the Other devices drawer lists ('' or null restores its
 * published name). Any other id, this device's included, is refused. */
function renameRemoteDevice(deviceId, name, devices = listRemoteDevices()) {
  if (name !== null && typeof name !== 'string') return false;
  if (!devices.some((device) => device.deviceId === deviceId)) return false;
  settings.setDeviceName(deviceId, name ?? '');
  return true;
}

/** Leaving a sync (M7b §3): publish this device's entry in a per-device
 * store (sends, closed, session) as retracted,
 * best effort and bounded, so the account's other devices stop offering it
 * as a target and drop its items. Never creates the store. Runs inside
 * disable()'s barrier, after the last pass has settled. */
async function retractSends(d,storeName='sends',makeRetraction=sends.retractedOwn) {
  const queue=getRequestQueue();
  // Departure is already best effort (offline/old Workers may prevent it).
  // Do not refill/bypass the request window, or leave a delayed GET behind
  // after disable resolves. Erase-server-copy still uses the separate DELETE.
  if(!requestScheduler.canRequest())return;
  const accountId=d.accountId,protectedKey=d.protectedKey,gen=syncGen,ownId=tabSyncContext().deviceId;
  const cancelled=()=>gen!==syncGen||ensureStore().data.accountId!==accountId?'generation':null;
  const operation=queue.enqueue({class:'F',item:storeName,generation:'leave:'+storeName+':'+gen,cancelled,run:async({attempt})=>{
    let key;
    try {
      try {key=unprotectSyncKey(safeStorage,protectedKey);}catch{return;}
      const url=`${ACTIVE_SYNC_ENDPOINT}/v1/blob/${accountId}/${storeName}`,signal=()=>AbortSignal.timeout(5000);
      const getRes=await net.fetch(url,{signal:signal()});if(cancelled())return;
      if(getRes.status===429)throw new SyncError('rate-limited');
      if(getRes.status!==200)return;
      const body=await getRes.json();if(cancelled())return;
      const remote=JSON.parse(decrypt(key,body.blob));
      if(!remote?.devices?.[ownId]||remote.devices[ownId].retracted)return;
      const devices={...remote.devices,[ownId]:makeRetraction()};
      if(cancelled())return;
      const putRes=await net.fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ifVersion:body.version,blob:encrypt(key,JSON.stringify({devices}))}),signal:signal()});
      if(putRes.status===409 && attempt<1 && requestScheduler.canRequest())return {retry:true};
    } finally {key?.fill(0);}
  }});
  queueBarrier();await operation;
}

/** Every other device of this account a page can be sent to ([] when sync
 * is off), named as the Other devices drawer names them. */
function listSendTargets() {
  if (!isDefaultLocalProfile()) return [];
  if (!ensureStore().data.enabled) return [];
  const ctx = tabSyncContext();
  const names = settings.getDeviceNames();
  return sends.targets(ctx, tabsync.getDeviceEntries(ctx), {})
    .map(({ id, name, platform }) => ({ id, name: resolveDeviceName(names, id, name), platform }));
}

/** Settings → Sync's device list: this device's platform, then every other
 * device this sync knows of. Those are the Send to Device targets (devices
 * sharing their open tabs, plus Send to Device presence), so a device that
 * does neither isn't listed; Settings says so. No ids or keys reach the page. */
function listDevices() {
  return {
    platform: process.platform,
    devices: listSendTargets().map(({ name, platform }) => ({ name, platform })),
  };
}

/** Pages other devices sent here that this device hasn't opened or dismissed. */
function listSentToThisDevice() {
  if (!isDefaultLocalProfile()) return [];
  if (!ensureStore().data.enabled) return [];
  const ctx = tabSyncContext();
  const names = settings.getDeviceNames();
  return sends.inbox(ctx).map(({ id, url, title, sentAt, fromId, fromName }) => ({
    id, url, title, sentAt, fromName: resolveDeviceName(names, fromId, fromName),
  }));
}

/** Hide one received page on this device; returns it (for opening) or null. */
function hideSentItem(id) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => hideSentItem(id));
  if (typeof id !== 'string' || !ensureStore().data.enabled) return null;
  const item = sends.hide(tabSyncContext(), id);
  return item ? { id: item.id, url: item.url } : null;
}

/** Send one page to another device of this account (M7b §6). The item is
 * PUT at once, outside the tab-publish debounce, and the reply says what the
 * sender may be told: 'sent' (never "delivered"), 'unavailable' (the Worker
 * doesn't serve the store yet), 'failed' or 'invalid'. A page that didn't go
 * is taken back out of this device's entry. */
async function sendTab({ url, title, to } = {}) {
  if (!isDefaultLocalProfile()) return withLocalProfile(DEFAULT_PROFILE_ID, () => sendTab({ url, title, to }));
  const d = ensureStore().data;
  if (!d.enabled || !d.accountId || !d.protectedKey || !bananifyServiceAllowed(SYNC_ENDPOINT)) return { status: 'failed' };
  if (!listSendTargets().some((target) => target.id === to)) return { status: 'invalid' };
  // Wait out a pass already on the wire (and any pass it coalesced), so this
  // send runs its own pass and hears its own result.
  await requestQueue?.runningSettled();
  if (suspended || !ensureStore().data.enabled) return { status: 'failed' };
  const ctx = tabSyncContext();
  const added = sends.addOwnItem(ctx, { url, title, to }, () => crypto.randomUUID());
  if (added.error) return { status: 'invalid' };
  let result = null;
  await syncNow(['sends'], {
    onOutcome: (name, outcome, error) => { if (name === 'sends') result = { outcome, error }; },
  });
  if (result && !result.error && !result.outcome?.unavailable && !result.outcome?.missing) return { status: 'sent' };
  // The queue can be cancelled by adopting another account. Rebinding the
  // old send here would erase the new account's cache during rollback.
  if(ensureStore().data.accountId===ctx.accountId)sends.removeOwnItem(ctx, added.item.id);
  return { status: result?.outcome?.unavailable ? 'unavailable' : 'failed' };
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
  sharedSpaces.onChanged(()=>withLocalProfile(DEFAULT_PROFILE_ID,()=>{if(ensureStore().data.enabled && sharedSpaces.isEnabled(tabSyncContext()) && !applyingRemote)schedule();}));
  syncedClosed.onChanged(()=>withLocalProfile(DEFAULT_PROFILE_ID,()=>{if(ensureStore().data.enabled && !applyingRemote)schedule();}));
  setInterval(()=>withLocalProfile(DEFAULT_PROFILE_ID,()=>{if(ensureStore().data.enabled)syncNow().catch(()=>{});}),60000).unref?.();
  bookmarks.onChanged(() => {
    if (isDefaultLocalProfile()) onDefaultLocalChange();
  });
  startPagePins.onChanged(() => {
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
    if (!d.enabled) return;
    const ctx = tabSyncContext();
    // Presence (M7b §3): a device that doesn't share tabs stays a target.
    if (sends.heartbeatDue(ctx)) syncNow(['sends']).catch(() => {});
    // Its open-tabs entry is presence alone then (tabsync-model presenceEntry),
    // and stays listed in Settings → Sync only while it keeps this heartbeat.
    if (tabsync.heartbeatDue(ctx)) scheduleSession(5000);
    if (!d.syncTabs) return;
    if (tabicons.heartbeatDue(ctx)) scheduleIcons(5000);
  }), 60 * 60 * 1000).unref?.();
}

module.exports = {
  sharedContext: tabSyncContext,
  sharedIndexPreview,
  sharedPayloadFits,
  onAccountChanged:listener=>accountListeners.add(listener),
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
  sharedStatus,
  spaceStatus,
  setSyncSpaces,
  status,
  setSyncTabs,
  setTabStateReady,
  refreshSession,
  onPairingShown:listener=>pairingShownListeners.add(listener),
  pairingDevices:()=>listSendTargets().map(({id,name})=>({deviceId:id,name})),
  setSharedVisibilityProvider:provider=>{sharedVisibility=provider;},
  listRemoteDevices,
  renameRemoteDevice,
  setThisDeviceName,
  listSendTargets,
  listDevices,
  listSentToThisDevice,
  hideSentItem,
  sendTab,
  onSendsChanged: sends.onChanged,
  captureTabIcon,
};
