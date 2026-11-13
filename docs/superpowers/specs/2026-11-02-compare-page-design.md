# Compare page: Blanc next to Crest, Arc, Helium and Brave

Status: draft for owner approval. Nothing is built. Checked November 2, 2026
against public Blanc v1.45.1.

## Intent

People arriving from Arc, Brave, Helium or Crest ask the same question: "what
do I give up, and what do I get?" A single chart on `/compare` answers it in
one screen, in plain words, with the places Blanc is behind shown as plainly as
the places it is ahead. Candor is the point: the page is only worth sending to
a skeptical Reddit reader if it does not read as selective.

## Decisions (owner, November 2, 2026)

1. **Placement:** a new page, `/compare`, linked from the footer and from
   `/arc-alternative`.
2. **Candor:** every row stays, including rows where Blanc is behind.
3. **Depth:** about ten rows, only what decides a switch.

## Goals, non-goals, anti-goals

- Goal: a chart of 11 rows by 5 browsers (Blanc first) that a new reader can
  understand without prior knowledge of Blanc.
- Goal: every cell traceable to Blanc's v1.45.1 release evidence or to a
  current first-party page of the other product, recorded with its access date
  in a claims ledger that `test/unit/website-feature-evidence.test.js` accepts.
- Non-goal: a winner, a score, a "best for" verdict, or any unqualified
  superiority claim (`docs/marketing-claims.md`).
- Non-goal: speed, memory or battery comparisons. The pinned memory benchmark
  has its own page and qualifications.
- Anti-goal: a cell that is true today but silently stale. The page names the
  Blanc version and the date it was checked, and a unit test fails when a newer
  release exists (see "Keeping it current").
- Anti-goal: a cell that claims a Blanc capability that exists only on `main`.
  Mini Window (merged November 2, 2026) is not in v1.45.1, so Crest's Quick
  Window gets no Blanc counterpart on this page.

## The chart (draft wording, ready to edit)

Column order: Blanc, Crest, Arc, Helium, Brave. Arc's header carries
"Ends Dec 22, 2026". A cell the first-party sources do not state reads
"Not stated" in muted type, never a guess in either direction.

| Row | Blanc | Crest | Arc | Helium | Brave |
|---|---|---|---|---|---|
| **Where it runs** | macOS, Windows, Linux. iPhone is a public TestFlight beta. | Mac (Apple silicon), iPhone, iPad. No Windows or Linux. | macOS and Windows until Dec 22, 2026. Arc Search on iOS and Android. | macOS, Windows, Linux, all beta. No mobile yet. | macOS, Windows, Linux, iOS, Android. |
| **Cost and account** | Free. No account. Patron is optional and unlocks nothing. | Free. No account system. | Price not stated. New accounts closed Oct 22, 2026. | Free. Funded by optional tips. | Browser is free. Optional paid add-ons such as VPN and Leo Premium. |
| **Open source** | Yes. MIT for Blanc's own code; name and logos reserved. | Yes. MPL 2.0. | Not stated. | Yes. GPL 3.0 for Helium's own code. | Yes. MPL 2.0. |
| **Release status** | Public release v1.45.1, Oct 29, 2026. | Early access, by its own description. | Sunsetting. Basic updates only until Dec 22, 2026. | Beta, by its own description. | Regular public releases. |
| **Chrome Web Store extensions** | No. Optional uBlock Origin only. | Yes, on Mac, Chromium pages only. | Yes. | Yes. | Yes, including some Manifest V2 extensions. |
| **Built-in ad and tracker blocking** | On by default, including private tabs. Full uBlock Origin optional. | WebKit pages and iPhone/iPad only. Chromium pages need an extension. | uBlock Origin installed by default on macOS. | On by default (its uBlock Origin fork), plus cookie banners. | On by default (Shields). |
| **Spaces and separate accounts** | Spaces save tab sets. Separate local profiles keep cookies and site data apart. | Spaces each keep their own cookies, history, passwords. Sub-Spaces can share sign-ins. | Spaces. Account separation not stated. | Not stated. | Containers keep cookies apart per tab, on desktop. |
| **Tabs on the side** | Optional vertical tabs. | Sidebar is the main layout. | Sidebar. | Vertical tabs. | Vertical tabs, off until turned on. |
| **Split view and link preview** | Split View for two tabs. Glance previews a link in a floating card. | Split View up to four tabs. Peek previews a link. | Split View and Peek. | Split view. No link preview stated. | Not stated. |
| **Sync** | Optional and end-to-end encrypted. Favorites and settings, plus open tabs and shared Spaces if you choose. | Optional, through iCloud. Apple devices only. | Account-based. Ends with the account, Dec 22, 2026. | Not yet. | Yes. Brave says it is encrypted on the device. |
| **Built-in AI** | None. | Lets coding agents you approve use it. Palette can ask an assistant. | Arc Max, until Dec 22, 2026 on desktop. | Not stated. | Leo assistant. Free, with a paid tier. |

