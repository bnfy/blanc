# Bangs page redesign: icons first, less reading

October 17, 2026. **Status: design, awaiting owner review.** Nothing here is
built yet.

This revises the live `/bangs` page (shipped from
`docs/superpowers/specs/2026-10-17-bangs-page-design.md`). That document's
rules on pinned data, the directory matcher, the engine-search tags, the Kagi
credit and claims all still hold. This one replaces its page layout (its
sections 1 to 5) and its try-it box.

## Why

The owner compared the page with `helium.computer/bangs` and wants ours more
visual and more fun. What makes Helium's work, in the owner's words: the site
icons make the page colorful and inviting, and there is little explainer text
in the way. Ours opens with a paragraph, a dark try-it stage and two sections
of copy before the first bang.

The first design's anti-goal "it must not look like a copy of Helium's page"
is relaxed by this direction: we take the visual idea (a grid of real site
icons with their codes). We still don't copy Helium's words, its layout
detail or its look; the page stays Blanc's cream, Blubird and the app's chip.

## Decisions (owner, October 17, 2026)

1. **Grid first; the try-it box goes.** The page opens with the headline, a
   search field and a grid of icon cards for the featured sites. The dark
   Island stage, its example buttons and its "Return would open" line are
   removed. (Chosen from three mock-ups: grid first, try-it then grid, and
   one box that does both.)
2. **The two copy sections become one, below the index.** "Type it first or
   last…" and "Your words skip your search engine." merge into one short
   section placed after the grid and the list.
3. **Featured sites are cards; a search shows a list.** With the search field
   empty the page shows cards. Typing replaces them with compact rows, which
   scan faster through long result lists. (Chosen from: cards with a lettered
   tile, plain cards, list.)
4. **Every bang gets a real icon, loaded live through Blanc's own server.** A
   new Cloudflare Worker on blanc.day fetches and caches each site's icon. The
   visitor's browser never contacts a third party. (Chosen over loading from
   Google's or DuckDuckGo's icon service in the browser, and over downloading
   every icon at each release.)
5. **Icons come from the site first, then DuckDuckGo.** The icon server asks
   each site for its own icon and, when a site has none or turns it away,
   DuckDuckGo's icon service. DuckDuckGo sees only the list of public bang
   hosts, never anything about visitors. (Chosen over each site only, and
   over DuckDuckGo only.)
