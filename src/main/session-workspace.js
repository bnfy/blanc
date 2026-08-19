// Versioned workspace persistence for session.json. v1 introduced independent
// window records; v2 gives every window an explicit local-profile identity.
//
// Keep this module Electron-free: migrations and rollback precedence must be
// fixture-testable without loading main.js.

const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

const SESSION_WORKSPACE_VERSION = 2;
const PRIMARY_WINDOW_ID = 'primary';

const EMPTY_ENTRY = (id = PRIMARY_WINDOW_ID) => ({
  id,
  profileId: DEFAULT_PROFILE_ID,
  urls: [],
  activeIndex: 0,
  groups: [],
  groupIds: [],
  pinned: [],
  meta: [],
});

/** @typedef {{title: string, favicon: string|null}} SessionTabMeta */

function validWindowId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

// A Named Workspace id lives HERE, not in workspaces-model, so the dependency
// runs one way only: the model imports from this file and this file must never
// import the model back. A cycle would hand one side partial exports, leaving
// validWindowId undefined mid-load and quietly failing every id. The entry
// shape carries a `workspaceId` binding pointer, so validating it is this
// module's job anyway.
//
// `__proto__` passes the character rule above but cannot be used as a plain
// object key — assigning it sets the prototype instead of storing a binding —
// so a workspace with that id would silently fail to bind. `constructor` and
// friends assign normally, so the deny-list is exactly this one key.
const UNSAFE_ID_KEYS = new Set(['__proto__']);
function validWorkspaceId(value) {
  return validWindowId(value) && !UNSAFE_ID_KEYS.has(value);
}

function entryFrom(source, fallbackId = PRIMARY_WINDOW_ID) {
  if (!source || typeof source !== 'object') return EMPTY_ENTRY(fallbackId);
  const urls = Array.isArray(source.urls) ? source.urls : [];
  return {
    id: validWindowId(source.id) ? source.id : fallbackId,
    profileId: validProfileId(source.profileId) ? source.profileId : DEFAULT_PROFILE_ID,
    urls,
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: Array.isArray(source.groups) ? source.groups : [],
    groupIds: Array.isArray(source.groupIds) ? source.groupIds : [],
    pinned: Array.isArray(source.pinned) ? source.pinned : [],
    // Quiet Tabs: titles and favicons for tabs that come back quiet, zipped
    // onto `urls`. A mismatch means a rollback writer moved the URL column.
    meta: Array.isArray(source.meta) && source.meta.length === urls.length ? source.meta : [],
  };
}

/** The five keys understood by the pre-v1 flat writer. Window ids, metadata,
 * and activeWindowId intentionally never enter this rollback mirror. */
const mirrorProjection = (entry) => ({
  urls: entry.urls,
  activeIndex: entry.activeIndex,
  groups: entry.groups,
  groupIds: entry.groupIds,
  pinned: entry.pinned,
});

function hasMirror(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    Array.isArray(data.urls) &&
    Number.isInteger(data.activeIndex) &&
    Array.isArray(data.groups) &&
    Array.isArray(data.groupIds) &&
    Array.isArray(data.pinned)
  );
}

/** Structural equality ignores object key order but preserves array order. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length &&
    aKeys.every((key, index) => key === bKeys[index]) &&
    aKeys.every((key) => deepEqual(a[key], b[key]));
}

function normalizedWindows(rawWindows) {
  const used = new Set();
  const windows = [];
  for (const [index, raw] of (Array.isArray(rawWindows) ? rawWindows : []).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = entryFrom(raw, index === 0 ? PRIMARY_WINDOW_ID : `window_${index + 1}`);
    if (used.has(entry.id)) continue;
    used.add(entry.id);
    windows.push(entry);
  }
  return windows;
}

/**
 * Load with rollback -> re-upgrade precedence. A legacy build rewrites the
 * flat mirror while preserving unknown v1 fields. If that mirror diverges
 * from the formerly focused nested window, the legacy writer won: collapse
 * to its one current workspace rather than resurrecting stale extra windows.
 */
function loadWorkspace(data) {
  if (!data || typeof data !== 'object') {
    return { windows: [EMPTY_ENTRY()], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
  }

  const mirrorPresent = hasMirror(data);
  const mirror = entryFrom(data, PRIMARY_WINDOW_ID);

  if (!Number.isInteger(data.version)) {
    return { windows: [mirror], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
  }
  if (data.version > SESSION_WORKSPACE_VERSION) {
    return {
      windows: [mirrorPresent ? mirror : EMPTY_ENTRY()],
      activeWindowId: PRIMARY_WINDOW_ID,
      readOnly: true,
    };
  }

  if (data.version !== 1 && data.version !== SESSION_WORKSPACE_VERSION) {
    return { windows: [mirror], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
  }

  const windows = normalizedWindows(data.windows);
  const requestedActiveId = validWindowId(data.activeWindowId) ? data.activeWindowId : null;
  const activeWindowId = windows.some((entry) => entry.id === requestedActiveId)
    ? requestedActiveId
    : windows[0]?.id ?? PRIMARY_WINDOW_ID;
  const focused = windows.find((entry) => entry.id === activeWindowId) ?? windows[0] ?? null;

  if (!mirrorPresent && focused) return { windows, activeWindowId, readOnly: false };
  if (mirrorPresent && !focused) {
    return { windows: [mirror], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
  }
  if (mirrorPresent && focused) {
    if (deepEqual(mirrorProjection(focused), mirrorProjection(mirror))) {
      return { windows, activeWindowId, readOnly: false };
    }
    return { windows: [mirror], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
  }
  return { windows: [EMPTY_ENTRY()], activeWindowId: PRIMARY_WINDOW_ID, readOnly: false };
}

/** v1 plus the exact five-key v0 mirror of the focused window. Accepts one
 * entry for M1 call-site compatibility or the full M2 window array. */
function buildSaveShape(windowEntries, existing, { activeWindowId = null } = {}) {
  const input = Array.isArray(windowEntries) ? windowEntries : [windowEntries];
  const windows = normalizedWindows(input);
  if (!windows.length) windows.push(EMPTY_ENTRY());
  const focusedId = validWindowId(activeWindowId) && windows.some((entry) => entry.id === activeWindowId)
    ? activeWindowId
    : windows[0].id;
  const focused = windows.find((entry) => entry.id === focusedId) ?? windows[0];
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: focusedId,
    windows,
    ...mirrorProjection(focused),
  };
}

function removeProfileWorkspaces(data, profileId) {
  const loaded = loadWorkspace(data);
  if (loaded.readOnly || !validProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) {
    return loaded;
  }
  const windows = loaded.windows.filter((entry) => entry.profileId !== profileId);
  const activeWindowId = windows.some((entry) => entry.id === loaded.activeWindowId)
    ? loaded.activeWindowId
    : windows[0]?.id ?? PRIMARY_WINDOW_ID;
  return { windows, activeWindowId, readOnly: false };
}

module.exports = {
  SESSION_WORKSPACE_VERSION,
  PRIMARY_WINDOW_ID,
  validWindowId,
  validWorkspaceId,
  loadWorkspace,
  buildSaveShape,
  entryFrom,
  removeProfileWorkspaces,
};
