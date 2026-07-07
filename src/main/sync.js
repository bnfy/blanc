const { net } = require('electron');
const { JsonStore } = require('./store');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const { deriveKeys, encrypt, decrypt } = require('./sync-crypto');

// Blanc-hosted E2EE profile sync. This module holds the only network calls;
// the Worker (cloudflare/sync-worker) stores AES-GCM ciphertext keyed by an
// opaque accountId and can't read anything. See the design spec.
const SYNC_ENDPOINT = 'https://blanc-sync.bnfy-441.workers.dev'; // wrangler dev -> http://127.0.0.1:8787

// Order doesn't matter; each store syncs independently.
const STORES = [
  { name: 'bookmarks', export: bookmarks.exportForSync, merge: bookmarks.mergeFromSync },
  { name: 'settings', export: settings.exportForSync, merge: settings.mergeFromSync },
];

let store = null;
const ensureStore = () => (store ??= new JsonStore('sync', {
  enabled: false, handle: '', accountId: '', key: '', lastSyncedAt: 0, lastError: null,
}));

let syncing = false, pending = false, timer = null;

class SyncError extends Error {}

function status() {
  const d = ensureStore().data;
  return { enabled: d.enabled, handle: d.handle, lastSyncedAt: d.lastSyncedAt, lastError: d.lastError };
}

// length OR variety — a client-side nudge (spec §14), not a security boundary
// (the Worker's per-account rate limit is that). No dependency.
function passphraseStrong(p) {
  if (p.length >= 16) return true;
  if (p.length < 10) return false;
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length >= 2;
}

function describe(err) {
  if (err instanceof SyncError && err.message === 'bad-passphrase') return 'Passphrase doesn’t match this sync account.';
  if (err instanceof SyncError && err.message === 'rate-limited') return 'Too many sync attempts — try again in a minute.';
  return 'Couldn’t reach sync — check your connection.';
}

async function enable({ handle, passphrase }) {
  const h = String(handle ?? '').trim();
  const p = String(passphrase ?? '');
  if (h.length < 2) return { ok: false, message: 'Choose a sync name (at least 2 characters).' };
  if (!passphraseStrong(p)) return { ok: false, message: 'Use a longer passphrase — 16+ characters, or 10+ with mixed characters.' };
  const { accountId, key } = deriveKeys(h, p);
  ensureStore().update((d) => {
    d.enabled = true; d.handle = h; d.accountId = accountId; d.key = key.toString('base64'); d.lastError = null;
  });
  const res = await syncNow();
  if (res.ok) return { ok: true, status: status() };
  // First sync failed (bad passphrase for an existing account, or offline):
  // stay enabled so a retry works, but report why.
  return { ok: false, message: res.message };
}

async function disable({ wipeRemote = false } = {}) {
  const d = ensureStore().data;
  if (wipeRemote && d.accountId) {
    try { await net.fetch(`${SYNC_ENDPOINT}/v1/blob/${d.accountId}`, { method: 'DELETE' }); } catch { /* best effort */ }
  }
  ensureStore().update((s) => { s.enabled = false; s.handle = ''; s.accountId = ''; s.key = ''; s.lastError = null; });
  return { ok: true, status: status() };
}

async function syncOne(accountId, key, desc, attempt = 0) {
  const url = `${SYNC_ENDPOINT}/v1/blob/${accountId}/${desc.name}`;
  const getRes = await net.fetch(url);
  let version = null, remote = null;
  if (getRes.status === 200) {
    const body = await getRes.json();
    version = body.version;
    try { remote = JSON.parse(decrypt(key, body.blob)); }
    catch { throw new SyncError('bad-passphrase'); }
  } else if (getRes.status === 429) {
    throw new SyncError('rate-limited');
  } else if (getRes.status !== 404) {
    throw new SyncError(`http-${getRes.status}`);
  }
  if (remote) desc.merge(remote);
  const blob = encrypt(key, JSON.stringify(desc.export()));
  const putRes = await net.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ifVersion: version, blob }),
  });
  if (putRes.status === 409 && attempt < 3) return syncOne(accountId, key, desc, attempt + 1); // re-pull-merge
  if (!putRes.ok) throw new SyncError(`http-${putRes.status}`);
}

async function syncNow() {
  const d = ensureStore().data;
  if (!d.enabled) return { ok: false, message: 'Sync is off.' };
  if (syncing) { pending = true; return { ok: true }; } // coalesce concurrent triggers
  syncing = true;
  const key = Buffer.from(d.key, 'base64');
  let firstError = null;
  try {
    for (const desc of STORES) {
      try { await syncOne(d.accountId, key, desc); }
      catch (err) { firstError ??= err; }
    }
  } finally { syncing = false; }
  ensureStore().update((s) => {
    if (firstError) s.lastError = describe(firstError);
    else { s.lastError = null; s.lastSyncedAt = Date.now(); }
  });
  if (pending) { pending = false; return syncNow(); }
  return firstError ? { ok: false, message: describe(firstError) } : { ok: true };
}

function schedule(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, delay);
}

function init() {
  if (ensureStore().data.enabled) schedule(2000); // sync-on-launch
  // React to local changes. mergeFromSync does NOT fire these, so no loop;
  // schedule() is a no-op churn-wise while a sync is in flight (coalesced).
  settings.onSettingsChanged(() => { if (ensureStore().data.enabled) schedule(); });
  bookmarks.onChanged(() => { if (ensureStore().data.enabled) schedule(); });
}

module.exports = { init, enable, disable, syncNow, status };
