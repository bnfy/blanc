# Right-click Context Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native right-click menus to the macOS Dock icon, the resting island pill, and expanded-island tab rows, and relocate tab grouping off the row into the menu.

**Architecture:** Follow Blanc's existing native-menu bridge (`context-menu.js` for pages, `address-menu.js` for the address bar): a pure, unit-tested model module builds a menu template; a thin Electron glue module pops it and runs the clicked item through an injected `actions` object (no `main.js` import → no require cycle). One shared model serves both the pill (active tab) and rows (right-clicked tab). Grouping moves into the model's "Move to Group ▸" submenu; "New Group…" hands off to the existing `/group` command input.

**Tech Stack:** Electron `Menu.buildFromTemplate` / `menu.popup`, `app.dock.setMenu`; `node --test` unit tests; plain CommonJS modules under `src/main/`.

## Global Constraints

- Pure model modules **must not** `require('electron')` — they are the unit-test surface (same rule as `address-menu-model.js`, `tab-sleep.js`).
- User-visible strings say **quiet**, never "sleep"/"asleep" (internal ids may say `asleep`).
- The user-facing favorites feature is **Favorites**; internal ids stay `bookmark*`. Menu labels say "Save to Favorites" / "Remove from Favorites".
- **Private tabs never populate Favorites** (Favorites is a synced store; private tabs are excluded from history/sync) — Save to Favorites is disabled for `tab.private`.
- New module names use the `tab-context-menu*` prefix — **not** `tab-menu*` — because `tabMenuItems()` / `test/unit/tab-menu-items.test.js` already exist for the *application* Tabs menu and must not be confused with this.
- No token/settings/slash-command *source* changes → `npm run substrate:check` is unaffected. The `/group`, `/ungroup`, `/close-group` slash commands stay.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- After any renderer/UI change, relaunch dev (`npm start`) to verify — chrome HTML/CSS only loads at window creation; a plain reload won't show it.
- Run `npm run test:unit` after model/runner tasks; it runs `node --test` over `test/unit/`.

---

### Task 1: Dock menu (macOS) + File-menu "New Window"

**Files:**
- Create: `src/main/dock-menu.js`
- Create: `test/unit/dock-menu.test.js`
- Modify: `src/main/main.js` — `openNewWindow` (add `private` seed option), install the dock menu at startup. (File → New Window already exists at `main.js:4738` — no File-menu change.)

**Interfaces:**
- Produces: `buildDockMenu()` → `Array<{id:'new-window'|'new-private-window',label:string}>`; `installDockMenu({ app, Menu, actions, platform })` where `actions = { newWindow(), newPrivateWindow() }`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/dock-menu.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDockMenu, installDockMenu } = require('../../src/main/dock-menu');

test('dock menu offers New Window and New Private Window, in order', () => {
  const items = buildDockMenu();
  assert.deepEqual(items.map((i) => i.id), ['new-window', 'new-private-window']);
  assert.deepEqual(items.map((i) => i.label), ['New Window', 'New Private Window']);
});

test('installDockMenu is a no-op off macOS', () => {
  let called = false;
  const app = { dock: { setMenu() { called = true; } } };
  installDockMenu({ app, Menu: { buildFromTemplate: () => ({}) }, actions: {}, platform: 'win32' });
  assert.equal(called, false);
});

