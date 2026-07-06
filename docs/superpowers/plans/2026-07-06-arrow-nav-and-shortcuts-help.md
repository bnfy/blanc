# Arrow-Key Workspace Navigation + Help/Shortcuts Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⌥⌘ arrow keys navigate tabs-within-cluster (←/→) and between clusters (↑/↓), plus a native Help menu whose "Keyboard Shortcuts" item opens a new `blanc://shortcuts/` page generated from the live application menu.

**Architecture:** All navigation logic lives in `src/main/main.js` (the single owner of `tabs`/`tabOrder`/`groups`), exposed as visible menu accelerators like every existing shortcut. The shortcuts page follows the established internal-page pattern: flat files in `src/renderer/pages/`, a guarded `pages:*` IPC in `pages.js` backed by a hook from `main.js`, bridged through `tab-preload.js`.

**Tech Stack:** Electron (main process `Menu`, custom `blanc://` protocol), vanilla JS/HTML/CSS internal pages.

**Spec:** `docs/superpowers/specs/2026-07-06-arrow-nav-and-shortcuts-help-design.md`

## Global Constraints

- No test suite or linter exists in this repo — verification is `node --check` for syntax plus manual smoke tests via `npm start`. Do NOT invent `npm test`/`npm run lint`.
- Chrome-level changes (anything in `src/renderer/` except `pages/`, or main-process code) need a full app relaunch to observe — `⌘R` only reloads the active tab.
- Internal pages are served flat: every asset must sit directly in `src/renderer/pages/`, and every page host must be in `KNOWN_PAGES` in `src/main/pages.js`.
- Each `pages/*.html` carries its own CSP `<meta>` tag (copy the existing one verbatim; no new external hosts are added by this work).
- The pages bridge stays named `bowserPages` (internal identifiers deliberately kept from the pre-rename era — do not "fix").
- Use CSS classes in `pages.css`, not inline styles.
- Line numbers below are as of commit `d3b52a3`; re-locate by content if drifted.

---

### Task 1: Extract `clusterSlots()` and refactor `selectTabAtIndex`

**Files:**
- Modify: `src/main/main.js` (cluster helpers ~line 574–587, `selectTabAtIndex` ~line 1093–1113)

**Interfaces:**
- Consumes: existing `clusterList()`, `tabOrder`, `tabs`, `groups`, `focusGroup()`, `setActiveTab()`.
- Produces: `clusterSlots()` → `[{ key: string, group: object|null, tabIds: string[] }]` — cluster order shared by ⌘1–9 and Tasks 2–3. `key` is the group id, `'pinned'`, or `'loose'`.

- [ ] **Step 1: Add `clusterSlots()` below `clusterList()`** (after line 587):

```js
/** clusterList() plus a leading pseudo-cluster for pinned tabs, each slot
 * tagged with a stable key — the one definition of "cluster order" shared
 * by Cmd/Ctrl+1–9 and the ⌥⌘ arrow navigation. */
function clusterSlots() {
  const slots = clusterList().map(({ group, tabIds }) => ({
    key: group ? group.id : 'loose',
    group,
    tabIds,
  }));
  const pinnedIds = tabOrder.filter((id) => tabs.get(id)?.pinned);
  if (pinnedIds.length) slots.unshift({ key: 'pinned', group: null, tabIds: pinnedIds });
  return slots;
}
```

- [ ] **Step 2: Refactor `selectTabAtIndex` to use it** — replace the whole function body:

```js
/** Cmd/Ctrl+1–9. With groups: n jumps to the nth cluster — a group's
 * first tab, unfolding it (Island Tab Groups design). Without groups the
 * browser convention stands: 1–8 jump to that tab, 9 to the last. */
function selectTabAtIndex(index) {
  const slots = clusterSlots();
  if (groups.length && slots.length) {
    const slot = slots[index];
    if (!slot) return;
    if (slot.group) focusGroup(slot.group.id);
    else setActiveTab(slot.tabIds[0]);
    return;
  }
  const id = index >= 8 ? tabOrder[tabOrder.length - 1] : tabOrder[index];
  if (id) setActiveTab(id);
}
```

(The old gate `groups.length && (pinnedIds.length || clusters.length)` is exactly `groups.length && slots.length` — behavior unchanged.)

- [ ] **Step 3: Syntax check**