6. **The paid Workers plan is approved** ($5 a month, if the BNFY account
   isn't on it already), so the server can keep one global copy of each icon
   (and resize images later if icons prove heavy). A billing alert and a route rate rule go with it.
7. **Some icons are held back.** A reviewed list in the repository names hosts
   that only ever get a lettered tile (adult image boards and the like). It is
   reviewed once before launch and guarded by a test; pulling another icon
   later means adding it to the list and redeploying the Worker. (Chosen over
   serving every icon, and over adding an instant switch.)
8. **Bangs the site asks you to type are the app's chip**, as already done in
   the chip change (`.bang-chip` in `site/src/styles/site.css`, guarded by
   `test/unit/site-bang-chips.test.js`). Codes on cards and rows use it too.

## The page, top to bottom

The owner chose from throwaway mock-ups (option A of three layouts, option 3
of three search-result styles) that lived only in the brainstorming session.
This document stands on its own; nothing in them is needed to build it.

### 1. Hero

- H1 **Search the site. Skip the engine.** (unchanged, so the share card's
  headline and the claims record stay).
- One line, reusing recorded homepage wording: *Type a site’s code before
  your search, like `!yt lofi`, to go straight to its results. Works with any
  search engine.*
- No "Find a bang ›" link: the index is right below.

### 2. Search

- The existing field (*Search bangs: youtube, yt, wikipedia…*) with its live
  count, directly under the hero. Same matcher as today
  (`filterBangs` in `site/src/scripts/bangs-directory.mjs`), still searching
  every alias once the data asset arrives.

### 3. Featured cards (search field empty)

- One card per entry of `bangs.json`'s `popular` list: the app's own 19
  popular bangs, in the app's order, the set its ⌘L panel shows for `!`.
  Not hand-picked (anti-goal: nothing the pinned build doesn't ship).
- A card shows the icon, the host, the site name as shipped, and its codes as
  chips: the popular code first (`!w` for Wikipedia, the code people type),
  then up to two more of the entry's codes.
- My call: cards are not links and do nothing when clicked (a link would only
  lead to the site itself, which isn't what the page is for).
- Grid: 4 columns on desktop, stepping down to 2 on phones. Cards are white
  on the cream page with the site's 16px-ish radius; exact metrics are the
  builder's.

### 4. The fold

- Under the cards: a line built from the data, *And {count − 19} more.* (the
  number formatted as the page formats counts), with two actions: **Search
  them** (focuses the field) and **Browse all** (opens the full list,
  alphabetical, paged). Browse all is my call, so the full list stays one
  click away as it is today.
- Under that, unchanged and still read from the data: *{count} bangs, exactly
  the list in Blanc {version}.* and the Kagi credit with its MIT link.

### 5. The list (a search, or Browse all)

- Replaces the cards while the field holds text or Browse all is open;
  clearing the field (or closing Browse all) brings the cards back.
- Each row: icon, the code as a chip, the site name, up to three other codes
  as chips then *+N* (as now), the host, and the *via Google* / *via
  DuckDuckGo* tag where it applies.
- Paged in steps of 50 with *Show more*, and *No bang matches “…”.* when
  empty, as now.

### 6. How bangs work

One section, heading *How bangs work* (the homepage card already links with
those words). Draft copy reuses recorded sentences wherever it can:

- **First or last.** `!yt lofi` and `lofi !yt` do the same thing, and a code
  on its own, like `!yt`, opens the site’s home page.
- **Don’t know the code? Type `!`.** The Island lists the bangs you used
  recently and a set of popular ones.
- **Your words skip your search engine.** A bang opens the address it names,
  and Blanc sends your words only there, never to your own search engine
  first. A few bangs send your words through Google or DuckDuckGo to search
  one site; the list marks them.
- **Add your own.** Settings, General, Your bangs: pick a code, a name, and
  the site’s search address with `%s` where your words go. With Sync on, your
  bangs follow you to your other computers.
- A small note: *The list ships inside Blanc and changes only with a Blanc
  update. Blanc doesn’t ask your search engine for suggestions while a bang is
  in the box; a bang typed at the end is different, because the words before
  it may already have gone to your search engine as suggestions.*

The qualifications in that note and in the third point must stay with their
claims (first design, *Claims*). Dropped from today's page: the SearXNG
example, "Keep typing to search the whole list…", "It works the same whichever
engine you chose in Settings", the recents/private-tabs sentence, and the
try-it caption. The builder may restore any of them if a claim needs it.

### 7. Close

*Try bangs in Blanc.* and the Download button, unchanged.

### Without JavaScript

The featured cards and the full list both render, the list expanded (no fold,
no paging), as today's page does. Icons in the cards still load (plain
`<img>`); list rows show their lettered tiles (see below).

## Icons

### What the page draws

- Every card and row has a square icon slot. Underneath the image sits a
  **lettered tile**: the site name's first letter on a warm color chosen from
  a small fixed palette by a hash of the host, so the same site always gets
  the same color. If the icon is slow, missing or fails, the tile is what
  shows. A broken-image glyph must never appear.
- Cards carry their `<img>` in the HTML. List rows get theirs from the script
  when a row is shown, so the 10,624 rows don't add an image tag each to the
  page's HTML (budget: the page stays within the first design's 1.8 MB raw).
- Images are `loading="lazy"`, `decoding="async"`, with fixed width and
  height so nothing shifts.

### The icon server

A new Worker, `cloudflare/bang-icons-worker/` (my call on the name), deployed
like `blanc-ping`: a more specific route carved out of the blanc.day Pages
site, so icons are same-origin and the site's `img-src 'self'` policy in
`site/public/_headers` stays unchanged.

- **Address:** one path per host, for example `blanc.day/bang-icons/<host>`
  (and `www.`). Exact shape is the builder's.
- **Only bang hosts.** The Worker answers only for hosts in the pinned bang
  list (8,910 distinct hosts at v1.36.0, none an IP literal or with a port).
  My call: `npm run site:bangs` writes that list to a stable public file on
  the site (for example `site/public/bang-hosts.json`), and the Worker reads
  it from blanc.day and keeps it briefly. The list then follows each
  post-release re-pin and site deploy with no Worker redeploy and no change
  to the release protocol. A unit test fails if the file disagrees with
  `bangs.json`. Anything else gets a 404. It must never become a general
  fetch-anything proxy.
- **Fetching, following the app's own favicon rules** (privacy page,
  *Favicons*): no cookies or referrer, refuse private and local network
  destinations including after redirects, a time limit, a response size cap,
  and only image responses.
- **What it serves:** a raster image (PNG, JPEG, GIF, WebP or ICO) under a
  byte cap, which the page draws at a fixed size, with
  `X-Content-Type-Options: nosniff`, a restrictive
  `Content-Security-Policy` and a long cache lifetime. Never a site's SVG
  served as-is from blanc.day, because a same-origin SVG opened directly could
  run script. Rasterize it or treat it as missing.
- **When there is no usable icon:** a fast 404 (cached for a shorter time) so
  the page keeps the lettered tile.
- **Caching:** each icon is kept in one global store (R2 or KV, builder's
  call) after its first fetch, so a site or DuckDuckGo sees Blanc's server
  about once per icon, never a visitor. Cloudflare's cache may sit in front
  of it. Misses are kept for a shorter time and retried later.
- **What it keeps about visitors:** nothing beyond Cloudflare's own request
  handling; no logging of addresses or of which icons a visitor asked for.
- **Cost guard:** like `blanc-ping`, a Cloudflare billing notification and a
  route rate rule. Requests are bounded by the host list and by lazy loading.
- **Featured sites must all show real icons.** My call: before the page PR,
  the Worker's acceptance includes a check that all 19 popular hosts return
  a real icon from the live Worker. A lettered tile is fine in the list, not
  on the first screen. Any gap is fixed in the Worker's sources, never by
  shipping icon files with the site.

