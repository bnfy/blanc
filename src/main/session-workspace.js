// Versioned workspace persistence for session.json (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// Pure functions over plain objects; main.js owns the JsonStore.

const EMPTY_ENTRY = () => ({ urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [] });

function entryFrom(source) {
  if (!source || typeof source !== 'object') return EMPTY_ENTRY();
  return {
    urls: Array.isArray(source.urls) ? source.urls : [],
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: Array.isArray(source.groups) ? source.groups : [],
    groupIds: Array.isArray(source.groupIds) ? source.groupIds : [],
    pinned: Array.isArray(source.pinned) ? source.pinned : [],
  };
}

const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Load with rollback → re-upgrade precedence. 1.0.9's JsonStore.update()
 * mutates the stored object in place and persists it whole, so a rolled-back
 * legacy build rewrites the flat mirror while PRESERVING the unknown
 * version/windows keys. Divergence between mirror and nested workspace
 * therefore means the legacy writer wrote last — the mirror wins and v1 is
 * rebuilt from it. Unknown future versions are read-only: best-effort load,
 * never rewritten by this build. */
function loadWorkspace(data) {
  if (!data || typeof data !== 'object') return { windows: [EMPTY_ENTRY()], readOnly: false };
  const mirror = entryFrom(data);
  if (!Number.isInteger(data.version)) {
    return { windows: [mirror], readOnly: false }; // v0: today's flat file
  }
  if (data.version > 1) {
    return { windows: [mirror], readOnly: true };
  }
  const nested = Array.isArray(data.windows) && data.windows.length
    ? entryFrom(data.windows[0])
    : null;
  if (!nested || !sameEntry(nested, mirror)) {
    return { windows: [mirror], readOnly: false }; // legacy writer won
  }
  return { windows: [nested], readOnly: false };
}

/** v1 + the v0 mirror of the focused window. The mirror is exactly the five
 * keys 1.0.9's persistSession writes, so a rollback restores tabs. Foreign
 * keys already in the store are preserved, mirroring JsonStore.update()'s
 * in-place semantics. */
function buildSaveShape(focusedEntry, existing) {
  const entry = entryFrom(focusedEntry);
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    version: 1,
    windows: [entry],
    urls: entry.urls,
    activeIndex: entry.activeIndex,
    groups: entry.groups,
    groupIds: entry.groupIds,
    pinned: entry.pinned,
  };
}

module.exports = { loadWorkspace, buildSaveShape, entryFrom };
