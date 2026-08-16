# New tab layouts + first-run onboarding — design

**Date:** 2026-08-16 · **Status:** approved pending user review
**Design source:** Blanc Browser Design System, `design_handoff_newtab_onboarding/`
(vendored verbatim in `references/2026-08-16-newtab-onboarding/` — `HANDOFF-README.md`
is the annotated spec, `NewtabOnboarding.dc.html` is the pixel source of truth).

## The verbatim rule

The prototype's inline style values, markup structure, copy, and SVG paths are
transcribed **exactly as they are** — no re-derived spacing, no "improved" values,
no substitute glyphs. Where the prototype and the handoff README prose disagree,
the prototype wins (it is what the screenshots were captured from). The only
permitted differences are (a) the four approved product deviations below, and
(b) mechanical adaptation to the renderer environment: React/`sc-if` template →
vanilla JS + hidden containers, `style-hover` attributes → CSS `:hover` rules,
prototype stub data (Google favicon service, hardcoded favorites/groups/counts) →
the app's real data feeds. The prototype's own state technique — CSS custom
properties flipped from JS (`--adb-track`, `--dot-N`, `--lay-*`, `--imp-*-bg`) —
ports directly to vanilla and SHOULD be kept, not replaced with class juggling.

## Approved product deviations (the complete list)

