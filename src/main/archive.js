// The Tab Archive store (F52): one per local profile, like history.json.
// Entries come only from tab-archive.js's buildArchiveEntry allow-list, so no
// snapshot, page state, back stack or opener can reach this file. Never synced;
// cleared with history. See docs/superpowers/specs/2026-10-19-tab-archive-design.md.

const { JsonStore } = require('./store');
const { expireArchive, projectArchive, searchArchive } = require('./tab-archive');

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'archive', { version: 1, entries: [] }, { scope: 'profile' }
));

const entriesOf = (d) => (Array.isArray(d.entries) ? d.entries : []);

/** Prepend newly archived entries, then expire and cap. */
function addEntries(entries, now) {
  const fresh = (entries ?? []).filter(Boolean);
  if (!fresh.length) return;
  ensureStore().update((d) => {
    d.version = 1;
    d.entries = expireArchive([...fresh, ...entriesOf(d)], { now });
  });
}

/** What a renderer may see, newest first, optionally searched. */
function listArchive({ query = '', now } = {}) {
  const live = expireArchive(entriesOf(ensureStore().data), { now });
  return projectArchive(searchArchive(live, query));
}

/** Remove and return one entry; null when it is already gone, so a second
 *  restore of the same id opens nothing. */
function takeEntry(id) {
  if (typeof id !== 'string') return null;
  let taken = null;
  ensureStore().update((d) => {
    const list = entriesOf(d);
    const index = list.findIndex((e) => e?.id === id);
    if (index === -1) return;
    [taken] = list.splice(index, 1);
    d.entries = list;
  });
  return taken ? structuredClone(taken) : null;
}

function forgetEntry(id) {
  return takeEntry(id) !== null;
}

function clearArchive() {
  ensureStore().update((d) => {
    d.version = 1;
    d.entries = [];
  });
}

function flushArchive() {
  return ensureStore().flush();
}

module.exports = {
  addEntries,
  listArchive,
  takeEntry,
  forgetEntry,
  clearArchive,
  flushArchive,
};
