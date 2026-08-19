# Right-click context menus — dock, pill, tab rows — design

Date: 2026-08-18
Status: designed; not yet implemented

## 1. Problem

Blanc has no right-click menu on three surfaces where users expect one:

- **The macOS Dock icon.** `applyDockAppIcon()` sets the Dock *icon* but never
  calls `app.dock.setMenu()`, so right-clicking the Dock tile shows only macOS's
  bare default (window list, Options, Show All Windows, Hide, Quit). Every
  mainstream browser adds **New Window** / **New Private Window** here.
- **The resting island pill.** `src/renderer/renderer.js` has zero contextmenu
  handling and no native menu is attached to the chrome window's `webContents`.
  Right-clicking the pill does nothing.
- **Tab rows in the expanded (⌘L) island.** `overlay.js` suppresses every
  right-click except on `#addressInput`, so right-clicking a `.island-row` is
  inert.

There is also a **second, coupled problem the menus let us fix.** Tab grouping is
done entirely inline on each row: a `row-grp` chip that, when clicked, expands
into a picker of `→ name` / `→ none` buttons plus a `new group…` text input. On a
row that already carries pin, glance, group, and close chips, this blows the
width budget — the title truncates and the group name itself truncates to "s…".
The inline grouping UI is the single worst offender for row clutter. A right-click
menu is the natural, uncluttered home for it.

**Scope.** Add the three native menus, and **relocate tab grouping off the row
into the menu**. Out of scope: a group-header context menu (headers, folded-group
stand-ins, and remote/synced rows deliberately stay inert), region-sensitive pill
menus (one unified menu only), and a back/forward history menu.

## 2. Decisions (resolved during brainstorming)

1. **Native OS menus** for the pill and tab rows — same `Menu.popup()` bridge
   Blanc already uses for the web page (`context-menu.js`) and address bar
   (`address-menu.js`). The Dock menu is macOS's own and is native by definition.
   No custom-drawn HTML menus.
2. **The pill gets one unified "this tab" menu** — no region-sensitivity. It is
   the same menu as a tab row, bound to the active tab.
3. **Optional items included:** Close Other Tabs, Move Tab to New Window,
   Open in Glance, Quiet This Tab Now. **Excluded:** group-header menu.
4. **Grouping moves entirely into the menu.** The `row-grp` chip and its inline
   picker are removed from the row; group membership remains visible through the
   panel's existing per-group headers.
5. **"New Group…" reuses the ⌘L command input** (`/group <name>`), bound to the
   right-clicked tab. No new dialog, no inline text field left on the row.

## 3. Architecture

Follows the existing native-menu split so there is one pattern, not a new one.
Pure model modules (no `require('electron')`) are unit-tested; a thin Electron
glue module wires them to `webContents` and pops the menu; menu clicks call
main-process functions directly through an injected `actions`/`deps` object to
avoid importing `main.js` (which would create a require cycle) — exactly as
`context-menu.js` and `address-menu.js` do today.

New files:

- **`src/main/tab-menu-model.js`** — pure. `buildTabMenu({ tab, groups,
  activeTabId, surface })` returns a template array of
  `{ id, label, accelerator?, enabled?, type?, submenu? }`. All
  which-items / enabled / toggle-label / visible logic lives here and is the
  unit-test surface.
- **`src/main/tab-menu.js`** — Electron glue. Exports `attachPillMenu(chromeWc,
  deps)`, `attachRowMenu(overlayWc, deps)`, and `runTabMenuItem(id, ctx)`
  (exported so the acceptance test-hook can drive the exact action path — a
  native `Menu.popup()` cannot be driven by Playwright, the same compromise
  `runAddressMenuItem` makes).
- **`src/main/dock-menu.js`** — `installDockMenu({ app, Menu, actions })`,
  macOS-only, calls `app.dock.setMenu(...)`. Pure template builder
  (`buildDockMenu()`) split out for unit testing.

No new IPC *namespaces*; one new `overlay:*` message for the New-Group flow (§5.3).

## 4. The shared tab menu

`buildTabMenu` produces this order. `surface` is `'pill'` or `'row'`. The pill's
tab is always `activeTabId`; a row's tab is the right-clicked one.

```
Copy Link                    enabled: tab.url is http(s)/file (not blanc://, not empty)
Copy Clean Link              visible only if cleanLink(url) !== url
──────
Reload                 ⌘R
Duplicate Tab
──────
Pin Tab / Unpin Tab          label from tab.pinned
Mute Tab / Unmute Tab        label from tab.muted (always available; muting a
                               silent tab pre-mutes future audio)
Save to Favorites /          label from tab.bookmarked; enabled: ^https?:// and
  Remove from Favorites        !tab.private (§8)
Move to Group          ▸     submenu, §4.1
──────
Open in Glance               surface==='row' && tab.id !== activeTabId
Quiet This Tab Now           surface==='row' && tab.id !== activeTabId
                               && !tab.capturing && !tab.asleep
──────
New Tab                ⌘T
New Private Tab        ⌘⇧N
──────
Close Other Tabs             enabled: >1 closable tab in this window
Move Tab to New Window       enabled: not the sole tab in this window (§6)
──────
Reopen Closed Tab      ⌘⇧T
Close Tab              ⌘W
```

