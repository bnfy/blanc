// src/main/workspaces.js
// Named Workspaces persistence: one profile-scoped `workspaces.json` per local
// profile (Personal at the userData root, named profiles under
// `profiles/<opaque-id>/`, exactly where Favorites and history already live).
//
// Deliberately thin. Every decision — validation, naming rules, the cap, the
// binding transitions — lives in the Electron-free workspaces-model, so it can
// be unit-tested. This file only reads and writes the store, mints ids, and
// stamps the clock.
//
// NEVER synced. Workspaces are device-local in this project; `workspaces` must
// not appear in SYNCED_KEYS or any sync payload.

const crypto = require('crypto');
const { JsonStore } = require('./store');
const { activeLocalProfileId } = require('./local-profile-context');
const model = require('./workspaces-model');

let store = null;
// Review round 2, Fix 4: which profiles have already been repaired THIS
// process. ensureStore() is the first thing every read AND write in this
// file calls — including main.js's autosaveWorkspaceBindings, which rides
// persistSession/broadcastTabs's ~10 broadcasts/s coalesce during a page
// load. Re-running normalizeFile plus two full JSON.stringify passes of the
// whole file (up to MAX_WORKSPACES records, each with an 8KB favicon column)
// on every single call was a measurable main-process stall on that hot path.
const repairedProfiles = new Set();

const ensureStore = () => {
  if (!store) {
    store = new JsonStore('workspaces', model.EMPTY_FILE(), { scope: 'profile' });
  }
  const profileId = activeLocalProfileId();
  // Repair on FIRST access per profile per process, not on every access. The
  // file is only ever written through this module (create/rename/remove/
  // saveCapture all route through ensureStore + store.update), so nothing
  // external can re-corrupt it mid-process — a hand-edited or partially
  // written file only needs normalizing the first time this process reads it
  // for that profile, exactly like JsonStore itself only loads a file once
  // per profile and then trusts its own retained copy.
  if (!repairedProfiles.has(profileId)) {
    // A profile-scoped file can never legitimately hold another profile's
    // records, so a foreign profileId is dropped here — the model stays
    // generally profile-aware, but the store enforces the single-profile
    // invariant at the boundary.
    const current = store.data;
    const repaired = model.normalizeFile(current);
    repaired.workspaces = repaired.workspaces.filter((w) => w.profileId === profileId);
    if (JSON.stringify(repaired) !== JSON.stringify(current)) {
      store.update((data) => {
        data.version = repaired.version;
        data.workspaces = repaired.workspaces;
      });
    }
    repairedProfiles.add(profileId);
  }
  return store;
};

/** This profile's workspaces, newest-updated first (the ⌘L list order). */
function list() {
  return model.listForProfile(ensureStore().data, activeLocalProfileId());
}

function get(id) {
  return list().find((workspace) => workspace.id === id) ?? null;
}

/** Save the current window as a new named workspace.
 * The store mints the id: the model stays deterministic, and randomUUID()
 * satisfies validWorkspaceId (36 chars, hex + hyphens). */
function create({ name, capture }) {
  const current = ensureStore();
  const result = model.createWorkspace(current.data, {
    name,
    profileId: activeLocalProfileId(),
    capture,
    now: Date.now(),
    id: crypto.randomUUID(),
  });
  if (result.error) return { ok: false, error: result.error };
  current.update((data) => { data.workspaces = result.file.workspaces; });
  return { ok: true, workspace: result.workspace };
}

function rename(id, name) {
  const current = ensureStore();
  const result = model.renameWorkspace(current.data, id, name, Date.now());
  if (result.error) return { ok: false, error: result.error };
  current.update((data) => { data.workspaces = result.file.workspaces; });
  return { ok: true, workspace: result.workspace };
}

function remove(id) {
  const current = ensureStore();
  const result = model.deleteWorkspace(current.data, id);
  if (!result.removed) return { ok: false, error: 'not-found' };
  current.update((data) => { data.workspaces = result.file.workspaces; });
  return { ok: true };
}

/** Autosave from a bound window. A no-op for an unknown id, so a deleted
 * workspace's last in-flight capture cannot resurrect it. */
function saveCapture(id, capture) {
  const current = ensureStore();
  const result = model.updateCapture(current.data, id, capture, Date.now());
  if (!result.workspace) return { ok: false, error: 'not-found' };
  current.update((data) => { data.workspaces = result.file.workspaces; });
  return { ok: true };
}

module.exports = { list, get, create, rename, remove, saveCapture };