test('installDockMenu wires each item click to its action on macOS', () => {
  const template = [];
  const Menu = { buildFromTemplate: (t) => { template.push(...t); return { __menu: true }; } };
  let set = null;
  const app = { dock: { setMenu: (m) => { set = m; } } };
  const hits = [];
  installDockMenu({
    app, Menu, platform: 'darwin',
    actions: { newWindow: () => hits.push('w'), newPrivateWindow: () => hits.push('p') },
  });
  assert.ok(set && set.__menu, 'dock.setMenu received the built menu');
  template.find((i) => i.label === 'New Window').click();
  template.find((i) => i.label === 'New Private Window').click();
  assert.deepEqual(hits, ['w', 'p']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/dock-menu.test.js`
Expected: FAIL — `Cannot find module '../../src/main/dock-menu'`.

- [ ] **Step 3: Write the module**

```js
// src/main/dock-menu.js
// macOS Dock icon right-click menu. Electron adds these ABOVE the AppKit
// defaults (window list, Options ▸, Show All Windows, Hide, Quit), which macOS
// supplies for free — so the app authors only these two lines.

function buildDockMenu() {
  return [
    { id: 'new-window', label: 'New Window' },
    { id: 'new-private-window', label: 'New Private Window' },
  ];
}

function installDockMenu({ app, Menu, actions, platform = process.platform }) {
  if (platform !== 'darwin' || !app.dock) return;
  const clicks = {
    'new-window': actions.newWindow,
    'new-private-window': actions.newPrivateWindow,
  };
  const menu = Menu.buildFromTemplate(
    buildDockMenu().map((item) => ({ label: item.label, click: () => clicks[item.id]?.() })),
  );
  app.dock.setMenu(menu);
}

module.exports = { buildDockMenu, installDockMenu };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/dock-menu.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Let `openNewWindow` seed a private first tab**

In `src/main/main.js`, `openNewWindow` (line ~5030), change the seed line so a private window is possible. Replace:

```js
    const tabId = createTab(newTabUrl());
```

with:

```js
    const tabId = options.private
      ? createTab(PRIVATE_NEW_TAB_URL, { private: true })
      : createTab(newTabUrl());
```

- [ ] **Step 6: Install the dock menu**

Add the require near the other menu requires (`src/main/main.js` ~line 73, beside `attachAddressMenu`):

```js
const { installDockMenu } = require('./dock-menu');
```

Install it once at startup — inside the `app.whenReady().then(...)` block (line ~5399), immediately after the `applyAppIcon();` call (line ~5515). Add:

```js
  installDockMenu({
    app, Menu,
    actions: {
      newWindow: () => openNewWindow(),
      newPrivateWindow: () => openNewWindow({ private: true }),
    },
  });
```

**No File-menu change needed** — correcting the spec here: File → New Window (⌘N) already exists (`main.js:4738`, bound to `openNewWindow({ profileId: runtime.profileId })`). The Dock items are the only additions. Note the deliberate difference: the File-menu item inherits the focused window's profile; the Dock actions call plain `openNewWindow()` / `openNewWindow({ private: true })`, which fall back to `focusedRuntime?.profileId ?? DEFAULT_PROFILE_ID` — correct for a Dock click, which may arrive with no window open.

- [ ] **Step 7: Verify + commit**

Run: `node --test test/unit/dock-menu.test.js` (PASS). Launch `npm start`, right-click the Dock icon → **New Window** / **New Private Window** appear and work (the private one opens a window whose first tab is private, with the private theme). File → New Window (⌘N) still works unchanged.

```bash
git add src/main/dock-menu.js test/unit/dock-menu.test.js src/main/main.js
git commit -m "feat: macOS Dock menu (New Window / New Private Window)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared menu model

**Files:**
- Create: `src/main/tab-context-menu-model.js`
- Create: `test/unit/tab-context-menu-model.test.js`

**Interfaces:**
- Consumes: `cleanLink` from `./clean-link`.
- Produces:
  - `buildTabContextMenu({ tab, groups, activeTabId, surface, canCloseOthers, canMoveToNewWindow })` → template array. Items: `{id,label,accelerator?,enabled?,type?,checked?,groupId?,submenu?}` or `{type:'separator'}`.
    - `tab` fields read: `id, url, title, pinned, muted, private, asleep, bookmarked, groupId, capturing`.
    - `groups`: `Array<{id, name}>` (the tab's window's groups).
    - `surface`: `'pill' | 'row'`.
  - `closableTabIds({ tabOrder, tabsById, keepId })` → `Array<id>` — ids to close for "Close Other Tabs" (excludes `keepId` and pinned tabs).

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/tab-context-menu-model.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTabContextMenu, closableTabIds } = require('../../src/main/tab-context-menu-model');

const baseTab = {
  id: 1, url: 'https://example.com/p?utm_source=x', title: 'Example',
  pinned: false, muted: false, private: false, asleep: false,
  bookmarked: false, groupId: null, capturing: false,
};
const build = (over = {}) => buildTabContextMenu({
  tab: { ...baseTab, ...(over.tab || {}) },
  groups: over.groups ?? [],
  activeTabId: over.activeTabId ?? 1,
  surface: over.surface ?? 'row',
  canCloseOthers: over.canCloseOthers ?? true,
  canMoveToNewWindow: over.canMoveToNewWindow ?? true,
});
const ids = (items) => items.filter((i) => i.id).map((i) => i.id);
const byId = (items, id) => items.find((i) => i.id === id);

test('core items present, in order, for a row on a non-active tab', () => {
  const m = build({ activeTabId: 2, surface: 'row' });
  assert.deepEqual(ids(m), [
    'copy-link', 'copy-clean-link', 'reload', 'duplicate',
    'toggle-pin', 'toggle-mute', 'toggle-favorite', 'group',
    'glance', 'quiet', 'new-tab', 'new-private-tab',
    'close-others', 'move-new-window', 'reopen-closed', 'close',
  ]);
});

test('pill (active tab) omits glance and quiet', () => {
  const m = build({ activeTabId: 1, surface: 'pill' });
  assert.equal(byId(m, 'glance'), undefined);
  assert.equal(byId(m, 'quiet'), undefined);
});

test('row on the active tab omits glance and quiet', () => {
  const m = build({ activeTabId: 1, surface: 'row' });
  assert.equal(byId(m, 'glance'), undefined);
  assert.equal(byId(m, 'quiet'), undefined);
});

test('pin/mute/favorite labels reflect state', () => {
  assert.equal(byId(build(), 'toggle-pin').label, 'Pin Tab');
  assert.equal(byId(build({ tab: { pinned: true } }), 'toggle-pin').label, 'Unpin Tab');
  assert.equal(byId(build({ tab: { muted: true } }), 'toggle-mute').label, 'Unmute Tab');
  assert.equal(byId(build(), 'toggle-favorite').label, 'Save to Favorites');
  assert.equal(byId(build({ tab: { bookmarked: true } }), 'toggle-favorite').label, 'Remove from Favorites');
});

test('save-to-favorites disabled for private and non-http tabs', () => {
  assert.equal(byId(build(), 'toggle-favorite').enabled, true);
  assert.equal(byId(build({ tab: { private: true } }), 'toggle-favorite').enabled, false);
  assert.equal(byId(build({ tab: { url: 'blanc://newtab/' } }), 'toggle-favorite').enabled, false);
});

test('copy-clean-link appears only when cleaning would change the url', () => {
  assert.ok(byId(build(), 'copy-clean-link')); // has utm_source → differs
  // cleanLink returns non-http(s) input as null and tracker-free URLs
  // unchanged — the item is OMITTED (spec §4: hidden), not disabled, in both.
  assert.equal(byId(build({ tab: { url: 'blanc://newtab/' } }), 'copy-clean-link'), undefined);
  assert.equal(byId(build({ tab: { url: 'https://example.com/plain' } }), 'copy-clean-link'), undefined);
});

test('quiet disabled for capturing or already-quiet tabs', () => {
  assert.equal(byId(build({ activeTabId: 2, tab: { asleep: true } }), 'quiet').enabled, false);
  assert.equal(byId(build({ activeTabId: 2, tab: { capturing: true } }), 'quiet').enabled, false);
  assert.equal(byId(build({ activeTabId: 2 }), 'quiet').enabled, true);
});

test('close-others / move-new-window respect caps', () => {
  assert.equal(byId(build({ canCloseOthers: false }), 'close-others').enabled, false);
  assert.equal(byId(build({ canMoveToNewWindow: false }), 'move-new-window').enabled, false);
});

test('group submenu lists groups with the current one checked, plus remove/new', () => {
  const sub = byId(build({
    tab: { groupId: 'g1' },
    groups: [{ id: 'g1', name: 'projects' }, { id: 'g2', name: 'tools' }],
  }), 'group').submenu;
  assert.deepEqual(sub.filter((i) => i.type === 'radio').map((i) => [i.label, i.checked]),
    [['projects', true], ['tools', false]]);
  assert.ok(sub.find((i) => i.id === 'group-none'), 'has Remove from Group when grouped');
  assert.ok(sub.find((i) => i.id === 'group-new'), 'has New Group…');
});

test('group submenu omits Remove when ungrouped; New Group always present', () => {
  const sub = byId(build({ tab: { groupId: null }, groups: [] }), 'group').submenu;
  assert.equal(sub.find((i) => i.id === 'group-none'), undefined);
  assert.equal(sub.filter((i) => i.id === 'group-new').length, 1);
});

test('radio group items carry the raw groupId for the runner', () => {
  const sub = byId(build({ groups: [{ id: 42, name: 'nums' }] }), 'group').submenu;
  assert.equal(sub.find((i) => i.type === 'radio').groupId, 42);
});

test('no leading, trailing, or doubled separators', () => {
  const m = build();
  assert.notEqual(m[0].type, 'separator');
  assert.notEqual(m[m.length - 1].type, 'separator');
  for (let i = 1; i < m.length; i++) {
    assert.ok(!(m[i].type === 'separator' && m[i - 1].type === 'separator'), 'no double sep');
  }
});

test('closableTabIds excludes the kept tab and pinned tabs', () => {
  const tabsById = new Map([
    [1, { id: 1, pinned: false }], [2, { id: 2, pinned: true }],
    [3, { id: 3, pinned: false }], [4, { id: 4, pinned: false }],
  ]);
  assert.deepEqual(closableTabIds({ tabOrder: [1, 2, 3, 4], tabsById, keepId: 3 }), [1, 4]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/tab-context-menu-model.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the model**

```js
// src/main/tab-context-menu-model.js
// Pure descriptor builder for the tab context menu shared by the resting pill
// (active tab) and expanded-island tab rows (right-clicked tab). No electron
// require — this is the unit-test surface. Glue + Menu.popup live in
// tab-context-menu.js. Same split as address-menu-model.js / address-menu.js.

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

module.exports = { buildTabContextMenu, buildGroupSubmenu, closableTabIds };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/tab-context-menu-model.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-context-menu-model.js test/unit/tab-context-menu-model.test.js
git commit -m "feat: pure model for the shared tab context menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Menu glue + item runner

**Files:**
- Create: `src/main/tab-context-menu.js`
- Create: `test/unit/tab-context-menu-runner.test.js`

**Interfaces:**
- Consumes: `buildTabContextMenu` (Task 2); `cleanLink` (only inside `actions` wiring, not here); Electron `Menu` (used only by the attach functions, Task 4/5).
- Produces:
  - `runTabContextMenuItem(id, { tab, groupId, actions })` — dispatches a clicked item id to `actions`. Every side effect (including clipboard) goes through `actions`, so this is electron-free and unit-testable.
  - `TAB_ROW_SELECTOR = '.island-row[data-tab-id]'`, `PILL_SELECTOR = '#islandPill'`.
  - `toElectronTemplate(modelItems, { tab, actions })` — maps model items (incl. submenu recursion, `type`, `checked`, `accelerator`, `enabled`) to Electron template objects with `click` handlers that call `runTabContextMenuItem`.
  - `attachPillMenu(wc, deps)` and `attachRowMenu(wc, deps)` — wired in Tasks 4 & 5 (defined here).
- `actions` shape (bound in main, Task 4): `{ copy(text), reload(id), duplicate(id), togglePin(id), toggleMute(id), toggleFavorite(id), setGroup(id, groupId), beginNewGroup(id), glance(id), quiet(id), newTab(), newPrivateTab(), closeOthers(id), moveToNewWindow(id), reopenClosed(), close(id) }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/tab-context-menu-runner.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { runTabContextMenuItem } = require('../../src/main/tab-context-menu');

function spyActions() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  const names = ['copy', 'reload', 'duplicate', 'togglePin', 'toggleMute', 'toggleFavorite',
    'setGroup', 'beginNewGroup', 'glance', 'quiet', 'newTab', 'newPrivateTab',
    'closeOthers', 'moveToNewWindow', 'reopenClosed', 'close'];
  const actions = {};
  for (const n of names) actions[n] = rec(n);
  return { actions, calls };
}
const tab = { id: 7, url: 'https://a.test/p?utm_source=x' };

test('copy-link copies the tab url; copy-clean-link copies the cleaned url', () => {
  const { actions, calls } = spyActions();
  runTabContextMenuItem('copy-link', { tab, actions });
  runTabContextMenuItem('copy-clean-link', { tab, actions });
  assert.deepEqual(calls[0], ['copy', 'https://a.test/p?utm_source=x']);
  assert.equal(calls[1][0], 'copy');
  assert.equal(calls[1][1], 'https://a.test/p'); // utm stripped by cleanLink
});

test('simple items dispatch to their action with the tab id', () => {
  const cases = [
    ['reload', 'reload'], ['duplicate', 'duplicate'], ['toggle-pin', 'togglePin'],
    ['toggle-mute', 'toggleMute'], ['toggle-favorite', 'toggleFavorite'],
    ['glance', 'glance'], ['quiet', 'quiet'], ['close-others', 'closeOthers'],
    ['move-new-window', 'moveToNewWindow'], ['close', 'close'],
  ];
  for (const [id, fn] of cases) {
    const { actions, calls } = spyActions();
    runTabContextMenuItem(id, { tab, actions });
    assert.deepEqual(calls, [[fn, 7]], `${id} → ${fn}(7)`);
  }
});

test('new-tab / new-private-tab / reopen take no id', () => {
  for (const [id, fn] of [['new-tab', 'newTab'], ['new-private-tab', 'newPrivateTab'], ['reopen-closed', 'reopenClosed']]) {
    const { actions, calls } = spyActions();
    runTabContextMenuItem(id, { tab, actions });
    assert.deepEqual(calls, [[fn]]);
  }
});

test('group items: move uses raw groupId, none clears, new begins the handoff', () => {
  let s = spyActions();
  runTabContextMenuItem('group-move', { tab, groupId: 42, actions: s.actions });
  assert.deepEqual(s.calls, [['setGroup', 7, 42]]);
  s = spyActions();
  runTabContextMenuItem('group-none', { tab, actions: s.actions });
  assert.deepEqual(s.calls, [['setGroup', 7, null]]);
  s = spyActions();
  runTabContextMenuItem('group-new', { tab, actions: s.actions });
  assert.deepEqual(s.calls, [['beginNewGroup', 7]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/tab-context-menu-runner.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the glue module**

```js
// src/main/tab-context-menu.js
// Electron glue for the shared tab context menu. The pure template is
// tab-context-menu-model.js; runTabContextMenuItem routes a clicked item id
// through the injected `actions` (incl. clipboard, so this stays electron-free
// and testable). attachPillMenu/attachRowMenu own the webContents listener +
// Menu.popup, mirroring address-menu.js.

const { Menu } = require('electron');
const { buildTabContextMenu } = require('./tab-context-menu-model');
const { cleanLink } = require('./clean-link');

const TAB_ROW_SELECTOR = '.island-row[data-tab-id]';
const PILL_SELECTOR = '#islandPill';

function runTabContextMenuItem(id, { tab, groupId, actions }) {
  switch (id) {
    case 'copy-link': return actions.copy(tab.url || '');
    case 'copy-clean-link': { const c = cleanLink(tab.url); if (c) actions.copy(c); return; }
    case 'reload': return actions.reload(tab.id);
    case 'duplicate': return actions.duplicate(tab.id);
    case 'toggle-pin': return actions.togglePin(tab.id);
    case 'toggle-mute': return actions.toggleMute(tab.id);
    case 'toggle-favorite': return actions.toggleFavorite(tab.id);
    case 'group-move': return actions.setGroup(tab.id, groupId);
    case 'group-none': return actions.setGroup(tab.id, null);
    case 'group-new': return actions.beginNewGroup(tab.id);
    case 'glance': return actions.glance(tab.id);
    case 'quiet': return actions.quiet(tab.id);
    case 'new-tab': return actions.newTab();
    case 'new-private-tab': return actions.newPrivateTab();
    case 'close-others': return actions.closeOthers(tab.id);
    case 'move-new-window': return actions.moveToNewWindow(tab.id);
    case 'reopen-closed': return actions.reopenClosed();
    case 'close': return actions.close(tab.id);
  }
}

function toElectronTemplate(modelItems, { tab, actions }) {
  return modelItems.map((item) => {
    if (item.type === 'separator') return { type: 'separator' };
    const el = { label: item.label };
    if (item.accelerator) el.accelerator = item.accelerator;
    if (item.enabled === false) el.enabled = false;
    if (item.type === 'radio') { el.type = 'radio'; el.checked = !!item.checked; }
    if (item.submenu) {
      el.submenu = toElectronTemplate(item.submenu, { tab, actions });
    } else {
      el.click = () => runTabContextMenuItem(item.id, { tab, groupId: item.groupId, actions });
    }
    return el;
  });
}

// Read the right-clicked tab id from the overlay DOM at the click point, with a
// hit-test re-verification (a renderer suppression can regress; main is the
// authority — same discipline as address-menu.js).
async function readRowTabId(wc, params) {
  return wc.executeJavaScript(`(() => {
    const hit = document.elementFromPoint(${Math.round(params.x)}, ${Math.round(params.y)});
    const row = hit && hit.closest && hit.closest(${JSON.stringify(TAB_ROW_SELECTOR)});
    return row ? row.dataset.tabId : null;
  })()`);
}

async function isInPill(wc, params) {
  return wc.executeJavaScript(`!!(document.elementFromPoint(${Math.round(params.x)}, ${Math.round(params.y)})
    ?.closest(${JSON.stringify(PILL_SELECTOR)}))`);
}

// The resting pill lives on the chrome window's own webContents; its coords are
// already window-relative and the overlay is closed, so no blur-guard here.
// deps: { resolveActiveTab(): ctx|null, getWindow(), actions }
function attachPillMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    let inPill = false;
    try { inPill = await isInPill(wc, params); } catch { return; }
    if (!inPill) return;
    const ctx = deps.resolveActiveTab();
    if (!ctx) return;
    const template = buildTabContextMenu({ ...ctx, surface: 'pill' });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, { tab: ctx.tab, actions: deps.actions }));
    try {
      menu.popup({ window: deps.getWindow(), x: Math.round(params.x), y: Math.round(params.y), sourceType: params.menuSourceType });
    } catch { /* window died mid-popup */ }
  });
}

