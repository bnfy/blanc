// Pure descriptor builder for the tab context menu shared by the resting pill
// (active tab) and expanded-island tab rows (right-clicked tab). No electron
// require — this is the unit-test surface. Glue + Menu.popup live in
// tab-context-menu.js. Same split as address-menu-model.js / address-menu.js.
// (Not to be confused with main.js's tabMenuItems(), the application Tabs menu.)

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

function collapseSeparators(items) {
  const out = [];
  for (const item of items) {
    if (item.type === 'separator') {
      if (!out.length || out[out.length - 1].type === 'separator') continue;
    }
    out.push(item);
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

function buildGroupSubmenu(tab, groups) {
  const sub = [];
  for (const g of groups) {
    sub.push({ id: 'group-move', label: g.name, type: 'radio', checked: tab.groupId === g.id, groupId: g.id });
  }
  if (groups.length) sub.push({ type: 'separator' });
  if (tab.groupId != null) sub.push({ id: 'group-none', label: 'Remove from Group', enabled: true });
  sub.push({ id: 'group-new', label: 'New Group…', enabled: true });
  return collapseSeparators(sub);
}

function buildTabContextMenu({ tab, groups = [], activeTabId, surface, canCloseOthers, canMoveToNewWindow }) {
  const isActive = tab.id === activeTabId;
  const items = [];

  items.push({ id: 'copy-link', label: 'Copy Link', enabled: isCopyable(tab) });
  // Hidden (not disabled) when cleaning changes nothing: cleanLink returns
  // tracker-free http(s) URLs unchanged and non-http(s) input as null, and a
  // "Copy Clean Link" identical to "Copy Link" is noise (design §4).
  const cleaned = cleanLink(tab.url);
  if (cleaned !== null && cleaned !== tab.url) {
    items.push({ id: 'copy-clean-link', label: 'Copy Clean Link', enabled: true });
  }
  items.push({ type: 'separator' });

  items.push({ id: 'reload', label: 'Reload', accelerator: ACCEL.reload, enabled: true });
  items.push({ id: 'duplicate', label: 'Duplicate Tab', enabled: true });
  items.push({ type: 'separator' });

  items.push({ id: 'toggle-pin', label: tab.pinned ? 'Unpin Tab' : 'Pin Tab', enabled: true });
  items.push({ id: 'toggle-mute', label: tab.muted ? 'Unmute Tab' : 'Mute Tab', enabled: true });
  items.push({
    id: 'toggle-favorite',
    label: tab.bookmarked ? 'Remove from Favorites' : 'Save to Favorites',
    enabled: isFavoritable(tab),
  });
  items.push({ id: 'group', label: 'Move to Group', submenu: buildGroupSubmenu(tab, groups) });
  items.push({ type: 'separator' });

  if (surface === 'row' && !isActive) {
    items.push({ id: 'glance', label: 'Open in Glance', enabled: true });
    items.push({ id: 'quiet', label: 'Quiet This Tab Now', enabled: !tab.capturing && !tab.asleep });
    items.push({ type: 'separator' });
  }

  items.push({ id: 'new-tab', label: 'New Tab', accelerator: ACCEL.newTab, enabled: true });
  items.push({ id: 'new-private-tab', label: 'New Private Tab', accelerator: ACCEL.newPrivateTab, enabled: true });
  items.push({ type: 'separator' });

  items.push({ id: 'close-others', label: 'Close Other Tabs', enabled: !!canCloseOthers });
  items.push({ id: 'move-new-window', label: 'Move Tab to New Window', enabled: !!canMoveToNewWindow });
  items.push({ type: 'separator' });

  items.push({ id: 'reopen-closed', label: 'Reopen Closed Tab', accelerator: ACCEL.reopen, enabled: true });
  items.push({ id: 'close', label: 'Close Tab', accelerator: ACCEL.close, enabled: true });

  return collapseSeparators(items);
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

module.exports = { buildTabContextMenu, buildGroupSubmenu, closableTabIds, pickSurvivorTabId };
