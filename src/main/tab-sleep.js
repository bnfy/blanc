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
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
};
