# Move to Space follow-ups: New Space…, Open Link in Space, and selecting several tabs

**Date:** 2026-10-24 (revised the same day after review)
**Status:** proposed. Decisions D1–D10 (§7) are the owner's to make; nothing here is built.
**Builds on:** PR #1097, Move to Space ▸ in the tab menu (one tab at a time), for issue #1060.
**Issue:** #1060 asks to move "one or more" tabs to another space, and its title asks for the same from a link's right-click menu.

## 1. What this covers, and in what order

| PR | What | Size |
| --- | --- | --- |
| 0 | **Checked persistence for Move to Space** (§3). #1097 as written ignores the result of its record write and reports success. This must be fixed in #1097 before it merges, or as the first follow-up before anything below. | Small |
| 1 | **New Space…** at the bottom of Move to Space ▸: make a space and move the tab into it in one step (§4). | Small |
| 2 | **Open Link in Space ▸** in a page's link menu: send a link to another space without leaving this one (§5). | Small to medium |
| 3 | **Selecting several tabs** in the ⌘L panel and the side list, with a tab menu that acts on all of them (§6). | Large |

Dragging several tabs, Split View from a selection, and selection on the Island's tab dots are out of scope (§8).

## 2. Rules every part keeps (from PR #1097)

- A tab that moves, or a link that opens, in another space lands **last and ungrouped**, and is **not selected** there. This window stays in its space.
- A space is in at most one window. If the target space is shown in another window, that window receives the tab. If it's set aside, the tab joins it in the background. If it's open nowhere, Move to Space first sets it aside in memory to receive the live tab.
- **Never a private tab.** Private tabs get no space items and can't be part of a move.
- **Same profile only.** Spaces are profile-scoped, so the lists only ever show the window's own profile.
- Space names in menus are user data. The pseudo-locale sweep (`test/desktop/i18n-pseudo-sweep.mjs`) must skip them, either because they're radio items or because their item id marks them.
- Every move persists as §3 says.

## 3. Saving a move (PR 0, and every later move)

### 3.1 What #1097 does today, and why it's not enough

`moveTabToSpace` does four things, in this order:
1. detaches the tab from its window;
2. attaches it to the target space;
3. calls `namedWorkspaces.saveCapture`;
4. returns `true`, whatever `saveCapture` returned.

If the write fails (a full disk, an unreadable `workspaces.json`, a newer file format), the tab has already moved in memory while the record on disk doesn't list it. Nothing reports the failure. The tab now exists only in memory and in this window's next debounced `session.json` write, which no longer lists it. A crash before the target space's autosave succeeds loses the tab. The code comment claims "never lose it", but it doesn't hold.

Undoing the move after the fact isn't a good fix either. The in-memory move can have:
- closed Glance;
- changed the current tab;
- removed the tab from a split;
- pruned an emptied group.

Putting all of that back is error-prone.

### 3.2 The rule: write first, then move

A move of tabs T₁…Tₙ into space S runs in five steps. Only step 4 changes what anyone sees.

1. **Check.** Every tab passes `canMoveTabToSpace`. S exists, and S's owner (if any) isn't closing or mid-switch. The workspaces store is not `future-format`, `read-failed` or `repair-failed`.
2. **Prepare, invisibly.** If S is open nowhere, set it aside in memory from its record (`applyWorkspaceToWindow` into a new set-aside runtime). Nothing is written yet. Then compute the record S will hold after the move:
   - start from S's capture as it is now, without a blank start page that stands in for an empty space;
   - append T₁…Tₙ, using a pure `appendCaptureEntries(capture, entries)` in `workspaces-model.js`.

   Each entry carries the per-tab fields `captureWindowEntry` writes: URL, pinned, meta, local-file flag and document-policy mark. Its group is null. Its split is set only when §6.5 moves a whole split.
3. **Write, checked.** `saveCapture(S, next)` is synchronous and durable (`updateAndFlush`). If it fails:
   - dispose the runtime step 2 set aside, if any;
   - change nothing else;
   - return `{ ok: false, error }` with the store's error (`storage-failed`, `future-format`, `not-found`, …).

   Nothing has moved, so there is nothing to roll back.
