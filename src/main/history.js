const { JsonStore } = require('./store');

// Newest entries first. Capped so the JSON file can't grow unbounded.
const MAX_ENTRIES = 5000;

let store = null;
const ensureStore = () => (store ??= new JsonStore('history', { entries: [] }));

const isRecordable = (url) => /^https?:\/\//.test(url);

/** Record a visit; consecutive reloads of the same URL update the existing entry. */
function addVisit(url, title) {
  if (!isRecordable(url)) return;
  ensureStore().update((d) => {
    const last = d.entries[0];
    if (last && last.url === url) {
      last.visitedAt = Date.now();
      if (title) last.title = title;
      return;
    }
    d.entries.unshift({ url, title: title || url, visitedAt: Date.now() });
    if (d.entries.length > MAX_ENTRIES) d.entries.length = MAX_ENTRIES;
  });
}

/** Pages report their real <title> after the navigation is recorded. */
function updateTitle(url, title) {
  if (!title) return;
  ensureStore().update((d) => {
    const entry = d.entries.find((e) => e.url === url);
    if (entry) entry.title = title;
  });
}

function listHistory({ query = '', limit = 500 } = {}) {
  const q = query.trim().toLowerCase();
  const entries = ensureStore().data.entries;
  const filtered = q
    ? entries.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : entries;
  return filtered.slice(0, limit);
}

function removeVisit(url, visitedAt) {
  ensureStore().update((d) => {
    d.entries = d.entries.filter((e) => !(e.url === url && e.visitedAt === visitedAt));
  });
}

function clearHistory() {
  ensureStore().update((d) => { d.entries = []; });
}

module.exports = { addVisit, updateTitle, listHistory, removeVisit, clearHistory };
