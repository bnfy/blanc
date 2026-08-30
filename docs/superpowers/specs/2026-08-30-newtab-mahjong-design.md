# New-Tab Mahjong (opt-in solitaire game)

**Date:** 2026-08-30
**Status:** Approved design, pre-implementation
**Prior art in-tree:** start-page layouts (`src/renderer/pages/newtab.html`/`newtab.js`, `newtabLayout` in `src/main/settings.js`), internal-page serving (`src/main/pages.js`), utility-page classifier (`src/main/utility-pages.js`).

## 1. Problem

The new-tab page is a calm ledger; some users want a small, quiet diversion to
live behind it. The ask: a minimalist, Blanc-branded **mahjong solitaire** game
users can choose to enable — zero footprint for everyone else.

## 2. Goal / non-goals

**Goal:** an opt-in Settings toggle that adds a quiet `mahjong` entry to the
new-tab footer; clicking it navigates to a full-page, theme-aware mahjong
solitaire at `blanc://mahjong/`, drawn entirely in Blanc's ink-on-paper
language, with undo, hint, a timer, and a locally stored personal best.

**Non-goals:**
- Real four-player mahjong (rules engine, AI opponents).
- Multiple board layouts — v1 ships the classic 144-tile turtle only.
- Any network access, remote assets, sync of game data, or telemetry.
- Mobile parity work — desktop-only; no `F#`/`D#` spec entries in v1.
- Supporter gating — the game is free.

## 3. Placement and opt-in

### 3.1 Settings key

New boolean `newtabMahjong`, default `false`.

- `src/main/settings.js`: add to `DEFAULTS`, coerce to boolean in the
  normalizer, accept in the `setSettings()` whitelist, and add to
  `SYNCED_KEYS` — it is the same class of new-tab presentation preference as
  `newtabLayout`.
- `settings-schema/schema.json`: mirror the key + default, then run
  `npm run settings:build` and commit the regenerated artifacts, or
  `substrate:check` fails CI.
