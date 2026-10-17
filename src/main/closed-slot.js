'use strict';

// Where the ⌘L panel's Recently closed band sits among a window's named groups
// (spec 2026-10-16-island-lower-section-design.md §4). The slot is the number
// of groups above the band: 0 is directly under Pinned. Pure: no Electron.

const CLOSED_SECTION_ID = 'recently-closed';

/** A usable slot for `groupCount` groups; anything malformed means the top. */
function clampClosedSlot(slot, groupCount) {
  if (!Number.isInteger(slot) || slot < 0) return 0;
  return Math.min(slot, groupCount);
}

/** Keep the band in place across a change from `prevIds` to `nextIds`: it
 * stays directly above the first surviving group that was below it, so groups
 * removed or reinserted above it move it with them and appended groups land
 * below it. With no group below left it stays last, and with nothing left to
 * anchor to it returns to the top. `movedId` (a group being dragged) never
 * anchors the band. */
function reconcileClosedSlot(prevIds, slot, nextIds, movedId = null) {
  const cut = clampClosedSlot(slot, prevIds.length);
  const below = new Set(prevIds.slice(cut));
  const above = new Set(prevIds.slice(0, cut));
  below.delete(movedId);
  above.delete(movedId);
  const at = nextIds.findIndex((id) => below.has(id));
  if (at !== -1) return at;
  return nextIds.some((id) => above.has(id)) ? nextIds.length : 0;
}

/** Move `id` (a group id or the band itself) before `beforeId` — a group id,
 * the band (directly above it) or null (after the last group). Returns the
 * new group order and band slot, or null for an unknown id. */
function reorderGroupsWithClosed(groupIds, slot, id, beforeId) {
  const combined = [...groupIds];
  combined.splice(clampClosedSlot(slot, groupIds.length), 0, CLOSED_SECTION_ID);
  if (!combined.includes(id)) return null;
  if (beforeId !== null && (typeof beforeId !== 'string' || !combined.includes(beforeId))) return null;
  if (beforeId !== id) {
    combined.splice(combined.indexOf(id), 1);
    const at = beforeId === null ? combined.length : combined.indexOf(beforeId);
    combined.splice(at, 0, id);
  }
  const nextSlot = combined.indexOf(CLOSED_SECTION_ID);
  return { order: combined.filter((entry) => entry !== CLOSED_SECTION_ID), slot: nextSlot };
}

module.exports = { CLOSED_SECTION_ID, clampClosedSlot, reconcileClosedSlot, reorderGroupsWithClosed };
