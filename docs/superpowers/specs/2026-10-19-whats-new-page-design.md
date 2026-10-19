# What's New page (F51) — design

Date: October 19, 2026. Status: approved by the owner in conversation, ready to plan.

## Intent

The owner likes Chrome's What's New tab: after an update, Chrome opens a colorful,
inviting page with only the highlights people would care about. Blanc should do the
same. Today, the Start Page footer's **What's new in X** pill links to the
website changelog, which is complete but dense. The new page is a highlight reel.
The changelog on blanc.day stays exactly as it is and remains the place for full detail;
the new page links to it.

Reference observed in the owner's Chrome (`chrome://whats-new`, October 19, 2026):
a slim header with the Chrome logo and "What's new"; one feature fills the page at a time,
with a large headline, a short paragraph, numbered steps, **Learn more ↗** and **Next**
on the left and a looping demo (with a replay button) in a soft rounded panel on the right;
along the bottom, a row of pastel-tinted tiles (name and thumbnail), one per feature, with
arrows, to jump between features. Chrome loads that content from google.com.

The approved mockup is `.superpowers/brainstorm/64575-1792432344/content/layout-v4.html`
(gitignored, so it doesn't travel with the repository; this section describes it).

## Decisions the owner made

1. **Opens on its own once.** The first launch after an update opens the page in its own
   tab, just that once.
2. **The footer pill points to it.** The existing What's new pill links to the new page
   instead of the changelog.
3. **Loaded from the website.** The page is a blanc.day page (option 1 of two offered),
   so its content can change without a new app build. The alternative, a `blanc://` page
   pulling remote content, was declined.
4. **Chrome's layout.** One highlight at a time, colored tiles along the bottom, demo panel
   on the right (layout-v4 mockup).
5. **The demos are a mix.** Each highlight uses whatever fits: a still capture, a short clip,
   or an animated demo reused from the website's existing components (`SpacesDemo`,
   `GlanceDemo`, `GestureDemo`, `TabDragFigure`, the captures in `site/public/revamp/` and
   `site/public/shots/`).
6. **The header carries the full Blanc lockup:** the small-header lockup (Sunrise mark and
   the "Blanc" word, `.site-lockup--small`, per `docs/brand-usage.md` → *Blanc lockup*), a thin
   divider, then "What's new"; version and release date at the right.
7. **The auto-open rules below were played back and accepted** ("looks good").

## Goals

- After a feature update, people see three to five highlights they'd care about, in a page
  that feels colorful and welcoming, not like release notes.
- The owner can edit or fix a page at any time with a normal site deploy.
- The footer pill and the automatic tab lead to the same place.

## Non-goals

- No `blanc://whats-new` internal page and no change to internal-page CSPs.
- No **Try it** buttons that drive the browser (a website can't). Steps are plain text;
  **Learn more ↗** goes to the feature's blanc.day page where one exists.
- No translations. The page is English, like the rest of the site.
- No change to the changelog page or its data.
- No history browser of past releases on the page itself (each release's page simply
  stays at its URL).

## Anti-goals (failure even if it works)

- Tracking. The page Blanc opens on its own must not load analytics, the consent banner,
  or the newsletter prompt.
- Claiming unreleased work. A page describes only what its release shipped
  (`docs/marketing-claims.md`).
- Being pushy: opening on a fresh install, in a private window, on every bug-fix update,
  or more than once per update; or replacing the tabs someone restored.

## The website page

- **URL:** `https://blanc.day/whats-new/<major>.<minor>` (for example `/whats-new/1.38`),
  one page per feature release. `https://blanc.day/whats-new` always leads to the newest one.
- **Layout (from the mockup):**
  - Header: lockup, divider, "What's new"; right side "Version 1.38 · October 18"
    (date from `site/src/data/releases.json`). The lockup links to the homepage.
    *My call:* the page uses this slim header instead of the full site navigation, as Chrome
    does.
  - Stage: the current highlight. Left: headline, short paragraph, optional numbered steps,
    optional note (e.g. privacy detail), **Learn more ↗** (only when the highlight has a URL)
    and **Next** (moves to the next highlight; on the last one it wraps to the first;
    *my call*). Right: the demo in a soft rounded panel; clips get a replay control.
  - Tile row: one tile per highlight, each tinted with one of the eight Spaces colors
    (`SpaceIdentity.PRESETS`) as a pale wash, with its name and a small thumbnail; the current
    tile has a stronger outline. Clicking a tile shows that highlight.
  - Footer line: "Want every detail? Read the full changelog on blanc.day", linking to that
    release's anchor on `/changelog`.
  - Background: the warm Sunrise page color. Type: the site's Blubird faces, per site rules;
    any app-UI replica inside a demo keeps the app's face (Instrument Sans), per existing
    site practice.
- **Without JavaScript or for screen readers:** every highlight is in the document in order
  (the "one at a time" view is progressive enhancement), so the page reads top to bottom.
  The tile row is a set of buttons with the current one marked; Next, tiles and arrow keys
  are keyboard-reachable. Motion respects `prefers-reduced-motion` (clips don't autoplay;
  the animated demos rest on a still frame).
- **Phone width:** stage stacks (text above demo), tiles scroll horizontally.
- **Analytics off:** built with `BaseLayout`'s `analytics: false` (no consent banner, no
  `site.js`) and no newsletter prompt.
