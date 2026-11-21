// Pure rule for #1505: which open New Tab page a plain new-tab request
// (⌘T, ⌘⇧N, the Island's New Tab buttons, /new, /private) may switch to
// instead of opening another. No electron import — this file must stay
// requireable from `node --test` (precedent: tab-sleep.js, tab-archive.js).
//
// A tab is reusable when it is the window's own New Tab page, unused (no
// history in either direction and not on its way somewhere else), of the
// requested kind (private or not), and a plain tab: never pinned, grouped, in
// a split, the Glance tab, or a page-opened tab kept in the restricted state.
// Owner decisions, November 15, 2026.

const NEW_TAB_URL = 'blanc://newtab/';
// The query flag tells the newtab page to show private copy + theme.
const PRIVATE_NEW_TAB_URL = 'blanc://newtab/?private=1';

/**
 * The id of the tab to switch to, or null to open a new one.
 *
 * @param {object} p
 * @param {string[]} p.tabOrder     the window's tabs, in order
 * @param {Map<string, object>} p.tabs
 * @param {string|null} p.activeTabId
 * @param {string|null} p.glanceTabId
 * @param {boolean} p.private       the kind of tab being asked for
 * @param {(tab: object) => boolean} p.isUsed  the caller's live check:
 *        history, or a navigation away from the page under way
 */
function findReusableNewTab({ tabOrder, tabs, activeTabId = null, glanceTabId = null, private: isPrivate = false, isUsed }) {
  const url = isPrivate ? PRIVATE_NEW_TAB_URL : NEW_TAB_URL;
  let best = null;
  for (const id of tabOrder) {
    const tab = tabs.get(id);
    if (!tab || tab.url !== url || !!tab.private !== isPrivate) continue;
    if (tab.pinned || tab.groupId || tab.splitId || id === glanceTabId) continue;
    if (tab.inert || tab.inheritsDocumentPolicy || tab.sleeping) continue;
    if (isUsed(tab)) continue;
    if (id === activeTabId) return id;
    // Most recently active wins; on a tie, the later tab in the window.
    const at = tab.lastActiveAt ?? -Infinity;
    if (!best || at >= best.at) best = { id, at };
  }
  return best ? best.id : null;
}

module.exports = { findReusableNewTab, NEW_TAB_URL, PRIVATE_NEW_TAB_URL };