4. **Move in memory.** This is one synchronous pass with no event-loop yield: detach from the source, attach to S, re-home listeners (`rehomeTab`), then broadcast both windows.
5. **This window's `session.json`** is written on its usual debounce. A crash between steps 3 and 5 restores the moved tabs in both places. That is a duplicate, never a loss. The "never lose it" claim holds only because step 3 is checked and comes before step 4.

**If step 4 throws partway.** Only a programming error can do this, but tests inject it on purpose:
- the tabs already re-homed stay in S, and the rest stay where they were;
- Blanc rewrites S's record from S's live tabs (a second, checked write), so disk matches memory;
- the result is `{ ok: false, error: 'moved-partly', moved: k, total: n }`.

If that rewrite also fails, S's record still lists every tab, so the unmoved ones are duplicated rather than lost. The error says so.

**How a failure is shown.** A native menu can't show an error. On any failure, Blanc opens the Spaces menu, which already shows storage errors in its `role="status"` feedback line, with **"Couldn't move {count, plural} to {space}."** followed by the store's reason (`ws.error.moveFailed`). The tabs stay where the person can see them.

### 3.3 How it's built and tested

- **Pure orchestrator:** the five steps live in `src/main/space-move.js`, with no `require('electron')`. It takes an injected adapter (`check`, `prepare`, `dispose`, `write`, `commitOne`, `rewrite`), the same pattern as `workspace-controller.js`. `main.js` supplies the adapter. Single moves (#1097), New Space… (§4), several tabs (§6) and Open Link in Space (§5, steps 2–3 only) all use it.
- **Unit tests that fail on purpose:**
  - The write fails: `commitOne` is never called, and the result carries the error.
  - The space was open nowhere and the write fails: `dispose` is called, and no runtime is left.
  - `commitOne` throws on the second of three tabs: the first stays moved, `rewrite` is called once, and the result is `moved-partly` with `moved: 1, total: 3`.
  - The rewrite fails too: the result says the record still lists all three.
- **Acceptance:** an env-gated test-hook seam (`failNextSpaceWrite(error)`, `failSpaceMoveAfter(n)`; installed only when `!app.isPackaged && BLANC_TEST === '1'`, like the rest of `test-hook.js`).
  - A failed write leaves the tab in this window, live and selected as before, and the Spaces menu shows the error.
  - A failure after the first tab leaves disk and memory agreeing on which tabs moved.

## 4. New Space… in Move to Space ▸

### 4.1 When the menu is enabled

#1097 enables Move to Space ▸ only when another space exists. With New Space…, *nowhere to go yet* and *this tab can't move* become separate conditions. The model takes three inputs:
- `canMoveToSpace`, the tab rule;
- `spaces`;
- `canCreateSpace`, which is false at 25 spaces (`MAX_WORKSPACES`).

| This tab can move | Another space exists | Room for a new space | Move to Space ▸ | Submenu |
| --- | --- | --- | --- | --- |
| No | any | any | disabled | — |
| Yes | yes | any | enabled | every space (this window's checked; choosing it does nothing), then separator, then New Space… (disabled when there's no room) |
| Yes | no | yes | **enabled** | this window's space (checked), then separator, then New Space… |
| Yes | no | no | disabled | — |

The common case of a window in its profile's only space is the third row. There, New Space… is reachable. Move to Space ▸ is still hidden until the profile has a space at all (D1).

### 4.2 What happens

1. Choosing **New Space…** opens the Spaces menu in its new-space editor: name, colour, symbol, with the same validation as typing a new space's name today. The menu hangs from the Island's space mark, as when the mark is clicked. If the Island is auto-hidden, it's revealed first, the same way.
2. The editor's start choice ("empty" or "this window's tabs") is replaced by one fixed line: **With this tab** and the tab's title (page data).
3. **Create** makes the space with the tab in it and moves the tab live. The new space is **not opened**: the window stays in its own space, and the menu closes.
4. Escape, clicking away, or closing the menu cancels. Nothing is created.

### 4.3 How

- **Main:** add `beginNewSpaceForTab(tabId)`. It calls `showOverlay('spaces', { purpose: { newSpaceTabId } })`, the same atomic purpose payload `beginNewGroup` uses, so the target survives the overlay's did-finish-load replay.
- **Bridge:** add a `browserAPI.createSpaceWithTab(name, identity, tabId)` member, with its `browser-api/contract.json` entry and regenerated vectors.
- **The steps, from §3.2:**
  - Step 1 adds `namedWorkspaces.validateCreate(name)`.
  - Step 3 is one checked write, `namedWorkspaces.create({ name, capture, color, symbol })`, whose capture already holds the tab. Creating the space and recording the tab are therefore a single write. If it fails, no space exists and the tab hasn't moved, so the editor stays open with the store's error and its input.
  - Step 4 moves the tab.
- **If step 4 throws:** the space exists. Blanc rewrites it from its live tabs (§3.2) and returns `saved-not-moved`. That is the only way this error can arise. The menu closes onto the list, which shows the new space and **"Saved {name}, but the tab couldn't move."** It does not invite a retry that can only fail with `duplicate-name`.
- **Renderer:** `workspace-ui.js` gains a `start: 'tab'` editor state with `fixedStart`, fed by the purpose payload.
- **Strings**, in six languages, acknowledged with `copy:ack`:
  - `tabMenu.newSpace`: "New Space…"
  - `ws.new.withTab`: "With this tab"
  - `ws.error.savedNotMoved`: "Saved {name}, but the tab couldn't move."

### 4.4 Tests

- **Model:** each row of the §4.1 table, including the case "only this window's space, New Space… enabled".
- **Runner:** the row dispatches `beginNewSpaceForTab`.
- **Orchestrator:** a failed create leaves no space and an unmoved tab, and a throw after create returns `saved-not-moved`.
- **Acceptance:**
  - In a profile whose only space is this window's, New Space… creates a space holding the tab, and the window stays.
  - Escape creates nothing.
  - A duplicate name keeps the editor open with its error.
  - A failed write (test seam) creates nothing and keeps the editor open.

## 5. Open Link in Space ▸

### 5.1 Where

The link section of the page context menu (`linkMenuItems` in `src/main/glance-open-link.js`), in this order:

1. Open Link in New Tab
2. Open Link in Glance
3. **Open Link in Space ▸**
4. Copy Link Address

The submenu lists every space in the profile **except this window's own**, since opening a link there is Open Link in New Tab. Each row is a plain item with the id `link-space:<id>`; the sweep's ignore rule gains that prefix. With D3, the submenu also ends with **New Space…** (§4, with "With this link" as the fixed start line). The §4.1 rule applies with "this tab can move" replaced by "this link can open". So in a profile whose only space is this window's, the item is enabled and holds just New Space….

The item is **hidden**:
- in a private tab;
- when the profile has no space;
- for a link that Open Link in New Tab refuses (`handOffToOs` targets such as `mailto:` and `tel:`, and `isForbiddenTopLevelUrl`).

### 5.2 What happens

| Target space | Result |
| --- | --- |
| Shown in another window | A background tab in that window, last, ungrouped. It loads now, exactly as Open Link in New Tab would in that window. |
| Set aside | A **quiet** tab added to it. The page isn't requested until the space is shown and the tab selected (D2). |
| Open nowhere | The link is **appended to the space's saved record** (§3.2 steps 2–3, without setting the space aside). Nothing is loaded. |

**Saving:**
- In the second and third rows the record write comes first and is checked. If it fails, nothing is added and the Spaces menu shows the error (§3.2).
- In the first row the tab opens there and then; the other window's autosave records it, as for any tab opened in that window.

A quiet tab is the recommended default (D2) for three reasons:
- A page in a set-aside space can't show a permission prompt and can't download: both are refused for set-aside spaces (`setHeldRequesterCheck`, `setDownloadRequesterCheck`). A page loading there could therefore fail with nobody seeing it.
- A quiet tab uses no memory and doesn't push other spaces out of the set-aside budget.
- The site isn't contacted until the person actually looks at the page.

**The cost:** no referrer is sent, and the page is fetched later. A link carrying a short-lived token (a one-time login link, say) may have expired by then. The same is true of any tab restored from a saved space today.

**Title:** the tab's title until it loads is the link's text (`params.linkText`, trimmed and capped like other titles), or else the URL.

**Inherited sandbox (document policy):** the new tab is ordinary and unmarked, the same as Open Link in New Tab from inside a sandboxed frame today. That is a known gap recorded in CLAUDE.md. Don't describe it as covered by the `inheritsDocumentPolicy` mark.

**Confirmation:** nothing visible changes in this window. The Spaces menu's tab count for the target updates, because it reads the saved record, and screen readers hear "Opened in {space}". Whether sighted users get a visual confirmation is D10.

### 5.3 How

- **Pure module:** `openLinkInSpace(opener, url, workspaceId, deps)` goes beside `openLinkInGlance`. It applies the same guards, then hands off to the §3 orchestrator: steps 2–3 with one appended entry, then, for a set-aside space only, `createTab(url, { asleep: true, title })` in that runtime as step 4.
- **Model:** the appending is `appendCaptureEntries` (§3.2). It appends to every parallel column (`urls`, `groupIds` → null, `pinned` → false, `meta`) and, when the record carries the `documentPolicy` stamp, adds an explicit `false`. Each column stays the length of `urls`.
- **Strings:**
  - `contextMenu.openLinkInSpace`: "Open Link in Space"
  - `ws.announce.openedIn`: "Opened in {space}"

### 5.4 Tests

- **Unit:**
  - `linkMenuItems`' order and its hidden cases.
  - `appendCaptureEntries` keeps the columns zipped, with and without the stamp.
  - A failed write adds nothing.
- **Acceptance**, one scenario for each row of the table in §5.2:
  - A space in another window loads the page there, and this window is unchanged.
  - A set-aside space gets a quiet tab, and the fixture server sees no request.
  - A space open nowhere: its saved record gains the URL, and no runtime is set aside.
- **Fault injection:** a failed write (test seam) leaves the record unchanged and opens the Spaces menu with the error.

## 6. Selecting several tabs

### 6.1 What can be selected

Selection works on the **rows the ⌘L panel and the side list draw**. A row is one ungrouped or grouped tab, or a **whole split**: `TabSections.rowsOf` draws a split's members as one row, and F53 keeps a split as one item. It doesn't apply to:
- the Island's tab dots (too small to aim at, and the pill shows one group);
- Quick Switcher results;
- group headers (a click there folds the group).

**Splits are always selected whole:**
- `selectedTabIds` holds either every member of a split or none of them. There is no partial split selection. Main enforces this: any member id it receives selects the whole split.
- In the ⌘L panel, a split row's disclosure can show its members as ordinary rows. ⌘-clicking one of those member rows selects the whole split. The split row and every member row then show as selected. A plain click on a member row still switches to that pane, as today.
- In the side list, a split row has no member rows. ⌘-clicking it selects the split.
- Ranges count rows, so a split counts as one.
- If a split forms or dissolves while any of its tabs is selected (Split with ▸, Remove from Split, a pane closing), the selection is cleared rather than guessed at.

The one-tab menu keeps #1097's behaviour: Move to Space ▸ on a single split member moves that pane alone and leaves the rest of the split.

### 6.2 Gestures

| Input | Effect |
| --- | --- |
| ⌘-click (Ctrl-click on Windows and Linux) | Adds or removes that row. The current tab doesn't change. |
| ⇧-click | Selects every row drawn between the anchor and the clicked row, across groups. Rows hidden in a collapsed group are skipped. |
| ⇧↑ / ⇧↓ on a focused row | Extends the selection by one row (side list roving focus; ⌘L rows reached with Tab, as in the drag spec). |
| Plain click | Switches tab and clears the selection, as today. |
| Escape | Clears the selection. In the ⌘L panel, a second Escape closes the panel. |

The anchor is the last row toggled, otherwise the current tab's row.

With D4 (recommended), the current tab's row is in the selection as soon as any other row is, which is how Chrome and most tab strips behave. ⌘-clicking two rows therefore selects three. If the current tab is in a split, that whole split is included.

There's no keyboard way to add a single row that isn't next to the selection in this version. The obvious chords are taken: ⌘Space and ⌃Space belong to Spotlight and input-source switching on macOS.

### 6.3 State

- **Main owns it.** It lives on the window runtime: `selectedTabIds`, kept in `tabOrder` order with whole splits, plus `selectionAnchorId`. Main stays the only writer, the same rule as `tabs` and `groups`.
- **Renderers ask; main answers.** A new `browserAPI.selectTab(tabId, mode)` member takes `mode` = `'toggle' | 'range' | 'extend-up' | 'extend-down' | 'clear'`. Main maps `tabId` to its row (a tab, or its whole split) and computes ranges from the drawn rows with `TabSections.rowsOf`, so the two surfaces can't disagree.
- **The payload carries it.** `tabs:updated` gains `selectedTabIds`. That field needs the matching `browser-api/contract.json` edit and new vectors.
- **Pure rules** go in `src/main/tab-selection.js` (no `require('electron')`, unit-tested): row mapping, toggle, range, extend, prune, and the split rules of §6.1.
- **When the selection ends or shrinks:**
  - A plain click, Escape, a space switch, or a split change involving a selected tab clears it.
  - A tab that closes, or moves to another window or space, leaves it.
  - After a menu action, §6.6 decides what stays selected.
- **It's never persisted, synced, or written to `session.json` or a space.**

### 6.4 Look and accessibility

- **Look:** selected rows take a tinted background, `--row-selected`. It's added to `styles.css` and `pages.css`, and to `tokens/tokens.json` with `tokens:build`. It must read as different from the current tab's row and reach 3:1 against the list in light, dark and private.
- **Accessible name:** each selected row's primary button adds ", selected" to its accessible name (`rail.state.selected`), the same way it already adds "quiet" and "private".
- **Announcements:** count changes go to the existing live regions (`#verticalTabsAnnouncer` in the side list, `#islandDragLive` in ⌘L), for example "3 tabs selected" and "Selection cleared". The count is in tabs, so a selected two-pane split counts as 2.

### 6.5 The menu for several tabs

- **Which tabs it acts on:**
  - Right-clicking a selected row opens the menu for the **whole selection**.
  - Right-clicking an unselected row replaces the selection with that row and opens the ordinary one-tab menu (an unselected split row in the side list still opens none, as today).
  - The resting pill's menu is always the current tab alone.
- **Header:** the menu opens with "{count} tabs" (`tabsMenu.header`), a native header on macOS 14 and later, otherwise a disabled label, as Split with ▸ does.
- **A separate builder:** `buildTabsContextMenu` goes beside `buildTabContextMenu` in `tab-context-menu-model.js`, so the one-tab menu stays as it is.

| Item | Rule | How it runs (§6.6) |
| --- | --- | --- |
| Move to Space ▸ | All to one space, New Space… included. Selected splits move whole, keeping their layout (the split record goes into the target's `splits`, and the capture's `splitIds` column carries it). | All or nothing |
| Move Tabs to New Window | Keeps order. Splits move whole. Under D7, allowed even when every tab of this window is selected. | All or nothing |
| Move to Group ▸ | All into one group, keeping order. A split joins as a whole. Remove from Group appears if any is grouped. New Group… binds the whole selection. | All or nothing |
| Pin Tabs / Unpin Tabs | Unpin when every selected tab is pinned, otherwise Pin. A split pins as a whole, as today. | All or nothing |
| Mute Tabs / Unmute Tabs | The same rule, by tab. | All or nothing |
| Copy Links | One per line, in order. Only http(s) and file links count; disabled when there are none. | One clipboard write |
| Close Tabs | One Recently closed entry for the set. Pinned tabs close too (D6). | See §6.6 |
| Reload Tabs | A quiet tab wakes instead, as Reload does. | Each tab on its own |
| Quiet Tabs | Each tab that passes the explicit-quiet rule. | Each tab on its own |

**Not offered for several tabs:** Copy Clean Link, Duplicate, Rename, Reset Title, the pinned-home items, Mute Site, Favorites, Start Page pin, Split with ▸, Glance, New Tab Below, New Tab, New Private Tab, Close Other Tabs, Close Tabs Above/Below, and Reopen Closed Tab.

**Moving every tab of a window (D7, recommended allowed):** this window keeps one blank start page, like a space saved empty, and stays in its space.

**Eligibility for moves:** each tab must pass `canMoveTabToSpace`'s per-tab rules (not private, capturing, popup-holding or mid-quiet). The window-only-tab rule is replaced by the D7 floor.

### 6.6 How each action runs, and what stays selected

Checking eligibility first doesn't make a sequence of operations atomic. Each action therefore belongs to one of three kinds.

**1. All or nothing, guaranteed.** Move to Space, Move Tabs to New Window, Move to Group, Pin/Unpin, Mute/Unmute.
- **Enabled only when every selected tab qualifies** (D5). An item whose rule refuses any selected tab is disabled, never partly applied.
- **Move to Space** follows §3.2. One checked write of the target record holds every member before anything moves. A failed write moves nothing. Only a programming error during the in-memory pass can leave some moved, and that is reported as `moved-partly` with disk and memory reconciled.
- **Move to Group, Pin/Unpin and Mute/Unmute** change memory only. A pure helper computes the full result first: the new `tabOrder`, groups, and pinned and muted flags. Main then applies it in one synchronous pass with no yield and broadcasts once. No step waits on or can be refused by a page.
- **Move Tabs to New Window** detaches the tabs, then opens the window adopting them (the existing Move Group to New Window path). If opening the window throws, the detached tabs go back into this window at their original places, in order. They're re-homed through `rehomeTab` and their group and split records are restored from the plan.
- **On success**, the selection clears. **On failure**, nothing changed, so the selection stays exactly as it was and the person can retry. The error shows in the Spaces menu for moves to a space, and is announced for the others.

**2. Each tab on its own.** Reload Tabs, Quiet Tabs.
- **Enabled when at least one selected tab qualifies.** The others are skipped.
- **Quieting is asynchronous** and a page can refuse it (the dirty probe, a `beforeunload` listener, a shared renderer). Each refusal affects only that tab.
- **Afterwards,** the selection becomes the tabs that weren't reloaded or quieted, so the person can see which ones stayed. The live region announces, for example, "Quieted 2 of 3 tabs."

**3. Close Tabs.**
- **Today's behaviour:** closing in Blanc doesn't run a page's leave-page prompt (`closeTab` calls `wc.close()` without `waitForBeforeUnload`), so no page can cancel a close. Close Tabs is one synchronous pass:
  - it records one batch entry first, as Close Other Tabs does;
  - it closes every selected tab;
  - it clears the selection.
- **If closing ever honours `beforeunload`:** a page whose prompt is cancelled stays open and stays selected. The others close, and the batch entry holds only the tabs that actually closed. This is specified now so that change has a defined outcome.
- **Splits:** a closed split is recorded as a split inside the batch entry, so ⌘⇧T restores it as a split. `buildBatchEntry` (`src/main/closed-tabs.js`) records plain tabs only today, unlike `buildSplitEntry`, so PR 3 extends it.

### 6.7 Dragging while several are selected

Dragging tabs as a group needs its own spec, because `tab-drag.js`'s source model is a single tab or a group. Until then, starting a drag on a selected row clears the selection and drags that row alone, so a drag never silently drops the other selected tabs.

### 6.8 Tests

**Unit:**
- `tab-selection.js`:
  - toggle, and range across groups, skipping collapsed groups;
  - extend and prune, and the current-tab rule (D4);
  - any split member id selects the whole split;
  - ranges count a split once;
  - a split change clears the selection.
- `buildTabsContextMenu`: each row of §6.5, including disabling an all-or-nothing item when one tab is refused.
- The runner's new ids.
- The `browser-api` check covers the bridge member and the payload field.
- **Failing after the first member**, one test per kind, each with an adapter that fails on the second of three tabs:
  - **Move to Space:** the in-memory pass throws on the second tab. Result: `moved-partly`, the record is rewritten, and the selection keeps the two unmoved tabs.
  - **Move to Space:** the write fails. Result: nothing moved, and the selection is unchanged.
  - **Move Tabs to New Window:** opening the window throws. Result: all three tabs are back in place, in order, with their group and split.
  - **Move to Group:** the plan is applied in one pass. No partial state can be observed between members (assert that a single broadcast happens).
  - **Quiet Tabs:** the second tab refuses. Result: the other two are quiet, and the selection is the second tab.
  - **Close Tabs, simulated cancellation** (future-proofing §6.6): the second tab's close is refused. Result: the batch entry holds tabs 1 and 3, and the selection is tab 2.

**Acceptance:**
- ⌘-click and ⇧-click give the same selection in the ⌘L panel and the side list.
- ⌘-clicking a split's member row selects the whole split.
- Right-clicking an unselected row replaces the selection.
- Move to Space with three selected tabs keeps their order, and the tabs stay live.
- Move to Space with a selected split keeps it a split in the target.
- A failed write (test seam) leaves everything selected and in place.
- Close Tabs makes one Recently closed entry, and ⌘⇧T restores all of them, splits as splits.
- Escape clears the selection.
- The selection never reaches `session.json`.

**Pseudo-locale sweep:** run it over the several-tabs menu.

## 7. Decisions for the owner

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Show Move to Space ▸ before the first space exists, with only New Space… inside? | **No.** Spaces stay out of sight until someone makes one, as the Island's space mark does. |
| D2 | A link opened into a set-aside space: quiet until looked at, or load now in the background? | **Quiet** (§5.2). |
| D3 | New Space… in Open Link in Space ▸ too? | **Yes**, once §4's editor exists; it costs one fixed start line. |
| D4 | Does the current tab join the selection once another row is selected? | **Yes**, the model people know from other browsers. |
| D5 | Placement actions on several tabs (§6.6, kind 1): disabled unless every tab qualifies, or applied to the tabs that can with a note on the rest? Reload and Quiet act per tab either way. | **Disabled unless every tab qualifies.** |
| D6 | Close Tabs with pinned tabs selected: close them, or skip them like Close Other Tabs? | **Close them.** Selecting them was an explicit choice. |
| D7 | Moving every tab of a window: allowed, leaving one blank start page, or disabled? | **Allowed.** |
| D8 | Add Move Group to Space ▸ to the group menu so a group moves with its name and colour? | **Yes.** Small; it mirrors Move Group to New Window, through the §3 orchestrator. |
| D9 | Split View from a selection of two to four tabs? | **A separate spec**, out of scope here. |
| D10 | Visual confirmation after Open Link in Space and Move to Space, beyond the screen-reader announcement? Blanc has no toast surface today; failures already open the Spaces menu (§3.2). | **None in v1.** Revisit if people report not knowing where the tab went. |

## 8. Out of scope

- Dragging several tabs at once (§6.7).
- Split View from a selection (D9).
- Selecting with the Island's tab dots.
- Selection on mobile. The future mobile apps would get their own parity entry; this is desktop-only (F41).
- Syncing or saving a selection.

## 9. Claims

Per `docs/marketing-claims.md`, nothing here may be described on the website, in release notes or in posts until a public release ships it and its evidence backs the claim. PR #1097's single-tab Move to Space is subject to the same rule.