The pill/row asymmetry is entirely a function of tab state (`Open in Glance` and
`Quiet This Tab Now` require a non-active tab, and the pill is always the active
tab), so it is expressed as visibility rules in the one model, not a second menu.
Accelerators mirror the real app-menu shortcuts so the menu teaches them; items
without a global accelerator (Duplicate, Pin, Mute) show none. Consecutive/leading
separators are collapsed by the model (same `sep()` discipline as
`context-menu.js`).

Capture note: the serialized projection exposes `tab.capture` (`{audio,video}`),
not `capturing`. The row menu is built in **main**, where the real tab record and
its `capturing` boolean are available, so `Quiet This Tab Now`'s guard reads the
authoritative record, not the projection.

### 4.1 "Move to Group ▸" submenu

Built in main from the authoritative `groups` list (not the renderer projection):

```
<group name>       type: radio, checked: tab.groupId === group.id     (one per group)
──────
Remove from Group  enabled: tab.groupId != null   → setTabGroup(tabId, null)
New Group…         → New-Group flow (§5.3)
```

Selecting an existing group calls `setTabGroup(tabId, group.id)`. When no groups
exist yet, the submenu is just `New Group…`.

## 5. Wiring the two chrome surfaces

A renderer `preventDefault()` on the `contextmenu` DOM event stops Chromium from
emitting the browser-process `context-menu` event, which is precisely how the
overlay suppresses stray native menus today. So enabling a menu means *not*
suppressing on that target and adding a matching main-side listener.

### 5.1 Tab rows (overlay `webContents`)

- **Renderer (`overlay.js`):** the existing suppression
  `if (!e.target.closest('#addressInput')) e.preventDefault();` also allows
  `.island-row[data-tab-id]`:
  `if (!e.target.closest('#addressInput') && !e.target.closest('.island-row[data-tab-id]')) e.preventDefault();`
  Remote/synced rows (`remoteTabRow`), the folded-group stand-in, and group
  headers carry no `data-tab-id`, so they remain suppressed and inert — the
  agreed scope, achieved for free.
- **Main (`tab-menu.js` → `attachRowMenu`):** a second `context-menu` listener on
  the overlay `webContents` (independent of the address-menu listener; the two
  are mutually exclusive by target). It reads the row's tab id with one awaited
  `executeJavaScript` round-trip that re-verifies via `document.elementFromPoint
  (params.x, params.y)` that the hit is inside a `.island-row[data-tab-id]` and
  returns its `data-tab-id` (mirroring `address-menu.js`'s field-read + hit-test).
  It then revalidates overlay liveness, builds the menu, and pops it anchored with
  `getOverlayBounds()` offset. It **arms the overlay blur-guard**
  (`acquireMenuGuard`/`releaseMenuGuard`) around `popup()` so opening the menu
  does not blur-dismiss the panel — same lifecycle discipline as the address menu,
  including releasing the guard on any synchronous/await failure.

### 5.2 The pill (chrome window `webContents`)

- **Renderer (`renderer.js`):** add a suppression listener that `preventDefault`s
  everywhere except inside `#islandPill`
  (`if (!e.target.closest('#islandPill')) e.preventDefault();`). Window controls
  and empty strip areas get no native menu.
- **Main (`tab-menu.js` → `attachPillMenu`):** a `context-menu` listener on the
  chrome window's `webContents`. Its coordinates are already window-relative (the
  chrome document is the window's own `webContents`, with tab views drawn over it
  below the strip), so `popup()` uses `params.x/params.y` directly — no overlay
  offset. The overlay panel is closed whenever the pill is visible, so **no
  blur-guard is needed.** A round-trip verifies the hit is within `#islandPill`
  before popping. The menu is built for the active tab.

### 5.3 New-Group flow (menu → command input)

`New Group…` cannot accept typed text inside a native menu, so it hands off to the
always-present ⌘L command input:

1. `runTabMenuItem('group-new', { tabId })` sends a new `overlay:*` message
   (e.g. `overlay:begin-group`) carrying `tabId`. If invoked from the pill, main
   opens the panel first (`showOverlay('panel')`), then sends it.
2. The overlay renderer, on that message: sets the command input value to
   `"/group "`, focuses it, places the caret at end, and stores a transient
   `pendingGroupTabId = tabId`.