// Tab rows live on the overlay webContents (shared with the address menu). Coords
// are overlay-relative → offset by overlay bounds; reuse the overlay blur-guard.
// deps: { isOverlayLive(), resolveTab(rawId): ctx|null, getWindow(),
//         getOverlayBounds(), acquireMenuGuard(), releaseMenuGuard(ticket), actions }
function attachRowMenu(wc, deps) {
  wc.on('context-menu', async (_event, params) => {
    if (params.isEditable) return; // the address menu owns editable targets
    let rawId;
    try { rawId = await readRowTabId(wc, params); } catch { return; }
    if (rawId == null) return;
    if (!deps.isOverlayLive()) return;
    const ctx = deps.resolveTab(rawId);
    if (!ctx) return;
    const template = buildTabContextMenu({ ...ctx, surface: 'row' });
    const menu = Menu.buildFromTemplate(toElectronTemplate(template, { tab: ctx.tab, actions: deps.actions }));
    const bounds = deps.getOverlayBounds();
    const ticket = deps.acquireMenuGuard();
    try {
      menu.popup({
        window: deps.getWindow(),
        x: Math.round(bounds.x + params.x),
        y: Math.round(bounds.y + params.y),
        sourceType: params.menuSourceType,
        callback: () => deps.releaseMenuGuard(ticket),
      });
    } catch { deps.releaseMenuGuard(ticket); }
  });
}

