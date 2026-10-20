# Split View: 2–4 panes that stay open (F53)

**Date:** 2026-10-19
**Status:** draft for the owner's review. The owner decided D1–D4 on 2026-10-19 (§11). Revised the same day for a design review's four findings (header ownership, layout schema, Close Split in PR 1, the group rule). The owner chose chrome direction A and settled the remaining questions on 2026-10-19 (D5–D8, §11). PR 1's implementation plan is `docs/superpowers/plans/2026-10-19-split-view-pr1.md`.
**Builds on:** [Glance](2026-08-15-glance-design.md) (F34) and its [refinement](2026-10-15-glance-refinement-design.md): focused-pane commands (`glance-focus.js`), pane geometry (`glance-layout.js`), the reference header, the picker, and Glance's motion vocabulary.
**Reverses:** three of the Glance spec's non-goals: "more than two simultaneous page panes", "persisting … the Glance relationship" and "a general split-view workspace manager". Glance itself is unchanged. Split View is what Glance turns into when the person asks it to stay.
**Reference:** Arc's Split View: up to four tabs side by side, which stay together as one item in the sidebar and survive relaunch. Arc has been in maintenance mode since May 2025. This is the most-used Arc habit Blanc still lacks (2026-10-19 parity audit).

## 1. Problem

Glance shows one other tab beside the current one, for as long as the person is looking. That fits a quick reference. It doesn't fit work that keeps two to four pages side by side for hours or days: a doc beside its preview, a ticket beside the code review, four dashboards. Today that layout has to be rebuilt by hand after every switch, relaunch or Space change.

## 2. The model in one paragraph

A **split** is a small, named-by-its-tabs set of 2–4 ordinary tabs in one window that are shown together. It sits in the tab list as **one row**, the way a tab group's tabs stay real tabs underneath. Selecting the row (or any of its tabs) shows all its panes. Selecting anything else shows that tab full-window, and the split waits in the list until it is selected again. A split is saved with the window's session and with Spaces, like groups are. Glance stays exactly as it is, as the temporary, two-pane, main-plus-reference view; **Keep as split** in the Glance header turns the current Glance into a split.

## 3. Behavior contract

### 3.1 Making a split (D1)

