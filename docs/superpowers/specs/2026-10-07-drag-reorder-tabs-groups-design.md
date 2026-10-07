# Drag to reorder tabs and groups — vertical rail and expanded island

Status: design approved in conversation 2026-10-07; revised after written-spec review round 1.

## Goal

Let people drag tabs and tab groups into the order they want, with the same
gesture in the vertical tab rail and the expanded island (the ⌘L panel's
resting list). Today only the rail can reorder, and only inside one
`{groupId, pinned}` bucket; the island has no drag at all, and groups cannot
be reordered anywhere.

## Scope

In scope:

- Reorder a tab within its bucket (both surfaces).
- Move a tab between groups, or between a group and the loose section, by
  dropping it there (both surfaces).
- Add a tab to a group by dropping it on that group's header, including a
  collapsed group.
- Reorder whole groups by dragging a group header (both surfaces).
- A keyboard equivalent (⌥⇧↑ / ⌥⇧↓) on both surfaces.

Out of scope:

- Changing pinned state by dragging.
- Dragging the resting pill's tab dots.
- Dragging between windows.
- Hover-to-unfold a collapsed group mid-drag.
- New context-menu items (Move to Group stays as it is).

## 1. Model and API (main process)

### The rule

A drag may change a tab's **position** and its **group**, never its
**pinned** state. The drop target is always the bucket
`{target groupId, source.pinned}`:

- loose ↔ any group, and group ↔ group, for unpinned tabs;
- the standalone pinned section ↔ a group's leading pinned rows, for pinned
  tabs;
- unpinned tabs can never land among pinned ones and vice versa. Those gaps
  are not drop targets.

This mirrors what the tab context menu already allows (Move to Group works
for any tab, private tabs included), so a drag can do nothing the menu
cannot.

### `tabs:move(id, { groupId, beforeId })`

Replaces `tabs:reorder-within-bucket`.

- Pure policy: `moveTab(order, tabs, groups, id, target)` in
  `src/main/tab-order.js` (no `require('electron')`), returning
  `{ order, groupId }` or `null` for an invalid request.
- `groupId` is a group id or `null` (loose / standalone pinned).
- `beforeId` must be a member of the target bucket; `null` means the end of
  that bucket. When the target bucket is empty the tab is appended to
  `tabOrder`. Rendering already filters by group and puts a group's pinned
  members first (`clusterList`, both renderers), so only order relative to
  bucket members matters.
- Rejected: an unknown or foreign-window tab, `beforeId` or group, and a
  `beforeId` outside the target bucket.
- Self-target: `beforeId === id` is an accepted no-op **only** when
  `groupId` equals the tab's current group (the target bucket is the one the
  tab already occupies). When a group change is requested, the tab is not a
  member of the target bucket, so `beforeId === id` fails target-bucket
  validation and is rejected like any other wrong-bucket `beforeId`. The
  self-target check never runs before, or instead of, bucket validation.
- A group change goes through the same path as Move to Group, so
  `pruneEmptyGroups` dissolves a group whose last tab leaves. The target
  group's `collapsed` state is untouched.
- Returns a boolean. Broadcasts and rebuilds the menu only when the order or
  group actually changed.

### `groups:reorder(groupId, beforeGroupId | null)`

New. Moves one entry within `rt().groups`; `null` means the end. Same
runtime validation; unknown ids are rejected.

Session persistence, ⌘1–9, ⌥⌘↑/↓, the pill's dots and both surfaces derive
from `rt().groups`, so they follow with no further change. The standalone
pinned section stays first and the loose section stays last; groups reorder
only among themselves.

### Cleanup

- Remove the unused `browserAPI.reorderTab` member and its `tabs:reorder`
  handler. No renderer calls them. The internal `reorderTab()` function stays
  (tab duplication uses it).
- Update together: `src/main/preload.js`, `browser-api/contract.json`,
  `npm run browser-api:build` output (generated vectors, `.d.ts`, `.md`),
  `src/main/test-hook.js`, and `security/audit-surface-inventory.json`.

## 2. The shared drag controller

### `src/renderer/tab-drag.js`

A surface-agnostic controller loaded by both the chrome document (rail) and
the overlay (island). Added to the exact `blanc-chrome://` allowlist in
`src/main/chrome-protocol.js`. Each surface passes:

- the scrolling list element;
- row discovery: tab rows carry `data-tab-id` and `data-bucket`, group
  headers carry `data-group-id`;
- `onDrop(intent)`, where `intent` is either
  `{ kind: 'tab', id, groupId, beforeId }` or
  `{ kind: 'group', id, beforeGroupId }`.

The rail drops its HTML5 drag-and-drop code, including the `text/plain`
tab-id payload a web page could otherwise receive.

### Gesture

- Starts on primary-button `pointerdown` on a tab row or group header, after
  **4px** of movement. Below that the press stays a click, so row selection
  and header fold/unfold keep working.
- On start the list takes pointer capture. The source row dims in place, and
  a lifted copy follows the pointer on the vertical axis only.
