# Mahjong: five more layouts and a Records sheet

**Date:** 2026-09-02
**Status:** Approved direction (owner answered the three design questions), spec for review before planning
**Follows:** `2026-09-02-mahjong-audit.md` (second batch), PR #270 (first batch)
**Prior art in-tree:** layout registry in `src/renderer/pages/mahjong-engine.js` (`LAYOUTS`, builders), records store in `mahjong-state.js` (`createRecordStore`, immutable completion events, `daily[key][mode]`), the Boards setup sheet in `mahjong.html`/`mahjong.css` (`.mj-modal`, `.mj-setup-card`, `.mj-layout-mini-*`), the dock in `mahjong.html` (`mahjong-icons.svg` symbols).

## 1. Goal

Close the two largest gaps the audit found against Mahjong Blast without importing its level-grinder shape: more boards to choose from, and visible progress. Both stay device-local, offline, and telemetry-free.

- **Layouts:** eight in total. Turtle, Arch, Peaks stay unchanged (same ids, revisions, and records). Add Pyramid, Fortress, Butterfly, Bridge, Cross.
- **Records sheet:** a new dock action opens a sheet showing best results per layout and mode, boards cleared, and the daily streak. It counts only completions, which the records store already records; no new event types, no telemetry.

## 2. Non-goals

- No level map, coins, boosters, or unlocks. Every layout is available from the first launch.
- No starts/abandons tracking, so no completion rate.
- No sync of records (Profile Sync scope is unchanged).
- No tile-set or table themes, tile-size control, share-a-deal, hint cycling, or auto-clear toggle. Those remain separate items from the audit.
- No change to Classic scoring or Burst scoring; `TRAY_SCORING_REVISION` stays 2.

## 3. Layouts

### 3.1 Geometry

All coordinates are the engine's half-tile units: a tile occupies `[x, x+2) × [y, y+2)` on one layer. Each layout is a pure builder in `mahjong-engine.js`, frozen like the existing three, with `revision: 1`. Footprints stay within Turtle's 30×16 so tiles render at least as large as Turtle's under `fitBoard()`.

| id | name | tiles | layers | footprint (w×h) | free tiles at start | card copy |
|---|---|---|---|---|---|---|
| `pyramid` | Pyramid | 108 | 4 | 20×12 | 26 | 108 tiles · steep |
| `fortress` | Fortress | 96 | 3 | 28×16 | 20 | 96 tiles · walled |
| `butterfly` | Butterfly | 94 | 3 | 30×12 | 43 | 94 tiles · open |
| `bridge` | Bridge | 100 | 4 | 30×10 | 8 | 100 tiles · narrow |
| `cross` | Cross | 86 | 4 | 30×16 | 17 | 86 tiles · layered |

Construction (verified by a throwaway probe against `isFreeAt`; the unit test in §3.3 re-verifies the shipped builders and pins the free-at-start counts above):

- **Pyramid.** z0: 10 columns × 6 rows (`x 0..18`, `y 0..10`). z1: 8×4 inset one tile (`x 2..16`, `y 2..8`). z2: 6×2 (`x 4..14`, `y 4..6`). z3: four bridging tiles at `y = 5`, `x 6, 8, 10, 12`. A single solid block; only edges are free, so it plays hard.
- **Fortress.** Wall ring at z0 and again at z1: top and bottom rows `x 0..26` at `y 0` and `y 14`, side columns `x 0` and `x 26` at `y 2..12` (40 tiles per course). Keep inside the courtyard: z0 five columns `x 8..16` × two rows `y 6, 8`; z1 four bridging tiles `x 9, 11, 13, 15` at `y 7`; z2 two tiles `x 11, 13` at `y 7`. Free tiles are the eight wall corners plus the keep's edges.
- **Butterfly.** Two mirrored wings (left origin `x 0`, right origin `x 18`): z0 rows `y 0` and `y 10` at `x ox+2..ox+8`, rows `y 2, 4, 6, 8` at `x ox..ox+10`; z1 a 3×3 block at half offsets `x ox+3..ox+7`, `y 3, 5, 7`; z2 one tile at `(ox+5, 5)`. Body: z0 column `x 14` at `y 0..10`, z1 `x 14` at `y 3, 5, 7`, z2 `(14, 5)`. A one-tile gap separates each wing from the body. Plays easy.
- **Bridge.** Two pylons (left origin `x 0`, right origin `x 22`): z0 4×5 (`x ox..ox+6`, `y 0..8`); z1 3×4 at half offsets (`x ox+1..ox+5`, `y 1..7`); z2 2×3 (`x ox+2..ox+4`, `y 2..6`); z3 `x ox+3` at `y 3, 5`. Span: z0 deck `x 9..19` step 2 × `y 3, 5` (12 tiles, a half-tile gap from each pylon: the pylon ends at `x 8`, the deck starts at `x 9`); z1 cables `x 10..18` at `y 4` (5); z2 `x 12, 14, 16` at `y 4` (3). 40 + 24 + 12 + 4 + 20 = 100. Only 8 tiles are free at the start (the two pylon caps on each side, both cable ends, and both z2 ends): the deck ends sit under the cable ends, so they open only after the cables go. The layout still passed 200 removal-plan seeds; it is the tightest opening of the eight and is labelled accordingly.
- **Cross.** z0: horizontal bar `x 0..28` × `y 6, 8` (30) plus vertical bar `x 12, 14, 16` × `y 0, 2, 4, 10, 12, 14` (18). z1: `x 3..25` at `y 7` (12) plus `x 13, 15` × `y 1, 3, 5, 9, 11, 13` (12). z2: `x 6..22` at `y 7` (9) plus `x 14` × `y 3, 5, 9, 11` (4). z3: `(14, 7)`.

