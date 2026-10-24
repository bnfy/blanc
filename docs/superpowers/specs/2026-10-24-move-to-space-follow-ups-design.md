# Move to Space follow-ups: New Space…, Open Link in Space, and selecting several tabs

**Date:** 2026-10-24
**Status:** proposed. Decisions D1–D10 (§6) are the owner's to make; nothing here is built.
**Builds on:** PR #1097, Move to Space ▸ in the tab menu (one tab at a time), for issue #1060.
**Issue:** #1060 asks to move "one or more" tabs to another space, and its title asks for the same from a link's right-click menu.

## 1. What this covers, and in what order

Three additions, each shipped in its own PR, smallest first:

1. **New Space…** at the bottom of Move to Space ▸: make a space and move the tab into it in one step (§3). Small. It reuses the Spaces menu's existing new-space editor.
2. **Open Link in Space ▸** in a page's link menu: send a link to another space without leaving this one (§4). Small to medium. It needs a way to add a tab to a space without loading it.
3. **Selecting several tabs** in the ⌘L panel and the side list, with a tab menu that acts on all of them, Move to Space ▸ included (§5). Large. It adds selection state to main, two surfaces and a second menu.

Dragging several tabs, Split View from a selection, and selection on the Island's tab dots are out of scope (§7).

## 2. Rules every part keeps (from PR #1097)

- A tab that moves, or a link that opens, in another space lands **last and ungrouped**, and is **not selected** there. This window stays in its space.
- A space is in at most one window. If the target space is shown in another window, that window receives the tab. If it's set aside, the tab joins it in the background. If it's open nowhere, Move to Space sets it aside to receive the live tab.
- **Never a private tab.** Private tabs get no space items and can't be part of a move.
- **Same profile only.** Spaces are profile-scoped, so the lists only ever show the window's own profile.
- The target space's saved record is written at once (`saveCapture`). This window's `session.json` follows on its usual debounce, so a crash in between can duplicate a page but never lose it.
- Space names in menus are user data. The pseudo-locale sweep (`test/desktop/i18n-pseudo-sweep.mjs`) must skip them, either because they're radio items or because their item id marks them.

## 3. New Space… in Move to Space ▸

### 3.1 Where

The last row of Move to Space ▸, under a separator: **New Space…**. It sits under the space list the way New Group… sits under Move to Group ▸. Move to Space ▸ is still hidden until the profile has a space (D1).

### 3.2 What happens

1. Choosing it opens the **Spaces menu** in its new-space editor: name, colour, symbol, with the same validation as typing a new space's name today. The menu hangs from the Island's space mark, as when the mark is clicked. If the Island is auto-hidden, it's revealed first, the same way.
2. The editor's start choice ("empty" or "this window's tabs") is replaced by one fixed line: **With this tab** and the tab's title (page data).
3. **Create** makes the space and moves the tab into it, live, exactly as Move to Space does. The new space is **not opened**: the window stays in its own space, and the menu closes.
4. Escape, clicking away, or closing the menu cancels. Nothing is created.

The row is disabled when the profile already has 25 spaces (`MAX_WORKSPACES`). Native menus can't show a tooltip, so this case gets no explanation. The whole Move to Space ▸ item is already disabled for a window's only tab and for the other refused cases from #1097.

### 3.3 How

- **Main:** add `beginNewSpaceForTab(tabId)`. It calls `showOverlay('spaces', { purpose: { newSpaceTabId } })`, the same atomic purpose payload `beginNewGroup` uses, so the target survives the overlay's did-finish-load replay. Main validates the tab when the editor opens, and again when Create is pressed.
- **Bridge:** add a `browserAPI.createSpaceWithTab(name, identity, tabId)` member, with its `browser-api/contract.json` entry and regenerated vectors. Main checks, in order:
  1. `canMoveTabToSpace`;
  2. `namedWorkspaces.validateCreate(name)`;
  3. creates the record with an empty capture;
  4. runs the move.

  Validation happens before the record exists, so the only failure left after creation is storage. That returns the existing `saved-not-opened`-style truthful error (`saved-not-moved`). The editor then shows the saved space in the list instead of inviting a retry that can only fail with `duplicate-name`.
- **Renderer:** `workspace-ui.js` gains a `start: 'tab'` editor state with `fixedStart`, fed by the purpose payload.
- **Strings:**
  - `tabMenu.newSpace`: "New Space…"
  - `ws.new.withTab`: "With this tab"
  - `ws.error.savedNotMoved`: "Saved {name}, but the tab couldn't move."

  All in six languages, acknowledged with `copy:ack`.