3. The overlay's existing `/group <name>` handler, when `pendingGroupTabId` is
   set, calls `groupTabByName(pendingGroupTabId, name)` instead of the
   active-tab default, then clears `pendingGroupTabId`. Typed with no name, or
   dismissed (Escape / blur / command changed away from `/group`), it clears the
   pending target and does nothing — the normal `/group` behaviour is unchanged
   when no target is pending.

This reuses the `/group` code path end-to-end and leaves no inline input on the
row.

## 6. Move Tab to New Window (separable milestone)

The only item needing real cross-window plumbing. Tabs are process-wide records
keyed to a window by `runtimeId`; a new window is created by `openNewWindow(...)`,
and `createTab` already has an `adoptView` seam for re-parenting an existing
`WebContentsView`. The move:

1. Guard: disabled when the tab is the only tab in its window (moving it would
   empty the source window — a no-op).
2. `openNewWindow({ profileId })` for a new runtime; reassign the tab's
   `runtimeId`, detach its `WebContentsView` from the old window's `contentView`
   and attach to the new one (via the `adoptView` path), remove it from the old
   window's order and selection (select a neighbour there), and select it in the
   new window.
3. **Group handling: the tab is ungrouped on move** (`groupId` cleared). A group
   spanning two windows is not a modeled concept; dropping membership keeps the
   window/group model bounded. Pin and mute state travel with the tab.

Sequenced last so the Dock, pill, rows, grouping relocation, and every other menu
item ship even if the cross-window move surfaces deeper window-model constraints.
The menu item and its guard live in the shared model from the start; only its
`runTabMenuItem` action is deferred to this milestone.

## 7. Dock menu (macOS)

`installDockMenu` runs on macOS at startup (guarded like `applyDockAppIcon`'s
`platform === 'darwin' && app.dock`). App-authored items only:

```
New Window            → openNewWindow(...) + a new tab
New Private Window    → openNewWindow(...) + createTab(PRIVATE_NEW_TAB_URL, { private: true })
```

macOS supplies the window list (with the frontmost marker), Options ▸, Show All
Windows, Hide, and Quit. Clicks may fire with no window open (app resident in the
Dock); `openNewWindow` handles that. (Correction, found during planning: File →
New Window ⌘N already exists — `main.js:4738` — so the Dock items are the only
additions; no File-menu change.)

## 8. Edge cases the model encodes

- **Private tabs:** favicon is nulled but `url` is present; most actions valid.
  **Save to Favorites is disabled** — Favorites is a synced store and Blanc
  excludes private tabs from history and sync, so a menu action must not leak a
  private URL into it. (If the pill's own heart does not already gate on
  `tab.private`, close that gap in the same change.)
- **Quiet tabs:** `url` present, menu works; `Quiet This Tab Now` disabled
  (`tab.asleep`).
- **Internal `blanc://` pages:** Copy Link and Save to Favorites disabled.
- **Sole-tab window:** `Move Tab to New Window` disabled.
- **Close Other Tabs:** closes other **unpinned** tabs in the same window; pinned
  tabs survive (conventional). Recoverable through Reopen Closed Tab.
- **Remote / folded / header rows:** no `data-tab-id` → no menu.

## 9. Documentation and test impact

- **`CLAUDE.md` Tab-groups section** documents the now-removed inline picker (the
  `row-grp` chip, the `→ name`/`→ none` picker, the surviving `new group…`
  input, and "The picker's name field survives `tabs:updated` re-renders"). It
  must be rewritten to describe grouping via the context menu and the
  `/group`-command New-Group flow.
- **Existing coverage** that drives the inline picker (unit tests and any
  `spec/acceptance` scenario exercising the `row-grp` picker) is updated or
  removed alongside the row change.
- **No substrate/parity impact:** native-menu copy is not a generated substrate,
  and no token/settings/slash-command source changes. `/group`, `/ungroup`,
  `/close-group` slash commands are unchanged.

## 10. Testing

- `node --test` unit tests for `tab-menu-model.js` (tab-state fixtures →
  expected items, enabled flags, toggle labels, submenu contents, pill vs row
  visibility) and `dock-menu.js` (`buildDockMenu` template).
- Acceptance via the test-hook driving `runTabMenuItem(id, ctx)` for the key
  actions (close, pin, duplicate, group-move, new-group handoff), since the
  native popup itself is not Playwright-drivable.

## 11. Build order

1. **Dock menu** — `dock-menu.js` + File-menu New Window. Self-contained.
2. **Shared model** — `tab-menu-model.js` + unit tests (including the
   Move-to-New-Window item and its guard, action deferred).
3. **Pill wiring** — `attachPillMenu`, `renderer.js` suppression.
4. **Row wiring + grouping relocation** — `attachRowMenu`, overlay suppression
   relax, remove `row-grp` chip + inline picker, New-Group handoff
   (`overlay:begin-group` + `pendingGroupTabId`), `CLAUDE.md` + test updates.
5. **Move Tab to New Window** — the cross-window move action (§6).
