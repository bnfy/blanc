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

function buildGroupSubmenu(tab, groups, t) {
  const sub = [];
  for (const g of groups) {
    sub.push({ id: 'group-move', label: g.name, type: 'radio', checked: tab.groupId === g.id, groupId: g.id });
  }
  if (groups.length) sub.push({ type: 'separator' });
  if (tab.groupId != null) sub.push({ id: 'group-none', label: t('tabMenu.removeFromGroup') });
  sub.push({ id: 'group-new', label: t('tabMenu.newGroup') });
  return sub;
}

// Native menus grow to their widest row, so long page titles are cut.
const SPLIT_TITLE_MAX = 48;
const shortTitle = (title) => {
  const chars = [...String(title)];
  return chars.length > SPLIT_TITLE_MAX ? `${chars.slice(0, SPLIT_TITLE_MAX - 1).join('').trimEnd()}…` : chars.join('');
};

// Split with ▸ (F53): tabs in the right-clicked tab's own group (or its
// fellow ungrouped tabs) come first; every other group, and Ungrouped, is a
// nested submenu whose header says once how the group rule moves the pick.
// Group names are user data, so their ids mark them (the pseudo-locale sweep).
function buildSplitSubmenu(tab, groups, candidates, t) {
  const own = tab.groupId ?? null;
  const ownGroup = groups.find((g) => g.id === own);
  const tabItem = (c) => ({ id: 'split-with-tab', label: shortTitle(c.title), tabId: c.id });
  const sub = [];
  const mine = candidates.filter((c) => (c.groupId ?? null) === own);
  if (mine.length) {
    if (ownGroup) sub.push({ id: 'split-with-header', type: 'header', label: ownGroup.name });
    sub.push(...mine.map(tabItem));
  }
  const others = [];
  for (const g of groups) {
    if (g.id === own) continue;
    const members = candidates.filter((c) => c.groupId === g.id);
    if (!members.length) continue;
    const note = ownGroup ? t('split.menuMovesInto', { group: ownGroup.name }) : t('split.menuMovesOutOf', { group: g.name });
    others.push({ id: 'split-with-group', label: g.name, submenu: [{ type: 'header', label: note }, ...members.map(tabItem)] });
  }
  const loose = own == null ? [] : candidates.filter((c) => c.groupId == null);
  if (loose.length) {
    others.push({
      id: 'split-with-ungrouped',
      label: t('tabMenu.splitUngrouped'),
      submenu: [{ type: 'header', label: t('split.menuMovesInto', { group: ownGroup?.name ?? '' }) }, ...loose.map(tabItem)],
    });
  }
  if (sub.length && others.length) sub.push({ type: 'separator' });
  sub.push(...others);
  return sub;
}