### 3.4 Tests

- **Model unit test:** the row's place, and its disabled state at 25 spaces.
- **Runner unit test:** the row dispatches `beginNewSpaceForTab`.
- **Acceptance:**
  - Create from the tab menu moves the tab, and the window stays in its space.
  - Escape creates nothing.
  - A duplicate name keeps the editor open with its error.

## 4. Open Link in Space ▸

### 4.1 Where

The link section of the page context menu (`linkMenuItems` in `src/main/glance-open-link.js`), in this order:

1. Open Link in New Tab
2. Open Link in Glance
3. **Open Link in Space ▸**
4. Copy Link Address

The submenu lists every space in the profile **except this window's own**, since opening a link there is Open Link in New Tab. Each row is a plain item with the id `link-space:<id>`; the sweep's ignore rule gains that prefix. With D3, the submenu also ends with **New Space…** (§3, with "With this link" as the fixed start line).

The item is **hidden**:
- in a private tab;
- when the profile has no other space;
- for a link that Open Link in New Tab refuses (`handOffToOs` targets such as `mailto:` and `tel:`, and `isForbiddenTopLevelUrl`).

### 4.2 What happens

| Target space | Result |
| --- | --- |
| Shown in another window | A background tab in that window, last, ungrouped. It loads now, exactly as Open Link in New Tab would in that window. |
| Set aside | A **quiet** tab added to it. The page isn't requested until the space is shown and the tab selected (D2). |
| Open nowhere | The link is **appended to the space's saved record**. Nothing is loaded, and the space isn't set aside. |

A quiet tab is the recommended default (D2) for three reasons:
- A page in a set-aside space can't show a permission prompt and can't download: both are refused for set-aside spaces (`setHeldRequesterCheck`, `setDownloadRequesterCheck`). A page loading there could therefore fail with nobody seeing it.
- A quiet tab uses no memory and doesn't push other spaces out of the set-aside budget.
- The site isn't contacted until the person actually looks at the page.

**The cost:** no referrer is sent, and the page is fetched later. A link carrying a short-lived token (a one-time login link, say) may have expired by then. The same is true of any tab restored from a saved space today.

**Title:** the tab's title until it loads is the link's text (`params.linkText`, trimmed and capped like other titles), or else the URL.

**Inherited sandbox (document policy):** the new tab is ordinary and unmarked, the same as Open Link in New Tab from inside a sandboxed frame today. That is a known gap recorded in CLAUDE.md. Don't describe it as covered by the `inheritsDocumentPolicy` mark.

**Confirmation:** nothing visible changes in this window. The Spaces menu's tab count for the target updates, because it reads the saved record, and screen readers hear "Opened in {space}". Whether sighted users get a visual confirmation is D10.

### 4.3 How

- **Pure module:** `openLinkInSpace(opener, url, workspaceId, deps)` goes beside `openLinkInGlance`. It applies the same guards, then calls main's `addUrlToSpace(workspaceId, url, { title })`, which branches on the space's owner.
- **Model:** `appendTab(record, { url, title })` goes in `src/main/workspaces-model.js` (pure, unit-tested). It appends to every parallel column (`urls`, `groupIds` → null, `pinned` → false, `meta`) and, when the record carries the `documentPolicy` stamp, adds an explicit `false`. Each column stays the length of `urls`.
- **Main:** for a set-aside space, `createTab(url, { asleep: true, title })` inside that runtime, then `saveCapture`. For a space open nowhere, `appendTab` through `namedWorkspaces`, with one durable write, and `broadcastWorkspacesUpdated()`.
- **Strings:**
  - `contextMenu.openLinkInSpace`: "Open Link in Space"
  - `ws.announce.openedIn`: "Opened in {space}"

### 4.4 Tests

- **Unit:**
  - `linkMenuItems`' order, and the hidden cases (private tab, no other space, `mailto:`).
  - `appendTab` keeps the columns zipped, with and without the stamp.
- **Acceptance**, one scenario for each row of the table in §4.2:
  - A space in another window loads the page there, and this window is unchanged.
  - A set-aside space gets a quiet tab, and the fixture server sees no request.
  - A space open nowhere: its saved record gains the URL, and no runtime is set aside.

## 5. Selecting several tabs

