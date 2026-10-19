// Migration boundary: a Chromium snapshot becomes Electron's saved columns.
// Persistence, switching and ownership remain native work, not renderer storage.
export function captureSpace(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tabs) || snapshot.tabs.some(t => t.private)) return null;
  const accepted = [], omitted = [];
  for (const tab of snapshot.tabs) {
    let url;
    try { url = new URL(tab.url); } catch { omitted.push({ id: tab.id, reason: 'invalid-url' }); continue; }
    if (!['http:', 'https:'].includes(url.protocol) && url.href !== 'blanc://newtab/') {
      omitted.push({ id: tab.id, reason: 'unsupported-scheme' }); continue;
    }
    accepted.push(tab);
  }
  const used = new Set(accepted.map(t => t.groupId).filter(Boolean));
  const groups = (snapshot.groups || []).filter(g => used.has(g.id)).map(g => ({
    id: g.id, name: g.name, color: g.color, collapsed: g.collapsed === true,
  }));
  const validGroups = new Set(groups.map(g => g.id));
  return {
    urls: accepted.map(t => t.url),
    pinned: accepted.map(t => t.pinned === true),
    groupIds: accepted.map(t => validGroups.has(t.groupId) ? t.groupId : null),
    groups,
    meta: accepted.map(t => ({ title: String(t.title || ''), favicon: null })),
    activeIndex: Math.max(0, accepted.findIndex(t => t.id === snapshot.activeTabId)),
    omitted,
    // Refuse switching/saving a partial capture until its UX is defined.
    complete: omitted.length === 0 && accepted.length > 0,
  };
}
