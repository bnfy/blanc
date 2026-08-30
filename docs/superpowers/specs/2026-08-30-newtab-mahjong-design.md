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
- `settings-schema/`: the generator is not schema-driven — `build.mjs`
  hand-emits every key into the Swift/Kotlin outputs and its drift
  comparisons. Adding the key therefore means, in one commit: mirror key +
  default in `schema.json`, extend the Swift and Kotlin emitters (and any
  per-key drift check) in `build.mjs` — treated like `usagePing`, a plain
  boolean default even though the feature itself is desktop-only — then run
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

- Data path: there is no generic settings payload on the page.
  `startPageStatus()` in `main.js` projects selected fields to the start
  page — add `newtabMahjong` to that projection, include it in the initial
  `pages:start:data` result, and handle it in `pages:start:status` updates so
  toggling in Settings shows/hides the link on an already-open new tab.
- In a private new tab (`?private=1`), the link's href carries the marker
  forward: `blanc://mahjong/?private=1` (see §4.2).
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
- Served at `blanc://mahjong/` by the existing `pages.js` handler. The
  handler 404s hosts absent from its `KNOWN_PAGES` allowlist, so `mahjong`
  must be added there.
- **Deliberately NOT added to `UTILITY_PAGES`** — it opens as a normal tab
  page like `newtab`, not in the utility sheet. Back returns to the start
  page. Ordinary tab switching preserves the in-progress deal (the
  `WebContentsView` stays alive); app restart / session restore reopens the
  URL as a fresh deal — in-progress games are not persisted (§4.6). A unit
  test asserts `mahjong` is in `KNOWN_PAGES` and not in `UTILITY_PAGES`.
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
- Theme: light/dark flow from the existing `:root` tokens in `pages.css`; no
  theme-specific art. Private is query-signaled, same mechanism as newtab:
  when opened as `blanc://mahjong/?private=1` (the footer link appends the
  marker in private tabs), `mahjong.js` sets
  `document.documentElement.dataset.theme = 'private'`. The private session
  itself needs no signal — only token selection does.
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

Deals are winnable **by construction**: simulate a winning game on the full
layout — starting from the full set of unassigned positions, repeatedly pick
two positions that are free with respect to the remaining unassigned
positions, assign them the next matching pair (pair order shuffled), and
remove them. The removal order, **as recorded**, is itself a valid
playthrough, so the deal is solvable. If the greedy pass dead-ends (fewer
than two free positions remain — rare but possible, e.g. a lone surviving
stack), discard and retry with the next state of the seeded RNG until
construction succeeds. There is **no non-constructive fallback** — a deal
that could be unwinnable is never shipped. Retries always terminate in
practice; the unit suite asserts construction succeeds across many seeds, and
a defensive attempt cap (large, e.g. 1000) exists only to turn a
never-expected infinite loop into a thrown error.

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

- Personal best time and the sound on/off preference only, in the page's own `localStorage`
  (`blanc://mahjong` is its own origin under the `standard: true` scheme).
  Nothing crosses IPC, nothing is written to a `JsonStore`, nothing syncs.
- In private tabs the non-persistent session makes it ephemeral — correct
  behavior, no special-casing.
- In-progress games are not persisted across app restarts (v1).

## 5. Module boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `mahjong-engine.js` | Pure logic: turtle position table, tile set, freeness, winnable deal generation (seedable RNG), match/select/undo state machine, stuck & win detection. **No DOM, no `require('electron')`.** | nothing |
| `mahjong-sound.js` | Lazy Web Audio synthesis, cue definitions, and the local sound preference. No assets or network. | nothing |
| `mahjong.js` | DOM: renders tiles from engine state, wires clicks/keys, timer, controls, localStorage best, and sound toggle; theme comes free from CSS. | `mahjong-engine.js`, `mahjong-sound.js` |
| `mahjong.html` | Markup shell + CSP. | pages.css |
| `settings.js` (+ schema) | `newtabMahjong` key. | existing |
| `newtab.js`/`newtab.html` | footer entry, gated by the setting. | existing |

