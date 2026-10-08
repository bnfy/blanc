# Site eyebrow reduction — design

Date: 2026-10-08 · Scope: marketing site (`site/`) only · Status: approved by the owner, 2026-10-08

## Problem

Nearly every headline on blancbrowser.com has a small uppercase label above it. On `main` at
`3b1744fe` there are **230** of them across 55 files:

| Class | Count | Where |
|---|---|---|
| `section-kicker` | 178 | feature pages, `components/guides/*` (rendered on `/trust`), press, download, landing pages, About, Support, Trust, Changelog, 404, Ambassadors, `ReleaseEvidence`, `MemoryChart` |
| `pop-eyebrow` | 33 | every Features hub popover (`features.astro`) |
| `mail-eyebrow` | 9 | `/mail` and its sub-pages |
| `frame-kicker` | 7 | homepage sections |
| `eyebrow` | 3 | `/terms`, `/privacy`, `/import-tabs` |

Most add nothing. "good to know" appears 24 times and "ready when you are" 12 times. Feature-page
section kickers mostly reword the H2 under them ("what syncs" above a section about what syncs).
Every popover eyebrow repeats a feature name its headline already says ("Glance" above "View two
tabs side by side with Glance."). Used everywhere, the label stops working as a signal and makes
the pages feel templated.

## Rule (owner decision, 2026-10-08)

**An eyebrow stays only if it tells the reader something the headline, and the breadcrumb where
there is one, does not.** In practice that is:

- **Status** — pre-release, pilot, coming soon, planned.
- **Platform** — when the headline and body don't already say it.
- **Version or date** — the release a table of evidence refers to.
- **Paid tier** — Patron, where the headline doesn't say so.
- **Page identity** — the product or page name above a hero H1 that is a tagline and doesn't name
  the page, on pages with no breadcrumb.

Everything else goes: section kickers, "good to know", "ready when you are", and all popover names.
Feature detail pages lose their hero kicker too, because the breadcrumb directly above it already
names the page (`home / features / glance`).

## What stays (17)

| # | File | Text | Reason |
|---|---|---|---|
| 1 | `pages/index.astro` (hero, `frame-kicker`) | Blanc Browser | Page identity: H1 "A little less browser." never names the product. Pinned by `test/unit/site-island-visual.test.js:67`. |
| 2 | `pages/index.astro` (`frame-kicker`) | The Island | Page identity (owner decision, see Decisions): H2 "Tabs, search and commands." never says "Island", the site's core term, and the homepage has no breadcrumb. |
| 3 | `pages/features.astro` (`.bento-patron`) | Patron | Paid tier: H2 "Keep the browser free. Get more room to move." doesn't name it. |
| 4 | `pages/features/workspaces.astro` (hero) | Blanc Patron | Paid tier: H1 "Save a whole window. Return to it by name." doesn't name it. |
| 5 | `pages/features/security.astro` | public v1.27.0 · October 3, 2026 | Version and date of the evidence table under it. |
| 6 | `components/ReleaseEvidence.astro` | public v1.27.0 · October 3, 2026 | Same, on `/trust`. |
| 7 | `pages/support.astro` | Blanc Support | Page identity: H1 "A little help goes a long way." |
| 8 | `pages/trust.astro` | Privacy & security | Page identity: H1 "Trust comes with the details." |
| 9 | `pages/about.astro` (hero) | about blanc | Page identity: H1 "Independent by design." |
| 10 | `pages/404.astro` | 404 | Status code. |
| 11 | `pages/ambassadors.astro` (hero) | Blanc ambassador pilot | Status: it is a pilot. |
| 12 | `pages/press.astro` (hero) | Blanc press kit · independent browser | Page identity: H1 is a product claim. Pinned by `test/unit/press-kit.test.js:211`. |
| 13 | `pages/mail/privacy.astro` | Blanc Mail · Pre-release policy | Status. |
| 14 | `pages/mail/terms.astro` | Blanc Mail · Pre-release terms | Status. |
| 15 | `pages/mail/pricing.astro` (hero) | Blanc Mail · Planned pricing | Status. |
| 16 | `pages/mail/download.astro` | macOS only · Coming soon | Status and platform. |
| 17 | `pages/mail/support.astro` | Blanc Mail | Page identity: H1 "Support." would otherwise read as Browser support. |

Kept eyebrows keep their current text and styling. This change only removes labels.

## What goes (213)

- **Features hub popovers:** all 33 `pop-eyebrow`s. The Named Workspaces popover loses
  "Named Workspaces · Patron" because its note already says "Creating and saving workspaces needs
  an active Patron membership." The 1Password popover loses "1Password · macOS" because its
  headline ends "on macOS".
- **Features hub:** "ready when you are" above the closing CTA.
- **Feature detail pages** (`pages/features/*.astro`, 16 files): every `section-kicker` except #4
  and #5, including each hero kicker, "good to know" and "ready when you are". The 1Password hero
  loses "1Password · macOS" because the H1 names 1Password and the availability line directly under
  it says "Currently available on macOS only."
- **`components/guides/*.astro`** (16 files, rendered on `/trust`): every `section-kicker`.
- **Homepage:** five `frame-kicker`s (Time-of-day wallpaper, Tabs and sessions, Privacy and
  control, Start Page, Switching to Blanc). Each H2 already names the subject.
- **Landing pages:** all of `/download` (4), `/arc-alternative` (5) and
  `/ublock-origin-after-chrome` (5).
- **Ambassadors:** the four section kickers (the hero stays).
- **About:** "support is human" (the hero stays).
- **Press:** the eleven section kickers (the hero stays).
- **Changelog:** "shipping in public" (H1 "Every Blanc release, in one place." says it).
- **Legal and import:** `eyebrow` on `/terms` ("terms"), `/privacy` ("privacy") and
  `/import-tabs` ("one-time handoff"). Their H1s name the page.
- **Mail:** "Made for the Mac" and "From the makers of Blanc Browser" on `/mail`, and the plan
  labels "Mail" and "Together" on `/mail/pricing` (each plan's H2 names it).
- **`ReleaseEvidence.astro`:** "independent review".
- **`MemoryChart.astro`:** the `kicker` prop and its element. Both values in use ("what blocking
  is worth", "measured, not claimed") are filler. The chart's figures, which a `public-truth` test
  pins, are untouched.

## Behaviour that depends on eyebrows

`site/src/scripts/feature-bento.js:38` labels the popover's previous/next buttons with the
neighbouring popover's `.pop-eyebrow` text. Removing the eyebrows would leave those buttons blank.
`FeaturePop.astro` gains a required `label` prop, rendered as `data-pop-label` on the
`<article>`, and `labelOf` reads `dataset.popLabel`. Each `label` gets the text of the eyebrow it
replaces, except Named Workspaces (`Named Workspaces`) and 1Password (`1Password`), which drop the
qualifier.

No other script or test reads eyebrow text. `test/desktop/steps/glance.steps.js` uses
`.glance-eyebrow`, which belongs to the desktop app's Glance UI, not the site.

## Layout

Most eyebrows sit as the first child of a wrapper, with the heading next
(`<div><p class="section-kicker">…</p><h2>…</h2></div>`). Removing the `<p>` leaves the wrapper in
place, so grid columns and `aria-labelledby` targets don't change. The heading moves up by the
label's height plus its margin (about 30 px). Nothing new is added to replace that space; the
visual check decides whether any block now sits too tight.

## CSS

Remove rules left with nothing to style, using the method from #629/#630: a selector goes only if a
class it *requires* (ignoring names inside `:not()`) no longer appears in anything the site renders.
Expected candidates:

- `features-bento.css`: `.pop-eyebrow`.
- `site.css`: `.legal-doc .eyebrow`, `.ambassador-promise .section-kicker`,
  `.press-compare-heading .section-kicker` (both breakpoints), `.press-contact .section-kicker`.
- `revamp.css`: `.eyebrow` within `main :is(.section-kicker, .eyebrow)`.
- `home.css`: `.home-revamp .eyebrow` (already unused).
- `home-appearance.css`: `.eyebrow` within its `:is(...)` list.

Selectors like `.pop-copy p:not(.pop-eyebrow)` and `p:not(.section-kicker)` stay as written.
Rewriting them lowers their specificity and could change which rule wins for `.pop-note` and
similar paragraphs. The leftover `:not()` costs nothing.

## Keeping it this way

A new unit test, `test/unit/site-eyebrows.test.js`, scans `site/src/**/*.astro` for elements
carrying `section-kicker`, `pop-eyebrow`, `mail-eyebrow`, `frame-kicker` or `eyebrow` and requires
the (file, text) set to equal the 17-entry allowlist above. A new eyebrow then needs a deliberate
allowlist edit in the same commit, per the repo's policy-test convention.

## Verification

1. `npm run test:unit` (the new guard, plus the existing press-kit and island-visual pins).
2. `npm run site:build` (Astro build plus SEO checks).
3. `test/site/features-bento.test.mjs` against a local preview, with a new assertion that
   previous/next show the neighbouring features' names.
4. A computed-style comparison of old and new builds served side by side at 1280 and 390 px. The
   only elements whose styles may differ are those that followed a removed eyebrow, and only in
   their position.
5. Before/after captures of representative surfaces, cropped to the changed area and stacked
   before over after: the homepage Island and Tabs sections, a feature detail page (Glance), a
   Features popover with its previous/next labels, `/download`, `/press` and `/mail/pricing`.

## Decisions (owner, 2026-10-08)

1. **Homepage "The Island" (#2): kept.** Its H2 "Tabs, search and commands." stays as written.
2. **Press hero text (#12): unchanged.** "Blanc press kit · independent browser" stays, and so does
   its pin in `test/unit/press-kit.test.js`.

## Out of scope

- Rewording any headline or body copy.
- Restyling the kept eyebrows or merging the five eyebrow classes into one.
- The desktop app's own UI labels (`src/renderer/**`).
- The stale "v1.27.0" release-evidence date. It is release-bound evidence with its own update path.
