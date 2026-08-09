// Versioned workspace persistence for session.json (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// Pure functions over plain objects; main.js owns the JsonStore.

const EMPTY_ENTRY = () => ({ urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] });

/** @typedef {{title: string, favicon: string|null}} SessionTabMeta */

function entryFrom(source) {
  if (!source || typeof source !== 'object') return EMPTY_ENTRY();
  const urls = Array.isArray(source.urls) ? source.urls : [];
  return {
    urls,
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: Array.isArray(source.groups) ? source.groups : [],
    groupIds: Array.isArray(source.groupIds) ? source.groupIds : [],
    pinned: Array.isArray(source.pinned) ? source.pinned : [],
    // Quiet Tabs (spec §10.1): titles and favicons for tabs that come back
    // quiet, zipped onto `urls`. A length mismatch means some other writer
    // — a rolled-back 1.0.x build rewriting the flat mirror — moved the urls
    // out from under this array, so drop it rather than mislabel pages.
    meta: Array.isArray(source.meta) && source.meta.length === urls.length ? source.meta : [],
  };
}

/** The five keys the v0 mirror carries. `meta` lives only in windows[0], so
 * mirror/nested divergence must be judged on the mirror's own columns —
 * comparing whole entries would report divergence on EVERY launch and drop
 * the nested workspace forever (spec §10.1). */
const mirrorProjection = (entry) => ({
  urls: entry.urls,
  activeIndex: entry.activeIndex,
  groups: entry.groups,
  groupIds: entry.groupIds,
  pinned: entry.pinned,
});

/** Check if all five mirror keys are present and valid on the raw data object.
 * Presence is checked on the input object itself (not normalized). */
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

/** Structural equality that ignores object key order (but preserves array order).
 * This prevents false divergence when identical group objects have different key orders. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  // For objects, compare by sorted keys to ignore key order
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((k, i) => k === bKeys[i])) return false;
  return aKeys.every(k => deepEqual(a[k], b[k]));
}

/** Load with rollback → re-upgrade precedence. 1.0.9's JsonStore.update()
 * mutates the stored object in place and persists it whole, so a rolled-back
 * legacy build rewrites the flat mirror while PRESERVING the unknown
 * version/windows keys. The mirror only participates in precedence when all
 * five keys are present and valid. Divergence between mirror and nested
 * workspace means the legacy writer wrote last — the mirror wins and v1 is
 * rebuilt from it. Unknown future versions are read-only: best-effort load,
 * never rewritten by this build. */
function loadWorkspace(data) {
  if (!data || typeof data !== 'object') return { windows: [EMPTY_ENTRY()], readOnly: false };

  const hasMirrorData = hasMirror(data);

  if (!Number.isInteger(data.version)) {
    return { windows: [entryFrom(data)], readOnly: false }; // v0: today's flat file
  }
  if (data.version > 1) {
    return { windows: [entryFrom(data)], readOnly: true };
  }

  const nested = Array.isArray(data.windows) && data.windows.length
    ? entryFrom(data.windows[0])
    : null;

  // v1 precedence rules:
  // 1. Mirror only participates if all five keys are present and valid.
  // 2. Absent/partial/invalid mirror + valid nested → nested wins.
  // 3. Valid mirror + absent/invalid nested → mirror wins.
  // 4. Both valid → compare structurally; differ → legacy writer wins.
  if (!hasMirrorData && nested) {
    return { windows: [nested], readOnly: false };
  }

  if (hasMirrorData && !nested) {
    return { windows: [entryFrom(data)], readOnly: false };
  }

  if (hasMirrorData && nested) {
    // Both present and valid; use structural equality (key-order-insensitive)
    if (deepEqual(mirrorProjection(nested), mirrorProjection(entryFrom(data)))) {
      return { windows: [nested], readOnly: false };
    } else {
      return { windows: [entryFrom(data)], readOnly: false }; // legacy writer won
    }
  }

  // No mirror, no nested → empty
  return { windows: [EMPTY_ENTRY()], readOnly: false };
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
