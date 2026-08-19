// src/main/workspaces-model.js
// Named Workspaces — pure entitlement-free decisions. NO require('electron').
// Mirrors the Electron-free pattern of session-workspace.js / patron-model.js
// so every branch is unit-testable. This file owns the record shape and its
// repair rules; workspaces.js owns the store, main.js owns the tabs.

const { validProfileId } = require('./local-profile-model');

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

const asArray = (value) => (Array.isArray(value) ? value : []);

/** One workspace record, repaired — or null when it cannot be trusted.
 * Rejects (rather than repairs) identity fields: a record with no id, no
 * usable name, or a foreign profileId is not this file's to keep. */
function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (!validProfileId(raw.profileId)) return null;
  const name = sanitizeName(raw.name);
  if (name === null) return null;
  if (!Array.isArray(raw.urls)) return null;

  const urls = raw.urls;
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

module.exports = {
  WORKSPACES_VERSION,
  MAX_WORKSPACES,
  MAX_NAME_LENGTH,
  EMPTY_FILE,
  sanitizeName,
  normalizeWorkspace,
  normalizeFile,
};