Run: `node --check "src/main/main.js"`
Expected: no output (exit 0)

- [ ] **Step 4: Manual smoke test** — `npm start`, create two groups via `/group a`, `/group b` plus an ungrouped tab and a pinned tab; verify ⌘1 focuses the pinned shelf, ⌘2/⌘3 focus groups a/b, ⌘4 the ungrouped tab — same as before the refactor.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js
git commit -m "Extract clusterSlots() shared cluster-order helper"
```

---

### Task 2: ⌥⌘←/→ — cycle tabs within the active cluster

**Files:**
- Modify: `src/main/main.js` (below `cycleTab` ~line 1115–1119; Tabs menu ~line 1423–1424)

**Interfaces:**
- Consumes: `clusterSlots()` (Task 1), `cycleTab(direction)`, `setActiveTab()`, `activeTabId`.
- Produces: `cycleTabInCluster(direction: 1|-1)` — used only by the menu items added here.

- [ ] **Step 1: Add `cycleTabInCluster` directly below `cycleTab`:**

```js
/** ⌥⌘←/→: previous/next tab within the active tab's cluster, wrapping.
 * With no groups and no pins everything is one loose cluster, so this
 * degrades to plain tab cycling (same result as Ctrl+Tab). */
function cycleTabInCluster(direction) {
  if (!activeTabId) return;
  const slot = clusterSlots().find((s) => s.tabIds.includes(activeTabId));
  if (!slot) return cycleTab(direction);
  if (slot.tabIds.length < 2) return;
  const i = slot.tabIds.indexOf(activeTabId);
  setActiveTab(slot.tabIds[(i + direction + slot.tabIds.length) % slot.tabIds.length]);
}
```

- [ ] **Step 2: Add two menu items** in the Tabs submenu, immediately after the `'Previous Tab'` item (line ~1424):

```js
        { label: 'Next Tab in Group', accelerator: 'Alt+CmdOrCtrl+Right', click: () => cycleTabInCluster(1) },
        { label: 'Previous Tab in Group', accelerator: 'Alt+CmdOrCtrl+Left', click: () => cycleTabInCluster(-1) },
```

- [ ] **Step 3: Syntax check**

Run: `node --check "src/main/main.js"`
Expected: exit 0

- [ ] **Step 4: Manual smoke test** — `npm start`:
  - 3 tabs in group "a", 2 ungrouped: with an "a" tab active, ⌥⌘→ cycles only the 3 "a" tabs and wraps; with an ungrouped tab active it cycles only the 2 loose tabs.
  - Single-tab group: ⌥⌘→ does nothing (no beep/error).
  - No groups, no pins: ⌥⌘→ behaves like Ctrl+Tab across all tabs.
  - Arrow keys still scroll normally in web pages (no bare-arrow capture).

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js
git commit -m "Add ⌥⌘←/→ to cycle tabs within the active group"
```

---

### Task 3: ⌥⌘↑/↓ — jump between clusters with last-active memory