### 5.1 Where and how

Selection works on **tab rows in the ⌘L panel and the side list**. It doesn't apply to:
- the Island's tab dots (too small to aim at, and the pill shows one group);
- Quick Switcher results;
- group headers (a click there folds the group).

| Input | Effect |
| --- | --- |
| ⌘-click (Ctrl-click on Windows and Linux) | Adds or removes that row. The current tab doesn't change. |
| ⇧-click | Selects every row drawn between the anchor and the clicked row, across groups. Rows hidden in a collapsed group are skipped. |
| ⇧↑ / ⇧↓ on a focused row | Extends the selection by one row (side list roving focus; ⌘L rows reached with Tab, as in the drag spec). |
| Plain click | Switches tab and clears the selection, as today. |
| Escape | Clears the selection. In the ⌘L panel, a second Escape closes the panel. |

The anchor is the last row toggled, otherwise the current tab.

With D4 (recommended), the current tab is in the selection as soon as any other row is, which is how Chrome and most tab strips behave. ⌘-clicking two rows therefore selects three tabs.

There's no keyboard way to add a single row that isn't next to the selection in this version. The obvious chords are taken: ⌘Space and ⌃Space belong to Spotlight and input-source switching on macOS.

### 5.2 State

- **Main owns it.** It lives on the window runtime: `selectedTabIds`, kept in `tabOrder` order, plus `selectionAnchorId`. Main stays the only writer, the same rule as `tabs` and `groups`.
- **Renderers ask; main answers.** A new `browserAPI.selectTab(tabId, mode)` member takes `mode` = `'toggle' | 'range' | 'extend-up' | 'extend-down' | 'clear'`. Main computes ranges from the drawn order with `TabSections`, so the two surfaces can't disagree.
- **The payload carries it.** `tabs:updated` gains `selectedTabIds`. That field needs the matching `browser-api/contract.json` edit and new vectors.
- **Pure rules** go in `src/main/tab-selection.js` (no `require('electron')`, unit-tested): toggle, range, extend, and prune.
- **When the selection ends:**
  - A plain click, Escape, or any menu action run on it clears it (acting consumes the selection).
  - A tab that closes, or moves to another window or space, leaves it.
  - A space switch clears it.
- **It's never persisted, synced, or written to `session.json` or a space.**

### 5.3 Look and accessibility

- **Look:** selected rows take a tinted background, `--row-selected`. It's added to `styles.css` and `pages.css`, and to `tokens/tokens.json` with `tokens:build`. It must read as different from the current tab's row and reach 3:1 against the list in light, dark and private.
- **Accessible name:** each selected row's primary button adds ", selected" to its accessible name (`rail.state.selected`), the same way it already adds "quiet" and "private".
- **Announcements:** count changes go to the existing live regions (`#verticalTabsAnnouncer` in the side list, `#islandDragLive` in ⌘L), for example "3 tabs selected" and "Selection cleared".

### 5.4 The menu for several tabs

- **Which tabs it acts on:**
  - Right-clicking a selected row opens the menu for the **whole selection**.
  - Right-clicking an unselected row replaces the selection with that row and opens the ordinary one-tab menu.
  - The resting pill's menu is always the current tab alone.
- **Header:** the menu opens with "{count} tabs" (`tabsMenu.header`), a native header on macOS 14 and later, otherwise a disabled label, as Split with ▸ does.
- **A separate builder:** `buildTabsContextMenu` goes beside `buildTabContextMenu` in `tab-context-menu-model.js`, so the one-tab menu stays as it is.

| Item | Rule |
| --- | --- |
| Move to Group ▸ | All into one group, keeping their order. Remove from Group appears if any of them is grouped. New Group… binds every selected tab. |
| Move to Space ▸ | All to one space (§5.5), New Space… included. |
| Pin Tabs / Unpin Tabs | Unpin when every selected tab is pinned, otherwise Pin. |
| Mute Tabs / Unmute Tabs | The same rule, by tab. |
| Reload Tabs | A quiet tab wakes instead, as Reload does. |
| Quiet Tabs | Only when every selected tab passes the explicit-quiet rule. |
| Copy Links | One per line, in order. Only http(s) and file links count; disabled when there are none. |
| Move Tabs to New Window | Keeps order. Under D7, allowed even when every tab of this window is selected. |
| Close Tabs | One Recently closed entry for the set (the batch entry Close Other Tabs uses). Pinned tabs close too (D6). |

