# Close-tab MRU selection + toned-down island proximity motion

**Date:** 2026-08-18
**Status:** Approved

Two independent behavior changes, one release.

## 1. Closing a tab returns to the previously active tab

### Problem

`closeTab` selects the tab to the *right* of the closed one (`tabOrder[closedIndex]`).
Opening a tab from elsewhere in the list and closing it strands you next to the
closed tab instead of back where you were.

### Behavior

- Each window runtime keeps an **activation history**: tab ids in activation
  order, most recent last, one occurrence per id.
- `setActiveTab` records every real activation (after the re-select no-op guard,
  so both the live-window and no-window paths record).
- When the **active** tab closes, selection walks the history backward to the
  most recent tab that still exists in this window, and selects it. Closing
  several tabs in a row keeps walking back through history.
- Existing special cases keep priority: shutdown never selects (quiet-wake
  hazard), `selectReplacement: false` callers own selection, and a surviving
  Glance pane is promoted first.
- **Fallback:** empty/exhausted history (e.g. right after session restore,
  where only the selected tab was ever activated) uses the existing
  right-neighbor rule unchanged.
- If the history pick has gone quiet, `setActiveTab` wakes it — normal behavior.
- History is in-memory only: never persisted, synced, or exposed over IPC; it
  dies with the window. Ids are pruned as tabs close, so it is bounded by the
  window's live tab count.

### Implementation shape

- Pure policy module `src/main/tab-activation.js` (no `require('electron')`,
  repo pattern): `recordActivation(history, id)` and
  `previousSurvivor(history, isAlive)` — the survivor predicate is a callback
  so main can check `tabs.has(id) && runtimeForTab(id) === rt()`.
- `main.js`: `activationHistory: []` on the window-runtime record; record in
  `setActiveTab`; prune + consult in `closeTab`.
- `test/unit/close-tab-shutdown.test.js` lifts `closeTab` via vm — its
  sandboxes gain the helper and `activationHistory`, same commit.

## 2. Island proximity motion: settle early + smaller

### Problem

The pill leans up to ±6px, rises 3.5px, and scales +4.5% continuously until the
cursor touches it. On a wide pill, edge buttons displace ~15px horizontally
*during the approach* — the target moves while being aimed at → mis-clicks.

### Behavior

- **Smaller:** lean 6px → 3px, scale 4.5% → 2%, rise 3.5px → 2px.
- **Settle early:** closeness reaches 1 while the cursor is still 80px away
  (distance remapped over [80, 250] instead of [0, 250], same smoothstep).
  Within 80px the pill is completely stationary — a stable click target.
- The shadow-clipping invariant holds: downward growth
  (pillHeight + shadowReach) × 0.02 ≈ 1.05px < 2px rise.

### Implementation shape

Constants live in three hand-synced places, all updated together:

- `src/main/island-proximity.js` — `MAX_LEAN`, `SCALE_AT_1`, `RISE_AT_1`, new
  `SETTLE`, and the remapped `closeness()`.
- `src/renderer/styles.css` — the `#islandPill` transform numbers.
- `src/renderer/renderer.js` — `ISLAND_SCALE`/`ISLAND_RISE`/`ISLAND_LEAN`
  (used to divide the transform back out of the reported rect).

`test/unit/island-proximity.test.js` updates in the same commit: the
monotonic-growth samples move outside the plateau, plus new assertions that
closeness is exactly 1 at and inside the settle distance. No tokens change
(proximity numbers are not in `tokens/tokens.json`), so `substrate:check` is
unaffected.

### Verification

Chrome documents load once per window — relaunch `npm start` to see the
change; verify the pill holds still inside 80px and the reported island rect
still un-transforms correctly (proximity still triggers at the right spot).
