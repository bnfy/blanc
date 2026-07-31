// Pure recovery stack for one browser window. It deliberately stays in
// memory: session restore already handles tabs that were still open at quit,
// while closed/private activity must never become a new persistent record.

const MAX_RECENTLY_CLOSED = 25;

function addRecentlyClosed(entries, tab, { group = null, index = 0 } = {}) {
  if (!tab?.url || tab.private || tab.url.startsWith('blanc://newtab')) return entries;
  const record = {
    url: tab.url,
    pinned: !!tab.pinned,
    muted: !!tab.muted,
    index: Number.isInteger(index) && index >= 0 ? index : 0,
    group: group && typeof group.id === 'string' && typeof group.name === 'string'
      ? { id: group.id, name: group.name, collapsed: !!group.collapsed }
      : null,
  };
  return [...entries, record].slice(-MAX_RECENTLY_CLOSED);
}

function takeRecentlyClosed(entries) {
  if (!entries.length) return { record: null, entries };
  return { record: entries[entries.length - 1], entries: entries.slice(0, -1) };
}

module.exports = { MAX_RECENTLY_CLOSED, addRecentlyClosed, takeRecentlyClosed };
