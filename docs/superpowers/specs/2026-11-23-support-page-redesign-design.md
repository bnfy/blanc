# Support page redesign — design

Date: November 23, 2026. Status: approved by the owner (plan approval, November 23, 2026).

## Context

The Support page (`site/src/pages/support.astro`) has three problems, as the owner stated on November 23, 2026:

1. **Answers are hard to find.** After the hero, search and contact block, the page is about 35 identical fold-out rows: 13 "Using Blanc" guides and 22 "Straight answers". The page is roughly 4,500px tall.
2. **It looks dated next to the new pages.** It still uses the older `reference.css` look. Privacy & Security (#1721) and Features (#1736) were redesigned recently.
3. **It covers only the desktop app.** It has nothing for Blanc for iPhone & iPad (App Store, currently 1.1), the Blanc Beta builds (Mac, Windows, Linux), or Blanc Mail. The App Store listing's Support URL and the Windows beta updater's `help_center_url` both land on this page.

The goal is one Support page for all of Blanc that is quick to scan and matches the new site look. Contact works today, so it stays; only its position moves.

## Decisions made with the owner (Nov 23, 2026)

- **Structure (Approach A).** One page with product tabs: *Blanc for desktop · iPhone & iPad · Blanc Beta · Mail*. Each tab holds topic groups of fold-out answers. One URL, and search spans every tab.
  - Rejected: a hub plus a page per product (search split, more routes, anchor redirects).
  - Rejected: one long page grouped by topic (desktop still dominates).
- **New content.** A starter set for each product: 5–8 answers for iPhone & iPad, 5–8 for Blanc Beta, and Mail's existing questions.
- **Layout.** As played back and approved: hero with search and popular links, then product tabs with topic groups, then "Still need help?" contact at the bottom, with a "Contact us" link in the hero.
- **Look.** Mock 2–3 directions with the real site CSS before building. The owner picks one (per the `ui-layout-show-options-first` rule).

## Design

### Page structure (top to bottom)

1. **Hero**
   - Eyebrow: "Blanc Support". `site-eyebrows.test.js` requires exactly this eyebrow.
   - h1, a one-line subline naming all four products, and search.
   - Popular links:
     - Bring your bookmarks → `#bookmark-import`
     - Update Blanc → `#updates`
     - Pair your iPhone → `#iphone-pair`
     - Set up 1Password → `#1password`
     - Activate Patron → `#patron`
     - Contact us → `#contact`
2. **Product tabs**
   - Four radios with a panel each, switched in CSS with `:has()` on the page wrapper (`.support-page:has(#sp-iphone:checked) [data-panel="iphone"]`), so they work without scripting.
   - /download switches its panels with sibling selectors (`#dl-os-*:checked ~ .dl-panels …`, `site.css` around lines 1214–1237), which forces the radios to sit before everything they control. `:has()` lets the radios sit anywhere, and the site already uses it (the Linux arch switch).
   - Don't copy /download's sliding pill: it assumes one row of columns.
   - The tab row wraps to a 2×2 grid on narrow screens, so the page never scrolls sideways at 390px (`blubird-reach.test.mjs`).
   - Each panel holds topic groups. Each group is an h2 heading and its `<details>` rows.
3. **"Still need help?"** The existing two contact lists, unchanged: Live chat, Email, Reddit, then Bug, Feature request and Security. Keep the `id="contact"` section, `<!--email_off-->` and `data-live-chat`.

### Desktop tab: 7 groups, all 35 existing rows, each exactly once, text unchanged

| Group | Rows |
|---|---|
| Get started | bookmark-import, arc-import, updates, languages |
| The Island & commands | island, command-palette, mouse-gestures, glance, start-page *(guides)* |
| Tabs, Spaces & windows | tab-groups, vertical-tabs, quiet-tabs, reopen-closed-tabs, workspaces, profiles *(guides)*; tabs-on-quit |
| Sync & devices | sync *(guide)*; sync-retention, shared-spaces |
| Passwords & privacy | 1password *(guide)*; 1password *(answer, rendered as `id="1password-faq"`)*, privacy, first-day-signals, start-page-data, independent-audit |
| Sites & compatibility | protected-streaming, extensions, vpn, architecture, electron |
| About Blanc | open-source, maker, development, ai, patron |

The mapping keys each row by kind and data id (`{guide:"1password"}`, `{answer:"1password"}`). The table above uses data ids too, so there are 35 rows and 35 rendered ids.

Guides keep their "Read the full guide →" link to `/features/<id>`. The extra links after five answers stay in `support.astro`, with the same text:
- Two are pinned by ledgers:
  - "Moving from Arc? See what transfers and how to bring your Spaces into Blanc." with `href="/arc-alternative"` (`website-arc-switching-claims-v1.38.json`, also tested)
  - "Source, license and third-party notices" (`website-revamp-claims-v1.27.json`)
- Three are kept as they are, though no ledger pins them: the audit link, the benchmark link and the Patron link.

### The new tabs

New answer ids are prefixed by product, so the build's duplicate-id check never collides.

- **iPhone & iPad** (`iphone-*`, about 6–7 rows):
  - Get the app: App Store, requirements, free
  - Pair with Blanc on your computer
  - What comes over: tabs from your devices, Shared Spaces, Send a tab
  - The Island on iPhone
  - Private tabs
  - Early builds on TestFlight
  - What isn't in it yet

  Sources:
  - `site/src/data/ios-releases.json` (the newest App Store version: 1.1, Nov 22)
  - `docs/website-iphone-1.0-claims.json`, `docs/website-ipad-1.0.3-claims.json`
  - `site/src/data/ios-availability.json`
  - The App Store description in `docs/ios/app-store-listing.md`

  Default browser and passkeys: only if a released App Store version ships them.
- **Blanc Beta** (`beta-*`, about 6–7 rows):
  - What Blanc Beta is: Chromium-based, installed beside Blanc
  - Installing on Mac, Windows and Linux
  - How updates arrive. Linux updates are "offered", never "installed automatically".
  - Its own data, kept apart from Blanc
  - What isn't in the beta yet. Link the release notes and `/download#betas`.
  - Reporting a beta bug
  - Removing it

  Sources:
  - `docs/website-blanc-beta-*-claims.json` (newest Mac, Windows and Linux)
  - `site/src/data/blanc-beta*.json`
  - The published release notes

  No claims about protected video or production Sync. Name only the Linux systems that were tested. No version numbers in the copy, so it doesn't go stale.
- **Mail** (`mail-*`): Move `questions` and `support` out of the `site/src/pages/mail.astro` frontmatter into `site/src/data/mail-questions.mjs`. Both pages render from that one source, so the two copies never drift apart. The move must leave /mail's output unchanged. `test/site/mail-overview.test.mjs` checks only five answers by pattern, so diff `dist/mail.html` from a build before the move with one after it (step 2).

### Behavior

- **Deep links.** `answers.js` already opens the hash or `?topic=` target and its parent `<details>`. Extend it: when the target is inside a product panel, check that panel's radio first. Every inbound anchor keeps working:
  - From the homepage, Features, About, Patron, the guides and `GestureDemo`
  - The search tests' `/support#glance`
  - The legacy `/faq#bookmark-import`
- **Opening tab**
  1. A hash pointing at an answer wins.
  2. Then `?product=desktop|iphone|beta|mail`, matching the `?product=` convention on /changelog.
  3. Then iPhone & iPad for iOS and iPadOS visitors, detected on the page without sending anything, like `download-switcher.js`.
  4. Otherwise desktop.

  Without scripting, desktop shows.
- **Search.** While a query is typed, show matches from every tab, with each group labeled by its product, and hide groups and panels with no matches. Clearing the query restores the selected tab. `answers.js` is shared with /trust, which has no `#answer-search`, so /trust's behavior stays as it is.
- **Site-wide search.** `site/scripts/search-index.mjs` indexes every `<details id>` with a `<summary>`, so the new rows become `/support#…` results without any change to the indexer.

### Constraints the build must keep (from the guard map)

- **Anchors.** Every existing `<details id>` is kept: 35 in all, the 13 guides and the 22 answers, one of which renders as `1password-faq`. `verify-seo.mjs` fails on a missing fragment target or a duplicate id.
- **Answers data.** `support-questions.json` keeps its 22 answers verbatim and in order (`website-revamp-trust.test.js`). New answers are appended. Group placement lives in a separate mapping, and `support.astro` still renders through `questions.map`.
- **Guides.** `<GuideTopics page="support"` stays literal in `support.astro` (`site-navigation.test.js`). GuideTopics gets an optional `ids` prop to render a chosen subset in order. /trust's usage is unchanged.
- **Shared CSS.** `reference.css` is shared with /trust and /android-beta. Put the new styles in a page-scoped `site/src/styles/support.css`. Move the Support-only rules into it, as #1721 did with `trust.css`: `.support-search`, `.support-shortcuts`, `.contact-groups`, `.search-empty`, `#contact`. Leave the shared classes alone.
- **Type and chat**
  - Headings are Blubird Display at 0 tracking, and text is Instrument Sans.
  - The first `main h2` must be a real display heading.
  - Keep BaseLayout's chat bubble, which wires the page's Live chat link.

### Look: chosen from mock-ups

Render these three directions on the real page with the real site CSS, at 1440px and 390px:

1. **Dark hero, like Privacy & Security.** A dark band with a gold mark from existing assets (no new 3D art), and search in the hero. It needs the clear header #1721 added: put `/support` beside `/trust` in `overlayTone` in `site/src/components/Header.astro`, which picks the clear bar by path.
2. **Two-column cream header, like Features.** Headline on the left; search and popular links on the right. Product tabs as the /download segmented control.
3. **Help-center grid, like Apple Support or 1Password.** A centered headline and a large search, then four product cards with icons that act as the tabs, and topic groups as cards.

## Calls I made (not discussed; check while reading)

- The seven desktop group names, and which group each row goes in.
- Desktop opens by default; iPhone & iPad opens for iOS and iPadOS visitors; `?product=` picks a tab.
- No Android tab.
- The new ledger covers only new copy. Mail's rows aren't re-recorded, because they're /mail's published copy from one shared source.
- The tabs are switched with `:has()` rather than /download's sibling selectors.
- The three mock-up directions.
- One PR, which runs the full CI because it touches `test/unit/`.
- Fonts are copied into the worktree locally for the mock-ups.

## Out of scope / follow-ups

- Pointing the App Store listing's Support URL at `/support?product=iphone` (owner-only, in App Store Connect).
- The Windows beta's `help_center_url` (a fork change on `chromium/next`).
- No Android tab until Android ships.