- **From Glance:** the reference header gains **Keep as split**. It turns the main page and the reference into a two-pane split, in their current places and proportions. The panes become equals: no main or reference, no Make main.
- **From the tab menu:** **Split with ▸** lists this window's other tabs (the Glance picker, filtered to eligible tabs). Picking one makes a two-pane split of the right-clicked tab and the chosen tab, side by side.
- **Adding a pane:** while a split is showing, **Add to Split…** (pane header menu, the tab menu's **Add to Split**, `/split`) opens the same picker and adds the chosen tab as a new pane, up to four. With four panes the action is disabled, and its tooltip says why.
- **Eligible tabs:** any tab in the window that isn't already in a split, including private tabs (a private pane shows the private chip, as a private Glance reference does). A split never crosses windows or profiles.
- While a split is showing, **Open Glance** becomes **Add to Split…**. Glance and a visible split never coexist in one window.
- **Which group wins.** The initiating tab decides the split's group:
  - **Keep as split:** the Glance main page.
  - **Split with ▸:** the right-clicked tab.
  - **Add to Split:** the split itself.

  Every other tab moves into that group, or out of its group when the initiating tab is ungrouped. This holds for every combination: grouped plus ungrouped, two different groups, or the same group. A group that loses its last tab this way disappears, as any emptied group does (`pruneEmptyGroups`). The split's row takes the initiating tab's place in the display order.
- **Saying so.** When a tab will change groups, the picker row and the menu item carry an accessible description and a tooltip: "Moves {title} into {group}", or "Moves {title} out of {group}". After the split is made, a polite announcement repeats it. Removing the tab from the split later does not put it back in its old group (§3.5).

### 3.2 Layout (D3)

**Saved layout.** One of two shapes, normalized on every read and write:

```json
{ "kind": "columns", "widths": [0.5, 0.5] }
{ "kind": "grid", "column": 0.5, "row": 0.5 }
```

- **`columns`** is for 2 or 3 panes. `widths` has one fraction per pane, in pane order. Each fraction is at least 0.2, they sum to 1, and a malformed value resets to equal widths.
- **`grid`** is for exactly 4 panes, in reading order (top-left, top-right, bottom-left, bottom-right). It has **one shared vertical divider** (`column`, the left column's share) and **one shared horizontal divider** (`row`, the top row's share), each clamped to 0.25–0.75. Rows can't have different column splits; a 2×2 is a cross, as in Arc.
- **Changing the pane count** resets the shape to its default: equal columns, or a centered cross.

**What is drawn.** `split-layout.js` picks the first entry in this list that fits the page region, using the measured minimums. `paneMinWidth` is the pane header's compact width, measured as Glance measures its header (300 px default). `paneMinHeight` is the 30 px header plus 160 px of page.

| Panes | 1st choice | 2nd | 3rd |
|---|---|---|---|
| 2 | saved columns | two rows (equal heights) | focus only |
| 3 | saved columns | three rows (equal heights) | focus only |
| 4 | saved grid | four columns (equal widths) | four rows (equal heights), then focus only |

- **Fitting:** columns need `n × paneMinWidth + (n − 1) × divider` of width; rows need `n × paneMinHeight + (n − 1) × divider` of height; the grid needs both two columns and two rows to fit.
- **Focus only** always fits. The focused pane fills the page region, and every other pane shrinks to its header band, stacked above it. Clicking a header focuses that pane and swaps it in.
- **Fallbacks are presentation only.** Their dividers can be moved while they show, but nothing is saved. The saved layout returns as soon as it fits again.
- **Every divider** in the saved layout is pointer-resizable and keyboard accessible (arrow keys move it, a reset action restores the default), reusing Glance's divider behavior. Moving one updates the saved fractions.
- **Pane order:** a pane's position is its order in the split. Dragging a pane header onto another pane swaps them. *(Drag lands in PR 3, §10.)*

### 3.3 Chrome: one Island, a header band on every pane (D5)

- **The Island:** it stays the only floating pill, centered over the window's page region as usual. It always addresses the **focused pane**: its address, Back/Forward, shield, Favorite and the tab-scoped slash commands act on that pane, extending Glance's "commands follow the focused pane" rule (`commandTargetTab`) from two panes to four.
- **Who draws the headers.** Header bands are reserved in each pane's geometry, which is how stacked Glance already works. The page views stop short of the band, so the window's own chrome document (`index.html`, which lies under every page view and spans the whole window) is what shows through, and it paints the header and takes its clicks there. This holds in every position, including the bottom row of a grid and the focus-only bands.
  - No new `WebContentsView`s, so there is no new stacking, focus or Linux re-attach lifecycle (`tab-view-lifecycle.js` is untouched).
  - Hit-testing is plain DOM, because nothing covers a reserved band.
  - Every header, top row included, sits at the top of its own pane, below the strip, the way Glance's stacked header sits between views. The strip holds the Island alone. **Keep as split** therefore moves the Glance reference's identity from the strip into its pane's band, and the main page gains a band of its own.
  - Menus opened from a header are the native tab menu, or the overlay view (already stacked above every page view), never DOM drawn over a page view.
- **Pane headers:** every pane gets a slim header, Glance's reference header generalized. It holds:
  - the favicon and title
  - the focused cue (eyebrow and hairline brighten, never an outline)
  - **Back** and **Reload/Stop**
  - a menu with **Add to Split…**, **Remove from Split**, **Close Split** and the tab's own menu
- **Mockups:** the three directions the owner chose between are in [`docs/design-reviews/split-view-chrome-2026-10-19/mockups.html`](../../design-reviews/split-view-chrome-2026-10-19/mockups.html). Direction A is the source of truth for the chrome. Each later PR that adds visible chrome still mocks up its details first.
- **Island dots:** while a split is showing, the Island hides its tab dots, as it does in Glance. Tabs stay reachable from ⌘L, the rail and ⌘1–9.
- **Moving focus:**
  - Clicking into a pane focuses it.
  - `Cmd+Option+]` / `Cmd+Option+[` on macOS, `Ctrl+Alt+]` / `Ctrl+Alt+[` on Windows and Linux, move focus to the next / previous pane in pane order, wrapping (D6).
  - The newly focused pane's title is announced ("{title}, pane 2 of 3").

### 3.4 In the tab list (D4)

- **One row per split:** the ⌘L panel and the vertical rail show a split as one row with each pane's favicon and the titles joined ("Docs + Preview", or "Docs + 2 more"). Choosing the row shows the split and focuses the pane that was last focused.
- **Expanding the row:** a disclosure on the row lists the split's tabs. Picking one shows the split with that pane focused.
- **⌘1–9:** a split counts as one item, where its first tab would count.
- **Quick Switcher:** typing matches each pane's title and URL. A matching pane shows as a tab result marked with the split's name, and choosing it shows the split with that pane focused.
- **Groups:**
  - A split belongs to at most one group; all its tabs share that `groupId`.
  - Adding a tab from elsewhere moves it into the split's group, or out of a group if the split has none. The tab menu says so in the item's accessible description.
  - A split's row sits in the window's display order wherever its first tab sits, and its tabs stay contiguous (the existing `syncTabLayout` contiguity rule, extended).
- **Pinning:** a split can't hold a pinned tab. Pinning a pane removes it from the split first, dissolving the split if one pane would remain, then pins it (D7).

### 3.5 Leaving and dissolving

- **Remove from Split:** the tab leaves the split and stays open as an ordinary tab, placed directly below the split's row (D8), as Remove from Group lands a tab below its group. If one pane would remain, the split **dissolves** and both tabs become ordinary tabs in place.
- **Closing a pane's tab** (⌘W with that pane focused, or the tab menu): it closes like any tab, and the split re-lays-out, or dissolves at one pane.
- **Close Split:** closes all its tabs. It's recorded as **one** Recently closed entry that reopens the split whole (a new entry kind beside tab and group, §5).
- **Move Tab to New Window** on a pane removes it from the split first. Moving the whole split to another window is out of scope (§9).

### 3.6 Persistence (D2)

- **Session:** `session.json` v2 `windows[]` entries gain `splits: [{id, layout, focusedIndex}]`, with `layout` in the §3.2 shape, and a `splitIds` column parallel to `urls`, as `groups`/`groupIds` work. The five-key flat rollback mirror never carries them, so a rollback to an older build simply shows the tabs as ordinary tabs.
- **Spaces:** saved Spaces store the same two fields, flagged like `sectionOrder: true`; an entry without them restores as plain tabs.
- **Private panes are never saved** (F4). A split that would keep fewer than two saved panes is written as plain tabs.
- **Restore:** a split comes back as one row. If the selected item at restore is a split, all its panes wake; otherwise they stay quiet until it is shown (Quiet Tabs' born-quiet rule).
- **Not synced:** Profile Sync's open-tab snapshots list a split's tabs as plain tabs. Other devices see the tabs, not the layout.

## 4. Interactions with existing features

| Feature | Rule |
|---|---|
| Glance (F34) | Unchanged on its own. **Keep as split** converts it. While a split shows, Open Glance becomes Add to Split. |
| Quiet Tabs (F31) | Every visible pane is exempt (`visibleTabIds` grows to all visible panes). A hidden split's panes quiet normally. Showing a split wakes all of them. |
| Tab Archive (F52) | Split tabs are never archived: a split is organized, like a group. A split dissolving makes its tabs ordinary again. |
| Recently closed | Closing a pane records a tab entry. That entry reopens as an ordinary tab, not back into the split. Close Split records one split entry that reopens whole. Same tiers, holds and privacy rules as group entries. |
| Capture indicator, permission prompts, 1Password | Per pane, as Glance already does for two panes: a prompt or fill message belongs to the pane it's about. |
| Find in page, zoom, print | Follow the focused pane. |
| Pinned homes (F48) | Not applicable: a split holds no pinned tabs. |
| Custom tab names (F46) | A pane header and the split row use each tab's display title. |
| Window close / reopen (macOS) | The split survives in the session like the rest of the window. |

## 5. Data and code shape

- **Pure modules, no Electron imports, unit-tested:**
  - `src/main/split-model.js`: create, add, remove, dissolve and reorder; contiguity with `tabOrder` and groups; capture and restore shapes for the session and Spaces.
  - `src/main/split-layout.js`: N-pane geometry: the §3.2 layout schema and its normalization, header-band reservation for every pane, and the fallback table, built on `glance-layout.js`'s minimum measurement.
- **State:** each window runtime gains `splits` beside `groups`; each tab record gains `splitId` (null for most). `glanceTabId` remains for Glance alone. When a split is showing, the runtime's `visibleSplitId` names it.
- **Focus:** `glance-focus.js` generalizes `visiblePaneIds`, `focusedPane` and `commandTargetTab` from a fixed pair to an ordered list. Glance becomes the two-pane case.
- **Renderers** see a projection: split id, pane tab ids in order, the saved layout, the layout actually drawn (including any fallback) and the focused pane. The `tabs:updated` payload, `browser-api/contract.json` and the vectors change together (`browser-api:build`).
- **Recently closed:** `closed-tabs.js` gains `buildSplitEntry`, with the same snapshot sanitizing and caps as `buildGroupEntry`. Snapshots never cross IPC, disk or sync.
- **Copy:** every new string goes into `copy/messages/en.json` and all shipped languages in the same PR, with `copy:ack`. The user-facing words are **Split View**, **split**, **Keep as split**, **Add to Split…**, **Remove from Split** and **Close Split**.

## 6. Accessibility

- **Panes:** each pane is a region named "{title}, pane N of M".
- **The split row:** has the accessible name "Split: {titles}" and its own disclosure state.
- **Pane headers:** their controls are reachable by keyboard, in pane order.
- **Dividers:** keep Glance's separator role and keyboard contract.
- **Motion:** making, growing and dissolving a split uses Glance's motion vocabulary (6 px fade-slides, a cross-fade on swap). Under Reduce Motion, each is a 140 ms fade.

## 7. Security and privacy

- **No new web capability:** a pane is an ordinary tab view, with the same preloads, sandbox and session (private panes in the private session).
- **The split relationship** (ids, order, layout) is the only new persisted data. It names no URLs beyond those `session.json` and Spaces already hold.
- **Never in telemetry:** no new events.

## 8. Testing

- **Unit:** the split model (all transitions, contiguity, dissolve, and the group rule for grouped plus ungrouped, two different groups, the same group, and a group emptied by the move), split layout (the schema's normalization, and for 2, 3 and 4 panes every row of the §3.2 fallback table at its exact breakpoints), session and Spaces capture/restore (private panes dropped, under-two dissolves, older entries), Recently closed split entries, and focus targeting across four panes.
- **Acceptance** (`spec/acceptance/split-view.feature`, through `test-hook.js`):
  - Keep as split from Glance, including a main page and reference from different groups.
  - Add a third and a fourth pane.
  - The 2×2 layout.
  - Commands follow the focused pane.
  - Pane focus moves by keyboard.
  - The row in ⌘L and the rail.
  - Select away and back.
  - Remove and dissolve.
  - Close Split and reopen it whole.
  - Relaunch restores it.
  - A Space round trip keeps it.
  - Private panes are not saved.
  - Visible panes never go quiet.
  - Split tabs are never archived.
- **The drawing check:** each pane's visibility is verified by `npm run test:tab-view-drawing:desktop` on Linux and Windows, because Playwright's focus emulation hides drawing bugs.
- **Hand checks:** in a packaged build on macOS, plus Windows and Linux VM checks before the release that ships it, as for Glance.

## 9. Deliberately excluded

- **Free-form layouts** (any pane split left/right or top/bottom). D3 chose columns plus a 2×2 grid.
- **More than four panes.**
- **Moving a whole split to another window or profile**, or one split spanning windows.
- **Pinned splits**, or a pinned tab inside a split.
- **Syncing the layout** to other devices.
- **Mobile.** This is a desktop window-model capability (D11); phones are N/A.
- **Any automatic grouping or "smart" split suggestions.** Splits are user-directed only (`docs/marketing-claims.md`).

## 10. Delivery

Three PRs, each shippable on its own:

1. **Two-pane splits that stay:** the model and layout modules (the full §3.2 schema, exercised for two panes), Keep as split, Split with ▸ with the group rule, the split row in ⌘L and the rail, focus targeting for two panes, Remove and dissolve, **Close Split with its single Recently closed entry that reopens the split whole**, session and Spaces persistence, and the Quiet Tabs and Tab Archive rules.
2. **Up to four panes:** Add to Split, three columns, the 2×2 grid, every fallback in §3.2, and keyboard pane focus.
3. **Polish:** motion, pane-header drag to reorder, the Quick Switcher pane matches, the remaining Glance-spec corrections and docs.

Each PR starts from mockups where it adds visible chrome, and is checked in a packaged build before merge.

## 11. Decisions (owner, 2026-10-19)

- **D1:** Glance is the first step. It stays as today, and **Keep as split** turns it into a split that stays open and can grow to four panes.
- **D2:** Splits are saved like groups: in the session and in Spaces, restored on relaunch. Private tabs never take part in what's saved.
- **D3:** Two or three columns; four panes become a 2×2 grid. Narrow windows stack, as Glance does. Dividers are resizable.
- **D4:** A split is one row in the tab list, and its tabs stay real tabs underneath.
- **D5 (was Q1):** chrome direction A. One Island stays centered in the strip and always addresses the focused pane; every pane, top row included, has the same header band at its top. The owner chose it over B (the Island follows focus) and C (the Island carries the panes, with no headers). This costs one header band of page height per pane; nothing moves when focus moves, and every pane can be identified and closed in place.
- **D6 (was Q2):** pane focus cycles with `Cmd+Option+]` / `[` on macOS and `Ctrl+Alt+]` / `[` on Windows and Linux. Directional arrows were rejected: `Cmd+Option+←/→` is tab switching in Chrome and Safari, and some Windows graphics drivers rotate the screen on `Ctrl+Alt+Arrow`.
- **D7 (was Q3):** pinning a split tab removes it from the split first.
- **D8 (was Q4):** a tab leaving a split lands directly below the split's row.

## 12. Open questions

None. Q1–Q4 became D5–D8 on 2026-10-19.

## 13. Obligations elsewhere

- `spec/`: add **F53 Split View** to `features.md` and `parity-matrix.md` (desktop PLANNED; iOS and Android N/A, D11), plus `spec/acceptance/split-view.feature`, in a paired commit. Amend F34's text where it says Glance is the only multi-pane surface.
- `CLAUDE.md` (Architecture → Glance) gets a short Split View paragraph when PR 1 lands.
- No website, roadmap or social claim until a public release ships it. Any Arc comparison must be release-backed and sourced (`docs/marketing-claims.md`).
- What's New: the release that ships it drafts its page with `npm run site:whats-new`; the owner signs off on the text and media.