**Files:**
- Modify: `src/main/main.js` (`setActiveTab` ~line 969; below `cycleTabInCluster` from Task 2; Tabs menu below Task 2's items)

**Interfaces:**
- Consumes: `clusterSlots()` (Task 1), `setActiveTab()`, `activeTabId`.
- Produces: `cycleCluster(direction: 1|-1)`; module-level `lastActiveByCluster: Map<string, string>` and `clusterKeyForTab(tab)` (main.js-internal).

- [ ] **Step 1: Add the memory map and key helper** next to the other tab-group helpers (below `clusterSlots()`):

```js
/** Cluster key → most recently active tab id there, so ⌥⌘↑/↓ lands back
 * where you were in each group. In-memory only — a remembered tab that
 * closed or moved simply fails the lookup and the first tab wins. */
const lastActiveByCluster = new Map();

function clusterKeyForTab(tab) {
  return tab.pinned ? 'pinned' : (tab.groupId ?? 'loose');
}
```

- [ ] **Step 2: Record on every activation** — in `setActiveTab`, immediately after the no-op guard `if (id === activeTabId) return;` (so both the headless and windowed paths record):

```js
  lastActiveByCluster.set(clusterKeyForTab(next), id);
```

- [ ] **Step 3: Add `cycleCluster` below `cycleTabInCluster`:**

```js
/** ⌥⌘↑/↓: previous/next cluster in ⌘1–9 order (pinned shelf → groups →
 * loose), wrapping. Lands on the cluster's last-active tab and unfolds a
 * collapsed group, consistent with focusGroup(). */
function cycleCluster(direction) {
  if (!activeTabId) return;
  const slots = clusterSlots();
  if (slots.length < 2) return;
  const from = slots.findIndex((s) => s.tabIds.includes(activeTabId));
  if (from === -1) return;
  const target = slots[(from + direction + slots.length) % slots.length];
  if (target.group) target.group.collapsed = false;
  const remembered = lastActiveByCluster.get(target.key);
  setActiveTab(target.tabIds.includes(remembered) ? remembered : target.tabIds[0]);
}
```

- [ ] **Step 4: Add two menu items** right after Task 2's "Previous Tab in Group" item:

```js
        { label: 'Next Group', accelerator: 'Alt+CmdOrCtrl+Down', click: () => cycleCluster(1) },
        { label: 'Previous Group', accelerator: 'Alt+CmdOrCtrl+Up', click: () => cycleCluster(-1) },
```

- [ ] **Step 5: Syntax check**

Run: `node --check "src/main/main.js"`
Expected: exit 0

- [ ] **Step 6: Manual smoke test** — `npm start` with a pinned tab, groups "a" (3 tabs) and "b" (2 tabs), and 2 loose tabs:
  - ⌥⌘↓ visits pinned → a → b → loose → wraps to pinned; ⌥⌘↑ reverses.
  - Switch to a's 2nd tab, jump to b, jump back: lands on a's 2nd tab (not the 1st).
  - Collapse group b (click its panel header), ⌥⌘↓ into it: it uncollapses.
  - Close the remembered tab of a cluster, jump to it: lands on its first tab.
  - Only one cluster (no groups/pins): ⌥⌘↓ does nothing.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js
git commit -m "Add ⌥⌘↑/↓ to jump between groups, remembering each group's last tab"
```

---

### Task 4: Shortcuts inventory — menu introspection + guarded IPC + bridge

**Files:**
- Modify: `src/main/main.js` (new helpers near `buildMenu` ~line 1366; `setupPages` call ~line 1565)
- Modify: `src/main/pages.js` (new handler after `pages:app-version` ~line 79)
- Modify: `src/main/tab-preload.js` (new bridge entry)

**Interfaces:**
- Consumes: `Menu.getApplicationMenu()` (Menu already imported in main.js), `setupPages(hooks)` hook pattern.
- Produces: `listShortcuts()` → `[{ category: string, label: string, keys: string }]`; hook `shortcuts.list`; IPC `pages:shortcuts:list`; bridge `window.bowserPages.shortcuts.list()` (Task 5 consumes the bridge).

- [ ] **Step 1: Add formatter + inventory walker in `main.js`**, directly above `buildMenu()`:

```js
// --- Keyboard shortcuts inventory (Help → Keyboard Shortcuts page) ---

/** 'Alt+CmdOrCtrl+Left' → '⌥⌘←' on macOS, 'Alt+Ctrl+Left' elsewhere —
 * same per-platform glyph convention the overlay uses. */
function formatAccelerator(accelerator) {
  const parts = String(accelerator).split('+');
  const key = parts.pop();
  const KEYS = { Left: '←', Right: '→', Up: '↑', Down: '↓', Plus: '+' };
  const label = KEYS[key] ?? key;
  if (process.platform !== 'darwin') {
    return [...parts.map((m) => (m === 'CmdOrCtrl' || m === 'CommandOrControl' ? 'Ctrl' : m)), label].join('+');
  }
  const MAC = { CmdOrCtrl: '⌘', CommandOrControl: '⌘', Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧' };
  const order = ['⌃', '⌥', '⇧', '⌘'];
  const mods = parts.map((m) => MAC[m] ?? m).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, label].join('');
}

/** Rows for blanc://shortcuts/, read from the LIVE application menu so the
 * page can never drift from the real bindings, plus static extras for the
 * island's non-menu keys. Hidden items (silent aliases like ⌘=) are
 * skipped; the nine ⌘1–9 items collapse into one row. */
function listShortcuts() {
  const rows = [];
  let collapsedTabJumps = false;
  for (const top of Menu.getApplicationMenu()?.items ?? []) {
    for (const item of top.submenu?.items ?? []) {
      if (!item.accelerator || item.visible === false) continue;
      if (/^CmdOrCtrl\+[1-9]$/.test(item.accelerator)) {
        if (!collapsedTabJumps) {
          collapsedTabJumps = true;
          rows.push({ category: top.label, label: 'Tab or Group 1–9', keys: `${formatAccelerator('CmdOrCtrl+1')}–9` });
        }
        continue;
      }
      rows.push({ category: top.label, label: item.label, keys: formatAccelerator(item.accelerator) });
    }
  }
  const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl+';
  rows.push(
    { category: 'Island', label: 'Dismiss island panel / find bar', keys: 'Esc' },
    { category: 'Island', label: 'Open address or run command (in command bar)', keys: 'Return' },
    { category: 'Island', label: 'Open link in background tab', keys: `${mod}click` },
  );
  return rows;
}
```

- [ ] **Step 2: Pass the hook** — in the `setupPages({...})` call, add alongside `startPage`:

```js
    shortcuts: { list: listShortcuts },
```

- [ ] **Step 3: Add the guarded handler in `pages.js`**, after the `pages:app-version` handler:

```js
  // Help → Keyboard Shortcuts: the list is introspected from the live
  // application menu in main.js, reached through a hook like startPage.
  handle('pages:shortcuts:list', () => hooks.shortcuts?.list() ?? []);
```

- [ ] **Step 4: Expose it in `tab-preload.js`**, inside the `bowserPages` object (e.g. after `start`):

```js
    shortcuts: {
      list: () => ipcRenderer.invoke('pages:shortcuts:list'),
    },
```

- [ ] **Step 5: Syntax check all three**

Run: `node --check src/main/main.js && node --check src/main/pages.js && node --check src/main/tab-preload.js`
Expected: exit 0

- [ ] **Step 6: Smoke-verify the data** — `npm start`, open any internal page (e.g. `blanc://settings/`), then in its DevTools console (View → Toggle Developer Tools targets the active tab):

Run: `await window.bowserPages.shortcuts.list()`
Expected: array of `{category, label, keys}`; contains one "Tab or Group 1–9" row; no duplicate "Zoom In" row for the hidden `⌘=` alias; includes the four Task 2/3 arrow items and the three Island extras.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js src/main/pages.js src/main/tab-preload.js
git commit -m "Add pages:shortcuts:list — shortcut inventory introspected from the live menu"
```

---

### Task 5: Help menu + `blanc://shortcuts/` page

**Files:**
- Create: `src/renderer/pages/shortcuts.html`
- Create: `src/renderer/pages/shortcuts.js`
- Modify: `src/main/pages.js:15` (`KNOWN_PAGES`)
- Modify: `src/main/main.js` (menu template end ~line 1488)
- Modify: `src/renderer/pages/pages.css` (append)

**Interfaces:**
- Consumes: `window.bowserPages.shortcuts.list()` (Task 4), `openInternalPage(url)` (existing).
- Produces: user-facing page; no downstream consumers.

- [ ] **Step 1: Allowlist the page** — in `pages.js` line 15 add `'shortcuts'`:

```js
const KNOWN_PAGES = new Set(['newtab', 'bookmarks', 'history', 'downloads', 'settings', 'error', 'auth', 'shortcuts']);
```

- [ ] **Step 2: Add the Help menu** as the last entry of the `template` array in `buildMenu()` (after the Favorites menu object):

```js
    {
      label: 'Help',
      ...(isMac ? { role: 'help' } : {}),
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => openInternalPage('blanc://shortcuts/') },
      ],
    },
```

(`role: 'help'` on macOS gets Apple's built-in Help search field for free.)

- [ ] **Step 3: Create `shortcuts.html`** (CSP copied verbatim from the sibling pages):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; script-src 'self'; font-src 'self' https://fonts.gstatic.com;" />
  <title>Keyboard Shortcuts</title>
  <link rel="icon" href="icon.svg" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500;700&display=swap" />
  <link rel="stylesheet" href="pages.css" />
</head>
<body>
  <div class="page">
    <nav class="page-nav">
      <a href="blanc://bookmarks/">Favorites</a>
      <a href="blanc://history/">History</a>
      <a href="blanc://downloads/">Downloads</a>
      <a href="blanc://settings/">Settings</a>
    </nav>
    <h1>Keyboard Shortcuts</h1>
    <div id="sections"></div>
  </div>
  <script src="shortcuts.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `shortcuts.js`.** Slash-command hints are copied from `overlay.js`'s command table (the one hand-maintained list on this page):

```js
// The shortcut sections are rendered from the live application menu
// (pages:shortcuts:list), so they can never drift from the real bindings.
// Only SLASH_COMMANDS below is maintained by hand — keep it in sync with
// the command table in overlay.js.
const SLASH_COMMANDS = [
  ['/favorites', 'Open favorites'],
  ['/history', 'Open browsing history'],
  ['/downloads', 'Open downloads'],
  ['/settings', 'Open settings'],
  ['/clear', 'Clear browsing history'],
  ['/new', 'Open a new tab'],
  ['/private', 'Open a private tab — history stays untouched'],
  ['/close', 'Close this tab'],
  ['/pin', 'Pin or unpin this tab'],
  ['/mute', 'Mute or unmute this tab'],
  ['/group <name>', 'Move this tab into a group, creating it on first use'],
  ['/ungroup', 'Take this tab out of its group'],
  ['/close-group', 'Close every tab in this group'],
  ['/find', 'Find in page'],
  ['/block-ads', 'Toggle ad & tracker blocking'],
  ['/allow-ads', 'Allow ads on this site'],
  ['/theme', 'Cycle appearance (system → light → dark)'],
];

/** One titled section of label/keys rows. */
function section(title, pairs) {
  const wrap = document.createElement('section');
  wrap.className = 'shortcut-section';
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = title;
  wrap.appendChild(heading);
  const list = document.createElement('div');
  list.className = 'shortcut-list';
  for (const [label, keys] of pairs) {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const name = document.createElement('span');
    name.textContent = label;
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    row.append(name, kbd);
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

(async () => {
  const rows = await window.bowserPages.shortcuts.list();
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push([row.label, row.keys]);
  }
  const root = document.getElementById('sections');
  for (const [title, pairs] of byCategory) root.appendChild(section(title, pairs));
  root.appendChild(section('Slash Commands', SLASH_COMMANDS.map(([cmd, hint]) => [hint, cmd])));
})();
```

- [ ] **Step 5: Append styles to `pages.css`:**

```css
/* --- Keyboard shortcuts page --- */

.shortcut-section { margin-top: 30px; }

.shortcut-list { display: flex; flex-direction: column; }

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.shortcut-row kbd {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2px 8px;
  white-space: nowrap;
}
```

- [ ] **Step 6: Reminder comment in `overlay.js`** — directly above the first slash-command entry (`{ cmd: '/favorites', ...`, ~line 403), add:

```js
    // Also listed on blanc://shortcuts/ — update SLASH_COMMANDS in
    // pages/shortcuts.js when adding or changing a command here.
```

- [ ] **Step 7: Syntax check**

Run: `node --check src/main/main.js && node --check src/main/pages.js && node --check src/renderer/pages/shortcuts.js && node --check src/renderer/overlay.js`
Expected: exit 0

- [ ] **Step 8: Manual smoke test** — `npm start`:
  - Help menu appears last in the menu bar; on macOS its search field finds "Keyboard Shortcuts".
  - Help → Keyboard Shortcuts (and `⌘/`) opens `blanc://shortcuts/`; invoking again refocuses the existing tab instead of opening a duplicate.
  - Sections: File, View, Tabs, Favorites, Help, Island, Slash Commands. One "Tab or Group 1–9" row; no hidden `⌘=` alias; the four ⌥⌘ arrow rows present; keystrokes right-aligned in capsules.
  - Toggle dark mode in Settings → Appearance and open the page in a private tab: tokens render correctly in both.

- [ ] **Step 9: Commit**

```bash
git add src/main/pages.js src/main/main.js src/renderer/pages/shortcuts.html src/renderer/pages/shortcuts.js src/renderer/pages/pages.css src/renderer/overlay.js
git commit -m "Add Help menu and blanc://shortcuts/ keyboard-shortcuts page"
```

---

## Final verification (whole feature)

- [ ] Run the full manual checklist from the spec's Testing section in one `npm start` session.
- [ ] `git log --oneline` shows the five task commits.
