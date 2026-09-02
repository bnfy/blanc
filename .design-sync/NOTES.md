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

## DS push-back queue — ✅ DONE 2026-08-17 (after PR #140 squash-merged as 0fea28e)

Pushed to the DS: `design_handoff_newtab_onboarding/README.md` rewritten to the
shipped contract with a PORTED banner and the ten deviations enumerated (island
PORT-CHECKLIST precedent); `NewtabOnboarding.dc.html` marked as the pre-port
historical prototype (its `newtabLayout` prop options already matched, no
change needed); sentinel re-armed. The deviations that were queued:

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

## 2026-08-24 sync (push-drift, v1.6.0 → v1.8.2)

Diffed all three canonical pairs against the live project.
- **Tokens:** no drift. Semantic color/type/shadow/radius core in `styles.css` +
  `pages.css` matches `colors/typography/layout.css` exactly; the layout/type/motion
  values the DS files enumerate are hardcoded in the app (not custom props) and unchanged.
- **Icons:** one candidate gap — **`reopen`** (`overlay.js` ICONS.reopen, the
  Reopen-Closed-Tab / ⌘⇧T return arrow: `M3.5 6.75h6a3 3 0 0 1 0 6h-3` +
  `M6.25 4 3.5 6.75l2.75 2.75`). It IS rendered, but only as the ↶ glyph on rows
  inside the ⌘L panel's "recently closed" section (`closedRow`, overlay.js:1482) —
  which exists only when `state.closed` is non-empty AND is folded by default
  (`closedSectionOpen=false`), so a user essentially never sees it. **Pushed then
  rolled back the same day (user call): the DS should not carry a glyph users never
  see.** Icon.jsx/.d.ts/.prompt.md/icons.card.html are back to the 30-icon set;
  sentinel re-armed. Treat `reopen` as a **deliberate NON-sync** going forward — do
  not re-flag it as missing drift (same class as the rail-plus). Every other chrome
  icon matched verbatim; `workspaces` was already synced (prior run).
- **`extensions`** stays as a retired/historical glyph (app removed extensions); left
  as-is — already documented that way in `Icon.d.ts`/`Icon.prompt.md`.
- **Island.jsx:** already current for capture / quiet dim-only / downloads / shield /
  groups. **Follow-up same day (user-approved): modeled the Named Workspaces footer
  switcher.** Added the footer button (`.bw-island-act.ws` / `.ws.bound` label) + the
  240px `.bw-ws-switcher` popover (workspace rows with ✓/tabCount, separator, new…/save
  as…) + props `workspaces` / `onSwitchWorkspace` / `onNewWorkspace` / `onSaveAsWorkspace`.
  CSS copied verbatim from `styles.css` (`.footer-act.ws` / `.ws-switcher*`); structure
  from `overlay.html`. Verified by rendering the real component (Babel-clean; switcher
  opens with the 3 sample workspaces + commands in light+dark). Updated Island.d.ts /
  Island.prompt.md; chrome.card.html now passes `workspaces` and its hint's stale quiet
  "dim + tag" was corrected to "dim only". The Patron gate / inline rename-delete-create
  editor states are deliberately NOT modeled (transient app-only states).