function buildTabContextMenu({ tab, groups = [], activeTabId, glanceTabId = null, surface, canCloseOthers, canMoveToNewWindow, canQuiet, canCloseAbove = false, canCloseBelow = false, siteMuted = null, splitCandidates = [], t }) {
  const isActive = tab.id === activeTabId;
  const items = [];

  items.push({ id: 'copy-link', label: t('tabMenu.copyLink'), enabled: isCopyable(tab) });
  // Hidden (not disabled) when cleaning changes nothing: cleanLink returns
  // tracker-free http(s) URLs unchanged and non-http(s) input as null, and a
  // "Copy Clean Link" identical to "Copy Link" is noise (design §4). The
  // cleaned URL rides the descriptor so the click copies exactly what this
  // visibility check evaluated — never a recomputed value.
  const cleaned = cleanLink(tab.url);
  if (cleaned !== null && cleaned !== tab.url) {
    items.push({ id: 'copy-clean-link', label: t('menu.copyCleanLink'), cleanedUrl: cleaned });
  }
  items.push({ type: 'separator' });

  items.push({ id: 'reload', label: t('menu.reload'), accelerator: ACCEL.reload });
  items.push({ id: 'duplicate', label: t('tabMenu.duplicate') });
  items.push({ id: 'rename', label: t('tabMenu.rename') });
  // Only a renamed tab has a page title to go back to (F46).
  if (tab.customTitle) items.push({ id: 'reset-title', label: t('tabMenu.resetTitle') });
  items.push({ type: 'separator' });

  items.push({ id: 'toggle-pin', label: t(tab.pinned ? 'tabMenu.unpin' : 'tabMenu.pin') });
  if (tab.pinned) {
    items.push({
      id: 'return-pinned-home',
      label: t('tabMenu.returnPinnedHome'),
      enabled: !!tab.pinnedHome?.canReturn,
    });
    items.push({
      id: 'set-pinned-home',
      label: t('tabMenu.setPinnedHome'),
      enabled: !!tab.pinnedHome?.canSet,
    });
  }
  items.push({ id: 'toggle-mute', label: t(tab.muted ? 'tabMenu.unmute' : 'tabMenu.mute') });
  // Mute Site: until Blanc quits, by exact host; only web pages have a site
  // (siteMuted is null otherwise). Tab menu additions spec §4.
  if (typeof siteMuted === 'boolean') {
    items.push({ id: 'toggle-site-mute', label: t(siteMuted ? 'tabMenu.unmuteSite' : 'tabMenu.muteSite') });
  }
  items.push({
    id: 'toggle-favorite',
    label: t(tab.bookmarked ? 'tabMenu.removeFavorite' : 'tabMenu.saveFavorite'),
    enabled: isFavoritable(tab),
  });
  items.push({ id: 'group', label: t('tabMenu.moveToGroup'), submenu: buildGroupSubmenu(tab, groups, t) });
  // Split View (F53): a split tab can leave or close its split; any other tab
  // can make one with an eligible tab (main passes the candidates with their
  // groups; buildSplitSubmenu sorts them). Pinned tabs never join.
  if (tab.splitId) {
    items.push({ id: 'remove-from-split', label: t('tabMenu.removeFromSplit') });
    items.push({ id: 'close-split', label: t('tabMenu.closeSplit') });
  } else if (tab.pinned) {
    items.push({ id: 'split-with', label: t('tabMenu.splitWith'), submenu: [{ label: t('tabMenu.splitPinnedRefused'), enabled: false }] });
  } else if (!splitCandidates.length) {
    items.push({ id: 'split-with', label: t('tabMenu.splitWith'), enabled: false });
  } else {
    items.push({ id: 'split-with', label: t('tabMenu.splitWith'), submenu: buildSplitSubmenu(tab, groups, splitCandidates, t) });
  }
  items.push({ type: 'separator' });

  if (surface === 'row' && !isActive) {
    // The current reference (its ⌘L row, or the Glance header) closes Glance.
    items.push(tab.id === glanceTabId
      ? { id: 'close-glance', label: t('menu.closeGlance') }
      : { id: 'glance', label: t('tabMenu.glance') });
    // canQuiet is main's explicit-quiet predicate (the sweep's full policy
    // minus the idle threshold) — the same check the action runs, so this
    // item can never render enabled for a tab the action would refuse.
    items.push({ id: 'quiet', label: t('tabMenu.quiet'), enabled: !!canQuiet });
    items.push({ type: 'separator' });
  }

  items.push({ id: 'new-tab-below', label: t('tabMenu.newTabBelow') });
  items.push({ id: 'new-tab', label: t('menu.newTab'), accelerator: ACCEL.newTab });
  items.push({ id: 'new-private-tab', label: t('menu.newPrivateTab'), accelerator: ACCEL.newPrivateTab });
  items.push({ type: 'separator' });

  items.push({ id: 'close-others', label: t('tabMenu.closeOthers'), enabled: !!canCloseOthers });
  items.push({ id: 'close-above', label: t('tabMenu.closeAbove'), enabled: !!canCloseAbove });
  items.push({ id: 'close-below', label: t('tabMenu.closeBelow'), enabled: !!canCloseBelow });
  items.push({ id: 'move-new-window', label: t('tabMenu.moveToNewWindow'), enabled: !!canMoveToNewWindow });
  items.push({ type: 'separator' });

  items.push({ id: 'reopen-closed', label: t('menu.reopenClosedTab'), accelerator: ACCEL.reopen });
  items.push({ id: 'close', label: t('menu.closeTab'), accelerator: ACCEL.close });

  return items;
}

function closableTabIds({ tabOrder, tabsById, keepId }) {
  return tabOrder.filter((id) => id !== keepId && tabsById.get(id) && !tabsById.get(id).pinned);
}

/** Close Tabs Above / Below: the unpinned tabs before or after `keepId` in
 * the window's (display) order. */
function closableBeside({ tabOrder, tabsById, keepId, direction }) {
  const at = tabOrder.indexOf(keepId);
  if (at === -1) return [];
  const side = direction === 'above' ? tabOrder.slice(0, at) : tabOrder.slice(at + 1);
  return side.filter((id) => tabsById.get(id) && !tabsById.get(id).pinned);
}

/** When a tab leaves a window, which of the remaining tabs should the source
 * window select? The neighbour after it, else the one before. null if it was
 * the only tab (the caller disables Move-to-New-Window in that case). */
function pickSurvivorTabId(tabOrder, movedId) {
  const i = tabOrder.indexOf(movedId);
  if (i === -1 || tabOrder.length <= 1) return null;
  return tabOrder[i + 1] ?? tabOrder[i - 1] ?? null;
}

module.exports = { buildTabContextMenu, closableTabIds, closableBeside, pickSurvivorTabId };