**Not offered for several tabs:** Copy Clean Link, Duplicate, Rename, Reset Title, the pinned-home items, Mute Site, Favorites, Start Page pin, Split with ▸, Glance, New Tab Below, New Tab, New Private Tab, Close Other Tabs, Close Tabs Above/Below, and Reopen Closed Tab.

**All or nothing (D5):** an item whose rule refuses any selected tab is **disabled**, never partly applied. For example, Move to Space ▸ is disabled when a private tab is in the selection. A partial move would leave the person hunting for the tabs that stayed behind.

### 5.5 Moving several tabs to a space

- **Order and grouping:** the tabs keep their relative order and land last and ungrouped, in one move. That means one target-record write and one session write.
- **A whole group** keeps its name and colour only through the group menu's **Move Group to Space ▸** (D8), which mirrors Move Group to New Window. A selection always lands ungrouped, even when it happens to be a whole group.
- **Splits:**
  - A selected tab whose split partner isn't selected leaves its split, as in #1097.
  - A fully selected split also dissolves in this version. Keeping it whole is a later refinement.
- **Every tab of the window (D7, recommended allowed):** this window keeps one blank start page, like a space saved empty, and stays in its space. That space then holds only the start page, which is what the person asked for.
- **Eligibility:** each tab must pass `canMoveTabToSpace`'s per-tab rules (not private, capturing, popup-holding or mid-quiet). The window-only-tab rule is replaced by the D7 floor.

### 5.6 Dragging while several are selected

Dragging tabs as a group needs its own spec, because `tab-drag.js`'s source model is a single tab or a group. Until then, starting a drag on a selected row clears the selection and drags that row alone, so a drag never silently drops the other selected tabs.

### 5.7 Tests

- **Unit:**
  - `tab-selection.js`: toggle, range across groups, skipping collapsed groups, extend, prune, and the current-tab rule (D4).
  - `buildTabsContextMenu`: each row of §5.4, including the all-or-nothing disabling.
  - The runner's new ids.
  - The `browser-api` check covers the bridge member and the payload field.
- **Acceptance:**
  - ⌘-click and ⇧-click give the same selection in the ⌘L panel and the side list.
  - Right-clicking an unselected row replaces the selection.
  - Move to Space with three selected tabs keeps their order, and the tabs stay live.
  - Close Tabs makes one Recently closed entry, and ⌘⇧T restores all of them.
  - Escape clears the selection.
  - The selection never reaches `session.json`.
- **Pseudo-locale sweep:** run it over the several-tabs menu.

## 6. Decisions for the owner

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Show Move to Space ▸ before the first space exists, with only New Space… inside? | **No.** Spaces stay out of sight until someone makes one, as the Island's space mark does. |
| D2 | A link opened into a set-aside space: quiet until looked at, or load now in the background? | **Quiet** (§4.2). |
| D3 | New Space… in Open Link in Space ▸ too? | **Yes**, once §3's editor exists; it costs one fixed start line. |
| D4 | Does the current tab join the selection once another row is selected? | **Yes**, the model people know from other browsers. |
| D5 | Actions on several tabs: all or nothing, or apply to the tabs that can and say how many couldn't? | **All or nothing.** |
| D6 | Close Tabs with pinned tabs selected: close them, or skip them like Close Other Tabs? | **Close them.** Selecting them was an explicit choice. |
| D7 | Moving every tab of a window: allowed, leaving one blank start page, or disabled? | **Allowed.** |
| D8 | Add Move Group to Space ▸ to the group menu so a group moves with its name and colour? | **Yes.** Small; it mirrors Move Group to New Window. |
| D9 | Split View from a selection of two to four tabs? | **A separate spec**, out of scope here. |
| D10 | Visual confirmation after Open Link in Space and Move to Space, beyond the screen-reader announcement? Blanc has no toast surface today. | **None in v1.** Revisit if people report not knowing where the tab went. |

## 7. Out of scope

- Dragging several tabs at once (§5.6).
- Split View from a selection (D9).
- Selecting with the Island's tab dots.
- Selection on mobile. The future mobile apps would get their own parity entry; this is desktop-only (F41).
- Syncing or saving a selection.

## 8. Claims

Per `docs/marketing-claims.md`, nothing here may be described on the website, in release notes or in posts until a public release ships it and its evidence backs the claim. PR #1097's single-tab Move to Space is subject to the same rule.
