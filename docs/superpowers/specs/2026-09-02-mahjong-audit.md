# Mahjong audit — bugs, gameplay gaps, and a Mahjong Blast comparison

**Date:** 2026-09-02
**Scope:** `src/renderer/pages/mahjong-engine.js`, `mahjong-state.js`, `mahjong.js`, `mahjong-sound.js`, `mahjong.html`, the new-tab embed in `newtab.js`, and the four `test/unit/mahjong-*.test.js` suites (90 tests, all passing at `ff3eaad`).
**Method:** code read of every module, node probes against the engine (900 random deals, 730 consecutive daily deals, undo/hint edge cases, localStorage churn benchmark), and a visual/interactive pass of the page served over `127.0.0.1` in the Browser pane (setup sheet, Classic win, Burst rescue, 720×560 viewport, light colour scheme). Mahjong Blast facts come from App Store / Google Play listings and user reviews, gathered by a research agent; sourced vs. inferred is marked below.

## 1. What is solid

- **Deals are solvable by construction** and generation never failed: 0 failures across 300 seeds per layout and 730 consecutive daily deals, ~3 ms per Turtle deal.
- Engine, persistence, and duplicate-tab guard are pure, validated on restore, and well covered. Corrupt or forged saves fall back to a fresh deal with a notice.
- Reduced-motion fallbacks, keyboard navigation, live-region announcements, and focus recovery all exist and work.
- Sound is local Web Audio, lazily created, persisted per device.
- Perf is fine: with 32 saved games a `save()` costs ~1 ms and a record read ~0.5 ms (node measurement).

## 2. Bugs and defects (ranked)

### B1. Shuffle is irreversible and bound to a bare `S` key — medium
`shuffleRemaining()` clears `state.history`, and `mahjong.js` binds an unmodified `s` to it with no confirmation. One stray keypress destroys the entire undo stack mid-game, and in Burst it also drops the combo. Fix options: push a `shuffle` history action carrying the prior `kinds`/`removed`/`tray` so Undo can reverse it (bounded, since kinds are ~2.5 KB), or at minimum require a confirm on the keyboard path. The Rescue dialog's "shuffle & continue" is fine because it is explicit.

### B2. Every new tab forgets the player's game and preferences — medium (UX)
Each new tab mints a fresh `game` id (`newtab.js` `mahjongGameId()`), and `bootstrap()` hard-codes the first deal to Daily + Burst. A player who prefers Classic Turtle reconfigures through Boards on every new tab, and a half-finished board in a closed tab is unreachable from a new one (it lingers in localStorage until the 30-day expiry or the 32-game cap evicts it). Only the free-highlight toggle persists. Fix: persist last layout/mode/source under a `mahjong.prefs` key and use it for fresh tabs; add a "continue last game" entry (most recently accessed save) to the setup sheet or the bootstrap path.

### B3. Undo after a Burst match erases the earlier park — low/medium (design ambiguity)
`selectTrayTile()` calls `removeParkHistory()` on a match and records the *post*-match tray as `priorTray`. Undoing the match therefore returns both tiles to the board and leaves nothing to undo for the park. Probe: park A, match A′, undo → tray `[]`, both on board, `history.length === 0`. Coherent, but players expect Undo to step back one action (A′ back on the board, A still in the rack). If it is deliberate, document it in the engine comment; otherwise record the true prior tray and keep the park action.

### B4. Hint can recommend a move that immediately triggers Rescue — low
With three parked tiles and no rack match, `availableMoves()` returns singles, so `Hint` highlights a tile whose only outcome is filling the rack. The hint should instead say the rack needs a match (or suggest undo/shuffle) in that state. Related: in Classic, `Hint` always returns `moves[0]`, so repeated presses never show a different pair.

### B5. "first clear" copy is unreachable; "new record" shows even when nothing was recorded — low
`recordCompletion()` sets `_newRecord = !before || …`, so the first completion always reads "new record" and `showWin()`'s `'first clear'` branch is dead. Reproduced: a completion with `elapsedMs === 0` was skipped by `applyResult()` (requires `> 0`) yet the dialog still said "new record". Compute `_newRecord` from whether `after` actually changed.

### B6. Arrow-key navigation clears an active hint — low (a11y)
Arrow keys call `refreshTiles()`, which calls `clearHint()`. A keyboard user who presses `H` loses the highlight the moment they start moving toward it. Keep `.hinted` across pure focus moves.

### B7. Daily mode leaves the layout buttons looking enabled — low (UI)
`paintSetupChoices()` sets `disabled` on the layout buttons when Daily is selected, but `mahjong.css` styles only `.mj-dock > button[disabled]`. Turtle/Peaks look clickable and silently do nothing. Add a disabled style plus a one-line note ("Daily rotates the layout").

### B8. "No moves remain" notice omits Shuffle — low
The Classic dead-end notice offers undo / new deal only, while Shuffle (the natural remedy, and the one the Rescue dialog offers) sits in the dock. "New deal" also silently converts a Daily game into a random one.

### B9. Match flight lands in the next empty slot, not on its mate — cosmetic
`startTrayFlight()` uses `nextTrayTarget()` for `tray-pair` results, so the matched tile flies into an empty slot while its partner sits elsewhere in the rack; the burst anchors on whichever `is-matching` slot is later in DOM order. Target the mate's slot instead.

### B10. Character tiles depend on a webfont — cosmetic
Character faces and wind badges are SVG `<text>`; before the font loads the tiles are blank. Local fonts make this brief in the packaged app, but a `font-display`/preload or outlined numerals would remove the flash entirely.