1. **Privacy step added — 6 steps, not 5.** The existing fresh-profile privacy
   card (search-suggestions + usage-ping consent) is absorbed into the dialog as
   step 5, between *ad blocking* and *theme*. Step labels become
   `default browser · import · the island · ad blocking · privacy · theme`;
   the header reads `{i} / 6 — {name}`; the footer renders 6 dots. The step's
   visual language follows the dialog system (h1 + dim body + bordered control
   rows with the standard toggle), carrying the same two choices and copy intent
   as the current card. The telemetry invariant is untouched: **no ping fires
   before the choice is saved**. `skip setup` saves the privacy choices at the
   values the step presents (the card's preselected defaults) — skipping can
   never leave the profile without a recorded choice.
2. **Import step is bookmarks-only.** H1 becomes "Bring your bookmarks"; the key
   tile is dropped from the vignette (heart tile → arrow → blanc tile remain,
   prototype values otherwise unchanged). Body copy stays
   "Imports happen on this device — nothing is uploaded."
3. **Import sources are detected, not hardcoded.** The radio list shows the
   installed browsers reported by the existing `browser-data-import.js` service
   (Chrome / Edge / Brave / Chromium / Vivaldi as present, service order, first
   row preselected) plus a final "From a bookmarks file (HTML)…" row that runs
   the existing file-picker import (Safari and Firefox both export that format).
   No new parsers. Row anatomy is the prototype's verbatim.
4. **Layout switcher ships in the footer AND Settings.** The prototype's footer
   switcher appears on all four layouts exactly as drawn; Settings → General
   additionally gains a "New tab layout" select (ledger / billboard / shelf /
   tally), consistent with the existing selects there.

These deviations get pushed back to the design system (handoff README + prototype)
after shipping, via the established design-sync flow — the DS follows code.

## Feature 1 — new tab layouts

- `blanc://newtab` renders one of four layouts from the `newtabLayout` setting:
  `ledger` (shipped today, unchanged), `billboard`, `shelf`, `tally` — markup and
  CSS transcribed from the prototype's four `sc-if` blocks.
- Shared frame: existing island/strip untouched; the footer becomes the
  prototype's three-part row (blocked count · `layout:` switcher · ⌘L hint).
  The footer stays **in-flow scroll behavior as shipped** where the ledger
  overflows (the 2026-07-22 decision stands); on the three new layouts it is
  absolutely positioned per the prototype (their content does not overflow).
- Billboard clock: `toLocaleTimeString(undefined, {hour:"numeric",minute:"2-digit"})`,
  meridiem split exactly as the prototype's regex does it; one `setInterval`
  aligned to the minute, torn down when the layout isn't active.
- Data feeds: favorites (existing `pages:bookmarks:list`), groups + weekly count
  (existing `pages:start:data`), plus two new fields (below). Billboard's short
  favorite labels derive from the favorite's domain first label (e.g. `github`),
  lowercased — the prototype stubs (`hn`, `linear`) are stub data, not a rule.
- Tally chart: 7 bars from real per-day blocked counts, **every bar (today
  included) normalized to the busiest day** — colour marks today (solid
  `--accent`), height is data. The prototype draws today at 100% because today
  was the max in its stub data; that is not the rule. Labels rotate so today is
  last. Zero-count weeks render all bars at 0 height with the bottom border
  intact. The caption's first line names the real busiest day
  (`busiest day friday.`), second is the fixed `nothing followed you home.`.
- Empty states: layouts render without favorites/groups by omitting those
  sections (the ledger already behaves this way); no new empty-state copy.

### Setting

- `newtabLayout: "ledger" | "billboard" | "shelf" | "tally"`, default `ledger`,
  validated like `theme`, **added to `SYNCED_KEYS`** (same class of preference
  as `theme`).
- `settings-schema/schema.json` gains the `newtabLayouts` enum + the key;
  `npm run settings:build` regenerates `settings-schema/generated/`;
  `substrate:check` must stay green.
- Settings → General gains the "New tab layout" select wired the standard way.
- Footer switcher writes the setting over a new narrow IPC
  (`pages:start:set-layout`, newtab-sender only, enum-validated in main);
  `tabs`/settings broadcasts keep multiple open newtabs and the Settings page
  in agreement.

### Per-day blocked counts (data model)

`adblock-stats.json` grows from `{weekStart, blocked}` to
`{weekStart, blocked, days: [n0..n6]}` (Mon-indexed, same `currentWeekStart()`
lazy rollover — on week change both `blocked` and `days` reset). Increments
bump `blocked` and today's bucket together. Upgraded installs seed
`days: [0,…,0]` mid-week: the chart may under-report the upgrade week while
`blocked` (the number everywhere else) stays true — accepted, self-heals next
Monday.

## Feature 2 — first-run onboarding

- Markup/CSS/copy/SVGs from the prototype's dialog block, verbatim, with the
  deviations above. Renders over whatever layout is active, inside the newtab
  page (scrim `rgba(0,0,0,0.4)` covers the page, not the island strip — same
  containment as the prototype).
- **Gating:** shows exactly where the privacy card shows today — the existing
  fresh-profile detection (`privacy.required`, i.e. `onboardingVersion <
  FIRST_RUN_VERSION`; legacy profiles were auto-marked complete when that
  mechanism shipped, so `required` is only ever true on a genuinely fresh
  profile). The dialog **replaces** the standalone privacy card and its inline
  migration offer outright — both are superseded (privacy → step 5, migration →
  step 2). The startup (blocking-preparation/failure) card is untouched and
  takes precedence: while it shows, the dialog waits. The done flag is the
  existing `onboardingVersion` marker, persisted by the same
  `completeFirstRunPrivacyChoices` commit (device-local; never synced) —
  `skip setup` and `Start browsing` both route through it.
- **Re-runnable:** Settings gains a quiet "Show welcome tour" action row. It
  opens the tour through a sender-validated IPC that creates and activates the
  tab in main (the utility sheet's navigation policy is default-deny for
  non-utility `blanc://` URLs, so a renderer-side `location.href` would be
  inert). The dialog initializes from a least-privilege `onboarding`
  projection on `pages:start:data` (`{adblockEnabled, theme}`) so a replay
  shows what is actually saved, never invented defaults; changing a choice
  re-saves it — which requires `completeFirstRunPrivacyChoices` to validate
  and write on every call rather than short-circuiting once first run is
  complete. The dialog closes only on a confirmed successful write; a
  write failure keeps it open and shows the error copy.
- Step actions wire to existing machinery only:
  1. *default browser* — the existing `pages:default-browser:get`/`:set`
     handlers, allowlist widened to the newtab sender. Their `canSet` guard is
     load-bearing and stays: an unpackaged dev run must never register the bare
     Electron binary, and Linux has no Electron API for it — the CTA renders
     disabled in both cases.
  2. *import* — existing `pages:bookmarks:browser-sources` /
     `pages:bookmarks:import-browser` / file-picker import (the latter two need
     their allowlist widened to newtab **and** exposure in the newtab preload
     surface). **F30/D22's explicit-discovery rule binds here:** no browser
     profile directory is read until the person asks, so the step renders a
     "Look for installed browsers" button (the shipped card's affordance) and
     the always-available bookmarks-file row; `browserSources()` runs only on
     that click. Import runs when the user advances with a source selected
     ("no thanks" = advancing with nothing selected); result feedback is the
     imported count in the step body, prototype-styled.
  3. *the island* — static vignette, verbatim.
  4. *ad blocking* — toggle writes `adblockEnabled` through the normal settings
     path, live (matches the existing Settings toggle semantics).
  5. *privacy* — the two consent choices, saved through the exact code path the
     privacy card uses today.
  6. *theme* — the two cards, verbatim (literal colors intentional); picking
     applies `theme` live through the normal settings path.
- No scrim-click dismissal (deliberate); Esc does not dismiss (skip is explicit);
  Back/Continue never wrap. `prefers-reduced-motion` honored (only the toggle
  slide and hover fades animate anyway).

## Architecture

- **Renderer:** `newtab.html` gains the three new layout containers + footer
  switcher + dialog markup; layout selection via `data-layout` on `<body>`;
  per-layout CSS in `pages.css` (flat-serving constraint: everything stays in
  `src/renderer/pages/`). `newtab.js` owns layouts/footer; a new flat
  `onboarding.js` owns the dialog (own file for isolation; both included by
  `newtab.html`). The dialog uses the prototype's CSS-custom-property state
  technique. The blanc mark in vignettes renders the shipped stroked-mark path
  (per the stroked-mark rule, `stroke` follows `fill` = `currentColor` — the
  prototype already does this).
- **Main:** `settings.js` (key, default, validation, SYNCED_KEYS, select
  labels); `main.js` adblock stats day buckets; `pages.js` — `pages:start:data`
  additionally returns `{layout, blockedByDay, onboarding}`, new handlers
  `pages:start:set-layout` and `pages:start:onboarding:*` (set-default /
  save-privacy / done — the rest reuses existing handlers), each newtab-sender
  validated like every `pages:*` channel.
- **CSP/network:** no new origins; favicons through the app's existing favicon
  pipeline; fonts/assets already bundled. The Google favicon service in the
  prototype is stub-only and must not ship.

## Testing

- Unit: day-bucket increment/rollover (fake clock), bar-height normalization
  including the zero week, `newtabLayout` validation + sync-key membership,
  the privacy re-save path, onboarding gating (fresh vs existing profile, done
  flag, skip-records-privacy-defaults invariant).
- Substrate: `settings-schema/build.mjs` must be extended alongside
  `schema.json` — it hardcodes each enum it generates and compares, so a
  JSON-only change leaves `settings:check` green while guarding nothing. Prove
  the new guard fails on deliberate drift before trusting it.
- Acceptance: `spec/acceptance/` scenarios under new stable ids (F35-*, F36-*),
  **registered in `test/desktop/cucumber.mjs`'s `RUNNABLE` list with real step
  definitions** — the profiles select by explicit id, so an unregistered
  scenario is silently never run. Covers: saved layout renders, choosing a
  layout persists it, fresh profile sees the walkthrough once, skip records
  privacy choices, completed profile is not re-asked, and no browser profile
  is read before the explicit ask.
- Existing tests that drive `#privacyCard` (`src/main/test-hook.js`, F30-3's
  steps, `test/desktop/packaged-first-run-smoke.mjs`) must be re-pointed at the
  dialog in the same commit that removes the card.
- Governance: new feature entries in `spec/features.md` (F35, F36 — with F30's
  first-run wording reconciled), parity-matrix rows, and
  `spec/acceptance/index.md` traceability rows; `npm run substrate:check` and
  `test:unit` green in CI.
- Hand verification: relaunched dev app (`npm start`), all four layouts in
  light/dark/private, onboarding on a scratch fresh profile, 1440px pill-fit
  unaffected. Playwright gotchas per repo memory (focus, colorScheme pinning).

## Non-goals

- Password import, Safari/Firefox native bookmark readers.
- Any change to the island/strip chrome, session model, or sync protocol.
- Mobile implementations (spec/ entries define the contract; apps don't exist).
- A `/layout` slash command (not in the design; the footer + Settings cover it).