- The drop position is a **hairline insertion line** (matching the rail's
  current indicator and the no-thick-focus-rings rule). Hovering the middle
  band of a group header shows a **header highlight**, meaning "join this
  group at the end".
- Gaps that violate the pinned rule show nothing, and releasing there
  cancels.
- Dragging a group header dims the whole group band. Only gaps between groups
  are valid targets.
- The list auto-scrolls near its top and bottom edges. Row rects are cached
  at drag start and refreshed on scroll.
- Escape, `pointercancel` or `lostpointercapture` cancel. The controller
  stops Escape's propagation while dragging, so the rail's own Escape handler
  (return focus to the active tab) does not also fire.
- Releasing outside the list (over page content, or outside the overlay's
  bounds) resolves to no target and cancels. Nothing is put on a
  `DataTransfer`, the clipboard or any other channel a page can read.

### Drop outcome

On drop the source row stays dimmed (the drag is "settling") until the IPC
promise settles:

- **Resolves `true`:** the deferred render (below) applies the broadcast
  order.
- **Resolves `false` (rejected or stale) or rejects (IPC error):** the
  source row is undimmed, the lifted copy and indicators are removed, the
  latest deferred payload (if any) is rendered, and the live region
  announces "Couldn't move *title*". The order is whatever main reports; the
  controller never applies an order of its own.

Every exit path (drop settled, cancel, error, `lostpointercapture`, the
source disappearing, `pagehide`) runs the same `endDrag()` teardown: release
capture, remove the lifted copy, dimming and indicators, stop auto-scroll,
flush the deferred render, and (overlay only) report drag-state `false`.

### Live re-renders during a drag

A `tabs:updated` broadcast can arrive mid-drag (title, favicon, loading,
blocker count, a new tab elsewhere) and would replace the captured source
row. Resting-list renders are therefore **deferred** while a drag is active
or settling:

- Each surface keeps only the latest payload. The other chrome (the pill,
  the rail's header) keeps rendering normally; only the draggable list is
  frozen.
- Row rects, the source row and the lifted copy stay valid for the whole
  drag because the list DOM does not change.
- If a deferred payload no longer contains the source tab (closed) or the
  source group (dissolved), the drag is cancelled immediately and that
  payload is rendered. A vanished *target* is left to main's validation,
  which takes the rejected-drop path above.
- In the island, anything that switches the list out of its resting mode
  (typing into the input, a notice row appearing) cancels the drag before
  rendering.
- `endDrag()` renders the latest deferred payload exactly once.

### Overlay focus guard (`overlay:drag-state`)

Main intercepts Escape for the overlay (`before-input-event`) and dismisses
panel/palette on overlay `blur`. While an island drag is active, those two
behaviours are suspended:

- **Sender.** Main accepts `overlay:drag-state` only when `event.sender` is
  the registered overlay `webContents` of the window runtime that sender
  belongs to. Messages from the chrome strip, a tab, a utility sheet, the
  permission or fill views, or another window's overlay are ignored and do
  not change any runtime's flag. The payload must be a boolean; anything
  else is ignored.
- **Effect while true.** Escape reaches the overlay so it can cancel the
  drag, and overlay `blur` is ignored, the same treatment a pending focus
  reclaim gets.
- **Reset to false** on: `hideOverlay` (any mode change away from
  panel/palette included), the overlay `webContents` being destroyed or its
  render process going away, the window runtime closing, and every renderer
  `endDrag()` path listed above.
- With the flag false, behaviour is exactly as today.

The rail runs in the chrome window's own `webContents`, which has no
blur-dismiss behaviour, so it needs no main-side flag.

### Per surface

- **Island:** dragging works only in the resting list (pinned, groups,
  loose). It is disabled while the list shows slash commands, Quick Switcher
  results or a notice row. The resting pill's dots are not draggable.
- **Rail:** keeps its "Moved *title*" live-region announcement and focus
  restore. A group change announces "Moved to *group*", and a group move
  announces "Moved group *name*".

### Keyboard

**⌥⇧↑ / ⌥⇧↓** acts on the focused rail row, or on the selected island row
while the island input is empty (so it never clashes with text selection).
Both surfaces send the same `tabs:move` / `groups:reorder` calls, computed
by one pure helper in `tab-drag.js` so the surfaces cannot disagree.

**Tab rows: precise boundary rule.** For a tab with pinned state *p*, the
*eligible buckets* in render order are:

1. the standalone pinned section, if *p* is pinned;
2. each **expanded** group's *p*-bucket, in group order, **including an
   empty one** (an expanded group whose members are all of the opposite
   pinned state still has a valid, visible slot: after its pins for an
   unpinned tab, before its unpinned members for a pinned tab);
3. the loose section, if *p* is unpinned (even when empty).

Collapsed groups are **skipped**: they have no visible tab slots. A
collapsed group can still be joined by dropping on its header or with Move
to Group. Buckets of the opposite pinned state are never eligible.

- ⌥⇧↓: if the tab is not last in its bucket, swap with the next member.
  Otherwise move to the **first** slot of the next eligible bucket.
- ⌥⇧↑: if the tab is not first in its bucket, swap with the previous
  member. Otherwise move to the **last** slot of the previous eligible
  bucket.
- At the first or last eligible slot: **stop**. No IPC is sent, and the live
  region announces "Already at the top" / "Already at the bottom".
- Focus (rail) or selection (island) follows the moved tab. Leaving a group
  announces "Moved to *group*" or "Moved out of *group*". If the source
  group dissolves, that is announced too.

**Group headers.** ⌥⇧↑/↓ moves the group one place among groups
(`groups:reorder`), whether collapsed or not, and stops at either end with
the same announcement. Focus or selection stays on the header.

## 3. Testing and acceptance

### Unit (`npm run test:unit`)

- `test/unit/tab-order.test.js`: table tests for `moveTab`.
  - Accepted: in-bucket reorder; loose → group, group → loose and
    group → group; a standalone pin ↔ a group's pinned rows; empty-bucket
    append (including an unpinned tab into a group holding only pins).
  - Rejected: unpinned→pinned and pinned→unpinned moves, a missing group, a
    wrong-bucket `beforeId`, a foreign window.
  - Self-target: `beforeId === id` with the current group is an accepted
    no-op. `beforeId === id` with a **different** group is rejected and
    leaves order and group unchanged.
  - `reorderGroup`: valid moves, `null` meaning the end, unknown ids.
- `test/unit/tab-drag.test.js`: the controller in a vm with fake rects and
  fake pointer events. It asserts the lift actually found its functions, so
  a rename cannot make it pass silently. Covers:
  - the 4px threshold (click vs drag);
  - gap → `{groupId, beforeId}` resolution, header hits, and invalid gaps or
    release outside the list resolving to cancel;
  - Escape (and that its propagation stops), `pointercancel` and
    `lostpointercapture`, each running the full `endDrag()` teardown;
  - auto-scroll near both edges, with rects refreshed after each scroll step
    so the resolved target matches the scrolled position;
  - drop outcomes: IPC resolving `true`, resolving `false` and rejecting.
    The last two restore the source row (undimmed, no lifted copy or
    indicators) and announce the failure;
  - deferred renders: payloads received mid-drag are not applied, only the
    latest is applied exactly once at `endDrag()`, and a payload missing
    the source tab or source group cancels the drag;
  - the keyboard helper: in-bucket swaps, crossing into the next or
    previous eligible bucket, **skipping a collapsed group**, entering an
    expanded group whose same-state bucket is empty, never entering an
    opposite-state bucket, and stopping (no intent) at both ends; group
    header moves and their end stops.
- Main overlay guard, alongside the existing focus-guard tests:
  - `overlay:drag-state` `true` from the window's registered overlay stops
    blur and Escape from closing the panel; `false` restores them;
  - **forged or wrong sender:** the same message from the chrome strip, a
    tab, a utility sheet, or another window's overlay changes no runtime's
    flag, and blur still dismisses; a non-boolean payload is ignored;
  - the flag resets on `hideOverlay`, overlay destruction or
    render-process-gone, and window close.

### Guards

`npm run browser-api:check`, `npm run lint`, `npm run substrate:check`, the
audit-surface inventory and the `blanc-chrome://` allowlist test.

### Acceptance (`spec/` and `test/desktop/`, real pointer events via `test/desktop/mouse-gestures.mjs`)

- `spec/features.md`: extend F3 (Tab groups) with drag moves and group
  reorder, F28 (Vertical tabs) with the shared gesture, and F2/F3 with the
  island drag.
- `spec/acceptance/vertical-tabs.feature`: rewrite "Drag reorder rejects
  cross-bucket drops" as a pin-crossing rejection.

Parity matrix: each row below is a scenario on **both** surfaces (rail and
island), so the two cannot drift.

| Behaviour | Rail | Island |
|---|---|---|
| Reorder within a group | ✓ | ✓ |
| Move a tab from one group to another | ✓ | ✓ |
| Move a grouped tab to the loose section | ✓ | ✓ |
| Move a loose tab into a group | ✓ | ✓ |
| Drop on a collapsed header: tab joins, group stays collapsed | ✓ | ✓ |
| Reorder groups; ⌘1 then targets the new first group | ✓ | ✓ |
| Source group dissolves when its last tab leaves | ✓ | ✓ |
| Pin-crossing drop is rejected | ✓ | ✓ |
| Keyboard ⌥⇧↓ across a group boundary, skipping a collapsed group | ✓ | ✓ |
| Drag out over page content cancels with no page effect (below) | ✓ | ✓ |
| Escape mid-drag keeps the panel open | n/a | ✓ |

**Drag out over page content.** The active tab loads a fixture page that
records `dragenter`, `dragover`, `drop` and `paste` events, plus any
navigation. The test drags a tab row out over the page area and releases it
there. Assertions:

- the page's URL and history length are unchanged (no navigation);
- the fixture recorded none of those events;
- the page's DOM and its recorded event data contain no tab id;
- tab order and groups are unchanged.

### Manual

- Relaunch `npm start` and verify in the app. Before/after crops of the
  island and the rail.
- Hand-check Win/Linux pointer capture in the next Windows VM validation,
  alongside the pending Glance divider check.