- **Content lives in one data file** (*my call on the shape*), e.g.
  `site/src/data/whats-new.json`: per feature release, its version and three to five
  highlights, each with title, tile label, body, optional steps, optional note, optional
  `learnMore` URL, tile color id, and media (`{ kind: "image" | "video" | "demo", ... }`
  where `demo` names one of the existing site demo components). Media files reuse the
  existing site assets; new captures go through the usual capture rules (Retina density,
  credits in the folder's `credits.txt` for any third-party page shown).
- **Release-backed:** a page may only exist for a version present in `releases.json`, and
  its claims come from that release's notes (`docs/marketing-claims.md`). A unit test
  enforces the first part.
- **Missing pages:** the site does nothing special; a release without a page simply has no
  `/whats-new/<minor>` (the app checks before using it, see *The app*). A release may skip
  its page on purpose (an Electron bump, a fixes-only minor) and then no tab opens.
  *My call:* a test fails when the newest release in `releases.json` has no What's New
  entry *and* isn't listed in an explicit "no page" list in the same data file, so a skip
  is a decision rather than something forgotten.
- **First page:** 1.38 (already public, so its page is release-backed) gets the first real
  page, so the template ships with real content and the owner can review it live before any
  app release depends on it. Releases before 1.38 have no pages. *(Planning decision,
  October 19, 2026; it needs the owner's sign-off like every page.)*

## The app

All logic stays in the pure, unit-tested `src/main/whats-new.js`; `main.js` only wires it.

- **When it opens automatically:** on the first launch of a packaged build whose
  `major.minor` is newer than `settings.lastRunVersion`'s (1.38.x → 1.39.0 opens it;
  1.39.0 → 1.39.1 does not). Skipping versions (1.37 → 1.39) opens only 1.39's page.
  Never on a fresh install (the existing `firstRunComplete` rule in `whatsNewOnLaunch`
  decides "update" vs "fresh"), never for a pre-release or downgrade, never in dev/test
  runs (`app.isPackaged`).
- **Exactly once:** the decision is recorded in device-local settings in the same launch
  patch that already records the pill (a new field, e.g. `whatsNewOpened: '<version>'`, or
  equivalent), so a crash or a second window never reopens it. Never synced (follow how
  `whatsNewVersion`/`whatsNewSince` are kept out of `SYNCED_KEYS`).
- **How it opens:** after session restore, as a new ordinary (non-private) tab, made
  active, in the first normal browser window; restored tabs are untouched. It counts as
  having seen the update: the auto-opened tab dismisses the footer pill (same effect as
  clicking the pill today).
- **Only when the page exists** (*my call*, settling two gaps the review found): the
  updater offers a release before the post-release site deploy publishes its page, and a
  release may have no page at all. So before opening, main checks the page with a single
  request (`HEAD https://blanc.day/whats-new/<major>.<minor>` from the main process, no
  cookies, no redirect following, short timeout; a 200 means it exists). It goes through the
  normal session after the blocker's startup navigation gate has lifted. Outcomes:
  - 200: open the tab (once) and point the pill at the page.
  - Not 200, offline, or timeout: no tab now; the pill keeps today's changelog link. The
    check repeats on later launches while the pill's 7-day window is open, so someone who
    updated before the deploy still gets the page on a later launch; after the window it
    stops for good. At most one check per launch.
  This is the only request Blanc makes on its own for this feature, and it is the same URL
  the tab would load.
- **The footer pill:** unchanged rules (7 days, dismiss on open or ×, never in private
  tabs). Its URL is `https://blanc.day/whats-new/<major>.<minor>` once the check has found
  the page, otherwise the changelog anchor as today. Bug-fix updates still show the pill;
  it points at the feature release's page when one was found. Its label stays
  "What's new in <version>".
- **Private windows:** never receive the tab; the pill already never shows there.
- **No new IPC, no new bridge, no renderer change** beyond what the pill's URL change needs
  (the pill already takes its URL from main). If the `pages:start:*` payload shape changes,
  update `browser-api/contract.json` per its rules.

## Platform and process

- **Spec:** add F51 — What's New page (desktop) to `spec/features.md` and the parity
  matrix, in the style of F46–F50.
- **Release process:** add "write the What's New page" to the post-release site steps
  (the paragraph in `CLAUDE.md`/`AGENTS.md` that lists `releases.json`, the roadmap and the
  Bangs pin, and the `releasing-blanc` skill). The page goes live with the post-release site
  deploy, never before the release is public.
- **Owner sign-off on every page (owner decision, October 19, 2026).** Each release's page
  needs the owner's explicit approval of its final text and media before it deploys, the
  same gate as other launch creative. Agents draft it (it can be drafted before the release
  from the merged work and checked against the published notes afterwards), show the
  owner the rendered page, and deploy only after a clear yes. The runbook steps above must
  say so. Because the app only opens the tab once the page exists, waiting for sign-off
  never shows anyone a missing page; the pill simply links to the changelog until then.
  *My call:* the "no page" list in the data file is also an owner decision.
- **Site work and app work ship separately** (website-only PRs are split from app PRs, per
  repo practice). The site page should be live before the first app release that opens it.
- **Privacy page:** the policy should mention that after a feature update Blanc checks for,
  and opens once, that release's page on blanc.day; check the existing wording and add a
  sentence if needed.
- **Copy:** any new Blanc-authored app strings go through `copy/messages/en.json` and every
  language (none are expected: the pill label is unchanged).

## Left to the builder

- Component structure of the Astro page, the exact data schema, styling details beyond the
  mockup, and how the existing demo components are embedded at the panel's size.
- Exactly where in the startup sequence the tab is created, as long as it follows session
  restore and doesn't steal the blank-tab address-bar focus behavior from a restored blank
  tab.
- Test layout (unit tests for `whats-new.js` decisions; site data/build tests; a desktop
  acceptance scenario if the harness can observe the launch-after-update tab cheaply).
