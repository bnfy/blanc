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

### ✅ The site is LIVE on Sunrise (2026-09-02)
blancbrowser.com ships the Sunrise mark: PR #263 (squash c91bc87) generated every site
brand surface from the Sunrise motifs via `scripts/build-brand-assets.js` (in-page ink
silhouette in `BrandMark.astro`, rays-only crop for the ≤16px favicons, white-tile
`logo.png`, re-rendered OG/feature/press cards, demo island hides the blank tab's favicon
slot). Deployed as Cloudflare Pages deployment 5457bcd8, Production, branch main, source
c91bc87; `favicon.svg`, `logo.png`, `favicon-32x32.png`, `apple-touch-icon.png`, and
`og-image.png` verified byte-identical on the live domain. App, DS, and site are aligned.
The DS's own "still ships the B" wording (`guidelines/brand-logos.html` note, `readme.md`
Logos bullet, `github.md` entry) was corrected in a same-day follow-up push; the readme's
site-lockup sizes now match the live site (header 20×20 mark alone, press 21×21, legal 24×24).

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

## 2026-09-11 sync (push-drift, v1.12.0 → v1.16.0 — resting island refresh)

Drift scan from 6469a2f (last sync) to main 5e6de3d, 153 commits. Three touched DS
surfaces: **ff3eaad1** ("refine resting island and add new tab shortcut"),
**0093b6c4** ("use Inter in vertical tabs"), **aec328a0** (screen + system-audio
sharing, #308). Brand scan clean — no `icon.svg` / `sunrise-mark.png` / dock-PNG
change rode in on an unrelated PR this window (the 2026-08-31 scan lesson applied
and found nothing). Owner approved the full scope + the push after render proof.

- **Tokens: FIRST REAL DRIFT since this mirror began.** `--strip-h` 64 → **68px**;
  new `--island-resting-surface` (light `rgba(255,255,255,.94)` / dark
  `rgba(31,31,31,.94)` / private `rgba(25,25,25,.94)`), `--shadow-island-resting`,
  `--island-resting-height: 44px`, `--island-resting-radius: 17px`. `--shadow-pill`
  is NO LONGER the island's shadow — it now dresses the tab dot's favicon peek and
  the onboarding island illustration; layout.css's long "fades out inside the 64px
  strip" rationale was rewritten around that. `--control-h` stays 28px but its
  comment dropped "address input", which is now its own 36px/14px geometry.
  pages.css `:root` did NOT drift (the mono→Inter churn there is a scoped
  `.ledger-body` override, not a token).
- **Island.jsx: the resting material moved to `::after`.** 94% face + 1px border +
  16px backdrop blur + the website nav's shadow, painted one layer below the
  content so the resting layer can stay `transform: none` and render crisp; fixed
  44/17 counter-scaled against `--pill-zoom`; the rise/grow now sits behind a
  `.proximity-active` class fed by a new `proximity` prop (0→1). Private's dashed
  edge moved to `::after` with it. Also added the **Slash + Plus shortcut keycaps**
  (`.bw-pill-shortcuts`, matched 22px targets over 18×17 faces, 4px pair gap,
  hidden wholesale in vertical-tabs mode) and the **display-share chip**
  (`displayShares` + `onDisplayShareClick`, window-wide, reuses `.bw-capture-chip`;
  `.display-share-chip` is a marker class with no declarations in the app).
- **`box-sizing: border-box` added to `.bw-pill` — the one non-verbatim line.** The
  app inherits it from a global `* { box-sizing: border-box }` reset that a
  standalone DS component cannot assume. Irrelevant while the pill's height fell
  out of padding; now that the height is FIXED, without it the 1px border lands
  outside and the island renders **46px instead of 44px**. Documented in the file.
  If a future port of a fixed-size app element looks 2px tall, check this first.
- **Icons: two added, and the `plus` question settled.** `displayShare` (verbatim
  from index.html `#pillDisplayShare`). `plusWide` (`M8 3v10M3 8h10`) is NEW: the
  island's New-tab keycap uses the RAIL's plus drawing, not the DS `plus`
  (`M8 3.25v9.5…`, still correct for the panel's new-tab buttons). Owner chose to
  carry both rather than pick a winner — same rule as pin/pinned and mute/audible.
  The old "two plus drawings coexist, left as-is" non-sync is therefore SUPERSEDED:
  both are now named glyphs. `reopen` remains a deliberate non-sync; `extensions`
  remains retired.
- Guidelines refreshed: `metrics.html` (68px strip, 44/17 island, 36/14 address
  input, 18px panel radius — that last one had been stale at 10px since the
  2026-08-09 softening), `elevation.html` (now THREE shadows; the island swatch
  carries the real face + blur, and `--shadow-pill` is relabelled as the peek
  disc's), `vertical-tabs.html` (rail typography mono→Inter in all four places
  0093b6c4 touched, 68px strip, and the stand-in minipill rebuilt as the 44/17
  material instead of the retired capsule).
- Pushed as plan_bee811dfe403446a_e97afb2cfd05, 13 files + sentinel fenced first
  and re-armed last. Verified: `tokens/layout.css` round-trips byte-identical.

### Finding only, NOT fixed: pages.css `--shadow-pill` is undefined for internal pages
`pages.css` referenced `var(--shadow-pill)` twice — `.ob-tile-blanc` and
`.ob-minipill`, both first-run onboarding (**partly overtaken 2026-09-11: PR #327
deleted `.ob-tile-blanc` outright, so only `.ob-minipill` is still affected**) — but `tokens.json` scoped the token to
`chrome` only, `pages.css` `:root` never declared it, and internal pages never load
`styles.css`. With no fallback the declaration was invalid at computed-value time,
so both elements painted **no shadow at all**. Present since 0fea28e (#140,
2026-08-16); unrelated to this drift window, found while rewriting the layout.css
shadow comment. Confirmed with a positive control: the stylesheet computes
`box-shadow: none` on both elements, and adding the token to `pages.css` `:root`
(plus `pages` to its `tokens.json` consumers) resolves all six layers.

**A fix was written, then REVERTED on the owner's instruction — see the standing
rule below.** The app is byte-identical to before this sync. Anyone picking this up
later: the two halves must land in ONE commit or `tokens:check` fails both ways (it
flags a token the source has and the CSS lacks, and vice versa), and `pages.css`
needs the exact unspaced `rgba(255,255,255,0.65)` form because the checker compares
strings, not colours.

## STANDING RULE (owner, 2026-09-11): /design-sync never changes the app

This mode is a ONE-WAY mirror: the app is the source of truth and the Design System
is what gets updated. Do not edit app code during a sync — not a token, not a
stylesheet, not a "bug fix" — even when a repo change is approved earlier in the
same conversation, and even when the defect is real and provable. Anything found in
the app gets WRITTEN DOWN here and handed to the owner as a separate decision; it
never rides along with a sync.

The `--shadow-pill` fix above is the case that produced this rule: it was a genuine
bug with a verified positive control, and it still changed what the app renders
(onboarding tiles gaining a shadow they had not been drawing), which is a design
change. Restoring intended behaviour is not a licence to alter shipped appearance.
The fix and its `tokens.json`/`tokens/generated` half were reverted; only this record
remains. The same rule retires the `.ob-minipill` restyle floated below — do not act
on it, just leave it documented.

**Still open / deliberately not done:** the onboarding `.ob-minipill` draws a 999px
capsule asking for `--shadow-pill` — it illustrates the RESTING ISLAND, which is no
longer either of those things (and, per the finding above, it gets no shadow at all).
Restyling it to the 44/17 island material is the owner's call, not a sync's. The
display-share PICKER dialog stays unmodeled (transient in-flow UI, same class as the
fill-status capsule and the Patron gate). PORT-CHECKLIST's two older gaps —
capture-controls popover, retinted theme icons — are still open.

### Gotchas learned
- The DS component CSS is written one rule per line inside a JS template literal, so
  a naive `indexOf("\n}")` block extractor swallows dozens of following rules and
  "compares" the wrong thing. Use brace counting. Likewise `indexOf(sel + " {")`
  matches a longer selector that merely ENDS with your selector
  (`#strip.glance-open #islandPill` before `#islandPill`) — anchor on the newline.
- Never put a backtick inside Island.jsx's `css` template literal; it terminates the
  literal and the whole bundle silently renders nothing.
- `get_file` on a file under ~50 KB is not persisted to disk, so patching one means
  re-typing it. Verify the transcription before pushing: split the result into
  paragraphs, list the ones you meant to change, and read the rest back against the
  fetched copy — curly apostrophes and em-dashes are where it drifts.

## 2026-09-12 sync (push-drift, v1.16.0 → v1.16.2 — app-icon retirement + doc rot)

Scan c937dcb4 (the squash of the last sync's head) → 534e2cd8. Of the fifteen commits
only **#327 "Replace legacy app branding with theme-aware Sunrise artwork"** touched a
DS surface; #325 was startup-recovery CSS on an internal page, and the v1.16.1/v1.16.2
release train (#328–#339) touched none. **No drift in the three canonical pairs** —
`styles.css`, `tokens.json` and all four icon sources are untouched — and
`guidelines/brand-logos.html` needed nothing, since the Sunrise mark itself did not
change. Owner approved all three tiers below plus the keep-and-relabel call.

- **App icons: four → two (#327).** `settings-schema/schema.json` and
  `src/main/app-icon-assets.js` now list only **sunrise** (default) and
  **sunrise-dark**; Paper and Ink joined the monogram set in retirement,
  `package.json` excludes eleven colorway PNGs from the payload, and a saved retired
  id falls back to Sunrise on read. `supporterIcons` is `[]`. The owner's rule for
  this pass: the B is gone from app UI **except inside Mahjong tile artwork**, kept
  as a nod to Blanc's origins. Mirrored to `guidelines/dock-icon-colorways.html`
  (rebuilt: a selectable Sunrise pair above, the five monogram tiles below in
  greyscale at 50% under an explicit "retired — not selectable and not packaged"
  heading — owner chose keep-and-relabel over deleting the PNGs), and to `DOCK_ICONS`
  in both `templates/browser/app.jsx` and `ui_kits/browser/pages.jsx`, whose App icon
  hint now matches the shipped "Follows macOS Icon & Widget Style; Finder uses
  Sunrise".
- **`readme.md` had rotted well beyond #327, and part of that was the previous sync's
  miss.** The 2026-09-11 run pushed thirteen component/token files but never opened
  the readme, which restates the same facts in prose — so it still described a 64px
  strip (twice), the resting island "wearing the fitted `--shadow-pill`", "two
  shadows", "no blur" (the island now carries a 16px backdrop blur), the island under
  the 999px corners, and "the expanded island panel is the one 10px corner" — 18px
  since 2026-08-09. Older errors fixed in the same pass, each verified against the
  app first: private mode was documented with its pre-monochrome green cast
  (`#0c110e` / `#a8c8b0`) while the same file's VISUAL FOUNDATIONS paragraph already
  said the green was dropped — real values `#0a0a0a` / `#f5f5f5`; the slash-command
  list advertised `/adblock` and `/off-leash`, which do not ship (they became
  `/block-ads` and `/allow-ads`) and omitted eleven that do, against a shipped set of
  24; and the island was said to name the active group and fold collapsed groups into
  a "mini-dot capsule" when it does neither — there is no group name in the island
  (no `pillGroup` element exists) and overflow is a quiet `+N` past `DOT_CAP = 8`.
- **`github.md` had no entry for the 2026-09-11 sync either** — same miss. Written
  retroactively alongside today's, and `guidelines/dock-icon-colorways.html` was added
  to the screen map with `settings-schema/schema.json` + `src/main/app-icon-assets.js`
  as its sources, so the app-icon set is a tracked input from now on rather than
  something only noticed when a colorway disappears.
- Pushed as plan_bee811dfe403446a_d34b471be18e, 5 files + sentinel fenced first and
  re-armed last. Verified by round-tripping `templates/browser/app.jsx` back
  byte-identical, and by rendering the rebuilt colorway card (7/7 images decode,
  2 selectable + 5 retired at 0.5 greyscale, no horizontal overflow).
- **No app file was touched**, per the standing rule above.

### Lesson: prose surfaces need their own sweep
A component sync is not a documentation sync. `readme.md` and `github.md` restate in
prose what the token and component files encode, and the design agent reads the readme
as fact — so a number corrected in `tokens/layout.css` but left standing in the readme
is still wrong where it does the most damage. **Every future push-drift run must grep
`readme.md` for the values it just changed** (strip height, radii, shadow names and
counts, colour hexes, command names, icon counts) before closing, and add a `github.md`
entry. The three canonical pairs are the scan's floor, not its ceiling.

### Still open (carried forward)
- `.ob-minipill` (first-run onboarding) still asks for `--shadow-pill`, still undefined
  for internal pages, so it still paints no shadow; and it draws a 999px capsule while
  illustrating an island that is now 44/17. Both are app-side, so both stay findings —
  see the standing rule.
- PORT-CHECKLIST's older gaps: the capture-controls popover and retinted theme icons.
- The display-share picker dialog stays unmodeled (transient in-flow UI).
