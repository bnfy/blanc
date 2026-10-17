# Bangs page on blanc.day

October 17, 2026. **Status: design, awaiting owner review.** Nothing here is
built yet.

## Why

Bangs (F47, `!yt lofi`) merged on October 17 as `081c965b` (PR #876). They
answer the top item on the Helium wish list of the Reddit commenter in the
`blanc-helium-gap-2026-10-16` notes, and they are a feature people look up:
"what's the bang for X?". Helium promotes theirs with a page at
`helium.computer/bangs`. That page is only a search box over its list: it
never explains what a bang is or how to type one, the privacy point lives on
their homepage instead, and without JavaScript it shows nothing but "Loading
bangs…". Blanc's page should explain the feature to someone who has never
heard the word, let them try it, and still be the lookup people bookmark.

## Decisions (owner, October 17, 2026)

1. **It goes live with the release that ships bangs, not before.** No surface
   of the website mentions bangs until that version is public.
2. **Until then the branch builds from candidate data and stays green.** As
   the v1.35.0 homepage did (#853, `docs/website-candidate-claims-v1.35.0.json`):
   the page's data and a candidate claims record are pinned to the bangs merge
   commit `081c965b`, CI passes, and the PR waits unmerged. After the release,
   one commit swaps the data and the claims to the release tag; then it merges
   and deploys.
3. **One page at `blanc.day/bangs`: an explainer, then the full directory.**
4. **The directory searches by site and by code**: `youtube` finds `!yt`,
   `yt` finds YouTube.
5. **A try-it box that shows the result only.** A replica of the Island's
   input runs Blanc's own bang code: it draws what the app draws and shows the
   address Return would open. It never navigates and sends nothing.
6. **Placements when it goes live:** a large board tile with a live demo on
   the Features page, a card on the homepage in *Everyday browser tools*, and
   the roadmap and changelog in the normal post-release follow-up. No header
   or footer link.
7. **Bangs takes Reopen closed tabs' place on the Features board** (area R3);
   Reopen closed tabs becomes a small tile with its pop-out.
8. **The privacy copy is narrowed, and the bangs that search through another
   engine are marked.** 37 shipped bangs (33 through Google, 4 through
   DuckDuckGo, at `081c965b`) open a search engine's search limited to one
   site, such as `!ubuntufr` or `!boingboing`, so "your words go only to that
   site" is not true for them. The copy says Blanc sends your words only to
   the address the bang opens, and those rows carry a *via Google* or *via
   DuckDuckGo* tag. The app does not change.
9. **The headline makes Helium's idea ours.** Helium's homepage heads its
   bangs section "Skip the search engine"; the owner chose the same idea in
   different words. *Search the site. Skip the engine.* is my call for the
   exact line.
10. **The directory comes after the explanation**, with a link near the top
    that jumps to it.

The reviewed mock-up (not committed):
`.superpowers/brainstorm/21867-1792224094/content/bangs-page.html` on the
owner's machine; this document supersedes its copy where they differ.

## The page

Route `/bangs` (`site/src/pages/bangs.astro`), the standard page profile, the
Features item current in the header, breadcrumb *home / features / bangs*,
BreadcrumbList JSON-LD like the feature pages, and an OG card
`feature-bangs.png` (the Island's input with `!yt lofi` and the hint row),
generated like the others: added to `CARDS` in
`site/scripts/render-og-cards.mjs` and to `test/unit/og-cards.test.js`. It
joins the sitemap's `MANIFEST`. Set in Blubird like every page; the Island
replica and the directory's codes use Inter, the app's face, as the existing
replicas do.

### 1. Hero

- H1: **Search the site. Skip the engine.**
- Paragraph (draft): *Type an exclamation mark and a site's code with your
  search, like `!yt lofi`, and Blanc opens YouTube's results directly. It
  works with whichever search engine you use, and your words go straight to
  the address the bang opens, not through your search engine.*
- A small link under it: *Find a bang ›*, jumping to the directory.

### 2. Try it

A dark stage like the feature pages' Island figures, holding a working copy of
the Island's input and list. It draws exactly what the app's ⌘L panel draws
for the same text, minus anything that depends on the person (recents, their
own bangs, open tabs):

- Prefilled with `!yt lofi`. Typing updates the list live.
- A known bang: the hint row as the app draws it, the entry's **primary**
  code in bold (`!w golden retriever` shows `!wikipedia`, as the app does),
  then *Search Wikipedia for "golden retriever"*, or *Open Wikipedia* for a
  bare code, with the ↵ glyph. Under the Island: *Return would open* and the
  full address.
- `!` alone, or a bare code, draws the app's picker: its foldable section
  headers with counts (*popular*, *all bangs*; no *recent*), the rows from the
  shipped `matchBangs` unmodified (so `!` lists all 19 popular bangs and a
  partial code at most eight), and the hint row above them when the code is
  itself a bang.
- Anything else: *Not a bang. Blanc treats this as it always does: an address,
  a command, or a search.* An unknown code: *No bang with that code. Blanc
  would search for it as typed.* The box never claims which of these Return
  would do, because that logic lives in the app, not in `bangs.js`.
- Example chips fill the box: `!w golden retriever`, `!a usb cable`,
  `!gh electron`, `lofi !yt`, `!`.
- Caption: *Type a bang and the Island shows where it will go before you press
  Return. Nothing you type in this box leaves the page.*
- It runs the pinned `bangs.js` and catalog (see *Data*), so its answers are
  the app's answers. It never navigates, opens a window, or makes a request;
  there is no Return handler.
- Without JavaScript the stage shows the prefilled state as static markup.

### 3. How to use it (feature-copy-grid)

Heading: *Type it first or last. Blanc takes it from there.*

- **The sites you search most, one code away.** `!w` searches Wikipedia, `!a`
  Amazon, `!gh` GitHub. `!yt lofi` and `lofi !yt` do the same thing, and a
  code on its own, like `!yt`, opens the site's home page.
- **Don't know the code? Type `!`.** The Island lists the bangs you used
  recently and a set of popular ones. Keep typing to search the whole list by
  code or by site name.
- **Add your own.** Settings, General, Your bangs: pick a code, a name, and the
  site's search address with `%s` where your words go, for example your own
  SearXNG server. With Profile Sync on, your bangs follow you to your other
  computers.

### 4. Privacy (feature-copy-grid)

Heading (draft): *Your words skip your search engine.*

- **Straight to the bang's address.** A bang opens the address it names, and
  Blanc sends your words only there, never to your own search engine first. It
  works the same whichever engine you chose in Settings. A few bangs open
  another search engine's search of one site; the list below marks them.
- **No suggestions while you type a bang.** Blanc doesn't ask your search
  engine for suggestions while a bang is in the box, so `!yt lofi` isn't sent
  anywhere until you press Return.
- **The list is built in.** Blanc doesn't look bangs up online. The list ships
  inside the app and changes only with a Blanc update. The bangs you used
  recently stay on this computer, and private tabs don't record them.

### 5. Directory

- H2 *Every bang in Blanc*; under it the count and version, both read from the
  data (*10,624 bangs, exactly the list in Blanc 1.36.0*; during the candidate
  phase the version line reads from the candidate record and the page is not
  public). Neither is ever typed by hand.
- A search field (*Search bangs: youtube, yt, wikipedia…*) with a live count of
  matches. The directory has its own matcher, not `matchBangs` (whose
  eight-row cap is fixed): code or alias prefix first (shorter codes first),
  then site name or opened host containing the words, case-insensitive. It
  searches every alias, not only the three shown.
- Rows: the code (Inter, bold), the site name, up to three other codes then
  *+N*, the host the address opens (taken from the template, not Kagi's `d`
  field), and, for the site-limited engine searches of decision 8, a *via
  Google* or *via DuckDuckGo* tag. Sorted by site name.
- Which rows are engine searches is decided by one rule in the generator: the
  template's host is a search engine's (Google, DuckDuckGo, Bing) and the
  template limits the search to one site (`site:`, `sites=`, or a Google
  custom search `cx=`). Google's own products (Maps, Images, Translate) are not
  tagged. The rule and its count live in a unit test.
- Every row is in the page's HTML, so search engines and visitors without
  JavaScript get the whole list. With JavaScript, the first 50 rows show and
  *Show more* reveals the rest in steps; searching filters across all of them.
- Credit under the list: *The bang list comes from Kagi's open-source bang
  collection (MIT), checked and bundled with each Blanc release.* It links to
  `github.com/kagisearch/bangs` and to the license text, shipped as
  `site/public/licenses/kagi-bangs-MIT.txt` beside the site's existing
  `three-MIT.txt`, because the page redistributes the list. It must not read
  as an endorsement by Kagi.

### 6. Close

*Try bangs in Blanc.* and the Download button, as the feature pages close.

## Data: pinned, never main's working tree

The site shows exactly what a pinned commit ships: the bangs merge commit
during the candidate phase, the release tag after it. Never main's working
tree (the same rule as `released-slash-commands.mjs`).

- A generator (`site/scripts/build-bangs-data.mjs`, with a root
  `npm run site:bangs` proxy beside `site:changelog`) takes a ref (commit or
  tag), reads `src/renderer/pages/bangs-catalog.js` and
  `src/renderer/pages/bangs.js` at that ref with `git show <ref>:…` (with a
  `maxBuffer` above the catalog's 1.5 MB; Node's 1 MiB default fails with
  `ENOBUFS`), and writes:
  - `site/src/data/bangs.json`: `{ ref, release (tag or null), catalogSha256,
    count, popular, entries }`, entries carrying what the directory and the
    try-it box need, including all aliases and each entry's engine tag;
  - a byte copy of that ref's `bangs.js` for the try-it box
    (`site/src/scripts/bangs.js`), never hand-edited.
- A unit test fails when either file differs from the bytes at the ref it
  names. While `release` is null it also requires `ref` to equal `081c965b`
  (or whatever commit the candidate record names); once set, it requires
  `release` to be the latest release in `site/src/data/releases.json`.
- The page ships the catalog once: the directory's HTML carries what it shows,
  and the try-it box's full data loads as one hashed JSON asset on first
  interaction or on idle, never inlined a second time.
- Budgets: the page's HTML at most 1.8 MB raw with lean row markup (bare rows
  measure about 1.0 MB), served compressed; the try-it data at most 1.6 MB raw
  (about 1.45 MB measured).
- After each later release, the post-release follow-up regenerates
  `bangs.json` with the changelog; `site/CLAUDE.md`'s post-release paragraph
  says so. Nothing is added to `release.sh`.

## Other surfaces

- **Features page (`/features`):** a large board tile in area R3 with a live
  demo (the Island input cycling through a few bangs and drawing the hint row,
  in the style of the existing demo tiles and honoring
  `prefers-reduced-motion`), plus its FeaturePop: *Bangs* — *Type `!yt lofi`
  to search YouTube directly, with any search engine.* — linking to `/bangs`.
  Reopen closed tabs moves to a small tile with an icon and keeps its pop-out.
  `test/site/features-bento.test.mjs` stays at 15 board tiles and moves to 21
  small tiles and 36 pop-outs.
- **Homepage (`/`):** a `tool-card` in *Everyday browser tools* beside Glance,
  Start Page layouts and Quiet Tabs: an Island drawing with the `!yt lofi`
  hint row (HTML/CSS like the Quiet Tabs and 1Password cards, not a
  screenshot), *Bangs* as the title, one sentence (*Type a site's code before
  your search, like `!yt lofi`, to go straight to its results.*), a
  `tool-limit` line (*Works with any search engine.*) and *How bangs work ›*
  to `/bangs`.
- **Roadmap and changelog:** in the post-release follow-up, bangs gets a short
  feature name in `release-feature-names.json` (unless the release body opens
  its bullet with **Bangs.**) and leaves any roadmap list it is on.
- **`docs/marketing-claims.md`:** gains a short Bangs entry (what may be
  claimed, the qualifications below, the engine-search exception), and its
  search-engine entry's "Do not claim search keywords or shortcuts" is
  clarified to mean Chrome-style engine keywords, which Blanc still lacks, so
  it doesn't read as forbidding bangs. My call; the owner approves it with the
  PR.

## Claims

During the candidate phase every sentence on `/bangs`, the Features tile and
pop-out, and the homepage card goes into a candidate claims record pinned to
`081c965b`, modeled on `docs/website-candidate-claims-v1.35.0.json` and its
test. After the release it becomes the release's ledger
(`docs/website-v1.36-claims.json` if that is the version) with evidence at the
tag: `spec/features.md` F47, the bang unit tests,
`spec/acceptance/island-and-commands.feature` `@F47`, `src/main/settings.js`
for sync and recents, `src/main/main.js` for the suggestion refusal, and the
compliance record for Kagi's license.

`test/unit/website-feature-evidence.test.js` hard-codes the pages it covers:
it gets an explicit block for `/bangs` that fails on any unrecorded sentence,
and the new ledger is added to the hand-written ledger lists of the homepage
and Features checks.

Qualifications that travel with their claims: custom bangs sync only with
Profile Sync on; recents are device-level and skip private tabs; the list
changes only with an update; a few bangs search another engine; no
suggestions are requested while a bang is in the box (suggestions typed
before a trailing bang may already have gone, so the page claims only the
in-the-box case).

## Non-goals

- No bang list service, no API, no download of the list as a file.
- No header or footer link, no newsletter or social post (any announcement
  follows `docs/marketing-claims.md` and the owner's approval separately).
- No mention of bangs anywhere public before the release ships.
- No category filters (the shipped catalog carries no categories).
- No change to the app or to `bangs/`.

## Anti-goals

- The page must never claim a bang the pinned build lacks, or a count or
  version typed by hand.
- No sentence may say a search avoids every search engine without the
  engine-search exception beside it.
- The try-it box must never send what is typed anywhere or navigate.
- It must not look like a copy of Helium's page or copy.

## Owner awareness

- Kagi's list includes a handful of sites some visitors may not expect on a
  browser's marketing page (for example Danbooru, an image board with adult
  content). The directory shows exactly what the app ships, so removing one
  means adding it to `bangs/excluded.json`, which removes it from the app too,
  in the release that carries the change.
- The PR touches the root `package.json` (the `site:bangs` proxy) and
  `test/unit/`, so it is not a website-only PR and CI runs the Electron jobs.

## Left to the builder

- Exact copy beyond the lines above, within `docs/marketing-claims.md` and the
  site's explicit-feature rule.
- The directory's row markup, the *Show more* step size, and the search
  debounce.
- The OG card's composition and the Features demo's sequence.
- Whether the try-it data loads on first interaction or on idle.