- Settings → General gains a toggle labeled **Mahjong on new tab** with a
  one-line description ("Adds a quiet mahjong solitaire link to the new-tab
  page."). Copy stays lowercase-calm like its neighbors.

### 3.2 New-tab entry

The entry renders in the shared `ledger-footer` (outside the four `<main>`
layouts, so it appears identically under ledger/billboard/shelf/tally with no
per-layout work): a quiet lowercase link, `mahjong`, styled like the layout
switcher's buttons, placed in the footer's right cluster next to `goAnywhere`.

- `newtab.js` shows/hides it from the same settings payload that already
  reaches the page; toggling in Settings updates an open new tab on the next
  data broadcast, same as other preferences.
- When `newtabMahjong` is `false` the element is `hidden` — zero visual
  footprint, and the game page itself still loads if navigated to directly
  (the toggle gates discovery, not access; no enforcement needed).

## 4. The game page

### 4.1 Files and serving

- `src/renderer/pages/mahjong.html` + `mahjong.js` + `mahjong-engine.js`,
  flat in `PAGES_DIR` per the flat-serving constraint.
- Styles live in a `/* mahjong */` section appended to `pages.css`, using the
  existing token set (same hand-synced duplication rules as the rest of the
  file; no new token values, so no `tokens/tokens.json` change).
- Served at `blanc://mahjong/` by the existing `pages.js` handler — the
  handler already serves any flat file in `PAGES_DIR`, so no route change; the
  page name is added wherever internal hostnames are enumerated (e.g. address
  autocompletion), if anywhere.
- **Deliberately NOT added to `UTILITY_PAGES`** — it opens as a normal tab
  page like `newtab`, not in the utility sheet. Back returns to the start
  page; session restore and tab switching just work; the game survives both.
- CSP meta tag identical in spirit to `newtab.html`:
  `default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:;`
  — no remote anything.

### 4.2 Visual design (ink on paper)

- Board: the page background is the standard page paper token; the turtle
  arrangement is centered, scaled to fit the viewport with a fixed aspect
  (CSS transform scale on a fixed-size board element; recomputed on resize).
- Tiles: DOM elements (`<button>` for accessibility) with paper-token fill, a
  hairline ink border, small radius, and a soft layered shadow; each stacking
  layer is offset a few px down-left so depth reads without 3D theatrics.
  Upper-layer tiles paint over lower ones by z-index = layer.
- Faces: traditional suits redrawn as minimal single-color inline SVG in the
  ink token — dots as circles, bamboo as slats, characters as a JetBrains
  Mono numeral over a small ink glyph, winds/dragons as mono letterforms
  (`E S W N`, `C F P`-style single glyphs), flowers/seasons as four simple
  line marks each. One color; no reds/greens — suit identity comes from form.
- Selection: hairline focus/selected ring per the no-thick-focus-rings rule,
  plus a slight ink-tint fill on the selected tile.
- Theme: light/dark/private all flow from the existing `:root` tokens in
  `pages.css`; no theme-specific art.
- The Blanc mark appears only in the win/empty state, not on tile backs
  (backs are never visible in solitaire) and not as a watermark.

### 4.3 Layout, rules, matching

- Classic 144-tile turtle: the standard position table (row/col/layer triples)
  is a constant in `mahjong-engine.js`.
- Tile set: 4× each of 9 dots, 9 bamboo, 9 characters, 4 winds, 3 dragons
  (= 136), plus 4 flowers and 4 seasons (= 144).
- Freeness: a tile is free iff no tile overlaps it on the layer above and at
  least one of its left/right sides is fully open (standard half-step overlap
  semantics).
- Matching: identical tiles match; any flower matches any flower; any season
  matches any season.
- Interaction: click a free tile to select; clicking a matching free tile
  clears the pair; clicking a non-matching free tile moves the selection;
  clicking a blocked tile gives a subtle shake/no-op; Esc deselects.

### 4.4 Winnable deals

Deals are winnable **by construction**: play the layout in reverse — starting
from the full set of unassigned positions, repeatedly pick two positions that
are free with respect to the remaining unassigned positions, assign them the
next matching pair (pair order shuffled), and remove them. The removal order
reversed is a valid solution, so the deal is solvable. If the greedy pass
dead-ends (fewer than two free positions remain — rare but possible), discard
and retry with a fresh shuffle; bound retries (e.g. 50) and fall back to a
plain shuffle only past the bound (in practice unreachable; the unit suite
asserts construction succeeds across many seeds).

### 4.5 Controls and feedback

- A quiet mono control row above or below the board:
  `undo · hint · new deal`, a running timer (`m:ss`, starts on the first
  selection, stops on win), and a `NN pairs left` counter.
- **Undo:** unlimited depth; restores the last cleared pair (and restores the
  timer's running state). Undo after a win resumes the game.
- **Hint:** highlights one currently matchable free pair with a brief pulse.
  No penalty, no limit — the tone is calm, not competitive.
- **Stuck:** when no matchable free pair exists, an inline notice appears
  ("no moves left") offering `undo` and `new deal` links. No modal, no
  auto-reshuffle.
- **Win:** the cleared board shows the Blanc mark, the final time, and
  `best m:ss` with `new deal` beneath. A `new best` note appears when beaten.
- **New deal** mid-game asks nothing — it just deals (undo history and timer
  reset). Losing a half-played casual game is not a destructive action.

### 4.6 Persistence

- Personal best time only, in the page's own `localStorage`
  (`blanc://mahjong` is its own origin under the `standard: true` scheme).
  Nothing crosses IPC, nothing is written to a `JsonStore`, nothing syncs.
- In private tabs the non-persistent session makes it ephemeral — correct
  behavior, no special-casing.
- In-progress games are not persisted across app restarts (v1).

## 5. Module boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `mahjong-engine.js` | Pure logic: turtle position table, tile set, freeness, winnable deal generation (seedable RNG), match/select/undo state machine, stuck & win detection. **No DOM, no `require('electron')`.** | nothing |
| `mahjong.js` | DOM: renders tiles from engine state, wires clicks/keys, timer, controls, localStorage best, theme comes free from CSS. | `mahjong-engine.js` |
| `mahjong.html` | Markup shell + CSP. | pages.css |
| `settings.js` (+ schema) | `newtabMahjong` key. | existing |
| `newtab.js`/`newtab.html` | footer entry, gated by the setting. | existing |

`mahjong.js` loads the engine via a plain `<script>` tag pair (the engine
attaches a single namespace global when `module` is absent, same pattern the
unit tests need — the engine file is `require()`-able under `node --test` and
script-taggable in the page).

## 6. Error handling

- Deal-generation retry bound as in 4.4; construction failure past the bound
  falls back to plain shuffle rather than a broken page.
- `localStorage` reads/writes wrapped in try/catch; a missing/failed best time
  renders as no best line, never an error.
- No other failure surface: no network, no IPC, no persistence beyond the
  above.

## 7. Testing

Unit tests (`test/unit/mahjong-engine.test.js`):
- Position table integrity: 144 positions, no duplicate coordinates,
  overlap/adjacency relations symmetric.
- Deal generation: for many seeds, generation succeeds and the recorded
  reverse order is a valid playthrough (each step removes a free matching
  pair) ending empty.
- Freeness edge cases: covered tile not free; tile with both neighbors not
  free; end tiles free; layer boundaries.
- Matching: identical-only for suits, class-wide for flowers/seasons.
- Undo round-trip: state after clear+undo deep-equals state before.
- Stuck detection: hand-built stuck position reports no moves; win reported
  only at zero tiles.

Static wiring:
- `settings-schema` check already guards the key via `substrate:check`; add
  the key to the schema in the same commit as `settings.js` (per
  `blanc-policy-tests` memory: guard and policy change land together).

Manual verification (chrome-level pages need a relaunch, not Cmd+R):
- Toggle off→on: footer link appears on all four layouts; off: gone.
- Play through in light/dark/private themes; win state; best-time persist
  across restart; undo/hint/stuck flows.

## 8. Out of scope / future

- Additional board layouts, sound, animations beyond subtle pulses.
- Cross-device sync of best times.
- Mobile port (would need touch sizing and its own spec entry).
