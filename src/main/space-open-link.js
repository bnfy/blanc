'use strict';

const { classifyExternalNavigation } = require('./external-protocols');
const { isForbiddenTopLevelUrl } = require('./top-level-url-policy');
const { appendTabToCapture } = require('./space-move');

// Inspecting a menu must never invoke the OS handoff. Only ordinary web
// links can be deferred: utility pages, extension pages and local grants
// cannot safely be reconstructed in another space.
function canOpenLinkInSpace(opener, url) {
  if (!opener || opener.private || typeof url !== 'string'
    || classifyExternalNavigation(url).action !== 'none' || isForbiddenTopLevelUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !!parsed.hostname;
  } catch { return false; }
}
function linkTitle(url, text) {
  return (typeof text === 'string' && text.trim() ? text.trim() : url).slice(0, 200);
}

/** The only eager destination is a space displayed in another window.
 * Deferred destinations are committed before a quiet in-memory tab exists.
 * A failed materialization is explicitly a failed open; rollback may leave
 * the saved link on disk, but never removes any pre-existing tab. */
function openLinkInSpace(opener, url, workspaceId, deps) {
  if (!canOpenLinkInSpace(opener, url)) return { ok: false, error: 'not-found' };
  const checked = deps.check(workspaceId);
  if (!checked.ok) return checked;
  const title = linkTitle(url, deps.title);
  if (checked.visible) {
    try { if (!deps.create(url, title, false)) throw new Error('tab refused'); }
    catch {
      try { deps.rollback(); } catch { /* report failure even if cleanup failed */ }
      return { ok: false, error: 'activation-failed' };
    }
    return { ok: true };
  }
  let base;
  try { base = deps.capture(); } catch { return { ok: false, error: 'activation-failed' }; }
  const next = appendTabToCapture(base, { url, pinned: false, meta: { title, favicon: null }, inheritsDocumentPolicy: false });
  let written;
  try { written = deps.write(next); } catch { written = { ok: false, error: 'storage-failed' }; }
  if (!written?.ok) return written || { ok: false, error: 'storage-failed' };
  if (checked.resident) {
    try { if (!deps.create(url, title, true)) throw new Error('quiet tab refused'); }
    catch {
      // Cleanup before writing the old capture. If cleanup itself fails,
      // keep the write-ahead record rather than erasing a possible live tab.
      try { deps.rollback(); deps.write(base); } catch { /* retain the saved copy */ }
      return { ok: false, error: 'activation-failed' };
    }
  }
  return { ok: true };
}
module.exports = { canOpenLinkInSpace, linkTitle, openLinkInSpace };
