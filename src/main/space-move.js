'use strict';

// Move to Space ▸ (#1060): the order a one-tab move runs in, and the record
// the target space holds after it. No electron: main.js supplies the adapter,
// unit tests supply failing ones. Spec:
// docs/superpowers/specs/2026-10-24-move-to-space-follow-ups-design.md §3.
//
// The space's record is written FIRST, already holding the tab, and its
// result is checked. Only then does the tab leave its window. A failed write
// therefore moves nothing. If the live transfer throws, the tab is put where
// it can be found (its window, or the space it reached) and the record is
// rewritten from what the space really holds. If that rewrite fails too, the
// record still lists the tab, so it can be duplicated but never lost.

/**
 * adapter: {
 *   check()      → { ok } | { ok: false, error }     nothing changed yet
 *   prepare()    → { ok, next } | { ok: false, error } may set a space aside in memory
 *   discard()    undo prepare (dispose a space it set aside)
 *   write(next)  → { ok } | { ok: false, error }     synchronous, durable
 *   transfer()   the live move; throws on failure
 *   reconcile()  → boolean: after a throw, leave the tab whole in one place;
 *                 true when that place is the space
 *   rewrite()    → { ok } | { ok: false, error }     record from the live space
 *   finish()     broadcasts and housekeeping after a clean transfer
 * }
 * Resolves to { ok: true } only when the write and the transfer both succeed.
 */
function runSpaceMove(adapter) {
  const checked = adapter.check();
  if (!checked?.ok) return { ok: false, error: checked?.error || 'refused', moved: false };
  let prepared;
  try { prepared = adapter.prepare(); } catch { prepared = { ok: false, error: 'prepare-failed' }; }
  if (!prepared?.ok) {
    adapter.discard();
    return { ok: false, error: prepared?.error || 'prepare-failed', moved: false };
  }
  let written;
  try { written = adapter.write(prepared.next); } catch { written = { ok: false, error: 'storage-failed' }; }
  if (!written?.ok) {
    adapter.discard();
    return { ok: false, error: written?.error || 'storage-failed', moved: false };
  }
  try {
    adapter.transfer();
  } catch {
    let moved = false;
    try { moved = adapter.reconcile() === true; } catch { /* reported below as not recorded */ }
    let rewritten;
    try { rewritten = adapter.rewrite(); } catch { rewritten = { ok: false }; }
    // recorded: the space's record matches where the tab is. When false, the
    // record still lists the tab (the first write), so it may be duplicated.
    return { ok: false, error: 'move-failed', moved, recorded: rewritten?.ok === true };
  }
  try { adapter.finish(); } catch { /* the move itself is done and saved */ }
  return { ok: true };
}

/** `capture` (a workspaceCapture shape) with one more tab at the end,
 * ungrouped and in no split. `entry`: { url, pinned, meta, localFile,
 * inheritsDocumentPolicy }. Every parallel column stays the length of urls. */
function appendTabToCapture(capture, entry) {
  const urls = [...(capture.urls ?? [])];
  const n = urls.length;
  const next = {
    ...capture,
    urls: [...urls, entry.url],
    groupIds: [...(capture.groupIds ?? []), null],
    pinned: [...(capture.pinned ?? []), !!entry.pinned],
    meta: [...(capture.meta ?? []), entry.meta],
  };
  if (Array.isArray(capture.localFiles) || entry.localFile === true) {
    const prior = Array.isArray(capture.localFiles) ? capture.localFiles : new Array(n).fill(false);
    next.localFiles = [...prior, entry.localFile === true];
  }
  if (Array.isArray(capture.splitIds)) next.splitIds = [...capture.splitIds, null];
  if (capture.documentPolicy !== undefined) {
    next.inheritsDocumentPolicy = [...(capture.inheritsDocumentPolicy ?? []), entry.inheritsDocumentPolicy === true];
  }
  return next;
}

/** `capture` with every tab removed: the blank start page standing in for a
 * space saved empty, about to be replaced by the moved tab. */
function emptiedCapture(capture) {
  const next = { ...capture, urls: [], groupIds: [], pinned: [], meta: [], groups: [], activeIndex: 0 };
  for (const key of ['localFiles', 'splits', 'splitIds', 'closedSlot', 'closedIndex']) delete next[key];
  if (capture.documentPolicy !== undefined) next.inheritsDocumentPolicy = [];
  return next;
}

module.exports = { runSpaceMove, appendTabToCapture, emptiedCapture };