Not bugs, but verified quirks worth knowing: the page ignores `prefers-color-scheme` entirely (fixed dark lacquer table, by v2 design); the timer never starts while `document.hidden` is true, which is correct in the app; `assists` and daily results are recorded but never displayed anywhere.

## 3. Gameplay enhancements (cheap, engine already supports them)

1. **Undoable shuffle** (B1) and **hint cycling** (B4).
2. **Remember preferences + continue last game** (B2).
3. **Daily completion state in the setup sheet**: the records store already has `daily[key][mode]`; show "done · 4:12" / "best 3,450" next to the Daily toggle and on the win dialog for daily games.
4. **Statistics panel** from existing data: games completed per layout/mode, best times/scores, assists used, average clear time, and a daily streak computed from consecutive `daily` keys. Mahjong Blast users specifically praise progress visibility and complain when rankings misbehave; a local, honest stats sheet is the Blanc-shaped answer.
5. **Auto-clear toggle in Burst.** Mahjong Blast's most-cited gameplay complaint is auto-assist removing agency (reviews, US App Store). Blanc's every-5th-combo auto pair is the same mechanic; offer "auto clears: on/off" (off = keep the 100-point milestone bonus, skip the automatic pair). Records already carry `scoringRevision`, so a toggle can be scored separately or simply flagged.
6. **Classic scoring option** so Classic is not time-only: a simple pair value with a time bonus, or leave Classic pure and say so in the mode description.
7. **Distinct mismatch cue** in Classic (currently the same `select` sound), and `N`/`B` keyboard shortcuts for Boards, `Esc` to dismiss Rescue to the board with Undo.
8. **Hint targets the mate's rack slot** and the burst anchors there (B9).

## 4. New features, informed by the Mahjong Blast comparison

Disambiguation: the popular "Mahjong Blast" is Nebula Studio / HURELAX PTE. LTD. (iOS id 6747492600, Play `com.nebula.mahjongtile`, formerly "Mahjong Wonders"). It is **not** a native Mac app; the Mac listing is the iPad build ("not verified for macOS"). It is free with ads plus $1.99/wk–$19.99/yr subscriptions. A closer classic-solitaire comparator is Jose Varela's "Mahjong Solitaire Blast" (564 layouts, 3 tile sets, unlimited undo/hint/shuffle).

| Mahjong Blast (Nebula) | Source | Blanc today | Recommendation |
|---|---|---|---|
| Hundreds of progressive levels, level map, coins | listing | 3 layouts, no progression | **More layouts** (see below); a quiet "boards cleared" ledger instead of a level map |
| Undo / hint / shuffle, unlimited | listing | Same, unlimited | Keep; make shuffle undoable |
| Daily challenges, "fresh layouts every day" | listing | Daily deal, rotating layout, results stored but invisible | Surface daily results + streak (§3.3–3.4) |
| Daily tournament / rankings | reviews | None (no network) | Skip. Offer **share this deal**: a `blanc://mahjong/?deal=<layout>-<seed>` link so two people can race the same board locally |
| Auto-assist / bonus move after combos | reviews (complaint) | Auto clear every 5th combo | Add the on/off toggle (§3.5) |
| Seasonal events with themed tile pairs | App Store Events card | One tile set | **Tile-set / table themes** (local assets only, CSP-safe): e.g. Paper (ink on paper, the original v1 direction), Lacquer (current), Ink. Costs art, not code |
| "Large tiles", senior-friendly readability | listing | Scale-to-fit, free-tile ring toggle | **Tile size control** (fit / large with scroll) and an optional high-contrast face set |
| Offline, no timers, zero pressure | listing | Offline; Classic has a visible timer | Add a **Zen** option: hide timer/score, no records — Classic without pressure |
| No cloud save, sound settings reset | reviews (complaints) | Device-local; sound persists | Records could ride Profile Sync later, but that needs its own review — not a quick win |
| 3D-rendered tiles, ads after every level | listing / reviews | 2.5D layered tiles, no ads | Nothing to copy |

### More layouts (biggest content gap, cheapest per unit)
The engine takes any list of `{x,y,z}` half-unit positions with an even count ≥ 28 (it always seats all 14 wind/dragon variant pairs). Adding a layout is: a builder in `mahjong-engine.js` with a `revision`, a `LAYOUT_IDS`/`LAYOUT_REVISIONS` entry in `mahjong-state.js`, a mini preview + button in `mahjong.html`, a `dailyLayoutId` rotation update, and a generation-success test across seeds. Good candidates with distinct feel: Pyramid (single tall stack), Fortress (walls with a courtyard), Butterfly/Dragon (wide, low), Bridge, Cross. Six to eight layouts would close most of the perceived gap without a level system.

### Share a deal
Seeds are already deterministic (`createGame({seed, layoutId})`). A `deal` query parameter that pre-seeds a Random game (validated like `game`, never trusted for state) gives Blanc a social hook with zero network. Pairs well with the daily key.

## 5. Suggested first batch (one PR, low risk)

**Status (2026-09-02):** implemented in this worktree — B1 (undoable shuffle; the bare `S` key stays, since Undo now reverses it), B2 (table preferences + an explicit "continue it" offer on fresh tabs), B5, B6, B7, B8, and the daily result in the setup sheet and completion card.

1. B1 undoable shuffle + confirm on the `S` path. 2. B2 preference memory and continue-last-game. 3. B5 record copy fix. 4. B6 keep hint across arrow moves. 5. B7 disabled layout style. 6. B8 add Shuffle to the notice. 7. Daily result shown in setup sheet and win dialog.

Then, as separate efforts: layouts (content), stats panel (UI), auto-clear toggle (scoring revision), share-a-deal (routing + validation).
