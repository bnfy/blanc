# Drag to reorder tabs and groups — vertical rail and expanded island

Status: design approved in conversation 2026-10-07; awaiting written-spec review.

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
  `beforeId` outside the target bucket. `beforeId === id` is an accepted
  no-op.
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
- Escape, `pointercancel` or `lostpointercapture` cancel. On drop, the source
  row stays dimmed until the IPC resolves; the `tabs:updated` broadcast then
  re-renders the list, so nothing snaps back first.

### Overlay focus guard

Main intercepts Escape for the overlay (`before-input-event`) and dismisses
panel/palette on overlay `blur`. While a drag is active the overlay reports
`overlay:drag-state` (`true` / `false`). While it is true, main lets Escape
reach the overlay so it can cancel the drag, and it ignores overlay blur, the
same treatment a pending focus reclaim gets. The flag resets whenever the
overlay hides. With the flag false, nothing changes.

### Per surface

- **Island:** dragging works only in the resting list (pinned, groups,
  loose). It is disabled while the list shows slash commands, Quick Switcher
  results or a notice row. The resting pill's dots are not draggable.
- **Rail:** keeps its "Moved *title*" live-region announcement and focus
  restore. A group change announces "Moved to *group*", and a group move
  announces "Moved group *name*".

### Keyboard

- **⌥⇧↑ / ⌥⇧↓** moves the focused rail row, or the selected island row while
  the island input is empty (so it never clashes with text selection), one
  visible step.
- At a group's edge the tab steps into the adjacent bucket of the same pinned
  state, exactly as a drag would. On a group header the keys move the whole
  group.
- Both surfaces send the same `tabs:move` / `groups:reorder` calls.

## 3. Testing and acceptance

### Unit (`npm run test:unit`)

- `test/unit/tab-order.test.js`: table tests for `moveTab`. Covers in-bucket
  reorder; loose → group, group → loose and group → group; a standalone pin ↔
  a group's pinned rows; rejection of unpinned→pinned and pinned→unpinned
  moves, a missing group, a wrong-bucket `beforeId` and a foreign window;
  self-target no-op; empty-bucket append. Covers `reorderGroup` valid moves,
  `null` end and unknown ids.
- `test/unit/tab-drag.test.js`: the controller in a vm with fake rects.
  Covers the 4px threshold, gap → `{groupId, beforeId}` resolution, header
  hits, invalid gaps resolving to cancel, and Escape / `pointercancel`. It
  asserts the lift actually found its functions, so a rename cannot make it
  pass silently.
- Main overlay guard: `overlay:drag-state` stops blur and Escape from
  closing the panel only while it is true, and it resets on hide.

### Guards

`npm run browser-api:check`, `npm run lint`, `npm run substrate:check`, the
audit-surface inventory and the `blanc-chrome://` allowlist test.

### Acceptance (`spec/` and `test/desktop/`, real pointer events via `test/desktop/mouse-gestures.mjs`)

- `spec/features.md`: extend F3 (Tab groups) with drag moves and group
  reorder, F28 (Vertical tabs) with the shared gesture, and F2/F3 with the
  island drag.
- `spec/acceptance/vertical-tabs.feature`: rewrite "Drag reorder rejects
  cross-bucket drops" as a pin-crossing rejection, and add "Drag moves a tab
  into another group".
- New island scenarios:
  - reorder within a group;
  - drag into another group;
  - drop on a collapsed header (the tab joins and the group stays collapsed);
  - reorder groups (⌘1 then targets the new first group);
  - Escape mid-drag keeps the panel open;
  - the source group dissolves when its last tab leaves.
- Keyboard: ⌥⇧↓ across a group boundary on both surfaces.

### Manual

- Relaunch `npm start` and verify in the app. Before/after crops of the
  island and the rail.
- Hand-check Win/Linux pointer capture in the next Windows VM validation,
  alongside the pending Glance divider check.
