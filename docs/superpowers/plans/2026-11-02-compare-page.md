# Compare Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `/compare`, a sourced 11-row chart of Blanc next to Crest, Arc, Helium and Brave, as a website-only pull request.

**Architecture:** The chart is data (`site/src/data/compare.json`) rendered by one Astro page; a small pure module (`site/src/lib/compare.mjs`) decides which columns show (Arc drops after its end date) and the release a chart was checked against. A claims ledger records every rendered sentence and every external source, and the existing landing-page evidence test is extended to cover the page.

**Tech Stack:** Astro (site/), node:test unit tests (`test/unit`), Playwright site tests (`test/site`).

**Spec:** `docs/superpowers/specs/2026-11-02-compare-page-design.md` (owner approved the chart wording, November 2, 2026).

## Global Constraints

- Chart wording is the spec's table, verbatim. Any change to a cell goes back to the owner.
- Blanc cells describe public v1.45.1 only; nothing that exists only on `main` (Mini Window).
- Absent facts render exactly `Not stated`, with the footnote "Not stated on the pages listed under Sources."
- The page shows "Checked November 2, 2026 against Blanc v1.45.1".
- Arc's header carries "Ends Dec 22, 2026"; `endsOn: "2026-12-22"`.
- No logos, screenshots or rankings of other products.
- Styles in a stylesheet (`site/src/styles/compare.css`), never inline `style=`.
- Headings in Blubird Display at 0 tracking via the site's existing display-heading rule; no new fonts.
- US spelling; explicit-feature voice per `docs/marketing-claims.md`.
- No commit, push, PR or deploy without the owner asking; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A 375px phone: the chart must not cause horizontal page scroll; the first column stays readable (test in Task 4).
2. A build on or after 2026-12-22: Arc's column disappears and the "Arc ended" line appears, without failing CI (test in Task 1).
3. A cell edited in the data but not in the ledger: the evidence test must fail (test in Task 3).
4. A new Blanc feature release (1.46.0) with stale chart: the data test fails; a bug-fix (1.45.2) does not (test in Task 1).
5. Screen readers: the chart is a real `<table>` with `<th scope="col|row">`, and "Not stated" is text, not color alone (test in Task 4).

---

### Task 1: Chart data and column logic

**Files:**
- Create: `site/src/data/compare.json`
- Create: `site/src/lib/compare.mjs`
- Test: `test/unit/site-compare-data.test.js`

**Interfaces:**
- Produces: `compare.json` shape:
  `{ checked: "2026-11-02", checkedAgainst: "v1.45.1", notStated: "Not stated", columns: [{ id, name, note?, endsOn? }], rows: [{ id, label, cells: { [columnId]: { text, sources: [sourceId] } } }], sources: [{ id, column, url, publisher, accessedAt }] }`.
  Column ids: `blanc`, `crest`, `arc`, `helium`, `brave`. Blanc cells use `sources: []` (release evidence lives in the ledger).
