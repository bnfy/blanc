// src/main/workspaces-model.js
// Named Workspaces — pure entitlement-free decisions. NO require('electron').
// Mirrors the Electron-free pattern of session-workspace.js / patron-model.js
// so every branch is unit-testable. This file owns the record shape and its
// repair rules; workspaces.js owns the store, main.js owns the tabs.

const { validProfileId } = require('./local-profile-model');
// A workspace id must survive a round-trip through session.json's
// `workspaceId` binding pointer, which is validated by this same rule. Sharing
// the helper is deliberate: two independent regexes would drift, and an id
// that fails validWindowId would silently lose its binding on restore.
const { validWindowId } = require('./session-workspace');

// `__proto__` satisfies validWindowId's character rule, but it cannot be used
// as a plain-object key: `bindings['__proto__'] = windowId` sets the prototype
// instead of storing a binding, so such a workspace would silently fail to
// bind (Task 3's bindings map is keyed by workspace id). `constructor` and
// friends are safe — assigning them creates an ordinary own property — so the
// list is exactly this one key rather than a cargo-culted set.
const UNSAFE_ID_KEYS = new Set(['__proto__']);
const validWorkspaceId = (value) => validWindowId(value) && !UNSAFE_ID_KEYS.has(value);

const WORKSPACES_VERSION = 1;
// Bounded like the closed-tab entry cap: keeps the file small and the ⌘L
// list scannable. A plan-time decision, not a spec requirement.
const MAX_WORKSPACES = 25;
const MAX_NAME_LENGTH = 60;

/** A fresh empty file. Returns a NEW object each call — a shared default
 * would let one profile's store mutate another's. */
const EMPTY_FILE = () => ({ version: WORKSPACES_VERSION, workspaces: [] });

/** The user's handle for switching: trimmed, whitespace-collapsed, capped.
 * Null when nothing survives, which is what makes an empty name a rejection
 * rather than a workspace called "". */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  return clean === '' ? null : clean;
}

// Always a NEW array. Returning the caller's array by reference would let a
// later updateCapture (or a store write) mutate the object we normalized from.
const asArray = (value) => (Array.isArray(value) ? value.slice() : []);

/** One workspace record, repaired — or null when it cannot be trusted.
 * Rejects (rather than repairs) identity fields: a record with no id, no
 * usable name, or a foreign profileId is not this file's to keep. */
function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!validWorkspaceId(raw.id)) return null;
  if (!validProfileId(raw.profileId)) return null;
  const name = sanitizeName(raw.name);
  if (name === null) return null;
  if (!Array.isArray(raw.urls)) return null;

  const urls = asArray(raw.urls);
  const meta = asArray(raw.meta);
  return {
    id: raw.id,
    name,
    profileId: raw.profileId,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    urls,
    activeIndex: Number.isInteger(raw.activeIndex) ? raw.activeIndex : 0,
    groups: asArray(raw.groups),
    groupIds: asArray(raw.groupIds),
    pinned: asArray(raw.pinned),
    // Titles/favicons are zipped onto `urls`. A length mismatch means a
    // writer moved the URL column, so the record survives without its meta
    // rather than pairing a title with the wrong tab.
    meta: meta.length === urls.length ? meta : [],
  };
}

/** The whole file, repaired: invalid records dropped, ids de-duplicated
 * (first wins), and the list bounded. Always stamped with THIS build's
 * version — a newer/unknown version is normalized, never trusted verbatim. */
function normalizeFile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const workspaces = [];
  for (const entry of asArray(source.workspaces)) {
    const workspace = normalizeWorkspace(entry);
    if (!workspace || seen.has(workspace.id)) continue;
    seen.add(workspace.id);
    workspaces.push(workspace);
    if (workspaces.length === MAX_WORKSPACES) break;
  }
  return { version: WORKSPACES_VERSION, workspaces };
}

/** The tab columns a capture carries, copied so the record never aliases the
 * live arrays main.js built it from. */
const captureColumns = (capture) => {
  const source = capture && typeof capture === 'object' ? capture : {};
  const urls = asArray(source.urls);
  const meta = asArray(source.meta);
  return {
    urls,
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: asArray(source.groups),
    groupIds: asArray(source.groupIds),
    pinned: asArray(source.pinned),
    meta: meta.length === urls.length ? meta : [],
  };
};

/** Names are the user's handle for switching, so a collision inside one
 * profile is confusing rather than merely redundant. Case-insensitive.
 * `exceptId` lets a rename keep its own current name. */
const nameTaken = (file, profileId, name, exceptId = null) => {
  const wanted = name.toLowerCase();
  return file.workspaces.some((w) =>
    w.profileId === profileId && w.id !== exceptId && w.name.toLowerCase() === wanted);
};

const withWorkspaces = (file, workspaces) => ({ version: WORKSPACES_VERSION, workspaces });

function createWorkspace(file, { name, profileId, capture, now, id } = {}) {
  const clean = normalizeFile(file);
  const safeName = sanitizeName(name);
  if (safeName === null) return { file: clean, error: 'invalid-name' };
  if (clean.workspaces.length >= MAX_WORKSPACES) return { file: clean, error: 'limit' };
  if (nameTaken(clean, profileId, safeName)) return { file: clean, error: 'duplicate-name' };

  const workspace = normalizeWorkspace({
    id, name: safeName, profileId, createdAt: now, updatedAt: now, ...captureColumns(capture),
  });
  // A caller-supplied id or profileId that cannot be stored is a programming
  // error, not a user error — surface it rather than writing a broken record.
  if (!workspace) return { file: clean, error: 'invalid-record' };
  return { file: withWorkspaces(clean, [...clean.workspaces, workspace]), workspace };
}