- Fixed a **stale local specimen** (repo fix, NOT a DS push): `design-system/components/
  quiet-tabs/index.html` (committed #198 on 2026-08-21) still documented the retired
  Zzz-glyph design — it referenced `quiet-glyph.js`, `.quiet-glyph`, `.row-quiet`, all
  removed 2026-08-18 when quiet went dim-only. Rewrote to dim-only (whole-row `opacity: .5`
  + hover/focus restore, verbatim from `styles.css` `.island-row.quiet` /
  `.vertical-tab-row.quiet`). This file is NOT in the DS project (no remote
  `components/quiet-tabs`) — it's a repo artifact; left in the working tree for commit.

- **Glance split-view (follow-up, user-approved): authored `guidelines/glance.html`.** The
  Glance split view was the PORT-CHECKLIST's "biggest gap" (no DS representation since #139).
  Built a guideline specimen verbatim from `styles.css` `.glance-*` + `index.html` markup,
  geometry from `glance-layout.js`: the side-by-side + stacked schematic, the owned header
  (eyebrow · favicon · title · make-main / change / close, + the change-open caret, private
  variant, and the ≤360 / ≤300 container-query collapse), and the draggable divider (both
  grips). `#glanceTitle`/`#glanceChange` shown as classes so several headers coexist on the
  page; `position: fixed` → `relative` (app ships native geometry) — every other declaration
  byte-for-byte. Verified via a real render (hero + each variant's computed behaviour). Also
  moved Glance out of PORT-CHECKLIST OPEN.

### Still open (carried forward)
- Nothing in the three canonical push-drift pairs (tokens / icons / island chrome) is
  outstanding as of 2026-08-24. The PORT-CHECKLIST's own OPEN list still carries two smaller,
  pre-existing gaps to author when wanted: the **capture-controls popover** (the pill's
  capture chip is modeled; the popover it opens is not) and **retinted theme icons**.

## 2026-08-25 sync (push-drift, v1.9.0)

Two DS-relevant changes landed in v1.9.0 (concurrent session): the **Blanc mark redesign
(#211)** and the **quiet-dots fix (#208)**. User approved a full brand sync.

- **Mark redesign (#211): stroked line-art B → filled logotype.** The app replaced the old
  `stroke-width:4` line-art mark with a detailed FILLED mark (fill-only, no stroke), viewBox
  `157.08×207.08`, TWO paths (counter dot + body); canonical source
  `src/renderer/pages/icon.svg`. Synced to the DS with paths embedded **byte-identical**
  (generated via `scratchpad/gen-mark.py` straight from icon.svg — never redrawn):
  `components/icons/Logo.jsx` (new mark + viewBox + fill-only, comment rewritten),
  `assets/blanc-symbol.svg` (currentColor), `assets/app-icon.svg` (#111111),
  `assets/app-icon.png` (← `export/app-icons-1024-square/icon-paper-1024.png`),
  `assets/dock-icons/icon-{cream,default,forest,midnight,sage}.png` (← the app's regenerated
  `src/renderer/pages/icon-*.png`; the DS carries these 5 of 11 colorways), and
  `guidelines/brand-logos.html` (inline mark + note rewritten). Verified by rendering: reads
  as a clean filled B, scales to nav size, inverts for dark, dock colorways carry it; Logo.jsx
  compiles with `stroke:none`. **`Logo.d.ts`/`Logo.prompt.md` needed no mark change** (they say
  "monogram", still true; no stroke mention).
- **#208 quiet dots:** the app reworked pill-dot selection to "standalone pins + active
  section" with a 4px gap and made quiet irrelevant to dots. The DS `Island.jsx` already
  modeled dots simply + quiet-agnostically, so the only new visible atom is the gap — added
  `.bw-island-dot.dot-section-start { margin-left: 4px }` + a pins-first render (verified: the
  4px lands on the first non-pin dot). No prompt/d.ts change needed.

### ⚠️ App ↔ site mark divergence (NOT a DS issue — flagged for the site workflow)
#211 touched only the app + internal pages. The **marketing site still ships the OLD stroked
mark** everywhere: `site/src/components/BrandMark.astro`, `site/public/favicon.svg`,
`site/src/pages/index.astro`, and all built `site/dist/*.html`. The DS now shows the new mark
(canonical / app-wins); the brand-logos note records the lag. The site needs its own mark
update (BrandMark.astro + favicon + rebuild) — a separate task, not this push-drift mirror.
Also out of scope: `Logo.prompt.md` still says "use --accent green" (palette went monochrome
long ago) — cosmetic, left for a later pass.

## 2026-08-31 sync (push-drift, v1.9.0 → v1.11.0)

Diffed all three canonical pairs from baseline 9396fc8^ (the 2026-08-25 sync predates
that same-day commit). **Tokens: no drift** (all post-baseline pages.css churn was
Mahjong game styles, no `:root` changes). Three app changes pushed (user approved all
three; verified by rendering the real components locally — Babel-clean, light + dark,
trust card + local state + fallbacks exercised via a served harness):

- **Site trust (0b88915):** Icon.jsx gained `secure` (closed padlock) + `local`
  (target dot) verbatim from overlay.js ICONS (`insecure` was already synced).
  Island.jsx: the panel address row is now LED by the `.bw-site-info-button`
  (secure/insecure/certificate-error/local states; internal/neutral/loading draw
  nothing — same visibility rule as overlay.js), replacing the old in-row insecure
  span; clicking swaps the list for the `.bw-site-info-card` (state dot, title, mono
  origin, summary, certificate dl grid, blocked tally + "Privacy settings" via new
  `onOpenPrivacySettings`); the hint line switches to "connection details are
  supplied by Chromium" / cert-error "Blanc did not offer a bypass". The pill's
  insecure badge became a button (opens site controls → `onShieldClick`) shown for
  insecure OR certificate-error, title from `siteInfo.title`; tab prop `siteInfo`
  added, legacy `insecure: true` still works (synthesized as an insecure siteInfo).
- **1Password fill hint (819d901):** Icon.jsx gained `key` (verbatim from
  index.html #pillFillHint); Island.jsx gained the `.bw-fill-hint-chip` between the
  capture chip and the shield (`tab.fillHint` + `onFillLogin`) — text-dim
  invitation, macOS-only in the app (documented in .d.ts/.prompt.md).
- **Favicon fallback (9396fc8):** Favicon gained a `url` prop → domain-initial
  fallback (`.bw-island-favicon.fallback`, mono 8px; `faviconFallbackLabel` logic
  verbatim); the dot peek mirrors it at 9px (`.bw-dot-peek.fallback` — the app
  composes `.dot-peek favicon` classes, DS folds the two rules). Tab rows, Quick
  Switcher rows, and the pill slot all pass `url` now.

chrome.card.html now exercises all three (active Verge tab carries full `siteInfo` +
`fillHint`; new 5th favicon-less tab shows the initial); icons.card.html renders the
31-glyph set (+secure/local/key; `reopen` stays a deliberate NON-sync). Sentinel
re-armed. NOT modeled: the fill-status capsule (fourth chrome document — transient
in-flow UI, same class as the Patron gate), and the shield popover's site-scoped
internals (unchanged).

## 2026-08-31 follow-up sync (brand: Mahjong-inspired mark, PR #256)

Caught after the morning sync: 61da29f ("Mahjong v2", merged same day) ALSO rolled out
a **new Blanc mark** in its final commit ("roll out Mahjong-inspired Blanc mark") — the
morning drift scan stat-checked only chrome renderer files for that commit and
miscategorized it as game-styles-only. The design-side agent flagged the stale mark.

- New canonical mark: `src/renderer/pages/icon.svg`, viewBox **290.91×344**, built as a
  LUMINANCE MASK (1 silhouette path + 13 cutout paths + 1 cutout polygon) painted through
  a currentColor/themable rect; master artwork `assets/blanc-mark.svg`. Replaces the
  v1.9.0 (#211) 157.08×207.08 filled two-path cut. All 11 dock colorway PNGs + export
  app icons regenerated in the same commit.
- Pushed (user-directed; verified by rendering — light pixels + dark computed-style
  currentColor flip; generated SVG vs shipped icon.svg side-by-side identical; path
  data diffed byte-identical; per-instance React.useId mask ids so multiple Logos
  coexist): `Logo.jsx` (mask-based symbol), `Logo.prompt.md` (also fixed the stale
  "--accent green" line → monochrome-ink rule), `assets/blanc-symbol.svg` (currentColor),
  `assets/app-icon.svg` (#111111), `assets/app-icon.png` (← export icon-paper-1024),
  the 5 dock-icon PNGs (← src/renderer/pages, verbatim copies), and
  `guidelines/brand-logos.html` (inline mask marks nm-a/nm-b + note). `Logo.d.ts`
  unchanged (API identical). Sentinel re-armed. Generation was scripted straight from
  icon.svg — never redrawn.
- ~~Site two mark generations behind~~ **WRONG, corrected same day:** #256 itself
  updated every site brand asset (BrandMark.astro, favicons, logo.png, OG/press cards)
  and the v1.11.0 release flow deployed it — live blancbrowser.com byte-matches the
  repo assets (verified 2026-08-31). App, DS, and site are aligned; the DS note/Logo.jsx
  comment were re-pushed with the correction. Lesson: verify the LIVE site before
  flagging it stale — the old flag was carried forward from pre-#256 notes.
- Scan lesson: the drift diff must include `src/renderer/pages/icon.svg` + `icon-*.png`
  in the per-commit stat, not just chrome renderer files — a mark change can ride in on
  an unrelated feature PR.

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
- 2026-08-18: quiet went dim-only in the app (user decision, docs/superpowers/specs/
  2026-08-18-quiet-marker-dim-only-design.md, shipped in v1.6.0) and the mirror was re-synced the
  same day (user-approved push): Island.jsx dropped `.bw-row-quiet` + its render block (the
  `.bw-island-row.quiet` dim + hover/focus restore stay), Island.prompt.md and Island.d.ts now
  document dim-only, and the `_ds_needs_recompile` sentinel was written — the served preview bundle
  stays on the old chip until the design project is next opened and recompiles. chrome.card.html's
  quiet MDN demo tab needs no change (it now just renders the dim). guidelines/vertical-tabs.html
  never had quiet rows. Never re-mirror the chip back into the app.

## 2026-09-02 sync (push-drift, v1.11.0 → v1.12.0 — Sunrise brand sync)

Drift scan from a19d334 (last sync commit) to df7a0e5. Only #262 (aa01590, "Adopt Sunrise
as the default app icon", shipped in v1.12.0) touched DS surfaces. **Tokens: no drift**
(no `:root` change in styles.css/pages.css/tokens.json since the verified 08-31 sync).
**Icon glyphs: no drift** (renderer.js/overlay.js ICONS unchanged; only comments moved).

Owner decisions (AskUserQuestion, 2026-09-02): (1) **Sunrise replaces the B everywhere** —
not just the app icon; (2) full app-icon sync incl. `assets/app-icon.png`; (3) model the
internal-page favicon change in Island. Rendering proof (Playwright Chromium against the
real compiled Icon bundle + DS tokens, light and dark, pixel crops) was sent and an
explicit push approval obtained before any write.

Pushed (plan_bee811dfe403446a_3ee10cffb81e; 24 writes + 1 delete; sentinel fenced first and
re-armed last):
- **Brand.** `components/icons/Logo.jsx` now embeds `src/renderer/pages/sunrise-mark.png`
  (680×680 RGBA, 265 KB base64) VERBATIM as a data URI — Sunrise is raster (the app's brand
  build derives it from `mahjong-wind-east.png`; there is no vector, never trace it). Two
  tones: `tone="ink"` (default; currentColor through the PNG alpha via CSS mask — exactly
  styles.css `.favicon.internal`) and `tone="color"` (the gold `<img>`). Below 20px the ink
  tone swaps in the app's rays-only `sunrise-favicon-mark.png`, embedded as a **128px
  alpha-preserving downsample** (3.7 KB; RGB zeroed, alpha kept) — the only non-verbatim
  bytes in the push, disclosed in the file header; the app itself applies the same crop
  rule at 14px. `Logo.d.ts` gained `tone`; `Logo.prompt.md` rewritten (monochrome-ink rule
  kept, gold reserved for app-icon contexts).
- `assets/blanc-symbol.svg` = the same verbatim PNG wrapped as an alpha `<mask>` over a
  currentColor rect (266 KB). `assets/app-icon.svg` (B vector) DELETED. `assets/app-icon.png`
  ← `export/app-icons-1024-square/icon-sunrise-1024.png`. Added `assets/sunrise-mark.png`,
  `assets/sunrise-favicon-mark.png`, `assets/dock-icons/icon-sunrise{,-dark}.png` (all
  byte-identical copies). `guidelines/brand-logos.html` (ink + color symbol, nav lockup with
  the ≤16px crop rule, Sunrise tile; viewport 700×330), `dock-icon-colorways.html`
  (7 of 13 swatches, Sunrise default first), `wordmark-export.html` (square 21×21 mark).
  `readme.md` brand/logo/dock paragraphs rewritten; `github.md` sync entry added.
- **Island internal-page favicon (#262).** Verbatim styles.css rules under bw- names:
  `.bw-island-favicon.internal` (text-ink mask of the rays-only crop; embedded data URI so
  it resolves from any card depth), `.bw-pill-favicon.internal { display: none }`
  (= `#islandPill #pillFavicon.internal`), `.bw-dot-peek.internal` = blank disc
  (= `#islandPill .dot-peek.internal::after { display:none }`; the app's dot peeks exist
  only in the pill — renderer.js:620). `Favicon` gained an `internal` state
  (`isInternalUrl` = url starts with `blanc://`); rows and peeks branch on it. `.d.ts` and
  `.prompt.md` document it; `chrome.card.html` gained a `blanc://newtab/` tab so the row
  is visible. Shield comment updated (B "since retired").
- `ui_kits/browser/index.html` + `templates/browser/app.jsx`: `faviconOf(blanc://)` →
  `undefined` (the Island supplies the mark; they used to borrow app-icon.svg);
  `pages.jsx`/`app.jsx` `DOCK_ICONS` = sunrise, sunrise-dark, evergreen (id `default`),
  midnight, cream, forest, sage; default `sunrise`.
- `templates/social-covers/CoverBoard.dc.html`: the two blancbrowser.com favicons (pill +
  pinned row) were the OLD stroked B (`153.09×203.01`, never updated for #211/#256) → Sunrise
  ink silhouettes (128px data URI). Everything else byte-for-byte as fetched.

Deliberately NOT touched: `explorations/*`, `design_handoff_*/*` (historical snapshots;
`NewtabOnboarding.dc.html` was already marked historical and still shows the old B),
`thumbnail.html` (wordmark text only), `guidelines/island-hero.html` (comment only),
the five monogram dock PNGs (the app still ships the B tile in those colorways).

### Site lag — RESOLVED same day (PR #263, merge c91bc87, deployed 5457bcd8 as Production/main; live assets byte-match the repo)
### (original flag kept for the record)
As of df7a0e5, `site/` has NO Sunrise asset (only `releases.json` mentions it) and the live
brand mark is still the Mahjong-inspired B from #256. With the owner's "Sunrise everywhere"
decision the DS is deliberately AHEAD of the site; BrandMark.astro, favicons, logo.png,
OG/press cards need their own pass. Also uncommitted in the shared checkout at sync time:
a Sunrise-for-Windows/Linux/iOS icon pass (build/icon.png, icon-sunrise.ico, iOS asset,
ASSET-LICENSE/README) — it LANDED mid-sync as 5e0964e ("Adopt Sunrise across all platforms", between df7a0e5 and this record). It changes no DS surface (Windows ICO, Linux PNG, iOS asset, docs), so nothing further to mirror; it is on main but not in a public release yet.

### Gotchas learned
- The Browser pane cannot crop (`zoom` region unsupported) and stalls while hidden; use the
  Playwright MCP against a `python3 -m http.server` launch.json entry (temporary
  `ds-harness`, removed after) and crop the saved PNG with magick.
- Babel-standalone can't resolve ESM imports: strip `import`/`export` from the sources,
  bind `Icon` from the fetched `_ds_bundle.js`, concatenate, and render.
- `get_file` results under ~50 KB are NOT persisted to disk — edits to such files mean
  re-authoring them in full; larger ones (Island.jsx, the bundle) land in tool-results and
  can be patched with assert-per-replacement scripts.
- A CSS `mask` on a raster needs the alpha channel: an alpha-EXTRACTED grayscale PNG masks
  as a solid square; keep RGBA (zero RGB, keep alpha) instead.
