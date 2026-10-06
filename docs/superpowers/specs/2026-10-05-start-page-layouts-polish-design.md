# Start page layouts polish — design

**Date:** 2026-10-05
**Status:** Draft for owner review
**Scope:** `blanc://newtab` — the shared frame and all four layouts (Ledger,
Billboard, Shelf, Tally)
**Delivery:** four PRs. PR 1 = shared frame + Ledger. PRs 2–4 = Billboard,
Shelf and Tally, each independent once PR 1 lands.

## Why

The four Sunrise layouts (#406) shipped with problems that show up at
ordinary window sizes. Captures from `main` at `4777cf4c`, 1440×900 and
820px, light/dark/private, with seeded data:

1. Tally: at 1440×900 the moving-in checklist overlaps the chart caption. At
   820px the chart sits behind the footer.
2. Billboard: recent-site labels are full page titles (`newtab.js:509`), so
   they wrap to two lines and still get cut off.
3. Private tabs show the Patron upgrade button.
4. Ledger, Shelf and Tally pin their content to the left and leave the middle
   empty. The checklist sits in a different place on every layout.
5. The black Patron pill is the heaviest element on every layout.
6. Shelf: the groups and blocked cards ignore the favorites grid, and 6
   favorites in 4 columns leave holes.
7. Labels are uppercase and letter-spaced and the date is tracked. That
   doesn't match the rest of the product's type.
8. The footer holds six items, and three layouts show the blocked count
   twice.
9. Ledger group names don't line up: a 2-dot cluster is wider than a 1-dot
   cluster.

## Owner decisions (2026-10-05)

- **Depth:** a shared frame plus a bold rework of each layout. All four
  layouts stay, along with the `newtabLayout` setting, its sync, and the
  `newtab_layout` telemetry ids.
- **Patron:** a quiet outlined chip with the Sunrise mark. It always sits in
  one slot (the last item in the content area) and is hidden in private tabs
  and for Patrons.
- **Footer:** the layout picker and the dynamic-wallpaper switch move behind
  one **Customize** button. Its popover shows small layout previews. The
  blocked count appears in the footer only on layouts that don't already show
  it. Version, Mahjong and the ⌘L hint stay.
- **Footer position:** the footer stays a fixed, blurred bar, as it has been
  since #406. Its hard top line is replaced by a soft fade that appears only
  when content scrolls under it. This corrects the earlier handoff, which said
  the footer "still scrolls with the page". That July 2026 decision was
  superseded by #406 and is not being restored.
- **Empty-state hint:** shown when there are no favorites (see *Empty state*
  for Billboard). This deliberately reverses the August 2026 rule of "no copy
  on the new layouts".
- **apple-design review:** approved in full: the type table, the
  surface-weight ladder with accessibility fallbacks, motion, and one
  corner/shadow scale.
- **Delivery:** prototype first. PR 1 is built in the real app and shown to
  the owner as before/after crops before the PR is opened.

## Section 1 — shared frame

### Page grid

`.ledger-body` becomes a three-row page:

1. **Header row:** the Sunrise mark and date on the left, the checklist slot
   on the right. The header is **in normal flow** (it is `position: fixed`
   today), so it scrolls with the page and can never sit over content rows.
2. **Content area:** `.start-content`, centered, with
   `max-width: 1080px` and `padding-inline: clamp(24px, 5vw, 72px)`. Every
   layout renders only inside it. No layout uses `position: absolute` or
   `fixed` for its content any more; that is what produces today's overlaps.
3. **Footer:** fixed to the bottom (unchanged position). The body reserves
   the footer's height as bottom padding, so the last content row always ends
   above the footer when the page is scrolled to the end.

The four `<main>` layout roots move inside `.start-content`. The startup
card, the onboarding dialog and the wallpaper layer stay where they are.

### Checklist slot

- At widths ≥ 960px the full checklist sits in the header row's right cell,
  top-aligned with the mark, on every layout. It is in the page flow, so the
  content area starts below whichever is taller, the brand or the checklist.
  Overlap becomes impossible by construction rather than by per-layout
  offsets. The per-layout `top:` overrides (`body[data-layout="billboard"]`,
  `body[data-layout="tally"]`) are deleted.
- Under 960px it collapses to the existing ring badge **in the same top-right
  corner** (today it moves to the bottom right above the footer). Tapping the
  ring expands the list downward from the ring.
- Unchanged: the checklist copy, the 1.5-second completion dwell, the
  private-tab and startup-card rules, and its `pages:*` calls.

### Typography

These are values scoped to `.ledger-body`, not new `:root` tokens, so
`tokens.json` is untouched. If the implementation does add a `:root` token,
it updates `tokens/tokens.json` in the same commit and runs `tokens:build`.

The bundled Inter has a weight axis only, so its tracking is set by hand per
size. Newsreader has an optical-size axis (6–72) that the browser applies
automatically. The spec sets `font-optical-sizing: auto` explicitly on every
Newsreader role so a later edit can't silently switch it off.

| Role | Face | Size / line height | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- | --- |
| Section label ("Favorites", "Pick up where you left off") | Inter | 12px / 1.3 | 600 | +0.005em | sentence case, `--text-dim` |
| Row name | Inter | 14px / 1.45 | 450 | 0 | |
| Secondary (host, counts, captions) | Inter | 12px / 1.45 | 400 | +0.005em | numbers `tabular-nums` |
| Footer | Inter | 11px / 1.4 | 400 | +0.005em | |
| Date | Inter | 12px / 1.3 | 500 | 0 | was 11px, +0.08em |
| Ledger "Where to?" | Newsreader | 32px / 1.1 | 400 | −0.015em | `font-optical-sizing: auto` |
| Big numbers (Shelf 32px, Tally 58px) | Inter | — / 1 | 650 | −0.02em | `tabular-nums` |
| Billboard clock | Newsreader | unchanged `clamp(80px, 12vw, 148px)` / 1 | 650 | −0.01em | add explicit `font-optical-sizing: auto` |

- Labels lose `text-transform: uppercase` and their `0.11em`/`0.12em`
  tracking. The copy itself becomes sentence case: "Favorites", "Pick up
  where you left off", "On your other devices", "Blocked this week".
- The date uses the locale's own capitalization ("Monday, October 5"); the
  `.toLowerCase()` in `newtab.js` goes. Private tabs read "Private tab".
- Footer items become sentence case: "Customize", "Mahjong", "⌘L to go
  anywhere".
- The checklist heading ("ready to move in?") and its copy are unchanged.
  Checklist copy is out of scope.
- Mahjong tile faces are untouched (JetBrains Mono 800 via `--mj-face-font`).

### Group rows

The dot cluster gets a fixed-width slot (5 dots × 6px + 4 × 4px gap = 46px,
the existing cap of 5), so names line up whatever the tab count.

### Surfaces (material weight)

One rule: the more a surface floats, the heavier it gets. A translucent
surface never sits on another light translucent surface. The one exception
is a level-2 surface over the footer, which is near-opaque for exactly that
reason.

| Level | Used by | Fill | Blur | Edge and shadow |
| --- | --- | --- | --- | --- |
| 0 — on the landscape | Ledger and Tally rows, group chips, Patron chip | none | none | chips: 1px border at `color-mix(--border 80%)`; Patron: gold outline |
| 1 — cards | Shelf tiles and cards; icon tiles everywhere | `color-mix(--surface-raised 80%, transparent)` | `blur(12px) saturate(140%)` (cards only; icon tiles get no blur) | the card shadow; light mode adds `inset 0 1px 0 rgb(255 255 255 / 0.55)` |
| 2 — floating | Customize popover, expanded compact checklist | `color-mix(--surface-raised 94%, transparent)` | `blur(20px) saturate(140%)` | the floating shadow |
| Footer bar | footer | `--start-footer` (unchanged) | `blur(14px)` (unchanged) | no border; soft fade (below) |

- **Footer edge:** the `border-top` goes. When content is underneath the
  footer, a 24px gradient above the footer fades from transparent to the
  footer color. An `IntersectionObserver` on a sentinel at the end of
  `.start-content` toggles `body.has-underflow`. At rest on a page that fits,
  there is no line at all and the footer's tint alone separates it.
- **Clock glow:** the `text-shadow` stays in light mode (legibility over the
  landscape). Dark and private set `text-shadow: none`, because there it reads
  as a halo.
- **`prefers-reduced-transparency: reduce`:** every level-1/2 surface and the
  footer use an opaque fill (the theme's `--onboarding-surface`, which is
  already opaque per theme) with `backdrop-filter: none`.
- **`prefers-contrast: more`:** opaque fills as above, with borders at
  `--text-dim`.

### Corners and shadows

| Element | Radius |
| --- | --- |
| Icon tiles (all layouts) | 6px (Ledger's 5px goes) |
| Cards (Shelf) | 10px |
| Floating surfaces (popover, expanded checklist) | 14px |
| Chips, footer buttons, Patron chip | 999px |

Three shadows, defined once as custom properties on `.ledger-body`:
`--start-shadow-icon` (today's `0 7px 22px -17px rgba(18,16,11,.65)`),
`--start-shadow-card` (today's Shelf `0 14px 36px -30px rgba(18,16,11,.68)`)
and `--start-shadow-float` (`0 24px 60px -32px rgba(18,16,11,.7)`). No other
shadow values remain on the start page.

### Motion

The page has nothing you drag, so there is no spring library. CSS
transitions are enough: a transition toggled mid-flight reverses from the
element's current value, which is the interruptibility that matters for a
popover. Nothing bounces.

- **Shared timing:** `--start-ease: cubic-bezier(0.2, 0, 0, 1)` (settles
  without overshoot). Enter 200ms, exit 150ms, layout fade 160ms, hover
  120ms.
- **Customize popover:** grows out of its button
  (`transform-origin: bottom center`, since it opens upward from the footer):
  `opacity 0 → 1` and `scale(0.96) translateY(4px) → none`. It closes back
  along the same path. Built on the native Popover API (`popover="auto"` +
  `popovertarget`), which supplies Esc, click-outside dismissal, focus return
  and top-layer stacking above the fixed footer. Entry uses `@starting-style`
  and `transition-behavior: allow-discrete`. Placement uses CSS anchor
  positioning against the Customize button. (All of these are supported by
  the bundled Chromium; the plan verifies that in the real app before relying
  on them.)
- **Expanded compact checklist:** the same motion, growing downward from the
  ring (`transform-origin: top right`).
- **Changing layout:** only the content area moves. The newly shown layout
  root fades in over 160ms. The header and footer stay still, and the
  popover stays open so you can compare layouts. The fade is suppressed on
  first paint (a `body.layout-ready` class is set after the first
  `applyLayout`), so opening a new tab never fades.
- **Press feedback:** tiles, chips, layout previews and the Customize button
  take `transform: scale(0.98)` on `:active` immediately, easing back over
  120ms on release.
- **Hover:** the Shelf tile lift (`translateY(-1px)`) gains a 120ms
  transition; today it jumps.
- **`prefers-reduced-motion: reduce`:** no transforms anywhere. The popover
  and checklist use a 120ms opacity fade only, and the layout change is
  instant.

### Footer

| Slot | Content |
| --- | --- |
| Left | Ledger only: "N ads blocked this week" (Billboard, Shelf and Tally already show it). Then the version. Private, every layout: the existing private explanation instead. |
| Center | **Customize** button, which opens the popover. |
| Right | Mahjong · ⌘L to go anywhere |

**Customize popover contents**

1. A "Layout" label, then four preview buttons in the existing order:
   Ledger, Billboard, Shelf, Tally. Each is a 64×40 thumbnail drawn in CSS
   (spans, no images) with the name under it. The buttons keep
   `data-layout-pick` and `aria-pressed`, so the IPC path and the test hook
   keep working. The active layout is marked with `aria-pressed="true"` and a
   2px accent outline. Picking a layout applies instantly and calls the
   existing `setLayout`.
2. A hairline divider, then the existing dynamic-wallpaper switch, moved
   unchanged (the same element id, `aria-pressed`, `setDynamicWallpaper` and
   disabled-while-pending behavior). The label becomes sentence case: "Dynamic
   wallpaper".

The popover has `aria-label="Customize start page"`. The button carries
`aria-expanded` mirrored from the popover's toggle event.

### Patron chip

- **Markup:** each layout's `.js-patron-callout` moves so that it is the
  **last child of its layout's root** inside `.start-content`. Its link
  markup (mark, "Upgrade to Blanc Patron", arrow) is unchanged.
- **Style:** an outlined pill with no fill. Border
  `1px solid color-mix(in srgb, var(--patron-gold) 60%, transparent)`, label
  in `--text`, arrow in `--patron-gold`, 16px mark, 32px tall. Hover: the
  border goes to full `--patron-gold` and the arrow shifts 2px. Geometry never
  changes.
- `--patron-surface` and `--patron-label` lose their last consumers. The
  implementation deletes them from `pages.css` and `tokens/tokens.json` in the
  same commit and runs `tokens:build`. `--patron-halo` stays only if
  something else still uses it, otherwise it goes the same way.
- **Visibility:** `renderPatronCallout(patronActive || isPrivate)`. This fixes
  issue 3.

### Empty state

When there are no favorites, the slot where they would render shows "Favorite
a page with ♥ to pin it here" (secondary type). This replaces Ledger's
current "♥ a page to pin it here" and is new on Shelf and Tally.

**Billboard is the exception, pending owner confirmation.** Its tile row shows
recent sites from history, not favorites, so the copy would be untrue there.
Billboard shows no hint.

### Private tabs

No Patron chip and no blocked counts: the Shelf blocked card and the Tally
data column hide. The private explanation stays (Billboard's line under the
clock and the footer's left slot). Favorites still render, without favicons
(unchanged).

### Unchanged

The Sunrise landscape and dynamic wallpaper, the onboarding dialog, the
startup/recovery card, the `pages:*` bridge (no new channels), the data the
page receives, the four layout ids and their order, Mahjong, the Island, and
the utility sheets.

## Section 2 — per layout

### Ledger (PR 1)

- One Newsreader line, "Where to?", leads the content area.
- Below it, a centered two-column spread
  (`grid-template-columns: 1fr 1fr; column-gap: 64px`). The left column holds
  Favorites (up to 6, or the empty hint). The right column holds "Pick up
  where you left off" and then "On your other devices".
- If the right column has nothing, the left column centers alone at
  `max-width: 420px`.
- Under 900px the columns stack: Favorites first.
- The Patron chip follows the spread, start-aligned with the left column.

### Billboard (PR 2)

- **Short site names:** a pure function `shortSiteName(title, url)` in a new
  flat file `src/renderer/pages/start-site-name.js`, exposed on
  `globalThis.blancStartSiteName` (the `type-to-open.js` pattern) so unit
  tests can run it in a vm.
  - Split the title on the first `" – "`, `" — "`, `" | "`, `" · "` or
    `" - "`. If the first segment is 1–20 characters after trimming, use it.
  - Otherwise use the existing `shortLabel(url)` result (the domain's first
    meaningful label).
  - Example: "YouTube – videos worth watching" → "YouTube";
    "Nintendo – Official Site" → "Nintendo"; "MDN Web Docs" → "MDN Web Docs".
  - (Owner check: `" — "` and `" - "` extend the approved list of `" – "`,
    `" | "` and `" · "`, because those separators are common in real titles.)
- The label is one line with an ellipsis (the 2-line clamp goes). The full
  title becomes the label's `title` tooltip and the link's accessible name
  ("Open YouTube – videos worth watching"). The dismiss button's name uses the
  full title too.
- **One row of tiles** (`flex-wrap: nowrap`), up to 6, keeping the 96px label
  slots. Under 640px only the first 4 show.
- Order: clock → blocked line → recent sites → group chips → Patron chip. The
  clock is unchanged apart from the dark/private glow. The blocked line stays
  under it, and the footer drops its blocked copy on this layout.
- The content area centers vertically in the space between the header and
  the footer. When the space is too short, the content falls into the page
  flow and scrolls (replacing today's `max-height: 640px` absolute-to-relative
  swap).

### Shelf (PR 3)

- **One grid** holds the favorite tiles and the two cards. Its column count
  is set by `data-columns` on the grid, chosen in `newtab.js`:
  - 1–4 favorites → one row of `max(count, 2)` columns
  - 5–8 favorites → two rows of `ceil(count / 2)` columns

  So 6 → 3×2 and 8 → 4×2. CSS maps `[data-columns="2|3|4"]` to
  `grid-template-columns` (no inline styles).
- The "Pick up where you left off" card spans `columns − 1` and the
  "Blocked" card spans 1, so their row is always full.
  - (Owner check: the approved design said "span 2". It matches that at 3
    columns. At 4 columns, "span 2" would leave a hole, so this generalizes
    it.)
  - With no groups, the blocked card spans 1, at the start.
  - In private there is no blocked card and the groups card spans every
    column.
- Tighter cards: tiles `min-height` 108px → 92px, card padding 16px → 14px,
  and the cards' `min-height` goes. The blocked number uses the big-number
  role.
- With no favorites, the empty hint takes the first grid row.

### Tally (PR 4)

- Two balanced columns, centered in the content area, tops aligned
  (`grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items:
  start`).
  - Left: Favorites (up to 5, or the empty hint), then groups, then the Patron
    chip.
  - Right: "Blocked this week", the count, the chart, the day initials and the
    caption.
- Bars: past days are filled
  `color-mix(in srgb, var(--accent) 32%, transparent)` with no border; today
  is solid `--accent`.
- Under 900px the data column comes first (`order: -1`) and the columns stack.
- Everything is in the page flow, so nothing can sit behind the footer.
- In private the data column is hidden and the left column centers alone.

## Section 3 — tests, docs, proof

### Tests, updated in the same commit as the behavior they cover

- `spec/acceptance/newtab-layouts.feature` + `test/desktop/steps/newtab-layouts.steps.js`:
  - `clickNewtabLayoutSwitcher` in `src/main/test-hook.js` (test-only,
    env-gated) opens Customize first, then clicks the
    `[data-layout-pick]` button.
  - New scenarios:
    - For every layout at 1440×900 and 820px, the checklist's bounding box
      doesn't intersect any content-area element, and no content element
      intersects the footer when scrolled to the end.
    - The Patron chip is the last element of the active layout root in all
      four layouts.
    - No Patron chip in a private tab.
    - The empty hint appears on Ledger, Shelf and Tally with zero favorites.
    - Customize opens, picks a layout, persists it, and Esc closes it with
      focus back on the button.
  - The existing F35-6/7/8 scenarios are updated for the new checklist slot.
- `test/unit/start-page-fonts.test.js`:
  - Drop `doesNotMatch(newtab, /Where to\?/)` and assert the Ledger heading's
    role instead.
  - Assert `font-optical-sizing: auto` on the clock.
  - Keep the six-onboarding-`<h1>` count: "Where to?" is an `<h2>` (the page
    keeps its visually hidden per-layout `<h1>`).
- `test/unit/newtab-top-sites.test.js`: the label assertion follows
  `shortSiteName`; the 2-line clamp assertion becomes a one-line ellipsis
  assertion.
- New `test/unit/start-site-name.test.js`: the separators, the 20-character
  cutoff, the domain fallback, and empty or odd titles.
- `test/unit/migration-checklist-page.test.js`:
  - The Patron assertions are rewritten for the outlined chip.
  - The checklist position assertions follow the header slot and the
    top-right compact ring.
  - The reduced-motion assertion stays.
- Expected to pass untouched: `newtab-layout-settings.test.js`,
  `telemetry-events.test.js`, `npm run browser-api:check`. `npm run
  substrate:check` passes after the Patron token removal is regenerated.

### Docs (PR 1)

- `docs/brand-usage.md` → *Desktop Start Page Sunrise treatment*:
  - Replace "Do not add … a large 'Where to?' heading" with: Ledger carries
    one 32px Newsreader "Where to?" line, and no other layout adds a heading.
  - Replace "one straight, subtle footer divider" with the soft fade rule.
  - Describe the outlined Patron chip and the Customize popover (the layout
    order is preserved).
  - Add the corner/type paragraph.
- `CLAUDE.md` and `AGENTS.md` (mirrored verbatim): rewrite the stale Start
  Page sentence ("the 'ledger' start page: date line, 'Where to?', …") to
  describe the shared frame and the four layouts.

### Proof, per PR, before the PR is opened

- Light, dark and private, at 1440×900 and 820px, with seeded data (the
  capture harness from the handoff).
- Full-resolution crops of the content area, before stacked over after, plus
  a numbered "where to look" list.
- Also for PR 1: one capture each with reduced motion, reduced transparency
  and increased contrast forced on, plus the Customize popover open.

## PR 1 interim state

PR 1 moves all four layouts into `.start-content` and removes their absolute
positioning. That way Billboard, Shelf and Tally sit correctly in the new
frame and pass the non-overlap scenarios, even though their own reworks land
later. They get the shared type, surfaces, corners and Patron slot in PR 1.
Their layout-specific changes (short names, the Shelf grid, the Tally
columns) wait for their PRs.

## Out of scope

Onboarding, the Sunrise art and wallpaper, Mahjong, the Island, utility
sheets, new settings, new `pages:*` channels, any change to the data the
page receives, and checklist copy.

## Risks

- **Header height on Billboard.** The full checklist makes the header about
  180px tall. At 1440×900 the clock stack still fits between the header and
  the footer. At shorter heights it scrolls, which the proof captures must
  show. If that looks wrong, the fallback is to compact the checklist sooner
  on Billboard only. That is a design call for the owner, not something to
  decide in implementation.
- **Popover API, anchor positioning and `@starting-style`** must behave in
  the bundled Chromium. The plan's first task checks them in the real app.
  If anchor positioning misbehaves, the popover is placed with plain
  `position: fixed` math from the button's rect.
- **Copy changes** (sentence case, the date, the empty hint) are visible to
  every user. They don't touch marketing claims, but the release notes should
  mention the redesign.
