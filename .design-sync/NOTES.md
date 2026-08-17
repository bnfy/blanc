# design-sync notes — Blanc Browser Design System (bee811df-e403-446a-9c63-078528dedf2c)

Mode: **push-drift** (this repo is the shipping app, not a component library — /design-sync here
diffs app tokens/icons/chrome against the design project and pushes app-side changes back; app wins
on divergence, user directive 2026-07-10).

## Canonical mirrored pairs
- `tokens/colors.css|typography.css|layout.css` (DS) ↔ app `tokens/tokens.json` + `styles.css`/`pages.css` `:root`
- `components/icons/Icon.jsx` PATHS (DS) ↔ app inline SVGs in `index.html`, `renderer.js` ICONS/PILL_ICONS,
  `overlay.js` ICONS, `vertical-tabs.js` ICONS (rail state markers are DIFFERENT drawings from the island
  row actions — pin vs pinned, mute vs audible/muted; both sets are deliberate)
- `components/chrome/Island.jsx` (DS) ↔ island pill/panel structure

## 2026-08-16 sync
- Tokens: **no drift** (colors/typography/layout all matched exactly).
- Pushed: Icon.jsx (fixed `download` — cistern-era redraw `M8 2.5v6.5…`; fixed `search` — `cx=7 cy=7` +
  `m10.25 10.25 3 3`; added `menu`, `captureMic`, `captureCam`, `pinned`, `audible`, `muted`, `caret`),
  Icon.d.ts + Icon.prompt.md (full name lists + action-vs-state note), icons.card.html (names array),
  Island.jsx (+ capture chip `.bw-capture-chip`, + quiet rows `.bw-island-row.quiet` / `.bw-row-quiet`),
  Island.d.ts + Island.prompt.md (capture/quiet docs), guidelines/vertical-tabs.html (two-wave audible,
  real caret path, pinned markers on pinned rows), design_handoff_island_chrome/PORT-CHECKLIST.md
  (OPEN register: Glance split view + capture popover + retinted theme icons; Island.jsx.txt marked as
  the historical 2026-08-09 snapshot).
- **Glance (PR #139) has no design-side representation** — flagged in PORT-CHECKLIST OPEN, needs authoring.
- Deliberately NOT changed: two plus drawings coexist in the app (overlay `M8 3.25v9.5…` = DS `plus`;
  vertical-tabs rail/new-tab uses `M8 3v10M3 8h10`) — app-internal inconsistency, left as-is; the rail
  guideline uses the rail's own drawing. `design_handoff_island_chrome/*.jsx.txt` are historical
  snapshots, never re-synced.

- Follow-up same day: wrote the `_ds_needs_recompile` sentinel and opened the project — the app consumed
  it and recompiled the bundle BODY from the pushed sources (verified: captureMic/bw-row-quiet in the
  served bundle, `__errors` empty), so new icons render. Also updated `components/chrome/chrome.card.html`:
  the demo now passes `capture={{audio,video}}` and a quiet MDN tab — the component supported both states
  but the card exercised neither, so they were invisible.

## DS push-back queue (from the 2026-08-16/17 newtab build — PR pending)

The "New tab v2 + onboarding" handoff shipped with approved deviations that the
DS (handoff README + `NewtabOnboarding.dc.html` + the `newtabLayout` prop docs)
should be updated to match, in a design-sync run after the feature merges:

- The dialog is SIX steps: privacy consent (the old first-run card's two
  choices) is step 5, between ad blocking and theme; header reads `{i} / 6`.
- Import step is bookmarks-only ("Bring your bookmarks", key tile dropped),
  lists DETECTED Chromium-family browsers behind an explicit "Look for
  installed browsers" button (F30 discovery rule), plus an always-present
  "From a bookmarks file (HTML)…" row; import feedback holds the step.
- The footer switcher ships alongside a Settings select; the version tag sits
  in the footer's left cluster; the footer is a 1fr/auto/1fr grid so the
  switcher is geometrically centered (user directive).
- Billboard favorites occupy fixed 96px slots — even icon rhythm with real
  labels (user directive); labels derive from the domain (github, mozilla),
  ellipsized at 96px.
- Tally: every bar including today is normalized to the busiest day; colour
  alone marks today; a zero week draws no bars (the prototype's 100% today-bar
  is stub data).
- No layout may scroll horizontally at any width: min-width floors, wrapping
  rows/footers, clock clamp, sub-960px shelf/tally compaction (user directive).
- Set-default CTA renders disabled where the OS registration is unavailable.

## Gotchas
- Preview cards render from compiled `_ds_bundle.js`. To rebuild it after pushing source changes: write
  a `_ds_needs_recompile` sentinel file (finalize_plan + write_files, any content) and open the project —
  the app consumes the sentinel and recompiles the bundle body. It does NOT refresh the header's
  `sourceHashes` bookkeeping (harmless; that only feeds the converter path's rebuild heuristics).
- Card demos must EXERCISE a state for it to show — adding a prop to a component does nothing visible
  until the `.card.html` passes it.
- The claude.ai/design project page can freeze its renderer when scrolling through the heavy
  template/animation cards (CDP screenshots time out). Verify a single card by downloading
  `_ds_bundle.js` + `styles.css`/`tokens/*` via get_file, serving the mirror locally, and opening just
  that `.card.html` — identical code path, one card at a time. `?file=<path>` URLs also work for
  jumping straight to a file.
- DesignSync write ordering: read → finalize_plan (deletes REQUIRED even if `[]`) → write_files.
- 2026-08-16: Design API had a ~20-minute full 503 outage (reads and writes) mid-push; the same
  planId worked once the service recovered — outages here are worth waiting out, not replanning.