Under the chart: "Bringing Arc tabs over? Blanc and Crest both import Arc
Spaces. See how Blanc's import works." (links to `/arc-alternative`; the row is
cut because Helium and Brave cells would mostly read "Not stated"). Blanc's
half rests on v1.32.0; Crest's on its home page import list ("Arc: Spaces,
tabs, folders, colors, icons, passwords") and the 0.8.0 changelog.

Above the chart, three short sentences on where Blanc is behind (extensions,
phones beyond an iPhone beta, no AI). There is no sentence about what is
unique to Blanc: the chart shows Arc, Helium and Brave also have sidebars or
vertical tabs, and a uniqueness line would contradict it. Exact copy is
written after the chart is approved, in the site's explicit-feature voice.

**What "Not stated" means.** A footnote defines it: "Not stated on the pages
listed under Sources." It is a statement about those pages, never about the
product. Seven cells use it: Arc open source, Arc price, Arc's separation of
accounts within Spaces, Helium Spaces, Helium AI and link preview, and Brave
split view and link preview. Brave's release-notes page (brave.com/latest)
was searched for split view and shows only the latest release, so it settles
nothing. A reader who knows Brave has split view will still read that cell as
a gap in our research, which is the cost of the rule that another product's
behavior needs a first-party source. Sources beyond the lists below (a
product's own repository, changelog or release notes) may be used to turn a
"Not stated" cell into a sourced yes or no before the build, and each such
cell is rewritten when that happens.

## Evidence (every cell, with the source it stands on)

All other-product sources were read on November 2, 2026, by the session that
wrote this document (three first-party fetches by subagents, each spot-checked
against the page in a browser, plus direct reads of arc.net, the Arc Help
Center, Crest's site and GitHub, helium.computer and brave.com). That session's
reads are the record; the builder transcribes them and does not re-research,
except to re-open a page that is cited but was not read in full (listed
below). The build produces the per-cell mapping the claims test needs: each
other-product claim gets an exact URL, the publisher, `accessedAt`
(2026-11-02), and a short supporting paraphrase, and the page links every
source URL in a Sources section, as `/arc-alternative` and the ledger test
(`website-feature-evidence.test.js`, `externalSources`) already require. A new
ledger, `docs/website-compare-claims-v1.45.1.json`, and a matching test case
are part of the build.

Cited but read only as a search snippet, to be opened in full during the
build: Arc Help Center "Troubleshoot or Report a Problem in Arc" (the uBlock
Origin default).

- **Blanc:** v1.45.1 release notes (`site/src/data/releases.json`: Split View
  and floating Glance v1.40.0, Arc import v1.32.0, free Spaces v1.33.0, Shared
  Spaces v1.45.0); `LICENSE` and `ASSET-LICENSE.md` at the tag;
  `site/src/data/ios-availability.json` (TestFlight, since Oct 28, 2026);
  `/features/sync` and `/download` copy. Mini Window absent from
  `src/main/main.js` at v1.45.1.
- **Crest:** github.com/pauljoda/Crest (README, releases, CHANGELOG 0.8.50 and
  0.8.0); crestbrowser.com home, `/guides/engines/`,
  `/guides/spaces-and-isolation/`, `/guides/sync-across-devices/`,
  `/guides/extension-compatibility/`, `/privacy/`; the App Store listing
  ("free and open source").
- **Arc:** arc.net (sunset timeline, Dec 22, 2026); Arc Help Center "Arc Sunset:
  Frequently Asked Questions" (Chrome extensions, Peek, Split View, Arc Max);
  Arc Help Center "Troubleshoot or Report a Problem in Arc" (uBlock Origin by
  default on macOS). resources.arc.net returns 403 to automated fetches but
  opens in a browser.
- **Helium:** helium.computer home and FAQ (free, FOSS, extensions, vertical
  tabs, split view, sync "Not yet", mobile "Not yet", blocking by default),
  `/download`, `/sponsor`, github.com/imputnet/helium and its three platform
  release pages (0.20.3.1, Oct 30; no year shown on the pages).
- **Brave:** brave.com/features, `/download`, `/privacy-features`, `/premium`,
  `/latest` (v1.98.62, Oct 28), `/blog/containers/` (Jul 2, 2026), and the
  brave-browser GitHub repository (MPL 2.0). support.brave.app returns 403 to
  automated fetches, so help-center wording is not used.

## Calls I made (change any of them)

1. **Arc stays as a column, labeled as ending.** You asked for it, and many
   visitors still arrive from Arc. Its own page says Arc stops working on
   macOS and Windows on Dec 22, 2026, so a chart without that would mislead.
   The chart would need a rethink after that date. A Dia column was not added.
2. **11 rows, not 12.** "Import from Arc" became a link under the chart.
3. **"Not stated" over a guess.** Seven cells use it (see "What 'Not stated'
   means"). The policy forbids inferring another product's behavior from
   silence. If you would rather leave those cells blank or cut the rows, say so.
4. **Crest "Free" rests on the publisher's App Store listing**, which says
   "free and open source". Its own site never states a price.
5. **Helium's release date** comes from GitHub release pages that show "30 Oct"
   with no year; the year is inferred from the release sequence.
6. **No engine row.** Every browser here is Chromium-based on desktop except
   Crest, which adds WebKit; the engine does not decide a switch for most
   readers, and Crest's two-engine model is already visible in its
   extensions and blocking cells.

## Keeping it current

A chart like this goes stale the moment a competitor ships. My calls:

- **Blanc cells:** the data file carries `checkedAgainst: "v1.45.1"` and
  `checked: "2026-11-02"`, and the page shows both. A unit test fails when
  `releases.json` has a newer *minor* version than `checkedAgainst` (1.46.0,
  not 1.45.2), the same kind of guard `site-roadmap.test.js` gives the
  roadmap. A bug-fix release does not add features to the chart's rows, so
  it needs no re-pin. A new feature release adds one review to the
  post-release follow-up.
- **Competitor cells:** no automated test. The "Release status" row uses the
  stage each product gives itself ("early access", "beta") instead of
  version numbers, which would go stale within days. Everything else is dated
  by the visible "Checked November 2, 2026" line. Re-checking competitor
  cells is a manual step; the chart drifts between re-checks. If you want a
  hard limit, a maximum age on `checked` is possible, at the cost of a test
  that eventually fails unrelated pull requests until someone re-checks.
- **Arc's end date.** The data carries `endsOn: "2026-12-22"` for Arc. A site
  build after that date drops the Arc column and prints one line saying Arc
  ended on that date. There is no date test that fails CI. A static page
  cannot change itself, so the live page keeps its "ends Dec 22" wording
  until the next deploy; I can set a reminder for December 22 so that deploy
  is not forgotten.

**Owner addition (November 2, 2026): keep the page updated regularly.** On
top of the feature-release test, every competitor cell is re-checked monthly,
and on a competitor's major release or a reader's correction. Schedule and
procedure: `docs/compare-page-maintenance.md`.

## Sign-offs and where the work stops

1. **Now:** you approve or edit the chart wording above. Nothing is built
   before that.
2. **After that:** I mock two or three layouts in real CSS with the intro
   copy shown in them, and you pick one. That is the second and last
   checkpoint.
3. **The work ends at a website-only pull request** (`site/`, `docs/`, tests),
   per the repo's rule to keep website changes separate. Deploying is a
   separate step: `npm run site:deploy` needs the licensed Blubird fonts on the
   deploying machine, and publishing goes out under your name, so it waits for
   your word.

## Left to the builder

- Page layout, after two or three CSS mockups are compared (this repo's
  convention for visual work).
- Final copy for the intro and the "where Blanc is behind" lines, in the
  explicit-feature voice of `docs/marketing-claims.md`.
- A mobile treatment: the chart must read at 375px without horizontal page
  scroll (a sticky first column inside a scroll container is acceptable).
- Sitemap entry, footer link, `/arc-alternative` link, a claims ledger
  (`docs/website-compare-claims-v1.45.1.json`), SEO title and description,
  and the data and logic tests.
- Styling in CSS classes, not inline styles.

## Out of scope

Brave, Helium, Crest and Arc logos (trademarks); screenshots of any other
product; pricing tables beyond the one cost row; any ranking.