### Where the icons come from

Decision 5. For each host, in order:

1. The site's own icon: the largest raster icon its homepage declares
   (`apple-touch-icon` or `<link rel="icon">`), else `/favicon.ico`.
2. Otherwise DuckDuckGo's icon service for that host.
3. Otherwise the "no icon" reply, and the page keeps the lettered tile.

Both fetches follow the rules below. Hosts on the hold-back list (decision 7)
skip all three and always get "no icon". The list lives with the Worker; the
builder drafts it from the pinned data and the owner approves it in the
Worker PR.

### Privacy and policy

- The visitor's browser talks only to blanc.day, as it does today. Which icons
  load tells blanc.day which rows were on screen; that is the same server the
  search already runs against, and nothing is stored.
- The privacy policy gains one sentence in its website section, roughly:
  *The bangs page shows site icons from blanc.day. Blanc's server fetches each
  icon from the site, or from DuckDuckGo's icon service, and keeps a copy, so
  your browser contacts neither.*

## What goes away

- The try-it stage, its example buttons and messages, `bangs-tryit.mjs`, and
  the try-it parts of `bangs-page.js`.
- If nothing else uses them: the byte copy of the app's `bangs.js` in
  `site/src/scripts/` and the try-it `labels` in `bangs.json`, together with
  the generator's code for them, their checks in
  `test/unit/site-bangs-data.test.js` and `test/unit/site-bangs-logic.test.js`,
  and the matching lines of `site/CLAUDE.md`'s *Bangs page* paragraph.

## Claims and tests

- New and changed sentences go into `docs/website-v1.36-claims.json` (the
  hero line and the fold line, the merged section, the privacy-policy
  sentence where it is ledgered). Data-built lines (the fold count) join
  `bangsPageDynamicLines()` in `test/unit/website-feature-evidence.test.js`.
  `test/unit/website-feature-evidence.test.js`'s bangs privacy test moves to
  the merged section and keeps its checks (the trailing-bang caveat, the
  Google/DuckDuckGo exception).
- `test/site/bangs-page.test.mjs` is rewritten: the try-it tests go; new
  checks cover the featured cards (the `popular` list, in order), the
  search swapping cards for rows and back, Browse all, the lettered tile when
  an icon fails, every image request staying on the site's origin, no layout
  shift from icons, no sideways scroll at 360px, the no-JavaScript page, and
  the faces (page in Blubird, chips in Instrument Sans).
- The Worker gets unit tests beside the existing Worker tests in `test/unit/`:
  the host allowlist, refusal of private addresses and redirects into them,
  the size cap, non-image and SVG handling, the 404 path, and its headers.
- `npm run lint` covers the Worker's JavaScript.

## Order of work

1. The chip change (done, uncommitted) lands on its own.
2. The Worker, in its own PR. Deployed and checked against real hosts before
   any page uses it (the rule the ambassador form follows).
3. The page, in a second PR, after the Worker is live. If the Worker is ever
   down, the page still works with lettered tiles.

## Non-goals

- No try-it box anywhere on the page.
- No icons in the app in this project; the app doesn't change. The owner
  wants them there too (see *Follow-up*), as its own design.
- No icon requests from the visitor's browser to anyone but blanc.day.
- No category filters, no hand-picked featured list, no change to the bang
  data or `bangs/excluded.json`.
- No header or footer link, no announcement.

## Anti-goals

- The page must never show a bang, count or version the pinned build doesn't
  ship, or a sentence that isn't recorded.
- A broken-image icon, a layout jump as icons arrive, or a page that stutters
  while 10,000 rows are searched.
- An icon server anyone can point at an arbitrary address.
- Copying Helium's words or its exact layout.

## Follow-up: icons in the app

The owner raised (October 17) showing the same icons in the app's bang rows
(the hint row and the `!` picker in the ⌘L panel). That is a separate project
after this one, because the app's rules differ from the website's: the app
never asks a favicon service, and fetches an icon only for a site you use
(privacy page, *Favicons*), so the picker can't simply call the icon server
without telling Blanc's server which bangs someone is browsing. Its design
chooses between icons the app already holds for sites you visited, icons
shipped inside the app for the popular bangs, or the icon server with its own
privacy review and policy change. This project only keeps the icon server's
contract (path, image format and size) plain and stable so the app could use
it later; it adds nothing for the app.

## Left to the builder

- Card and row metrics, icon size and corner radius, the tile palette, grid
  steps per width.
- The Worker's storage, cache lifetimes, image size and how it rasterizes.
- Exact copy within `docs/marketing-claims.md`, the claims ledger and the
  qualifications above.
- Paging step, ranking within the existing matcher, keyboard behavior of
  Search them and Browse all.

## Owner awareness

- The popular list is shipped data, so a few featured names read as Kagi
  wrote them ("Amazon.com", "GMail.com", "Google TR"). Changing them means
  changing the app's data in a release, not the page.
- The Worker deploy and the site deploy are production deploys and each
  needs the owner's go-ahead at the time.