Every deal still seats all 14 wind/dragon variant pairs (`standardPairs` requires ≥ 28 tiles); the smallest new layout is 86.

### 3.2 Registry and rotation

- `mahjong-engine.js`: add the five builders and `LAYOUTS` entries (`id`, `name`, `revision: 1`, `positions`, `tileCount`, `layers`). Export the new `*_LAYOUT` constants alongside the existing three for symmetry.
- `mahjong-state.js`: `LAYOUT_IDS` becomes `['turtle', 'arch', 'peaks', 'pyramid', 'fortress', 'butterfly', 'bridge', 'cross']` and `LAYOUT_REVISIONS` gains `1` for each. `normalizeRecords`, `applyResult`, and the prefs store all iterate `LAYOUT_IDS`, so records and preferences accept the new ids with no further change. The existing test that pins `LAYOUT_REVISIONS` to `E.LAYOUTS` revisions keeps them aligned.
- **Daily rotation** (owner's choice: rotate all eight): `dailyLayoutId` keeps `epochDay % LAYOUT_IDS.length` over the extended list. Consequence, stated once: on the day this ships, the Daily layout for that date can differ from what the previous build dealt. Past daily results are keyed by date and mode and remain valid; a player who cleared that day's daily on the old layout still sees "cleared" for the day. No migration.
- `test/desktop/steps/newtab-layouts.steps.js`: extend `MAHJONG_TILE_COUNTS` with the five counts so the "active Daily layout at playable size" step keeps working when the rotation lands on a new layout.

### 3.3 Verification (unit)

New engine test, `every layout is physically valid and always deals`: for each `LAYOUTS` entry, no two tiles on one layer overlap (`|dx| < 2 && |dy| < 2`), every tile with `z > 0` overlaps at least one tile at `z − 1`, the count is even and ≥ 28, `tileCount`/`layers` match the positions, and `createGame` succeeds for 60 seeds per layout with `availableMoves(...).length > 0`. The existing shuffle sweep (`solvable shuffle preserves…`) already iterates `Object.keys(E.LAYOUTS)`, so it covers the new layouts automatically. Daily: extend the rotation test to assert eight consecutive days visit all eight ids.

### 3.4 Setup sheet

- Eight cards in `.mj-layout-grid`. Desktop: `repeat(4, minmax(0, 1fr))` (two rows). The existing compact breakpoint (single column, horizontal card) and the smallest breakpoint (`max-height` + scroll) stay as they are; a middle breakpoint at `max-width: 900px` uses two columns so cards never fall below ~150 px wide.
- Previews: one `.mj-layout-mini-<id>` rule set per new layout, seven to nine `<i>` tiles each, mirroring the silhouette (Pyramid: a centred stepped stack; Fortress: a ring with a raised centre; Butterfly: two lifted wings and a body; Bridge: two towers and a low span; Cross: a plus with a raised centre). Same `<i>` sizing and shadow as today; later `<i>` paint above earlier ones.
- Card copy per the table above. Card order matches `LAYOUT_IDS`.

## 4. Records sheet

### 4.1 Entry point

A new dock action **records** (`#mjRecords`, `aria-haspopup="dialog"`, `aria-controls="mjRecordsSheet"`, tooltip "Records"), placed after **boards**. Icon: a new `records` symbol in `mahjong-icons.svg` in the same 1.7-stroke line style (a small laurel-free ribbon rosette: circle over two short ribbon tails). Keyboard: `R` opens it when no modal is open; `Esc`, the ✕, and the scrim close it, the same three paths as the Boards sheet. `activeModal()` gains `mjRecordsSheet` so the existing inert/focus-trap handling applies. Opening pauses the timer exactly as `openSetup()` does; closing resumes under the same conditions.

### 4.2 Content

`#mjRecordsSheet` reuses `.mj-modal` + `.mj-setup-card` and `.mj-modal-head` ("your table" overline, "Records" title). Three blocks, top to bottom:

1. **Overview** (four tiles, same visual language as `.mj-win-stats`): *boards cleared*, *daily streak* (current, in days), *longest streak*, *dailies cleared*.
2. **By board** table: one row per layout in `LAYOUT_IDS` order, columns *layout*, *classic best* (time or "—"), *burst best* (score · time or "—"), *cleared* (classic + burst count). Rows use tabular numerals; the current game's layout row is marked with `aria-current="true"` and a brass left rule.
3. **Last four weeks**: 28 small squares, oldest left, today last with an outline; filled when that day has a completed daily in either mode. A one-line caption: "cleared N of the last 28 dailies". Screen readers get a text alternative ("Daily cleared on Sep 1, Sep 2 …") via `aria-label` on the strip, and each square is `aria-hidden`.

Empty state: when nothing has been recorded, the overview shows zeros, the table shows "—" throughout, and the caption reads "no dailies cleared yet". No copy about levels, ranks, or comparisons.

### 4.3 Data model

Records aggregate (`mahjong.records.v2`, `RECORDS_VERSION` stays 2; the shape is extended, not versioned, because `normalizeRecords` already tolerates missing fields):

```
totals: {
  cleared: { classic: { [layoutId]: n }, tray: { [layoutId]: n } },
  countedEvents: [eventId, …]   // ids of retained events already counted
}
```

- **Totals are durable, not a cache.** Best-of records can be rebuilt from retained events; `totals` cannot once events are pruned. `mergeEvents()` therefore treats `totals` as the source of truth for counts and events as the feed, and it never prunes an event whose count it has not yet persisted.
- **Idempotent counting.** For each retained event whose id is not in `countedEvents`, increment `cleared[mode][layoutId]` and add the id. Only `completed: true` events with a valid layout revision count. Daily and random completions both count.
- **Two-phase compaction.** On every `read()`:
  1. Merge best-of records and count uncounted events into an in-memory aggregate whose `countedEvents` holds **every** seen event id (retained ones plus any already listed).
  2. Persist that aggregate. If the write fails (`safeSet` returns false), stop here: return the merged view, prune nothing, and leave storage as it was. The next read repeats the same work.
  3. Only after a successful write, prune events beyond `MAX_RECORD_EVENTS` (oldest first), and prune **only** events whose ids are in the just-persisted `countedEvents`. An event that appeared between step 1 and step 3 (another tab's completion) is never pruned before it is counted.
  4. Compact `countedEvents` to the ids of events still retained and persist again, best effort. If this second write fails, the extra ids linger until a later successful read; they are ≤ 128 extra 36-character strings and cause no miscount.
- **Back-fill.** Completions recorded before this ships are counted on the first read from whatever events are still retained (up to 128). Older ones are not recoverable. The sheet does not claim otherwise.
- **Concurrency.** Two tabs finishing at once each write their own event, and step 3 prunes only counted ids, so a clear can neither be lost nor counted twice at the retention boundary. The tests in §6 cover a failed aggregate write and a 129th event interleaved between a read's persist and prune steps.
- **Streak** is derived, never stored: `dailyStreak(records, todayKey)` walks `records.daily` keys. A day counts if either mode is `completed`. `current` counts consecutive days back from today, or from yesterday when today is not yet cleared (so a streak is not shown as broken during the day). `longest` is the maximum run over all keys. `cleared` is the number of days with any completed daily. Local calendar days via the existing `dailyKey()`.
- **View model:** `recordsSummary(records, { today, layoutIds, currentLayoutId })` returns `{ overview, rows, days }` for the page to render; it is pure and unit-tested, and the page only maps it to DOM.

### 4.4 Rendering

`paintRecords()` in `mahjong.js` rebuilds the sheet body from `S.recordsSummary(recordStore.read(), …)` each time it opens (records only change on completion, so no live updates while open). `formatMs` is reused for times; scores use `toLocaleString()`. All new copy is lowercase-calm like the rest of the dock and sheets. CSS lives in `mahjong.css` next to the setup-sheet rules and uses existing tokens only; no new token values, so `substrate:check` is unaffected.

### 4.5 Private tabs

Nothing new. A private Mahjong tab (`blanc://mahjong/?private=1`) runs in Blanc's isolated private session, whose `localStorage` is separate from the normal profile and is discarded when Blanc quits. So in a private tab the Records sheet neither reads normal-profile records nor keeps private completions past the session, and normal records stay persistent and untouched by private play. The existing private chip in the header is the only signal; the sheet adds no extra copy or UI for this.

## 5. Files touched

- `src/renderer/pages/mahjong-engine.js` — five builders, registry entries, exports.
- `src/renderer/pages/mahjong-state.js` — `LAYOUT_IDS`/`LAYOUT_REVISIONS`, `totals` in `normalizeRecords`/`mergeEvents`, `dailyStreak`, `recordsSummary`.
- `src/renderer/pages/mahjong.html` — five layout cards, records dock button, records sheet markup.
- `src/renderer/pages/mahjong.css` — grid columns, five preview rule sets, records sheet styles, disabled/current-row states.
- `src/renderer/pages/mahjong-icons.svg` — `records` symbol.
- `src/renderer/pages/mahjong.js` — open/close/paint for the records sheet, `R` shortcut, `activeModal()` entry.
- `test/unit/mahjong-engine.test.js`, `mahjong-state.test.js`, `mahjong-page.test.js` — per §3.3 and §6.
- `test/desktop/steps/newtab-layouts.steps.js` — tile counts.

## 6. Testing

- **Engine:** layout integrity and deal success for all eight (§3.3); daily rotation covers eight ids.
- **State:** `LAYOUT_REVISIONS` alignment (existing); totals count each event once across repeated reads; pruning past 128 events keeps totals and drops pruned ids from `countedEvents`; a corrupt `totals` block normalises to zeros without touching best records; `dailyStreak` for: empty, today only, yesterday only (current = 1), gap (current resets, longest kept), both modes on one day (counts once); `recordsSummary` produces eight rows in order, marks the current layout, and yields 28 day entries ending today.
- **State, counting durability:** (a) a stubbed storage whose aggregate write fails leaves every event in place and totals unchanged, and the following successful read counts them exactly once; (b) with 128 counted events retained, a 129th event written by a second store between the first store's persist and prune steps is not pruned and is counted on the next read, while the oldest counted event is the one pruned; (c) after compaction `countedEvents` contains only retained ids.
- **Engine fixtures:** the hard-coded registry fixture (`Object.keys(E.LAYOUTS)` order plus per-layer tile counts) is extended to all eight ids in `LAYOUT_IDS` order with each layout's per-layer counts (Pyramid 60/32/12/4, Fortress 50/44/2, Butterfly 70/21/3, Bridge 52/29/15/4, Cross 48/24/13/1, each summing to the table in §3.1).
- **Page (source-guard style, as the suite already does):** dock button `#mjRecords` carries `aria-keyshortcuts="R"`, `aria-haspopup="dialog"`, and `aria-controls="mjRecordsSheet"`; the sheet is in `activeModal()`; closing it (✕, scrim, or Esc) returns focus to `#mjRecords`, mirroring `closeSetup()`; the by-board block is a semantic `<table>` with a `<caption>`, `<th scope="col">` column headers, and `<th scope="row">` layout names; `paintRecords` uses `S.recordsSummary`; eight layout cards appear in `LAYOUT_IDS` order; the four-column grid rule is present; `mahjong-icons.svg` defines `id="records"` **and** `mahjong.html` references `mahjong-icons.svg#records` (a symbol nobody uses is a test failure).
- **Desktop acceptance (`test/desktop`, `src/main/test-hook.js`):** `MAHJONG_TILE_COUNTS` gains the five new counts; the ready step asserts six circular dock controls (`dockButtonCount === 6`); a new step drives the desktop rail through 1000×611, 1000×720, 1000×721, and 1280×800 and asserts the six-control rail stays inside the table (≥ 53.5 px controls under the 611–720 px fallback, ≥ 63.5 px above it); a new step opens the Records sheet at 1280×800 and 640×480 at zoom 1, then at zoom 1.5 and 1.25 through a new `setNewtabZoomFactor` hook (the page's own `webContents.setZoomFactor`, restored afterwards), and asserts eight rows, `scrollWidth <= clientWidth` (no horizontal overflow), the card rect inside the viewport, and focus returned to the dock control, in the same style as the existing completion-card containment check (`readMahjongCompletionGeometry`).
- **Browser pass** over a local server before the PR: each new layout renders inside the table at 1280×800 and 720×560 with no tile off-canvas; the Records sheet opens from the dock and `R`, shows the empty state, then real values after a scripted Peaks clear; Esc closes.
- **Acceptance dry run** stays green; the Daily step's tile-count table covers the new ids.

## 7. Risks and notes

- The Daily layout for the ship date may change once (§3.2). Landing after the launch train's product-merge cutoff (Thu Sep 3, noon ET) is likely, so this rides the first post-launch release.
- Eight cards make the Boards sheet taller on short windows; the smallest breakpoint already scrolls the grid, and the two-column middle breakpoint keeps cards legible on the app's minimum window.
- `countedEvents` grows the aggregate by up to ~5 KB after compaction (transiently up to twice that between steps 2 and 4). Well inside the localStorage budget the game already uses.
