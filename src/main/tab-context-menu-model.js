// Pure descriptor builder for the tab context menu shared by the resting pill
// (active tab) and expanded-island tab rows (right-clicked tab). No electron
// require — this is the unit-test surface. Glue + Menu.popup live in
// tab-context-menu.js. Same split as address-menu-model.js / address-menu.js.
// (Not to be confused with main.js's tabMenuItems(), the application Tabs menu.)
//
// Items are enabled by default (Electron's own default; the translator only
// acts on `enabled: false`) — an explicit `enabled:` below always means the
// state is genuinely conditional. Separators are correct by construction:
// every section opens with an unconditional item, and the one conditional
// section (glance/quiet) carries its own trailing separator inside its guard.
// The model unit test asserts the no-leading/trailing/doubled invariant.

const { cleanLink } = require('./clean-link');

const ACCEL = {
  reload: 'CmdOrCtrl+R',
  newTab: 'CmdOrCtrl+T',
  newPrivateTab: 'CmdOrCtrl+Shift+N',
  reopen: 'CmdOrCtrl+Shift+T',
  close: 'CmdOrCtrl+W',
};

const isFavoritable = (tab) => !tab.private && /^https?:\/\//.test(tab.url || '');
const isCopyable = (tab) => /^(https?|file):\/\//.test(tab.url || '');

function buildGroupSubmenu(tab, groups) {
  const sub = [];
  for (const g of groups) {
    sub.push({ id: 'group-move', label: g.name, type: 'radio', checked: tab.groupId === g.id, groupId: g.id });
  }
  if (groups.length) sub.push({ type: 'separator' });
  if (tab.groupId != null) sub.push({ id: 'group-none', label: 'Remove from Group' });
  sub.push({ id: 'group-new', label: 'New Group…' });
  return sub;
}

function buildTabContextMenu({ tab, groups = [], activeTabId, surface, canCloseOthers, canMoveToNewWindow, canQuiet }) {
  const isActive = tab.id === activeTabId;
  const items = [];

  items.push({ id: 'copy-link', label: 'Copy Link', enabled: isCopyable(tab) });
  // Hidden (not disabled) when cleaning changes nothing: cleanLink returns
  // tracker-free http(s) URLs unchanged and non-http(s) input as null, and a
  // "Copy Clean Link" identical to "Copy Link" is noise (design §4). The
  // cleaned URL rides the descriptor so the click copies exactly what this
  // visibility check evaluated — never a recomputed value.
  const cleaned = cleanLink(tab.url);
  if (cleaned !== null && cleaned !== tab.url) {
    items.push({ id: 'copy-clean-link', label: 'Copy Clean Link', cleanedUrl: cleaned });
  }
  items.push({ type: 'separator' });

  items.push({ id: 'reload', label: 'Reload', accelerator: ACCEL.reload });
  items.push({ id: 'duplicate', label: 'Duplicate Tab' });
  items.push({ type: 'separator' });

  items.push({ id: 'toggle-pin', label: tab.pinned ? 'Unpin Tab' : 'Pin Tab' });
  items.push({ id: 'toggle-mute', label: tab.muted ? 'Unmute Tab' : 'Mute Tab' });
  items.push({
    id: 'toggle-favorite',
    label: tab.bookmarked ? 'Remove from Favorites' : 'Save to Favorites',
    enabled: isFavoritable(tab),
  });
  items.push({ id: 'group', label: 'Move to Group', submenu: buildGroupSubmenu(tab, groups) });
  items.push({ type: 'separator' });

  if (surface === 'row' && !isActive) {
    items.push({ id: 'glance', label: 'Open in Glance' });
    // canQuiet is main's explicit-quiet predicate (the sweep's full policy
    // minus the idle threshold) — the same check the action runs, so this
    // item can never render enabled for a tab the action would refuse.
    items.push({ id: 'quiet', label: 'Quiet This Tab Now', enabled: !!canQuiet });
    items.push({ type: 'separator' });
  }

  items.push({ id: 'new-tab', label: 'New Tab', accelerator: ACCEL.newTab });
  items.push({ id: 'new-private-tab', label: 'New Private Tab', accelerator: ACCEL.newPrivateTab });
  items.push({ type: 'separator' });

  items.push({ id: 'close-others', label: 'Close Other Tabs', enabled: !!canCloseOthers });
  items.push({ id: 'move-new-window', label: 'Move Tab to New Window', enabled: !!canMoveToNewWindow });
  items.push({ type: 'separator' });

  items.push({ id: 'reopen-closed', label: 'Reopen Closed Tab', accelerator: ACCEL.reopen });
  items.push({ id: 'close', label: 'Close Tab', accelerator: ACCEL.close });

  return items;
}

function closableTabIds({ tabOrder, tabsById, keepId }) {
  return tabOrder.filter((id) => id !== keepId && tabsById.get(id) && !tabsById.get(id).pinned);
}

/** When a tab leaves a window, which of the remaining tabs should the source
 * window select? The neighbour after it, else the one before. null if it was
 * the only tab (the caller disables Move-to-New-Window in that case). */
function pickSurvivorTabId(tabOrder, movedId) {
  const i = tabOrder.indexOf(movedId);
  if (i === -1 || tabOrder.length <= 1) return null;
  return tabOrder[i + 1] ?? tabOrder[i - 1] ?? null;
}

module.exports = { buildTabContextMenu, closableTabIds, pickSurvivorTabId };