function renameWorkspace(file, id, name, now) {
  const clean = normalizeFile(file);
  const existing = clean.workspaces.find((w) => w.id === id);
  if (!existing) return { file: clean, error: 'not-found' };
  const safeName = sanitizeName(name);
  if (safeName === null) return { file: clean, error: 'invalid-name' };
  if (nameTaken(clean, existing.profileId, safeName, id)) return { file: clean, error: 'duplicate-name' };

  const workspace = { ...existing, name: safeName, updatedAt: now };
  return {
    file: withWorkspaces(clean, clean.workspaces.map((w) => (w.id === id ? workspace : w))),
    workspace,
  };
}

function deleteWorkspace(file, id) {
  const clean = normalizeFile(file);
  const workspaces = clean.workspaces.filter((w) => w.id !== id);
  return {
    file: withWorkspaces(clean, workspaces),
    removed: workspaces.length !== clean.workspaces.length,
  };
}

/** Autosave: replace the tab columns from a live capture. Identity fields
 * (id/name/profileId/createdAt) are preserved — a capture is not a rename. */
function updateCapture(file, id, capture, now) {
  const clean = normalizeFile(file);
  const existing = clean.workspaces.find((w) => w.id === id);
  if (!existing) return { file: clean };
  const workspace = { ...existing, ...captureColumns(capture), updatedAt: now };
  return {
    file: withWorkspaces(clean, clean.workspaces.map((w) => (w.id === id ? workspace : w))),
    workspace,
  };
}

/** One profile's workspaces, newest-updated first — the ⌘L list order. */
function listForProfile(file, profileId) {
  return normalizeFile(file).workspaces
    .filter((w) => w.profileId === profileId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------------------------------------------------------------------------
// Single-window binding.
//
// `bindings` maps workspaceId -> windowId. The caller derives it from LIVE
// window runtimes, so every entry is a live window by construction and this
// model never needs a liveness probe.
//
// Every map produced here is null-prototype: even if a hostile id slipped past
// validWorkspaceId (a hand-edited file, a future caller), assigning it can
// neither poison a prototype nor collide with an inherited name. The id reject
// is defense in depth, not the only line.
// ---------------------------------------------------------------------------

const boundWindow = (bindings, workspaceId) => {
  if (!bindings || typeof bindings !== 'object') return null;
  if (typeof workspaceId !== 'string' || workspaceId === '') return null;
  if (!Object.prototype.hasOwnProperty.call(bindings, workspaceId)) return null;
  const windowId = bindings[workspaceId];
  return typeof windowId === 'string' && windowId !== '' ? windowId : null;
};

/** Copy into a null-prototype map, keeping own string entries only. */
function cloneBindings(bindings) {
  const next = Object.create(null);
  if (!bindings || typeof bindings !== 'object') return next;
  for (const key of Object.keys(bindings)) {
    const windowId = bindings[key];
    if (typeof windowId === 'string' && windowId !== '') next[key] = windowId;
  }
  return next;
}

/** What opening `workspaceId` from `requestingWindowId` should do. */
function resolveOpen(bindings, workspaceId, requestingWindowId) {
  const windowId = boundWindow(bindings, workspaceId);
  if (!windowId) return { action: 'swap' };            // unbound — this window takes it
  if (windowId === requestingWindowId) return { action: 'noop' };  // already here
  return { action: 'focus', windowId };                 // live elsewhere — never double-bind
}

/** Bind one workspace to one window, releasing BOTH prior claims: the window's
 * previous workspace and the workspace's previous window. Either leftover
 * would give a single slot two autosave writers. */
function bindingsAfterSwap(bindings, { workspaceId, windowId } = {}) {
  const next = cloneBindings(bindings);
  if (!validWorkspaceId(workspaceId) || typeof windowId !== 'string' || windowId === '') return next;
  for (const key of Object.keys(next)) {
    if (next[key] === windowId) delete next[key];       // this window's previous workspace
  }
  next[workspaceId] = windowId;                          // also replaces the workspace's previous window
  return next;
}

/** A window closed (or became scratch): it binds nothing. */
function bindingsAfterUnbind(bindings, { windowId } = {}) {
  const next = cloneBindings(bindings);
  for (const key of Object.keys(next)) {
    if (next[key] === windowId) delete next[key];
  }
  return next;
}

/** A workspace was deleted: whatever window showed it becomes scratch. */
function bindingsAfterDelete(bindings, workspaceId) {
  const next = cloneBindings(bindings);
  if (typeof workspaceId === 'string' && Object.prototype.hasOwnProperty.call(next, workspaceId)) {
    delete next[workspaceId];
  }
  return next;
}

module.exports = {
  WORKSPACES_VERSION,
  MAX_WORKSPACES,
  MAX_NAME_LENGTH,
  EMPTY_FILE,
  sanitizeName,
  normalizeWorkspace,
  normalizeFile,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  updateCapture,
  listForProfile,
  // Exported so Task 6's session-pointer validation reuses this exact rule
  // (validWindowId + the __proto__ reject) instead of re-deriving it.
  validWorkspaceId,
  resolveOpen,
  bindingsAfterSwap,
  bindingsAfterUnbind,
  bindingsAfterDelete,
};
