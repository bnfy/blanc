# Non-island surfaces polish — design

**Status:** approved by the owner 2026-09-26, with decisions D1–D3 taken as
recommended (§10).
**Date:** 2026-09-26.
**Baseline:** `main` at `43e136bd` (includes #431 `e602e1b7` and #432). PR #433
(permission-prompt focus and onboarding ring fixes for #431) is open and is
assumed merged before any work here starts. Line references below are to
`43e136bd`.

## 1. Goal

Refine and polish every desktop surface outside the Island so that it feels
like one product: one visual language, consistent states, and flows that do
not make people work harder than they need to. This covers visual detail and
the flows the owner chose to rework. It adds no new product features.

## 2. Decisions already made by the owner (2026-09-26)

| Topic | Decision |
|---|---|
| Scope | Three surface families: utility sheets, small in-flow views, and chrome beside the Island. Start Page, onboarding and Mahjong are **out** (all passed design QA on Sep 20–23). |
| Direction | **Carry Sunrise warmth into these surfaces.** This deliberately reverses the Sep 21 rule that Sunrise stays on the Start Page. |
| Frame | The vertical tabs rail and Glance header **stay neutral**, like the Island, so the frame around the Island reads as one piece. |
| Depth | Visual and state polish **and** rework of clunky flows. |
| Delivery | One PR per surface family, each reviewed with before/after captures. |
| Codex #431 | Land first and build on it. Its remaining issues are addressed in #433 (open). Its Start Page "finish setup" pill and dashed empty states stay. |

## 3. Scope

### In scope

**Family A — utility sheets** (`body.sheet` pages in `src/renderer/pages/`):
Settings, Favorites (`bookmarks.*`), History, Downloads, Keyboard Shortcuts,
Bring Your Tabs (`tab-import.*`, `tab-import-open-tabs.js`) and the one-time
tab handoff (`tab-handoff.*`). Shared shell: `sheet.js`, `pages.css`.

**Family B — small in-flow views:** the site permission prompt
(`permission.html/js`, `#permissionBar` in `styles.css`), the error and
certificate page (`error.html/js`), the 1Password fill capsule
(`fill-status.html/js`, `.fill-capsule`), and the screen-share picker
(`#displayShareBackdrop` in `overlay.html`, `.display-share-picker`).

**Family C — chrome beside the Island (neutral):** the vertical tabs rail
(`vertical-tabs.js`, `.vertical-tabs-*`), the Glance header and divider
(`#glanceHeader`, `.glance-*`), and the Windows/Linux window controls and main
menu button (`#windowControls`, `#mainMenuButton`).

### Out of scope

- The Island and everything anchored to it: resting pill, panel, palette,
  find, shield popover, and the **capture popover** (`overlayMode === 'capture'`,
  `#capturePop` in `overlay.html`). These stay neutral and unchanged.
- Start Page layouts, first-run onboarding, Mahjong (except D1's focus ring on
  the Start Page and onboarding, §10).
- Native menus and OS-owned dialogs (they keep platform styling).
- New features, new settings, and any change to what a setting does.

## 4. What the audit found

Captured on a scratch profile at 1280×820 and 760×600, light, dark and private,
before #431; rechecked against #431's diff and captures. Classes: **Bug**
(broken behavior), **Inconsistency** (two treatments for one thing), **Flow**
(works, but makes people work harder).

| # | Surface | Finding | Evidence | Class |
|---|---|---|---|---|
| 1 | Settings | The section list never follows scrolling in the sheet. It listens for `scroll` on `window`, but in the sheet the scrolling element is `body.sheet .page`. It only updates on click. | `settings.js:1154`; the same file listens on `.page` for a different purpose at `:1217` | Bug |
| 2 | Shortcuts | Role-based menu items render as "CommandH" and "Command⌥H". The formatter maps `Cmd`/`CmdOrCtrl` but not `Command`/`Control`. | `main.js:6794` | Bug |
| 3 | All sheets | The top nav differs by sheet. Settings, Favorites, History and Downloads show four links in one order; Shortcuts shows them in a different order with no current item; Bring Your Tabs shows only Favorites and Settings. | `shortcuts.html:12`, `tab-import.html:12` | Inconsistency |
| 4 | Bring Your Tabs | Its card is 960px wide while every other sheet is 900px. | `pages.css:1470` vs `:1349` | Inconsistency |
| 5 | Settings | Three section treatments coexist: bordered cards (General, Profiles, Diagnostics), an unboxed editorial block (Sync), and one Privacy & Security card holding five sub-sections with their own `h3`s (1Password, ad-block exceptions, site permissions, usage measurement, clear browsing data). | `settings.html:305–449` | Inconsistency / Flow |
| 6 | Settings | Several descriptions run five to six lines (Encrypted DNS, call audio, usage measurement, Patron), pushing controls apart. | audit capture, 1280×820 | Flow |
| 7 | Downloads | The status column shifts sideways by row: completed rows reserve space for hidden Open/Show actions, cancelled and interrupted rows do not. "Clear finished" floats on its own row. | `downloads.js` action rendering (`.row .actions` is `opacity: 0` but still takes width, `pages.css:300`); audit capture | Inconsistency |
| 8 | History | No day grouping: today shows a time with a leading zero ("04:54 PM"), older rows show "Sep 21". Hard to scan by day. | `history.js:6` `formatWhen` | Flow |
| 9 | Favorites, History | Rows have no site icons, although favorites store a sanitized favicon per record and history keeps a local hostname icon cache. | `bookmarks.js` record `favicon`; `history.js:66,84` | Flow |
| 10 | Permission prompt | Block uses dim text and reads as disabled. Only camera and microphone requests show a glyph. | `styles.css:3167`; `permission.js` | Inconsistency |
| 11 | Error page | The title is set in the dim text color; the body shows the raw Chromium code as the main explanation ("ERR_NAME_NOT_RESOLVED (-105)"). | `pages.css:1126–1140`; `error.js` | Flow |
| 12 | All in-scope surfaces | Neutral white and grey while the Start Page and onboarding around them are Sunrise; the owner chose warmth. | brand-usage.md:164 | Direction |

Checked and fine: Glance header and divider, vertical tabs rows, and the
1Password capsule behave consistently. Family C therefore has the fewest
findings, and its Windows/Linux controls cannot be judged on this Mac (§5.7).

## 5. Design

### 5.1 The rule: Sunrise pages, ink frame

> Sunrise dresses Blanc's own pages and the questions Blanc asks you. The
> frame — the Island, the strip, the vertical tabs rail, the Glance header,
> and everything that opens from the Island — stays ink.

| Warm (Sunrise) | Neutral (unchanged palette) |
|---|---|
| Utility sheets, error and certificate pages, permission prompt, 1Password capsule, screen-share picker | Island and its overlays (panel, palette, find, shield, capture popover), strip, vertical tabs rail, Glance header, window controls |

Typography does not change: Inter stays the operating voice everywhere in
scope. Newsreader stays limited to the invitation titles (brand-usage.md:180
"Do not extend the serif to other product headings without a separate
review").

### 5.2 Tokens

Add a themed `sunrise-*` palette to `tokens/tokens.json` with consumers
`chrome` and `pages`, so `tokens:check` guards both stylesheets and the mobile
generators emit the same names and values (F15: "Token names and values are
shared"). Values are the opaque forms of the approved Start Page palette
(`pages.css` `.ledger-body`, which stays untouched):

| Token | Light | Dark | Private |
|---|---|---|---|
| `sunrise-bg` | `#f7f0e5` | `#17130f` | `#100d0b` |
| `sunrise-surface` | `#efe6d8` | `#2d251d` | `#251d17` |
| `sunrise-surface-raised` | `#fffcf7` | `#221d17` | `#1a1511` |
| `sunrise-border` | `#ddd2c2` | `#4a3e31` | `#594a39` |
| `sunrise-text` | `#12100b` | `#f7f0e5` | `#f8f0e4` |
| `sunrise-text-dim` | `#6b6257` | `#b8aa98` | `#b5a38f` |
| `sunrise-accent` | `#805d28` | `#d4ad66` | `#d4ad66` |
| `sunrise-accent-dim` | `rgba(128, 93, 40, 0.16)` | `rgba(212, 173, 102, 0.2)` | `rgba(212, 173, 102, 0.2)` |

Measured contrast (WCAG): text on every background ≥ 13.3:1; dim text
≥ 4.84:1; gold accent ≥ 4.83:1 (lowest pair: gold on light surface). All pairs
clear 4.5:1.

**Mechanism.** A surface opts in with one scope that remaps the semantic
tokens it already uses (`--bg`, `--surface`, `--surface-raised`, `--border`,
`--text`, `--text-dim`, `--accent`, `--accent-dim`) to `--sunrise-*`, the same
technique `.ledger-body` uses today. Component CSS keeps reading semantic
tokens, so no rule is duplicated per theme. Scopes: `body.sheet`,
`body.error-page` (new class on `error.html`), `body.permission-surface`,
`.fill-capsule`, `.display-share-picker`.

**Roles.** Gold (`--accent` inside a scope) marks state and navigation:
the current nav item, selected rows, toggles in the on position, links and
progress. Primary buttons stay ink on ivory (dark mode: ivory on ink), as on
the website ("dark primary buttons"). Destructive actions keep `--danger`.

### 5.3 Shared components (all warm surfaces)

- **Sheet card and scrim:** card on `sunrise-surface-raised`, hairline
  `sunrise-border`, existing radius and shadow. The scrim keeps today's
  strength (0.18 light, `pages.css:1335`; 0.35 dark) but takes the warm ink
  hue `rgb(18, 16, 11)` instead of neutral grey (decision D3).
- **Buttons:** primary (ink fill), secondary (hairline, full-contrast text —
  never dim), quiet text button, danger. One height and padding scale across
  every warm surface.
- **Toggles, selects, text inputs:** redrawn on the palette. On-state toggle
  in gold. The in-page select pickers from #203 keep their behavior.
- **Row lists:** icon column (16px favicon, domain-initial fallback matching
  the Island's), title and secondary line, a fixed-width meta column and a
  fixed-width action column. Actions reveal on hover and focus, but their
  width is always reserved, so columns never shift (fixes finding 7).
- **Empty states:** keep #431's dashed placeholder box (it matches the
  existing `.tab-import-placeholder` convention), redrawn on the palette, with
  one sentence and, where there is one, a single next action.
- **Focus:** see decision D1 (§10).

### 5.4 Family A, part 1 — sheet shell, system and bugs

1. Apply the `body.sheet` Sunrise scope and the shared components.
2. **One nav for every sheet:** Settings · Favorites · History · Downloads, in
   that order. Shortcuts and Bring Your Tabs show the same four links with no
   current item. The tab handoff keeps its one-time label and no links: it is
   a security confirmation, not a place to wander from.
3. **One card width (900px).** Bring Your Tabs moves to 900px unless its
   review step no longer fits without horizontal scrolling at 900px, checked
   by capture at 1280×800 and 640×480. If it does not fit, 960px stays as the
   single documented exception.
4. **Fix finding 1:** the section list follows scrolling of the element that
   actually scrolls.
5. **Fix finding 2:** `formatAccelerator` maps `Command` and `Control`.

### 5.5 Family A, part 2 — page flows

**Settings.**
- One section grammar: section label, then one or more cards of rows. Sync
  keeps its two-path setup (#382, #384), but inside that grammar rather than
  as a free-standing editorial block.
- Privacy & Security becomes five cards instead of one: **Blocking**
  (ad blocking and exceptions), **Calls and connections** (IP address in
  calls, call audio, encrypted DNS), **1Password** (macOS only, as today),
  **Site permissions**, and **Usage and data** (help improve Blanc, reset
  install ID, clear browsing data).
- Long descriptions become a one-line summary plus a **Details** disclosure
  holding the existing text word for word. Privacy and telemetry wording is
  a disclosure, so it is never shortened or reworded here.
- Controls, keys, defaults and validation are unchanged (F14 contract).

**History.**
- Day groups with headings: Today, Yesterday, then weekday and date. Times
  per row in the locale's format without a leading zero.
- Site icons from the existing local hostname icon cache: no network request,
  no new stored data. `pages:history:list` gains an `icon` field for rows whose
  hostname is cached. This is a data-flow change inside the existing guarded
  IPC and gets a privacy note in the PR.
- Search, per-row Remove, and Clear all keep their behavior.

**Favorites.**
- Rows show the favicon each favorite already stores, with the Island's
  domain-initial fallback.
- The import actions keep their three explicit buttons. F30's rule that
  browser discovery sits behind an explicit button stays.

**Downloads.**
- The fixed column layout from §5.3. In-progress downloads first, with their
  progress bar. Status as a word plus a small glyph.
- The secondary line shows the source's domain; the full URL moves to the
  tooltip. Long file names keep their extension visible.
- "Clear finished" moves into the header row next to the title.

**Keyboard Shortcuts.** Shared nav, fixed labels (finding 2), keycaps on the
palette. Slash-command copy stays owned by `copy/slash-commands.json`.

**Bring Your Tabs.** Shared nav and width. When no supported browser is
found, the empty state names the browsers Blanc can read and points to
Favorites → Import HTML… as the alternative.

**Tab handoff.** Palette and components only.

### 5.6 Family B — small in-flow views (warm)

**Permission prompt.** Sunrise surface; Block becomes a secondary button with
full-contrast text; every permission type gets a glyph (location and
notifications join camera and microphone). The requesting host is set in
medium weight, the rest of the sentence in regular. The copy is
unchanged (F13 requires shared decision copy across platforms). #433's
no-focus behavior stays; the prompt text becomes a polite live region so
screen readers announce it without moving focus.

**Error page.** Sunrise surface; title in full-contrast text. Plain titles by
error class, with the technical line kept underneath:

| Chromium codes | Title |
|---|---|
| -105, -137 (name not resolved) | Can't find {host} |
| -106 (internet disconnected) | You're offline |
| -102, -101, -118 (refused, reset, timed out) | {host} isn't responding |
| crash reasons (non-numeric) | This page stopped working |
| anything else | This page didn't load |

The certificate variant keeps its title, detail list, and the rule that Blanc
offers no bypass. The Chrome Web Store variant is unchanged.

**1Password capsule.** Palette and shared buttons. Its hairline focus stays
(it is the existing precedent).

**Screen-share picker.** Palette, shared buttons and source tiles; #431's
narrow-window layout stays.

### 5.7 Family C — chrome beside the Island (neutral)

A consistency pass on the neutral palette:

- Labels: the Glance eyebrow is still set in the mono face
  (`styles.css:202`) while the rail's labels moved to Inter in `0093b6c4`;
  the eyebrow moves to Inter so the frame uses one label face.
- Hover, pressed and focus states on rail rows, the rail footer, the Glance
  actions and the divider use the same values.
- **Windows/Linux window controls and main menu button:** audited on a
  private validation build (`release-windows-linux.yml`, `mode=validation`)
  before any change. The PR lists only what that audit finds.

## 6. Cross-cutting

- **Accessibility:** contrast as in §5.2. The current nav item and the current
  settings section carry `aria-current` (added in #431). Nothing moves focus
  unless the person asked for it.
- **Small windows and zoom:** every in-scope surface checked at 640×480 and
  at 150% zoom, with no horizontal page scroll.
- **Private tabs:** utility sheets are device-level and do not take the
  private theme (as today). The error page in a private tab uses the private
  Sunrise values.
- **Motion:** no new animation. Existing transitions respect reduced motion.

## 7. Documents changed alongside the code

Each lands in the same PR as the code that needs it.

- `docs/brand-usage.md`: replace the Start-Page-only rule (line 164), the
  "product tokens are never warmed" line (77), and the Start-Page-only token
  clause (89–91) with the rule in §5.1.
- `pages.css:46` comment ("Patron is the one product surface allowed to carry
  Sunrise warmth").
- `tokens/tokens.json` plus `npm run tokens:build`; `spec/features.md` F15
  (and F16 for warm internal pages), ratified in the same commit.
- `CLAUDE.md:119` and `AGENTS.md:125` Theming paragraph, kept identical.
- `design-qa.md` entry and `docs/design-reviews/non-island-polish/<family>/`
  before/after captures, following #431's convention.
- After all families land: a `/design-sync` push to the Design System as its
  own approved step. The sync never changes the app.

## 8. Delivery

| Order | PR | Contents |
|---|---|---|
| 1 | A1 | Tokens, `body.sheet` scope, shared components, one nav, one width, findings 1 and 2, brand and theming docs |
| 2 | A2 | Settings, History, Favorites, Downloads, Shortcuts, Bring Your Tabs flows |
| 3 | B | Permission prompt, error page, 1Password capsule, screen-share picker |
| 4 | C | Rail, Glance header, Windows/Linux controls |

Every PR: a branch off current `main`; before/after captures in light and
dark (and private where the surface has a private variant) at 1280×800 and
640×480; unit, lint, `substrate:check` and the
related acceptance scenarios; rendered proof shown to the owner **before**
the branch is pushed; a private Windows/Linux validation build before merge.
No public release is part of this effort.

## 9. Testing

- **Unit (behavior, test first):** accelerator labels (table of inputs and
  expected labels, lifted from `main.js`); settings scroll tracking against
  a stand-in scroll container; history day grouping as a pure helper in a flat
  `pages/` file loaded by both the page and the test; error-class titles from
  code to title; contrast of every `sunrise-*` text and background pair
  computed from `tokens.json`.
- **Acceptance:** extend the runnable F9, F10, F11, F14 and F16 scenarios
  where behavior changes (day headings, icons, nav set). `@F36-1` changes to
  "visible, at least 1px" (D1).
- **Captures:** promote the audit's capture script into a dev-only
  `test/desktop/surface-captures.mjs` so every PR produces the same set.

## 10. Decisions (owner, 2026-09-26: "go with your recommendations")

- **D1 — Focus ring: hairline.** Today pages use a 2px ring with a 1px gap
  (`pages.css:203`), and `@F36-1` requires at least 2px on onboarding.
  Decided: **one 1px ring in `--text-dim` on every `blanc://` page and every
  in-scope chrome surface**, with `@F36-1` changed to "visible, at least 1px"
  in the same commit. Because it covers every `blanc://` page, this is the one
  deliberate change that reaches the Start Page and onboarding; it lands in A1
  so it is reviewed once. Mahjong is excluded: it keeps its own focus styling
  (`mahjong.css`), per brand-usage.md's rule that Mahjong keeps its identity. The Island keeps its own rings until a
  later Island pass. Rationale: the owner's stated preference, applied
  consistently. It still meets WCAG 2.2 AA (visible, ≥3:1 against the
  surface); only the AAA focus-appearance guideline asks for 2px.
- **D2 — Family A ships as two PRs** (A1 shell, A2 flows), a deliberate
  exception to one PR per family because utility sheets are by far the largest
  family.
- **D3 — Warm scrim.** Sheets sit over a warm-tinted scrim instead of today's
  neutral grey, at today's strength. The page underneath stays untouched.

## 11. Risks

- **Two palettes side by side:** a warm sheet sits under the white Island.
  This is the chosen direction; captures in every PR show it.
- **Substrate churn:** new tokens regenerate the mobile token files; reviewed
  in A1.
- **Settings scope creep:** A2 changes layout and disclosure only; any change
  to a setting's behavior is out of scope.
- **Windows/Linux:** focus, controls and fonts differ; each PR gets a
  validation build.

## 12. Follow-ups noted, not part of this effort

- Billboard's "Upgrade to Blanc Patron" button sits partly behind the footer
  at 640×480 (present before and after #431; Start Page is out of scope).
- Acceptance `@F33-2` and `@F38-3` failed on untouched `main` on the owner's
  Mac on 2026-09-26 while passing earlier the same day; likely local window
  focus. Worth a look on its own.
- Aligning the Island's focus rings with D1.
- Marketing and site imagery that shows utility pages is refreshed only after
  a release ships this work (marketing claims rule).

## 13. System v2 — owner decisions, 2026-09-27

This dated direction supersedes the earlier scope and component details where
they differ. The owner found A1/A2 too subtle and asked for visibly rounder
dialogs, Inter throughout product UI, and a more mature shared system. The
`claude/non-island-polish-v2-proto` stylesheet is a visual reference, not code
to ship as an appended override block.

### Scope and voice

System v2 covers every utility sheet, the site permission prompt, 1Password
fill capsule, screen-share picker, error and certificate page, and first-run
onboarding dialog. The Island and its anchored surfaces, strip, Start Page
layouts, and Mahjong keep their layouts. The vertical tabs rail and Glance
header stay neutral alongside the Island but receive typography and state
polish. Windows/Linux controls are audited on a private validation build
before changing them.

Sunrise remains the palette for Blanc's own pages and prompts; the frame stays
neutral. Remove mono from all product UI, including addresses, times, sizes,
counts, keycaps, slash commands, and the Patron license key. Use Inter with
tabular figures where values align and a slashed zero for the license key.
Only Mahjong tile faces retain JetBrains Mono through `--mj-face-font`.
The owner expanded Newsreader to utility-sheet page and section headings on
September 27 after seeing system v2 on Mac. Lists, controls, card labels, and
body copy remain Inter. The 1px
`--text-dim` focus rings on `blanc://` pages are settled; Mahjong keeps its
own focus treatment. Keep #431's Start Page finish-setup pill. Do not reword
privacy, telemetry, Patron, or permission copy; folding the exact text remains
allowed.

### Scale and components

The new radius tokens are 8px small, 10px for buttons/fields/rows, 14px for
cards and grouped lists, 20px for sheets/dialogs, and full for segmented tabs,
toggles, and primary pills. The existing 6px `--radius` stays available for
the Island and Start Page. Utility-sheet page titles are Newsreader 30px/500
with slight negative tracking; section titles are Newsreader 21px/500; card
titles are dim Inter 12px/600; body text is Inter 13px. In-scope labels do not use
uppercase letter spacing.

Utility-sheet navigation becomes a segmented control on `--surface`, with a
raised current segment, a 32px round soft close button, and a hairline at the
sticky header's lower edge. Secondary controls are 32px high, 10px round,
and soft-filled; primary controls are ink pills. Text fields are 36px high.
Toggles are 40×24px with a gold on-state and a light knob. The sheet canvas is
`--sunrise-bg`; raised cards and lists have a hairline and 14px corners, while
lists nested within cards stay flat. Site icons are 20px with 6px corners.
History and Favorites actions overlay the right edge on reveal, leaving dates
flush right at rest; Downloads retains aligned status and action columns.
Sheets and dialogs start from a soft two-layer shadow of
`0 30px 90px rgba(18,16,11,.22), 0 2px 10px rgba(18,16,11,.08)`.
