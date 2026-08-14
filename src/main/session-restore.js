// Pure restore-time filter (design §6 of 2026-07-22-utility-sheet-design):
// session.json holds parallel arrays (urls / groupIds / pinned / meta) plus
// activeIndex, so dropping entries must be zipped or the metadata silently
// misaligns onto the wrong tabs.

/**
 * @param {{urls?: string[], groupIds?: (string|null)[], pinned?: boolean[],
 *          meta?: {title: string, favicon: string|null}[], activeIndex?: number}} saved
 * @param {(url: string) => boolean} shouldDrop
 */
// Files written before the meta column (≤1.1.1), and rollbacks that dropped
// it, carry no saved title — and restored tabs are born quiet, so nothing
// repaints the label until first wake. A real site's host ("blancbrowser.com",
// www-stripped like the panel's own url labels) keeps rows distinguishable;
// non-web urls (blanc://newtab) stay blank and render as "New Tab". Favicons
// are never fabricated here.
function hostTitle(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function filterRestoredSession({ urls = [], groupIds = [], pinned = [], meta = [], activeIndex = 0 } = {}, shouldDrop) {
  const survivors = [];
  for (const [i, url] of urls.entries()) {
    if (shouldDrop(url)) continue;
    // Quiet Tabs (spec §10.1). A missing or blank saved title falls back to
    // the host, never to a label belonging to a different tab.
    const saved = meta[i] ?? { title: '', favicon: null };
    survivors.push({
      url,
      groupId: groupIds[i] ?? null,
      pinned: !!pinned[i],
      meta: saved.title ? saved : { ...saved, title: hostTitle(url) },
      originalIndex: i,
    });
  }
  const clamped = Math.min(Math.max(0, activeIndex), Math.max(0, urls.length - 1));
  // The survivor at the original index, else the next surviving neighbor
  // (first after, falling back to last before), else 0.
  let next = survivors.findIndex((s) => s.originalIndex >= clamped);
  if (next === -1) next = survivors.length - 1;
  if (next === -1) next = 0;
  return {
    urls: survivors.map((s) => s.url),
    groupIds: survivors.map((s) => s.groupId),
    pinned: survivors.map((s) => s.pinned),
    meta: survivors.map((s) => s.meta),
    activeIndex: next,
  };
}

/** The tab to activate after a restore. createTab returns null for a url it
 * refuses (utility pages — filtered above, but the guard is structural), so
 * the saved index can land on a hole. Walk forward, then back, exactly like
 * the survivor rule above. Null means nothing usable was created. */
function restoreTargetId(restoredIds, activeIndex) {
  const ids = Array.isArray(restoredIds) ? restoredIds : [];
  if (!ids.length) return null;
  const start = Math.min(
    Math.max(0, Number.isInteger(activeIndex) ? activeIndex : 0),
    ids.length - 1
  );
  for (let i = start; i < ids.length; i += 1) if (ids[i]) return ids[i];
  for (let i = start - 1; i >= 0; i -= 1) if (ids[i]) return ids[i];
  return null;
}

module.exports = { filterRestoredSession, restoreTargetId };