- Produces: `visibleColumns(data, now: Date): Column[]` (drops a column whose `endsOn` is before `now`'s UTC date) and `endedColumns(data, now: Date): Column[]`; `releaseMinor(tag: string): string` (`"v1.45.1"` → `"1.45"`).

- [ ] **Step 1: Write the failing tests** in `test/unit/site-compare-data.test.js`:
  - `the chart has the approved 11 rows and 5 columns in order`: row ids `platforms, cost, open-source, status, extensions, blocking, spaces, side-tabs, split, sync, ai`; column ids as above.
  - `every non-Blanc cell is sourced or reads Not stated`: a cell with `text === notStated` has `sources: []`; every other non-Blanc cell has ≥1 source id that exists in `sources` with the same `column`; every source has `https://` url, publisher and `accessedAt === "2026-11-02"`.
  - `seven cells record an absence`: cells whose text matches `/not stated|no [a-z ]+ stated/i` number exactly 7 (Arc open source, Arc price, Arc account separation, Helium Spaces, Helium AI, Helium link preview, Brave split view).
  - `the chart is re-checked for each Blanc feature release`: `releaseMinor(newest releases.json tag) === releaseMinor(checkedAgainst)`.
  - `Arc drops after its end date`: `visibleColumns(data, new Date('2026-12-21T12:00Z'))` includes `arc`; `new Date('2026-12-23T00:00Z')` excludes it and `endedColumns` returns it.
  - `no Blanc cell names an unreleased feature`: no Blanc cell matches `/Mini Window|Quick Window/`.
- [ ] **Step 2: Run** `node --test test/unit/site-compare-data.test.js` → FAIL (files missing).
- [ ] **Step 3: Write `compare.json`** with the spec's table text verbatim and the sources the spec's Evidence section names, one source entry per URL actually read; then `compare.mjs` with the three exports (pure ES module, no Astro imports).
- [ ] **Step 4: Run** the same command → PASS.

### Task 2: Layout checkpoint (owner picks)

**Files:** scratchpad only; nothing in the repo.

- [ ] **Step 1:** Build 2–3 static HTML mockups from the real `compare.json` and the site's CSS tokens (e.g. A: full table with sticky row labels; B: Blanc column highlighted, others muted; C: per-row stacked cards on phones, table on desktop). Each mock includes the draft intro (three "where Blanc is behind" sentences) and the Sources section.
- [ ] **Step 2:** Publish them as one private artifact page and ask the owner to pick a layout and approve the intro copy. **Blocking: do not start Task 3 before both answers.**

### Task 3: The page, its links, ledger and evidence test

**Files:**
- Create: `site/src/pages/compare.astro`, `site/src/styles/compare.css`
- Modify: `site/src/pages/sitemap.xml.js` (add `'/compare'` to `MANIFEST` after `'/arc-alternative'`)
- Modify: `site/src/components/Footer.astro` (Explore group: `<a href="/compare">Compare browsers</a>` after "Switching from Arc")
- Modify: `site/src/pages/arc-alternative.astro` (one new `<p class="arc-limits">` after the existing limits paragraph: "Weighing other browsers too? <a href=\"/compare\">See Blanc next to Crest, Arc, Helium and Brave</a>.")
- Create: `docs/website-compare-claims-v1.45.1.json`
- Modify: `test/unit/website-feature-evidence.test.js` (landing-page test)
- Modify: `test/site/footer.test.mjs` (Explore group list)

**Interfaces:**
- Consumes: `compare.json`, `visibleColumns`, `endedColumns` from Task 1; the layout chosen in Task 2.
- Produces: ledger shape like `docs/website-arc-switching-claims-v1.38.json` plus `externalSources` like `docs/website-revamp-claims-v1.27.json`: `publicRelease: "v1.45.1"`, `sourceSha` = `git rev-parse v1.45.1^{commit}`, `releaseEvidence: "docs/release-incidents/2026-10-29-v1.45.1.md"`, `evidenceGroups` for Blanc rows (release-tag paths that exist at v1.45.1), `claims[]` with `source`, `exactWording`, `subject`, `evidenceGroups`, `verdict`, `externalSources[]`.

- [ ] **Step 1: Extend the evidence test (failing):** in the landing-page test, add `site/src/pages/compare.astro` to the file list, add `compareLedger` to the claims union, and build `sources` from both `ledger.externalSources` and `compareLedger.externalSources`. Add a test `compare ledger resolves to v1.45.1` (publicRelease, sourceSha via `git rev-parse`, every Blanc evidence path exists at the tag via `git cat-file -e`). Update `footer.test.mjs` Explore list with `['Compare browsers', '/compare']`.
- [ ] **Step 2: Run** `node --test test/unit/website-feature-evidence.test.js` → FAIL (no page, no ledger).
- [ ] **Step 3: Before writing the ledger, open in a browser** the Arc Help Center article "Troubleshoot or Report a Problem in Arc" and confirm the sentence that Arc for macOS installs uBlock Origin by default; if it is not there, the Arc blocking cell becomes `Not stated` and the owner is told.
- [ ] **Step 4: Build the page** with `BaseLayout` (`title="Compare Blanc with Crest, Arc, Helium and Brave | Blanc"`, a ≤155-character `description`, `path="/compare"`, `page="compare"`, `current="features"`), breadcrumb JSON-LD as on `/arc-alternative`, the chosen layout, the "Checked …" line, the "Not stated" footnote, the Arc import line linking `/arc-alternative`, a Sources section linking every `sources[].url` with `href`, and, when `endedColumns` is non-empty, the line "Arc ended on December 22, 2026." Render with `visibleColumns(data, new Date())`.
- [ ] **Step 5: Write the ledger**: one claim per rendered `h1/h2/h3/p/th/td` wording, Blanc claims with evidence groups, other-product claims with `externalSources` and `evidenceGroups: []`; `externalSources` entries carry `url, publisher, accessedAt: "2026-11-02", supports` (a paraphrase of what the page says).
- [ ] **Step 6: Run** `node --test test/unit/website-feature-evidence.test.js test/unit/site-compare-data.test.js` → PASS; then `npm run test:unit` → PASS.

### Task 4: Build and browser verification

**Files:** none new.

- [ ] **Step 1: Run** `npm run site:build` → succeeds, including `check:seo` and the sitemap manifest check.
- [ ] **Step 2:** Serve `site/dist` on a free port and run `BLANC_SITE_URL=http://127.0.0.1:<port> node --test test/site/footer.test.mjs test/site/crawl-hygiene.test.mjs` → PASS.
- [ ] **Step 3:** In the browser at 1440px and 375px: `document.documentElement.scrollWidth <= innerWidth`; the table has `th[scope=col]` × 5 and `th[scope=row]` × 11; every source link resolves; screenshot both widths for the owner.
- [ ] **Step 4:** Report to the owner; commit, push and open the website-only PR only when asked. Deploy is a separate request (needs the Blubird fonts on the deploying machine).
