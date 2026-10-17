# Bangs Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `blanc.day/bangs` as an icon-first page: headline, search, a grid of the 19 popular bangs as icon cards, a fold into the full list, one short "How bangs work" section, with the try-it box removed.

**Architecture:** `bangs.astro` renders the featured cards and the whole list server-side from the pinned `bangs.json`, so the page works without JavaScript. `bangs-page.js` switches the page between a cards view and a list view (a search, or Browse all), pages the list, and adds each shown row's icon from the icon server at `/bang-icons/<host>` (PR 2, `docs/superpowers/plans/2026-10-17-bang-icons-worker.md`). Every icon sits on a lettered tile, so a missing or slow icon never shows a broken image. The share card moves to a native capture from the installed public app, as the other v1.36.0 cards are made. This is PR 3 of three.

**Tech Stack:** Astro (`site/`), plain browser JS modules, CSS; Node `node:test` unit tests; Playwright browser suites in `test/site/` run against a built preview; the installed-app capture tooling in `test/desktop/support/installed-capture.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-17-bangs-page-redesign-design.md`

## Before you start

- PR 1 (bang chips) and PR 2 (icon server) are merged, and `https://blanc.day/bang-icons/www.youtube.com` answers 200. Branch from `main`.
- Browser suites run against a build: `npm run site:build`, then `cd site && npx astro preview --host 127.0.0.1 --port <free port>` in the background, then `BLANC_SITE_URL=http://127.0.0.1:<port> node --test ../test/site/bangs-page.test.mjs`, then stop the preview. (Port 4322 is CI's default and may be taken by another session.)
- The site preview has no icon server. Browser tests stub `/bang-icons/*` with Playwright routes (a 1×1 PNG, or a 404).

## Global Constraints

- `site/public/_headers` stays unchanged: icons load only from `/bang-icons/<host>` on the page's own origin.
- Page text in Blubird; every bang code and typed example in the app chip (`.bang-chip`, or `.bangs-rows b`/`kbd` as styled now).
- The data is never hand-edited: regenerate with `npm run site:bangs` (reuses the pinned ref) and check with `npm run site:bangs:check`.
- `dist/bangs.html` stays at most 1.8 MB raw (the existing budget test).
- Every sentence on the page is recorded in `docs/website-v1.36-claims.json` (`test/unit/website-feature-evidence.test.js`), and the qualifications stay: the trailing-bang suggestions caveat and the Google/DuckDuckGo exception.
- Featured cards are exactly `bangs.json`'s `popular` list, in its order. Not hand-picked.
- No broken-image glyph, no layout shift as icons arrive, no sideways scroll at 360px.
- US spelling.

## Exact copy

- Hero paragraph: `Type a site’s code before your search, like <kbd class="bang-chip">!yt lofi</kbd>, to go straight to its results. Works with any search engine.`
- Fold: `And {more} more.` where `{more}` is `count − 19` formatted with `toLocaleString('en-US')`; buttons `Search them` and `Browse all`.
- How bangs work: H2 `How bangs work`, then four items and a note, exactly the design's section 6 wording, with every bang and `%s` in `<kbd class="bang-chip">`.

## Review Focus

- The data asset fails or arrives late: search must still work from the rows in the HTML. (Task 3 keeps the test `if the data asset fails, search still works from the page`.)
- Typing, clearing, typing again: clearing returns the cards and resets the list to its first 50 rows. (Task 3 test `clearing the search brings the cards back and resets the list`.)
- Browse all on 10,624 rows: only shown rows request icons. (Task 3 test `only shown rows ask for icons`.)
- A 404 or slow icon: the lettered tile stays and no broken image appears, with and without JavaScript. (Task 2 test `a missing icon leaves the lettered tile`.)
- A 360px phone: two card columns, no sideways scroll, long codes wrap. (Task 2 test `phones get two card columns and no sideways scroll`.)

---

### Task 1: Featured cards and lettered tiles as pure helpers

**Files:**
- Modify: `site/src/scripts/bangs-directory.mjs`
- Test: `test/unit/site-bangs-logic.test.js`

**Interfaces:**
- Produces, from `bangs-directory.mjs`:
  - `featuredCards(data) -> Array<{ code: string, codes: string[], name: string, host: string }>`: one per `data.popular` code, in order; the entry is the one whose code or alias equals it; `codes` is the popular code, then up to two more of the entry's codes (primary code first, then aliases, skipping the popular one); `host` is the entry's `[3]`.
  - `iconTile(host: string, name: string) -> { letter: string, tone: number }`: `letter` is the first letter or digit of `name` (else of `host`), uppercased; `tone` is an integer 0–5 from a stable string hash (FNV-1a) of `host`.
  - `iconUrl(host: string) -> string`: `'/bang-icons/' + host`.

- [ ] **Step 1: Write the failing tests:**
  - `featuredCards follows the app's popular list`: against the committed `bangs.json`, length 19; `cards.map((c) => c.code)` deep-equals `data.popular`; the `w` card has `name === 'Wikipedia'`, `host === 'wikipedia.org'`, `codes[0] === 'w'`, `codes.length <= 3`; the `yt` card's `codes` start with `'yt'`.
  - `iconTile is stable and readable`: `iconTile('www.youtube.com', 'YouTube')` → letter `'Y'`, the same `tone` on every call; `iconTile('example.org', '_ Blender').letter === 'B'`; `iconTile('9gag.com', '9GAG').letter === '9'`; every tone over all hosts in `bangs.json` is in 0–5 and at least five tones occur.
  - `iconUrl keeps the host as the path`: `iconUrl('maps.google.com') === '/bang-icons/maps.google.com'`.
- [ ] **Step 2: Run** `node --test test/unit/site-bangs-logic.test.js`. Expected: the three new tests FAIL.
- [ ] **Step 3: Implement** the three functions in `bangs-directory.mjs`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Bangs page: featured cards and lettered tiles"`

### Task 2: The page markup and styles (cards, fold, list, How bangs work)

**Files:**
- Modify: `site/src/pages/bangs.astro`
- Modify: `site/src/styles/bangs.css`
- Test: `test/site/bangs-page.test.mjs`

**Interfaces:**
- Consumes: `featuredCards`, `iconTile`, `iconUrl`, `directoryRows` (Task 1 and existing).
- Produces (DOM contract Task 3's script and tests rely on):
  - `#bangs-search` and `#bangs-count` inside `.bangs-search`, directly after the hero.
  - `ul#bangs-cards > li.bangs-card[data-code]`, each with `span.bangs-icon.t{tone}` holding the letter and an `img` (`src` from `iconUrl`, `alt=""`, `width`/`height` 32, `loading="lazy"`, `decoding="async"`), `.bangs-card-host`, `.bangs-card-name`, and `.bangs-card-codes` of `kbd.bang-chip`.
  - `#bangs-fold` with `p` (`And {more} more.`), `button#bangs-search-them`, `button#bangs-browse`; then the existing count line (`.bangs-dir-sub`) and Kagi credit (`.bangs-credit`).
  - `section#bangs-list` holding the existing `ol#bangs-rows` (each `li[data-code][data-host]` now starting with `span.bangs-icon.t{tone}` holding only the letter), `#bangs-more`, `#bangs-showing`.
  - `section.bangs-how` with the exact copy.
  - The view is `main.bangs-page[data-view]`: absent without JavaScript (everything visible, the fold's buttons hidden), `cards` (list hidden), `list` (cards and fold hidden).

- [ ] **Step 1: Rewrite the browser suite's page-shape tests first.** In `test/site/bangs-page.test.mjs`, delete the try-it tests (`the try-it box answers…`, `pasted text is capped…`, `try-it messages and the address…`, `keyboard focus is visible on the try-it field…`) and change `the page leads with…` and `without JavaScript…`; add, with `/bang-icons/*` routed to a 1×1 PNG unless a test says otherwise:
  - `the page leads with its headline, search and the popular bangs`: H1 text, hero paragraph text, `#bangs-search` before `#bangs-cards`, 19 cards whose `data-code` order equals `data.popular`, no `a` inside any card, no `#bangs-try` and no `a[href="#find-a-bang"]`.
  - `without JavaScript every bang and card is in the page`: JavaScript disabled; 19 cards, `#bangs-rows li` count equals `data.count`, `#bangs-search-them` and `#bangs-browse` not visible.
  - `a missing icon leaves the lettered tile`: route `/bang-icons/*` to 404; every card's `.bangs-icon` shows its letter. With JavaScript, no `img` with `naturalWidth === 0` remains in the page; without it, every card `img` has `alt=""` (so browsers draw nothing over the tile).
  - `phones get two card columns and no sideways scroll`: at 360×780, `document.documentElement.scrollWidth <= innerWidth` and the first two cards share a `top`.
  - `How bangs work comes after the index`: `.bangs-how` follows `#bangs-list` in document order and holds four `li` and a note naming the trailing-bang caveat and "Google or DuckDuckGo".
- [ ] **Step 2: Build, preview and run** the suite (see *Before you start*). Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the markup in `bangs.astro` (drop the try-it frontmatter: `vm`, `bangsSource`, `describeTryIt`, `example`, `chips`) and the styles in `bangs.css`: a 4-column card grid stepping to 3 under 900px and 2 under 560px; white cards on the cream page; `.bangs-icon` a 32px rounded square in tone colors `.t0`–`.t5` (warm, white letter, contrast ≥ 4.5:1) with the `img` absolutely covering it; list rows gain a 22px icon column. `[data-view]` rules as in *Interfaces*.
- [ ] **Step 4: Build, preview and run** the suite. Expected: the Task 2 tests PASS (tests for search behavior may still fail until Task 3).
- [ ] **Step 5: Commit** `git commit -am "Bangs page: icon cards, the fold and one How bangs work section"`

### Task 3: The page script: two views, paging, icons for shown rows

**Files:**
- Modify: `site/src/scripts/bangs-page.js`
- Test: `test/site/bangs-page.test.mjs`

**Interfaces:**
- Consumes: Task 2's DOM contract; `filterBangs`, `iconTile`, `iconUrl`.
- Produces: no exports. Behavior: on start, sets `data-view="cards"`; typing (debounced 120 ms, as now) sets `list` when the query is non-empty and `cards` when cleared, resetting the page size to 50; `#bangs-browse` sets `list` with an empty query and scrolls `#bangs-list` into view; `#bangs-search-them` focuses `#bangs-search`; every row made visible gets its `img` (`iconUrl(host)`, same attributes as the cards) inserted once into its `.bangs-icon`; any `img` (card or row) that errors is removed.

- [ ] **Step 1: Write the failing browser tests:**
  - `typing shows matching rows instead of the cards`: type `youtube`; `#bangs-cards` hidden, first visible row `data-code` is `yt`, and `#bangs-count` reads `${n} bangs` with `n = filterBangs(directoryRows(data), 'youtube').length`.
  - `clearing the search brings the cards back and resets the list`: type `a`, click `#bangs-more`, clear; cards visible, list hidden; type `a` again; exactly 50 rows visible.
  - `Browse all opens the full list and Search them focuses the box`: click `#bangs-browse` → list visible with 50 rows, `#bangs-showing` reads `Showing 50 of {count}`; reload, click `#bangs-search-them` → `document.activeElement.id === 'bangs-search'`.
  - `only shown rows ask for icons`: count requests to `/bang-icons/` after Browse all; at most 50 + 19.
  - Keep and adapt: `the directory searches by site and by code…`, `once the data arrives…`, `bangs that search through another engine are marked`, `both search boxes…` (now only `#bangs-search`), `a long pasted search never scrolls…`, the faces test (drop the try-it selectors; add `.bangs-card-codes .bang-chip`), `if the data asset fails…` (drop the try-it assertion), and `the page and its data stay within budget`.
- [ ] **Step 2: Build, preview and run.** Expected: the new tests FAIL.
- [ ] **Step 3: Rewrite `bangs-page.js`:** remove the try-it half and the `bangs.js`/`describeTryIt` imports; keep the data load and alias adoption; add the view switching, Browse all, Search them, and the icon insertion inside the existing `render()`.
- [ ] **Step 4: Build, preview and run** the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "Bangs page: cards and list views with live icons"`

### Task 4: Claims, the privacy policy and the evidence tests

**Files:**
- Modify: `docs/website-v1.36-claims.json`
- Modify: `site/src/pages/privacy.astro` (section *This website*)
- Modify: `test/unit/website-feature-evidence.test.js` (`bangsPageDynamicLines()` and `bangs privacy copy holds only for a code typed first…`)

**Interfaces:**
- Consumes: the copy from Task 2.

- [ ] **Step 1: Run** `node --test test/unit/website-feature-evidence.test.js`. Expected: FAIL, naming each unrecorded line (the hero paragraph's new sentence as it now reads on `/bangs`, the fold line, the buttons, `How bangs work` and its items) and the removed try-it keys in `bangsPageDynamicLines()`.
- [ ] **Step 2: Update the test's dynamic lines:** drop the `{chip}` and `Return would open` keys, add the fold line's normalized source mapped to `` [`And ${(count - 19).toLocaleString('en-US')} more.`] ``, and point the privacy test at the `bangs-how` section (it must still find `A bang typed at the end is different` and `through Google or DuckDuckGo`).
- [ ] **Step 3: Record every new or changed line** in `docs/website-v1.36-claims.json`, one claim each, `source: "site/src/pages/bangs.astro"`, the next free `v136-0NN` ids, `exactWording` the line as the test normalizes it, `subject: "Blanc"`, `evidenceGroups: ["bangsCore"]` (and the group the existing claim for that sentence uses, where one exists), `verdict` copied from the matching existing claim, and `replaces` naming the claim it supersedes where the wording moved. Remove nothing the homepage or Features page still uses.
- [ ] **Step 4: Add the privacy sentence** to *This website*: `The bangs page shows site icons from blanc.day. Blanc’s server fetches each icon from the site, or from DuckDuckGo’s icon service, and keeps a copy, so your browser contacts neither.` Leave `Last updated` alone if it already reads the deploy date; otherwise set it to the deploy date.
- [ ] **Step 5: Run** `node --test test/unit/website-feature-evidence.test.js test/unit/public-truth.test.js test/unit/security-controls.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** `git commit -am "Bangs page: record the new copy and the icon server in the privacy policy"`

### Task 5: The share card from a native capture

**Files:**
- Create: `scripts/capture-installed-bangs.mjs`
- Create: `site/public/feature-captures/bangs-v1.36.0.png` (and its `.webp` companion, as the other captures have)
- Modify: `docs/website-captures-v1.36.0.json` (one more `captures[]` entry)
- Modify: `site/scripts/render-og-cards.mjs` (the `feature-bangs.png` entry)
- Modify: `site/public/feature-bangs.png` (re-rendered)

**Interfaces:**
- Consumes: `installedBlanc`, `captureOutputDirectory`, `launchPackagedOverCdp` and the helpers `scripts/capture-installed-reopen-closed-tabs.mjs` uses.
- Produces: `bangs-v1.36.0.png`, 1440×900 sRGB: the installed public Blanc 1.36.0 in a disposable profile on its Start Page, with the ⌘L panel opened as a real click opens it and `!yt lofi` typed with real key events, so the hint row reads *Search YouTube for “lofi”*. The card entry becomes `{ out: 'feature-bangs.png', capture: 'bangs-v1.36.0.png', kicker: 'bangs', headline: 'Search the site. Skip the engine.' }` with the crop the window layout needs to keep the panel in frame.

- [ ] **Step 1: Write `capture-installed-bangs.mjs`** modeled on `capture-installed-reopen-closed-tabs.mjs` (same disposable-profile settings as the manifest's `settings`, nothing patched, `screencapture -o -x -l`, resize to 1440×900, sRGB, `.webp` companion).
- [ ] **Step 2: Run it** on the owner's Mac with `BLANC_CAPTURE_VERSION=1.36.0 BLANC_CAPTURE_OUTPUT_DIR=site/public/feature-captures node scripts/capture-installed-bangs.mjs`. Expected: the PNG shows the hint row. Look at it before going on.
- [ ] **Step 3: Add the manifest entry** (file, width, height, sha256, capturedAt, state, evidence `v1.36.0:src/renderer/overlay.js` and `v1.36.0:src/renderer/pages/bangs.js`), extend `method` with the new script, and run `node --test test/unit/website-feature-evidence.test.js`. Expected: PASS (it verifies the hashes).
- [ ] **Step 4: Re-render the card:** `npm run site:build`, then `node site/scripts/render-og-cards.mjs --only=feature-bangs.png` (needs the licensed Blubird fonts installed). Look at the card; run `node --test test/unit/og-cards.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** the script, capture, manifest, generator entry and card: `git commit -m "Bangs share card from a native v1.36.0 capture"`

### Task 6: Remove the try-it leftovers and update the docs

**Files:**
- Delete: `site/src/scripts/bangs-tryit.mjs`, `site/src/scripts/bangs.js`
- Modify: `site/scripts/build-bangs-data.mjs` (drop `OUT_MODULE`, `MODULE_PATH`, `readLabels` and the `labels` field)
- Modify (generated): `site/src/data/bangs.json`
- Modify: `.gitattributes` (drop `/site/src/scripts/bangs.js`)
- Modify: `test/unit/site-bangs-data.test.js` (drop `the try-it labels…`; make `the try-it module and the Kagi license…` about the license only), `test/unit/site-bangs-logic.test.js` (drop the seven try-it tests and the `tryit` import)
- Modify: `site/CLAUDE.md` (*Bangs page* paragraph), `docs/superpowers/specs/2026-10-17-bangs-page-design.md` (a one-line note at the top that the redesign replaces its sections 1–5 and the try-it box)

- [ ] **Step 1: Confirm nothing else uses them:** `rg -n "bangs-tryit|scripts/bangs\.js|\.labels" site src test scripts`. Expected: only the files listed above.
- [ ] **Step 2: Delete and edit** as listed; `npm run site:bangs` to regenerate `bangs.json` without `labels`.
- [ ] **Step 3: Run** `npm run site:bangs:check`, `node --test test/unit/site-*.test.js test/unit/website-*.test.js test/unit/site-bang-chips.test.js`, `npm run site:build`, and the full browser suites against a preview (`node --test ../test/site/*.test.mjs`). Expected: all PASS, and `dist/bangs.html` within budget.
- [ ] **Step 4: Commit** `git commit -am "Bangs page: remove the try-it box's code and data"`

### Task 7: Verify in the browser and open the PR

- [ ] **Step 1: Look at it** on the dev site (`preview_start` name `site`): cards with lettered tiles (there is no icon server locally), a search for `maps` shows rows, Browse all pages, the 360px layout holds, and without JavaScript the full list shows. Screenshot desktop and phone widths for the PR. Real icons are checked after the owner-approved deploy: `node cloudflare/bang-icons-worker/scripts/check-icons.mjs --popular` and a look at `https://blanc.day/bangs`.
- [ ] **Step 2: Full checks:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`, the browser suites. Expected: all pass.
- [ ] **Step 3: Open the PR** with the screenshots, the claims added, and the owner-approved points to re-check (cards are not links; Browse all; the dropped copy). Deploying the site afterwards needs the owner's go-ahead, then the Production SHA check from `site/CLAUDE.md`.