module.exports = {
  runTabContextMenuItem, toElectronTemplate, attachPillMenu, attachRowMenu,
  TAB_ROW_SELECTOR, PILL_SELECTOR,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/tab-context-menu-runner.test.js`
Expected: PASS.

Note: requiring `electron` at the top is fine for `node --test` here because the runner test only calls `runTabContextMenuItem` — but to keep the model/runner tests electron-free, the `require('electron')` resolves in Electron's test env. If `node --test` cannot resolve `electron`, move `const { Menu } = require('electron')` to a lazy `require` inside `attachPillMenu`/`attachRowMenu`. Verify at Step 4; apply the lazy-require fix only if the run fails on the electron import.

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-context-menu.js test/unit/tab-context-menu-runner.test.js
git commit -m "feat: tab context-menu glue (runner + pill/row attach)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Pill wiring + shared main-side deps + new main actions

**Files:**
- Modify: `src/main/main.js` — new helpers `tabContextData`, `menuContextActions`, `toggleBookmarkForTab`, `quietTabNow`, `closeOtherTabsInWindow`, `beginNewGroup`; attach `attachPillMenu`.
- Modify: `src/renderer/renderer.js` — suppress contextmenu except on `#islandPill`.

**Interfaces:**
- Consumes: `attachPillMenu` (Task 3); `buildTabContextMenu` inputs (Task 2); existing `tabs`, `rt()`, `bindWindowRuntime`, `closableTabIds`, `setTabGroup`, `duplicateTab`, `toggleTabPinned`, `toggleTabMuted`, `setGlanceTab`, `sleepTab`, `reopenClosedTab`, `closeTab`, `createTab`, `setActiveTab`, `showOverlay`, `liveContents`, `bookmarks`, `newTabUrl`, `PRIVATE_NEW_TAB_URL`, `broadcastTabs`, `scheduleMenuRebuild`.
- Produces: `tabContextData(tab, owner)`; `menuContextActions(owner)`; `moveTabToNewWindow` is a stub here (throws/no-op), fully built in Task 6.

- [ ] **Step 1: Add the per-tab favorite toggle** (`src/main/main.js`, next to `toggleBookmarkForActiveTab`, ~line 3943)

```js
/** Per-tab favorite toggle for the context menu; same guards as the active-tab
 * version (private tabs never populate synced Favorites). */
function toggleBookmarkForTab(id) {
  const tab = tabs.get(id);
  if (!tab || tab.private || !/^https?:\/\//.test(tab.url)) return;
  tab.bookmarked = bookmarks.toggleBookmark(tab.url, tab.title, tab.favicon);
  broadcastTabs();
  scheduleMenuRebuild();
}
```

- [ ] **Step 2: Add per-tab quiet + close-others + the New-Group handoff** (`src/main/main.js`, near `sleepTab`/`closeTab`)

```js
/** "Quiet This Tab Now" — quiet a specific background tab immediately. Never the
 * active tab (its renderer must stay live) and never a capturing tab; sleepTab's
 * own guards are the backstop. */
function quietTabNow(id) {
  const tab = tabs.get(id);
  if (!tab || id === rt().activeTabId || tab.capturing || tab.asleep) return;
  sleepTab(id);
}

/** "Close Other Tabs" — close every other unpinned tab in this window. */
function closeOtherTabsInWindow(keepId) {
  for (const id of closableTabIds({ tabOrder: [...rt().tabOrder], tabsById: tabs, keepId })) {
    closeTab(id);
  }
}

/** "New Group…" handoff: open the command panel and hand the right-clicked tab
 * to the /group command input (§5.3 of the design). */
function beginNewGroup(tabId) {
  showOverlay('panel', { prefill: '/group ' });
  rt().overlayView?.webContents.send('overlay:begin-group', { tabId });
}
```

Add the require for `closableTabIds` near the top (~line 73):

```js
const { closableTabIds } = require('./tab-context-menu-model');
const { attachPillMenu, attachRowMenu } = require('./tab-context-menu');
```

- [ ] **Step 3: Add the shared context-data + actions factories** (`src/main/main.js`, near `createOverlay`/`serializeTabs`)

```js
/** The tab fields + window facts the shared menu model reads. `owner` is the
 * window runtime the menu belongs to. Returns null if the tab isn't in it. */
function tabContextData(tab, owner) {
  if (!tab || tab.runtimeId !== owner.id) return null;
  return {
    tab: {
      id: tab.id, url: tab.url, title: tab.title,
      pinned: !!tab.pinned, muted: !!tab.muted, private: !!tab.private,
      asleep: !!tab.asleep, bookmarked: !!tab.bookmarked,
      groupId: tab.groupId ?? null, capturing: !!tab.capturing,
    },
    groups: owner.groups.map((g) => ({ id: g.id, name: g.name })),
    activeTabId: owner.activeTabId,
    canCloseOthers: closableTabIds({ tabOrder: owner.tabOrder, tabsById: tabs, keepId: tab.id }).length > 0,
    canMoveToNewWindow: owner.tabOrder.length > 1,
  };
}

/** The action closures the menu runner calls, all bound to `owner`'s runtime. */
function menuContextActions(owner) {
  const b = (fn) => bindWindowRuntime(owner, fn);
  return {
    copy: (text) => clipboard.writeText(text),
    reload: b((id) => liveContents(tabs.get(id))?.reload()),
    duplicate: b((id) => duplicateTab(id)),
    togglePin: b((id) => toggleTabPinned(id)),
    toggleMute: b((id) => toggleTabMuted(id)),
    toggleFavorite: b((id) => toggleBookmarkForTab(id)),
    setGroup: b((id, gid) => setTabGroup(id, gid)),
    beginNewGroup: b((id) => beginNewGroup(id)),
    glance: b((id) => setGlanceTab(id)),
    quiet: b((id) => quietTabNow(id)),
    newTab: b(() => setActiveTab(createTab(newTabUrl()), { focusContent: false, focusAddress: true })),
    newPrivateTab: b(() => setActiveTab(createTab(PRIVATE_NEW_TAB_URL, { private: true }), { focusContent: false, focusAddress: true })),
    closeOthers: b((id) => closeOtherTabsInWindow(id)),
    moveToNewWindow: b((id) => moveTabToNewWindow(id)),
    reopenClosed: b(() => reopenClosedTab()),
    close: b((id) => closeTab(id)),
  };
}
```

Ensure `clipboard` is imported from electron at the top of main.js (search `require('electron')`; add `clipboard` to the destructure if absent).

- [ ] **Step 4: Add a temporary `moveTabToNewWindow` stub** (replaced in Task 6), near `openNewWindow`:

```js
/** Filled in Task 6. */
function moveTabToNewWindow(id) { void id; /* TODO(Task 6) */ }
```

- [ ] **Step 5: Attach the pill menu** (`src/main/main.js`, in `createMainWindowForRuntime`, right after `installChromeShortcuts(rt().window.webContents);` ~line 4965)

```js
  attachPillMenu(rt().window.webContents, {
    getWindow: bindWindowRuntime(runtime, () => rt().window),
    resolveActiveTab: bindWindowRuntime(runtime, () =>
      tabContextData(tabs.get(rt().activeTabId), runtime)),
    actions: menuContextActions(runtime),
  });
```

- [ ] **Step 6: Suppress non-pill contextmenu in the chrome renderer** (`src/renderer/renderer.js`)

Add once near the other top-level `document.addEventListener` setup:

```js
  // Right-click only opens the pill's native menu (built in main). Everywhere
  // else on the strip — window controls, empty drag band — shows nothing.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#islandPill')) e.preventDefault();
  });
```

- [ ] **Step 7: Verify**

Relaunch `npm start`. Right-click the resting pill → the unified menu appears with the active tab's state (correct Pin/Save-to-Favorites/mute labels; Glance/Quiet absent). Exercise Copy Link, Reload, Duplicate, Pin, New Tab, Close, and Move to Group ▸ → an existing group and Remove from Group. Right-click window controls / empty strip → no menu. Confirm `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js` still PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/main.js src/renderer/renderer.js
git commit -m "feat: unified right-click menu on the resting island pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Tab-row menu + relocate grouping off the row

**Files:**
- Modify: `src/main/main.js` — `attachRowMenu` inside `createOverlay()`.
- Modify: `src/renderer/overlay.js` — relax contextmenu suppression; remove the `row-grp` chip + inline group picker; add `pendingGroupTabId` + `overlay:begin-group`; target `/group` at the pending tab.
- Modify: `CLAUDE.md` — rewrite the Tab-groups picker description.

**Interfaces:**
- Consumes: `attachRowMenu` (Task 3), `tabContextData`/`menuContextActions` (Task 4), and the overlay blur-guard deps already built for `attachAddressMenu`.

- [ ] **Step 1: Attach the row menu** (`src/main/main.js`, inside `createOverlay()`, immediately after the `attachAddressMenu(...)` call ~line 1869)

```js
  attachRowMenu(rt().overlayView.webContents, {
    isOverlayLive: bindWindowRuntime(owner, () =>
      hasLiveWindow()
      && rt().overlayView && !rt().overlayView.webContents.isDestroyed()
      && (rt().overlayMode === 'panel' || rt().overlayMode === 'palette')),
    getWindow: bindWindowRuntime(owner, () => rt().window),
    getOverlayBounds: bindWindowRuntime(owner, () => overlayBounds()),
    acquireMenuGuard: bindWindowRuntime(owner, () => { rt().addressMenuTicket = ++rt().addressMenuSeq; return rt().addressMenuTicket; }),
    releaseMenuGuard: bindWindowRuntime(owner, (ticket) => {
      if (ticket !== rt().addressMenuTicket) return;
      rt().addressMenuTicket = 0;
      if (!hasLiveWindow()) return;
      if (rt().window.isFocused()) return refocusOverlayAfterMenu();
      setTimeout(bindWindowRuntime(owner, () => {
        if (rt().addressMenuTicket || !hasLiveWindow()) return;
        if (!rt().window.isFocused()) return hideOverlay({ refocusContent: false });
        refocusOverlayAfterMenu();
      }), 80);
    }),
    resolveTab: bindWindowRuntime(owner, (rawId) => {
      const id = tabs.has(rawId) ? rawId : (tabs.has(Number(rawId)) ? Number(rawId) : null);
      return id == null ? null : tabContextData(tabs.get(id), owner);
    }),
    actions: menuContextActions(owner),
  });
```

Note: the guard block is intentionally identical to `attachAddressMenu`'s — both menus share `rt().addressMenuTicket`/`addressMenuSeq`, and they are mutually exclusive (a right-click is either on the editable address input or on a row, never both). To avoid duplication, optionally extract the five guard closures into a local `const overlayMenuGuardDeps = { ... }` above both calls and spread it into each; keep it inline if that reads clearer.

- [ ] **Step 2: Relax the overlay's contextmenu suppression** (`src/renderer/overlay.js`, the sole `contextmenu` listener ~line 1860)

Replace:

```js
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#addressInput')) e.preventDefault();
  });
```

with:

```js
  // Let right-clicks reach main for the address input AND real tab rows (so
  // main can pop their native menus). Remote/folded/header rows carry no
  // data-tab-id, so they stay suppressed — no menu, by design.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#addressInput') && !e.target.closest('.island-row[data-tab-id]')) {
      e.preventDefault();
    }
  });
```

- [ ] **Step 3: Add the New-Group handoff state + message** (`src/renderer/overlay.js`)

Replace the `let pickingTabId = null;` declaration (~line 66) and its focus helper (~line 72) with:

```js
  // The tab a menu-triggered "New Group…" is naming (see overlay:begin-group).
  let pendingGroupTabId = null;
```

(Delete the `islandList.querySelector(...).row-grp')?.focus();` helper that used `pickingTabId` — nothing calls it after Step 5.)

Register the message handler near the other `window.browserAPI.on*` subscriptions (e.g. beside `onOverlayShow`, ~line 1550):

```js
  // Only records the target. The '/group ' text, focus, and caret all arrive
  // through the overlay:show prefill that beginNewGroup (main) sends first —
  // showOverlay re-sends overlay:show even when the panel is already open, and
  // applyMode handles prefill value/focus/caret (verified ~lines 1324–1340).
  window.browserAPI.onBeginGroup?.(({ tabId }) => {
    pendingGroupTabId = tabId;
  });
```

- [ ] **Step 4: Expose the message on the preload bridge** (`src/main/preload.js`)

Add to the `browserAPI` object (next to `onOverlayShow`):

```js
  onBeginGroup: (fn) => ipcRenderer.on('overlay:begin-group', (_e, payload) => fn(payload)),
```

- [ ] **Step 5: Remove the row group chip + inline picker; target `/group`** (`src/renderer/overlay.js`)

In `tabRow(tab)` (~lines 511–545), delete the `row-grp` chip block (the `grp` button, its `className = 'row-grp'`, and its click handler that toggled `pickingTabId`). In the same function delete the entire `if (pickingTabId === tab.id) { … }` inline-picker block (~lines 546–592), including the `→ name` buttons, the `→ none` button, and the `group-picker-input` field.

In `renderList()` remove the picker-input focus/value restoration that referenced `.group-picker-input` (~lines 1183 and 1216).

Update the `/group` command's `run` (~line 762) to honor the pending target and then clear it:

```js
    { cmd: '/group', hint: 'Type a space, then a group name — e.g. "work"', run: (input) => {
      const name = input.slice('/group'.length).trim();
      const target = pendingGroupTabId ?? state.activeTabId;
      if (name && target) window.browserAPI.groupTabByName(target, name);
      pendingGroupTabId = null;
    } },
```

In `applyMode(...)` where it resets picker state (~line 1317, `pickingTabId = null;`) replace with `pendingGroupTabId = null;`. In the hide path (~line 1628, another `pickingTabId = null;`) replace with `pendingGroupTabId = null;`. Grep the file for any remaining `pickingTabId` and remove those references.

The spec (§5.3) also requires clearing the pending target when the user edits the command *away* from `/group` — otherwise a stale target hijacks a later hand-typed `/group work` and groups the wrong tab. In the `addressInput` input handler (~line 1134, where `const value = addressInput.value;` feeds `renderList`), add:

```js
    if (pendingGroupTabId != null && !value.startsWith('/group')) pendingGroupTabId = null;
```

- [ ] **Step 6: Update CLAUDE.md** — in the **Tab groups** section, replace the sentences describing the per-row "group" chip picker (the `→ name` / `→ none` picker, the inline "new group…" field, and "The picker's name field survives `tabs:updated` re-renders…") with a description of grouping via the right-click **Move to Group ▸** submenu and the `/group`-command New-Group handoff. Keep the rest (pill dots, ⌘L headers, `session.json` persistence) unchanged.

- [ ] **Step 7: Verify**

Relaunch `npm start` with several tabs and at least one group:
- A tab row is no longer carrying the group chip; titles have room. Group membership still shows under the panel's group headers.
- Right-click a background tab row → menu shows Glance + Quiet This Tab Now; right-click the active row → both absent.
- Move to Group ▸ → an existing group moves the tab; Remove from Group clears it.
- Move to Group ▸ → New Group… → the command field shows `/group `, focused; type `work`, Enter → *that* tab (not the active one) joins the new "work" group.
- Opening the menu does not dismiss the panel (blur-guard); Escape/away still dismisses normally.
- Right-click a synced/remote row or a group header → no menu.

Run `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js` (PASS). Run `git grep -n "row-grp\|group-picker\|pickingTabId" src/renderer/overlay.js` → **no matches**. If any test under `test/` or `spec/` drives the removed picker, update or delete it in this commit.

- [ ] **Step 8: Commit**

```bash
git add src/main/main.js src/renderer/overlay.js src/main/preload.js CLAUDE.md
git commit -m "feat: tab-row right-click menu; move grouping off the row into it

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5b: Acceptance test-hook binding (spec §10)

**Files:**
- Modify: `src/main/test-hook.js` — bind the tab-context-menu pure/action layers, mirroring the existing address-menu block (lines ~672–711).
- Modify: `src/main/main.js` — pass `tabContextData` + `menuContextActions` into `installTestHook`'s deps (the big deps object at ~line 5848).

**Interfaces:**
- Consumes: `buildTabContextMenu` (Task 2), `runTabContextMenuItem` (Task 3), `tabContextData`/`menuContextActions` (Task 4).
- Produces: hook methods `tabContextMenu(tabId, surface)` and `runTabContextMenuItem(id, tabId, groupId?)` on `globalThis.__blanc`.

- [ ] **Step 1: Pass the factories through main's test-hook deps**

In `src/main/main.js`, where `installTestHook` receives its deps (~line 5848, the object already carrying `groupTabByName, toggleGroupCollapsed, …`), add:

```js
      tabContextData: (tabId) => tabContextData(tabs.get(tabId), rt()),
      tabMenuActions: () => menuContextActions(rt()),
```

- [ ] **Step 2: Add the hook methods** (`src/main/test-hook.js`, after the address-menu block ~line 711)

Add the require at the top, beside the address-menu requires:

```js
const { buildTabContextMenu } = require('./tab-context-menu-model');
const { runTabContextMenuItem } = require('./tab-context-menu');
```

And in the hook surface object:

```js
    // ---- tab context menu ----
    // Same compromise as the address menu: a native Menu.popup() can't be
    // driven by Playwright, so bind the pure template + the click runner.
    tabContextMenu(tabId, surface = 'row') {
      const ctx = deps.tabContextData(tabId);
      if (!ctx) throw new Error(`no such tab in the focused window: ${tabId}`);
      return buildTabContextMenu({ ...ctx, surface });
    },
    runTabContextMenuItem(id, tabId, groupId = null) {
      const ctx = deps.tabContextData(tabId);
      if (!ctx) throw new Error(`no such tab in the focused window: ${tabId}`);
      return runTabContextMenuItem(id, { tab: ctx.tab, groupId, actions: deps.tabMenuActions() });
    },
```

(Adjust `deps.` to however that file names its injected dependencies object — grep how the neighbouring methods reach `groupTabByName` and follow suit.)

- [ ] **Step 3: Verify + commit**

Run: `BLANC_TEST=1 npm run test:acceptance:dry` — step resolution still clean (no new steps required; this lands the binding the spec's acceptance scenarios will use).

```bash
git add src/main/test-hook.js src/main/main.js
git commit -m "test: bind the tab context menu into the acceptance test hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Move Tab to New Window

**Files:**
- Modify: `src/main/main.js` — replace the `moveTabToNewWindow` stub with the real cross-window move.
- Create: `test/unit/move-tab-to-new-window.test.js` (pure planning helper only).

**Interfaces:**
- Consumes: `openNewWindow` seam idea, `windowRuntimes`, `tabs`, `rt()`, `setActiveTab`, `broadcastTabs`, `withWindowRuntime`, `bindWindowRuntime`.
- Produces: `pickSurvivorTabId(tabOrder, movedId)` (pure) + `moveTabToNewWindow(id)` (imperative).

- [ ] **Step 1: Write the failing test for the pure survivor pick**

```js
// test/unit/move-tab-to-new-window.test.js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { pickSurvivorTabId } = require('../../src/main/tab-context-menu-model');

test('survivor is the next tab, or the previous when moving the last', () => {
  assert.equal(pickSurvivorTabId([1, 2, 3], 2), 3);
  assert.equal(pickSurvivorTabId([1, 2, 3], 3), 2);
  assert.equal(pickSurvivorTabId([1, 2, 3], 1), 2);
  assert.equal(pickSurvivorTabId([5], 5), null); // sole tab — caller must guard
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/move-tab-to-new-window.test.js`
Expected: FAIL — `pickSurvivorTabId is not a function`.

- [ ] **Step 3: Add the pure helper to the model** (`src/main/tab-context-menu-model.js`)

```js
/** When a tab leaves a window, which of the remaining tabs should the source
 * window select? The neighbour after it, else the one before. null if it was
 * the only tab (the caller disables Move-to-New-Window in that case). */
function pickSurvivorTabId(tabOrder, movedId) {
  const i = tabOrder.indexOf(movedId);
  if (i === -1 || tabOrder.length <= 1) return null;
  return tabOrder[i + 1] ?? tabOrder[i - 1] ?? null;
}
```

Add `pickSurvivorTabId` to `module.exports`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/unit/move-tab-to-new-window.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the imperative move** (`src/main/main.js`, replacing the Task 4 stub)

First, extend the Task 4 model require to also import the survivor helper:

```js
const { closableTabIds, pickSurvivorTabId } = require('./tab-context-menu-model');
```

Then replace the stub with:

```js
/** "Move Tab to New Window": detach the tab from its window into a fresh one.
 * Ungrouped on move — a group spanning two windows isn't a modeled concept
 * (design §6). Pin and mute state travel with the tab. */
function moveTabToNewWindow(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const source = windowRuntimes.all().find((r) => r.id === tab.runtimeId);
  if (!source || source.tabOrder.length <= 1) return; // sole tab — no-op

  // 1. Detach from the source window: if active, hand focus to a survivor first
  //    (setActiveTab removes the outgoing view from contentView). pruneEmptyGroups
  //    uses rt(), so it must run inside the source runtime after the tab leaves.
  const survivor = pickSurvivorTabId(source.tabOrder, id);
  withWindowRuntime(source, () => {
    if (source.activeTabId === id && survivor != null) setActiveTab(survivor, { focusContent: false });
    source.tabOrder = source.tabOrder.filter((tid) => tid !== id);
    // A quiet tab's renderer may be discarded and its view gone — guard both.
    // liveContents(tab) is the ONLY correct liveness check (CLAUDE.md).
    liveContents(tab)?.setVisible?.(false);
    if (tab.view) source.window?.contentView.removeChildView(tab.view);
    pruneEmptyGroups();
    broadcastTabs();
  });

  // 2. Create the destination window and adopt the tab into it.
  const destRuntime = windowRuntimes.createRuntime({ id: createWindowRuntimeId(), profileId: source.profileId });
  createMainWindow(destRuntime);
  withWindowRuntime(destRuntime, () => {
    tab.runtimeId = destRuntime.id;
    tab.groupId = null; // ungroup on move
    destRuntime.tabOrder = [id];
    focusedRuntime = destRuntime;
    setFocusedLocalProfile(destRuntime.profileId);
    setActiveTab(id); // attaches tab.view to the new window's contentView
    destRuntime.window.show();
    destRuntime.window.focus();
    broadcastTabs();
    buildMenu(destRuntime);
  });

  if (!sessionReadOnly) persistSession();
}
```

Verify the exact helper names against `src/main/main.js` before finalizing (grep each): `windowRuntimes.all()` + `.find` (the pattern `runInWindowRuntime` uses at line ~5312), `windowRuntimes.createRuntime`, `createWindowRuntimeId`, `createMainWindow`, `pruneEmptyGroups()` (no args — uses `rt()`), `setFocusedLocalProfile`, `buildMenu`, `persistSession`, `sessionReadOnly`, and the view field (`tab.view` + `contentView.removeChildView`). `openNewWindow` at ~5030 models the create/show/focus sequence — mirror it.

- [ ] **Step 6: Verify**

Relaunch `npm start`:
- Right-click a background tab in a 2+‑tab window → **Move Tab to New Window** → a new window opens showing that tab; the source window keeps the rest and selects a sensible neighbour. A grouped tab lands ungrouped; the source group closes if it was its last member.
- In a single-tab window the item is disabled.
- Move a **quiet** (dimmed) tab → the new window wakes it via the normal `setActiveTab` wake path; no crash when its renderer was discarded.
- `⌘⇧T` in the source window still reopens recently closed tabs; the moved tab isn't treated as closed.

Run: `node --test test/unit/move-tab-to-new-window.test.js` (PASS).

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js src/main/tab-context-menu-model.js test/unit/move-tab-to-new-window.test.js
git commit -m "feat: Move Tab to New Window from the tab context menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run test:unit` — all unit suites PASS (new: dock-menu, tab-context-menu-model, tab-context-menu-runner, move-tab-to-new-window).
- [ ] `npm run substrate:check` — unaffected (no token/settings/slash-command source changes).
- [ ] Manual pass across the three surfaces per each task's verify step, in a packaged-parity dev run.
- [ ] `git grep -n "row-grp\|group-picker\|pickingTabId"` returns no stray references outside history/docs.
