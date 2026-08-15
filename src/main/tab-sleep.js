// Pure Quiet Tabs policy: which tabs may lose their renderer, and what of a
// tab's navigation history is worth retaining while it has none. No electron
// import — this file must stay requireable from `node --test` (precedent:
// session-snapshot.js, tabsync-model.js). The clock is injected, never read.
// See docs/superpowers/specs/2026-08-09-quiet-tabs-design.md §4.2, §6.

/** Delay-setting id -> idle threshold in ms. `off` => null (never auto-quiet).
 *  This is the ONLY setting-id -> milliseconds mapping in the app; settings.js
 *  owns the enum of ids and nothing else. */
const TAB_SLEEP_DELAY_MS = {
  off: null,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
};

/** Hard ceiling on retained snapshots. Refuse the 51st; never evict — eviction
 *  would silently downgrade an already-quiet tab's recovery data with no
 *  signal to the user (spec §6). */
const MAX_SLEEP_SNAPSHOTS = 50;

/** Ceiling on a retained entry's pageState, in UTF-8 BYTES (spec §6). */
const MAX_PAGE_STATE_BYTES = 512 * 1024;

const NO_IDS = new Set();
const NO_COUNTS = new Map();

/**
 * Return the tabs eligible to have their renderer released, longest-idle
 * first. This only reads durable tab-record fields; it never touches a
 * WebContents, which may already be gone.
 *
 * @param {Array<object>} tabList
 * @param {object} [options]
 * @returns {string[]}
 */
function sleepCandidates(tabList, options) {
  const {
    now,
    thresholdMs,
    activeTabId = null,
    ignoreThreshold = false,
    snapshotCount = 0,
    maxSnapshots = MAX_SLEEP_SNAPSHOTS,
    permissionPendingTabIds = NO_IDS,
    popupChildCounts = NO_COUNTS,
    visibleTabIds = NO_IDS,
  } = options ?? {};

  if (thresholdMs === null && ignoreThreshold !== true) return [];
  if (!Array.isArray(tabList) || tabList.length === 0) return [];

  const room = maxSnapshots - snapshotCount;
  // The cap refuses new snapshots rather than evicting recovery data from an
  // existing quiet tab.
  if (room <= 0) return [];

  const liveIds = new Set();
  const liveOpenerIds = new Set();
  for (const tab of tabList) {
    if (!tab?.id) continue;
    liveIds.add(tab.id);
    if (tab.openerTabId) liveOpenerIds.add(tab.openerTabId);
  }

  const survivors = [];
  tabList.forEach((tab, index) => {
    if (!tab?.id || tab.id === activeTabId) return;
    if (visibleTabIds.has(tab.id)) return;
    if (tab.asleep || tab.sleeping || tab.waking || tab.isLoading) return;
    if (tab.audible || tab.muted || tab.usedMedia || tab.capturing || tab.pinned) return;
    if (tab.adopted || tab.restorableCommit !== true || tab.deepScrolled) return;
    if (permissionPendingTabIds.has(tab.id)) return;
    if ((popupChildCounts.get(tab.id) ?? 0) !== 0) return;
    // Keep opener families together while both sides still exist. A stale
    // opener id is harmless and must not strand this tab permanently.
    if (tab.openerTabId && liveIds.has(tab.openerTabId)) return;
    if (liveOpenerIds.has(tab.id)) return;
    if (!(tab.httpEntryCount >= 1)) return;

    if (ignoreThreshold !== true) {
      if (!Number.isFinite(tab.lastActiveAt)) return;
      if (!(now - tab.lastActiveAt >= thresholdMs)) return;
    }

    survivors.push({
      id: tab.id,
      index,
      lastActiveAt: Number.isFinite(tab.lastActiveAt) ? tab.lastActiveAt : Infinity,
    });
  });

  survivors.sort((a, b) => (
    a.lastActiveAt !== b.lastActiveAt
      ? a.lastActiveAt - b.lastActiveAt
      : a.index - b.index
  ));
  return survivors.slice(0, room).map(({ id }) => id);
}

/**
 * Shape a navigationHistory snapshot for retention.
 *
 * @param {Array<{url:string,title:string,pageState?:string}>} entries getAllEntries() result
 * @param {number} index navigationHistory.getActiveIndex()
 * @param {object} [options]
 * @param {boolean} [options.private=false] private tab => NO pageState on any entry
 * @param {number} [options.maxPageStateBytes=MAX_PAGE_STATE_BYTES]
 * @returns {{entries: Array<{url:string,title:string,pageState?:string}>,
 *            index: number, droppedPageState: boolean} | null}
 */
function trimSnapshot(entries, index, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const { private: isPrivate = false, maxPageStateBytes = MAX_PAGE_STATE_BYTES } = options;
  const activeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(entries.length - 1, index))
    : 0;
  let droppedPageState = false;
  const out = entries.map((entry, i) => {
    const url = entry?.url ?? '';
    const title = entry?.title ?? '';
    // Back entries carry the verbatim POST body of past submissions and stale
    // form values; only the active entry may keep page state at all.
    if (i !== activeIndex) return { url, title };
    const pageState = entry?.pageState;
    if (typeof pageState !== 'string' || pageState === '') return { url, title };
    // Buffer.byteLength on the base64 string — String.length differs, and the
    // ceiling exists to bound real heap.
    if (isPrivate || Buffer.byteLength(pageState, 'utf8') > maxPageStateBytes) {
      droppedPageState = true;
      return { url, title };
    }
    return { url, title, pageState };
  });
  return { entries: out, index: activeIndex, droppedPageState };
}

module.exports = {
  sleepCandidates,
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
};