`mahjong.js` loads the engine and sound helper through plain `<script>` tags
(each attaches one namespace global when `module` is absent, the same pattern
their unit tests need — both files are `require()`-able under `node --test` and
script-taggable in the page).

## 6. Error handling

- Deal-generation retries as in §4.4; the defensive attempt cap throws rather
  than ever dealing a possibly-unwinnable board, and `mahjong.js` surfaces a
  quiet "couldn't deal — try again" state in that never-expected case.
- `localStorage` reads/writes wrapped in try/catch; a missing/failed best time
  renders as no best line and a failed sound preference remains in memory.
- No other failure surface: no network, no IPC, no persistence beyond the
  above.

## 7. Testing

Unit tests (`test/unit/mahjong-engine.test.js`):
- Position table integrity: 144 positions, no duplicate coordinates,
  overlap/adjacency relations symmetric.
- Deal generation: for many seeds, generation succeeds and the recorded
  removal order is a valid playthrough of the dealt board (each step removes
  a free matching pair) ending empty.
- Freeness edge cases: covered tile not free; tile with both neighbors not
  free; end tiles free; layer boundaries.
- Matching: identical-only for suits, class-wide for flowers/seasons.
- Undo round-trip: state after clear+undo deep-equals state before.
- Stuck detection: hand-built stuck position reports no moves; win reported
  only at zero tiles.

Settings and wiring tests (`test/unit/`):
- `newtabMahjong` defaults to `false`; normalizer coerces to boolean and
  rejects/repairs invalid stored values; `setSettings()` accepts the key.
- Sync: the key participates in `SYNCED_KEYS` export and merge.
- Page routing: `mahjong` is in `pages.js`'s `KNOWN_PAGES` and not in
  `UTILITY_PAGES` (so it never routes into the utility sheet).
- Schema: `settings-schema` drift check covers the key via `substrate:check`;
  schema + generator + regenerated artifacts land in the same commit as
  `settings.js` (per `blanc-policy-tests`: guard and policy change together).
- Start page: `startPageStatus()` projection includes `newtabMahjong`
  (covered by whatever unit seam exists for the projection, else by the
  manual checklist below for initial `pages:start:data` and live
  `pages:start:status` visibility).

Manual verification (chrome-level pages need a relaunch, not Cmd+R):
- Toggle off→on: footer link appears on all four layouts; off: gone.
- Play through in light/dark/private themes; win state; best-time persist
  across restart; undo/hint/stuck flows.

## 8. Out of scope / future

- Additional board layouts and animations beyond subtle pulses.
- Cross-device sync of best times.
- Mobile port (would need touch sizing and its own spec entry).

## 9. Addendum (2026-08-30, post-ship)

By owner request after playing v1, the game is ALSO the fifth start-page
layout: `mahjong` joined `NEWTAB_LAYOUTS` (settings.js + schema + generated
enums), picked from the footer switcher like the other four. The layout
embeds `blanc://mahjong/` in an iframe (newtab.html allows it via
`frame-src blanc://mahjong`; src set lazily on first show; `?private=1`
carried in private tabs; the game's wordmark back-link goes inert when
framed). This supersedes §2's "fifth layout" non-goal; the §3 opt-in footer
link and `newtabMahjong` setting remain unchanged. Later same day: suit
inks + bone-ivory shading, and the Blanc mark as the white dragon face
(ink only, never framed — logomark brand rule).

Follow-up, same day: with the layout in the switcher the §3 opt-in footer
link was redundant — the `newtabMahjong` setting, footer link, Settings
toggle, and startPageStatus projection were all removed (never shipped in a
release, so no migration). The game is reached via the `mahjong` layout or
by typing `blanc://mahjong`.

Follow-up, same day: the game gained quiet Web Audio cues for selection,
matching, blocked moves, hints, undo, new deals, and wins. They are synthesized
locally by `mahjong-sound.js` — no media assets or requests — and AudioContext
is created only after a user gesture. An accessible `sound on` / `sound off`
button persists the preference in the Mahjong origin's `localStorage` (and is
therefore ephemeral in private tabs); sound defaults on and initial page load
is silent.
