# Changelog for Every Blanc Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `blanc.day/changelog` shows every public release of every Blanc build (desktop, Blanc Beta for Mac/Windows/Linux, Blanc for iPhone and iPad) in one filtered timeline, backfilled, and kept current by each release flow.

**Architecture:** Each product has its own data file under `site/src/data/` (`releases.json` unchanged, new `beta-releases.json` and `ios-releases.json`), all in the existing entry shape. A pure site library merges them for the changelog page and its feeds only. Generators: the existing GitHub generator gains a beta output; a new App Store Connect script writes the iPhone file.

**Tech Stack:** Node 22 ESM scripts, `node:test`, Astro (static), `gh` CLI, App Store Connect REST API (ES256 JWT via `node:crypto`), Playwright for the site browser test.

**Spec:** `docs/superpowers/specs/2026-11-23-changelog-all-builds-design.md` (approved November 23, 2026). Read it first; this plan does not repeat its reasoning.

## Global Constraints

- `site/src/data/releases.json` stays byte-identical to what today's generator produces from the same GitHub data. No reader of it other than `/changelog` and its feeds changes.
- Existing anchors (`v1-52-0`, …) and `/changelog.xml`'s output for the same data stay byte-identical.
- New anchors: `beta-mac-<version>`, `beta-windows-<version>`, `beta-linux-<version>`, `ios-<version>`, each with non-alphanumerics collapsed to `-` (`beta-mac-2-0-0-beta-9`, `beta-windows-158-0-8127-904`, `ios-1-0-4`).
- Only published, non-draft GitHub pre-releases whose tag matches `^chromium-beta-` enter `beta-releases.json`. Never: `v*-rc.*`, `blanc-chromium-preview-*`, `fork-windows-candidate`, untagged drafts, Android anything.
- Every sentence shown is word for word from the published GitHub body or the App Store What's New text; sections may be dropped, never edited. The legacy-name scrub (`scrubLegacyName`) and span typing apply to the new files too.
- Page default (`/changelog` with no `?product`) is **Stable**: desktop and iPhone entries, no betas. Chips: Stable, Desktop, iPhone & iPad, Blanc Beta, All; `?product=desktop|iphone|beta|all`; any other value means Stable.
- Product labels: "Blanc for desktop", "Blanc Beta for Mac", "Blanc Beta for Windows", "Blanc Beta for Linux", "Blanc for iPhone", "Blanc for iPhone and iPad". Entry titles: "Blanc 1.52.0", "Blanc Beta 2.0.0-beta.9", "Blanc Beta for Windows 158.0.8127.904", "Blanc Beta for Linux 158.0.8127.906", "Blanc for iPhone 1.1".
- iPhone devices: versions ≥ 1.0.3 are `["iphone","ipad"]`, earlier `["iphone"]`. App Store link: `https://apps.apple.com/app/id6828027794`.
- The App Store Connect script runs only on the owner's Mac through `op run --env-file=ios/.env.1password` (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`), never in CI, never prints the key.
- No inline styles; new CSS goes in `site/src/styles/site.css` beside `.changelog-filter`, using existing tokens.
- Nothing merges to `main` (auto-merge included) while a desktop release's press gate is running.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no model name in subject lines.

## Review Focus

1. **A link to a beta entry while betas are hidden** (`/changelog#beta-mac-2-0-0-beta-9` with no `?product`): the page switches to **All** and scrolls to it, rather than landing on nothing. Test in Task 6.
2. **App Store What's New written with `•` bullets** (1.1, 1.0.3): each bullet becomes a list item, wrapped lines joined into one item, not paragraphs starting with "•". Test in Task 2.
3. **Releases on the same day across products** (beta.9 and Windows .902 vs. desktop): the merged order is by `publishedAt` then a fixed product order, the same on every build. Test in Task 4.
4. **A future beta whose body has no change section and isn't a platform's first** (only What to know / boilerplate): the entry still renders its title, date and GitHub link with no empty heading; the generator warns but doesn't fail. Test in Task 1.
5. **An unknown or mistyped `?product=` value**, and **New features combined with Blanc Beta** (betas have no feature names): unknown falls back to Stable; New features with Blanc Beta shows the empty-state text, not a blank list, and chip counts match visible entries. Test in Task 6.

---

## Shipping order

- **PR 1** (Tasks 1–4): generators, data, pure libraries, unit tests, deploy guard, iOS record step. Branch from `main`.
- **PR 2** (Tasks 5–6): page, feeds, CSS, browser test. Website-only (paths under `site/`, `test/site/`). Branch from `main` after PR 1 merges.
- **`chromium/next` push** (Task 7): Mac beta website step and Windows/Linux runbook lines. After PR 1 merges.
- Deploy (Task 8) after PR 2 merges.

---

### Task 1: Beta releases from GitHub

**Files:**
- Modify: `scripts/generate-site-changelog.mjs` (normalization, outputs, `--check`)
- Create: `test/fixtures/site-beta-releases.json` — the real GitHub release objects (`tag_name`, `name`, `body`, `draft`, `prerelease`, `published_at`, `html_url`) for `chromium-beta-2.0.0-beta.2`, `-beta.9`, `chromium-beta-windows-158.0.8127.902`, `-904`, `chromium-beta-linux-158.0.8127.906`, plus one draft beta and one `blanc-chromium-preview-*` copied from an existing one with its flags kept. Fetch with `gh api repos/bnfy/blanc/releases/tags/<tag>`.
- Create: `site/src/data/beta-releases.json` (generated)
- Test: `test/unit/site-changelog.test.js`

**Interfaces:**
- Produces: `normalizeBetaReleases(raw: object[]) -> BetaEntry[]`, `betaPlatform(tag: string) -> 'mac'|'windows'|'linux'|null`, `trimBetaSections(sections, { platform, first: boolean }) -> sections`. `BetaEntry` = the existing entry shape (`tag, version, name, publishedAt, humanDate, machineDate, url, anchor, compareUrl, sections`) plus `product: 'beta'`, `platform`. `version` is the tag minus `chromium-beta-`, `chromium-beta-windows-` or `chromium-beta-linux-`. `first` is true for the earliest published entry of its platform. `outputPaths()` gains `beta`; `writeOutputs`/`checkOutputs` take `{ releases, betas }`.
- `parseGeneratedNotes(body, { boldHeadings = false } = {})`: with `boldHeadings`, a line that is exactly one `**…**` span opens a section with that heading.

- [ ] **Step 1: Write the failing tests** in `test/unit/site-changelog.test.js`:
  - `beta tags map to platforms`: `betaPlatform('chromium-beta-2.0.0-beta.9') === 'mac'`, `…-windows-158.0.8127.904 === 'windows'`, `…-linux-158.0.8127.906 === 'linux'`, `'v1.52.0' === null`, `'blanc-chromium-preview-l8-20261024-14706b0e' === null`.
  - `only published chromium-beta pre-releases become beta entries`: from the fixture, tags are exactly the five real ones, newest first; the draft and preview are absent.
  - `beta anchors are namespaced and unique across products`: anchors equal `beta-mac-2-0-0-beta-9`, `beta-windows-158-0-8127-904`, `beta-linux-158-0-8127-906`; none collides with any anchor in `site/src/data/releases.json`.
  - `Mac and Linux beta bodies keep change sections and limits`: beta.9's headings are exactly `['Fixed in this beta', 'New in this beta', 'Not in this beta yet']`; no section text contains `Checking the download`, `Tested on`, or the intro sentence `Blanc Beta is an early preview`.
  - `a platform's first beta keeps What to know`: beta.2 and Linux .906 include a `What to know` section; beta.9 does not.
  - `Windows lead-in paragraphs are kept whole`: .904's paragraphs, in order, start with `Check for updates.`, `About tells the truth on Windows.`, `Updating.`, `Not yet.`; none contains `Blanc 1.51 stays` or `SHA256SUMS`.
  - `a beta with nothing but boilerplate still yields an entry`: a synthetic non-first Mac beta whose body is only intro + `**What to know**` + `**Checking the download**` produces an entry with `sections: []`.
  - `desktop output is unchanged`: `renderReleasesJson(normalizeReleases(fixture))` equals its value before this change (snapshot the current string in the test from the existing fixture before editing the script).
  - Extend `offline CLI writes release data and --check fails after it goes stale` so `--input` of a combined fixture writes both files and `--check` reports `beta-releases.json` when only it is stale.

- [ ] **Step 2: Run them and see them fail**
  Run: `node --test test/unit/site-changelog.test.js`
  Expected: FAIL (`betaPlatform is not a function`, etc.); existing tests pass.

- [ ] **Step 3: Implement** in `scripts/generate-site-changelog.mjs`. Keep `normalizeReleases` and `FORK_BETA_TAG` as they are. Section rules for `trimBetaSections`: drop the leading heading-less section (the intro); drop sections whose heading matches `/^(What to know|Checking the download|Tested on)$/i` except keep `What to know` when `first` is true and no other kept section exists; for Windows (no headings), drop the first paragraph (intro) and any paragraph that doesn't start with a `strong` span (the signature line). When an entry ends with no sections and isn't `first`, `console.warn` its tag.

- [ ] **Step 4: Run the tests and see them pass**
  Run: `node --test test/unit/site-changelog.test.js`
  Expected: PASS, all tests.

- [ ] **Step 5: Generate the real data**
  Run: `npm run site:changelog && npm run site:changelog:check`
  Expected: `releases.json` unchanged in `git diff`; `beta-releases.json` lists every published beta (re-check the count against `gh release list --repo bnfy/blanc --limit 200 --json tagName,isPrerelease,isDraft`).

- [ ] **Step 6: Commit**
```bash
git add scripts/generate-site-changelog.mjs test/unit/site-changelog.test.js test/fixtures/site-beta-releases.json site/src/data/beta-releases.json
git commit -m "Changelog data: Blanc Beta releases for Mac, Windows and Linux"
```

---

### Task 2: iPhone releases from App Store Connect

**Files:**
- Create: `scripts/ios-changelog.mjs`; `package.json` script `"site:ios-changelog": "op run --env-file=ios/.env.1password --no-masking -- node scripts/ios-changelog.mjs"`
- Create: `site/src/data/ios-releases.json`
- Create: `test/unit/ios-changelog.test.js`, `test/fixtures/ios-app-store-versions.json` (synthetic API responses: two versions, one `READY_FOR_SALE`, one `PREPARE_FOR_SUBMISSION`, with `appStoreVersionLocalizations` including `en-US` and `de-DE`)
- Modify: `docs/ios/app-store-connect.md` — after the release table, a short "After a version goes on sale" step: run `npm run site:ios-changelog`, open a website-only PR with `site/src/data/ios-releases.json`.

**Interfaces:**
- Consumes: `parseInline`, `humanDate`, `machineDate` exported from `scripts/generate-site-changelog.mjs` (export `humanDate`/`machineDate` there).
- Produces: `parseAppStoreNotes(text: string) -> sections`, `iosDevices(version: string) -> string[]`, `buildIosEntries({ versions, localizations, existing, today }) -> IosEntry[]`, `appStoreJwt({ keyId, issuerId, p8, now }) -> string`. `IosEntry` = entry shape plus `product: 'ios'`, `devices`, `url: 'https://apps.apple.com/app/id6828027794'`, `tag: 'ios-<version>'`, `anchor: 'ios-<version-dashed>'`.
- CLI flags: `--check` (fail if the file would change), `--force` (allow changed text for an existing version), `--date <version>=<YYYY-MM-DD>` (repeatable; sets `publishedAt` at 17:00 UTC for backfill).

- [ ] **Step 1: Write the failing tests** in `test/unit/ios-changelog.test.js`:
  - `• bullets become one list with wrapped lines joined`: the 1.1 text from `docs/ios/app-store-listing.md` (three `•` bullets, wrapped) gives one section, one list, three items; item 1 begins `A new Island: smaller`.
  - `plain text becomes a paragraph`: the 1.0 line gives one paragraph.
  - `devices follow the 1.0.3 rule`: `iosDevices('1.0.2')` is `['iphone']`; `'1.0.3'`, `'1.0.4'`, `'1.1'` are `['iphone','ipad']`.
  - `only versions on sale become entries, from en-US`: the fixture yields one entry using the `en-US` text.
  - `an existing entry keeps its date and refuses changed text`: with `existing` holding the version at `2026-11-22`, `today` later, the date stays; changed `whatsNew` throws `/--force/` unless `force: true`.
  - `a new version on sale takes today's date`.
  - `the JWT is ES256 with the App Store audience`: decode header and payload of `appStoreJwt` with a generated P-256 key; `alg === 'ES256'`, `kid`, `iss`, `aud === 'appstoreconnect-v1'`, `exp - iat <= 1200`; the signature verifies with `crypto.verify` (`dsaEncoding: 'ieee-p1363'`).
  - `release text is typed spans, never markup`: a `whatsNew` containing `<script>` comes out as a text span.

- [ ] **Step 2: Run them and see them fail**
  Run: `node --test test/unit/ios-changelog.test.js`
  Expected: FAIL (module missing).

- [ ] **Step 3: Implement `scripts/ios-changelog.mjs`.** API calls (app id `6828027794`): `GET https://api.appstoreconnect.apple.com/v1/apps/6828027794/appStoreVersions?filter[platform]=IOS&limit=200`, keep `appStoreState` in `READY_FOR_SALE`, `REPLACED_WITH_NEW_VERSION`, `READY_FOR_DISTRIBUTION`; for each, `GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations` and take `locale === 'en-US'`'s `whatsNew`. For a version with no `whatsNew` (1.0), read the quoted block under `**What's New in 1.0**` in `docs/ios/app-store-listing.md`. Write `ios-releases.json` newest first.

- [ ] **Step 4: Run the tests and see them pass**
  Run: `node --test test/unit/ios-changelog.test.js`
  Expected: PASS.

- [ ] **Step 5: Confirm the backfill dates.** Open the App Store listing's version history (`https://apps.apple.com/app/id6828027794`, "Version History") in the browser and note each version's date. Where it can't be read, use `docs/ios/app-store-connect.md`: 1.0 `2026-11-06`, 1.0.3 `2026-11-12`, 1.1 `2026-11-22`; for 1.0.1, 1.0.2 and 1.0.4, ask the owner.

- [ ] **Step 6: Backfill** on the owner's Mac:
  Run: `npm run site:ios-changelog -- --date 1.0=2026-11-06 --date 1.0.1=<d> --date 1.0.2=<d> --date 1.0.3=2026-11-12 --date 1.0.4=<d> --date 1.1=2026-11-22`
  Expected: six entries; 1.0.3, 1.0.4 and 1.1 carry `["iphone","ipad"]`; each What's New matches App Store Connect word for word (spot-check 1.0.4's three bullets against `docs/ios/app-store-connect.md` item 25).

- [ ] **Step 7: Commit**
```bash
git add scripts/ios-changelog.mjs package.json test/unit/ios-changelog.test.js test/fixtures/ios-app-store-versions.json site/src/data/ios-releases.json docs/ios/app-store-connect.md
git commit -m "Changelog data: Blanc for iPhone and iPad releases from App Store Connect"
```

---

### Task 3: Deploy guard and isolation

**Files:**
- Modify: `package.json` (`site:deploy`)
- Test: `test/unit/site-changelog.test.js`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test** `site:deploy refuses a changelog behind GitHub`: `package.json`'s `scripts['site:deploy']` starts with `npm run site:changelog:check && `.

- [ ] **Step 2: Run and see it fail**
  Run: `node --test test/unit/site-changelog.test.js`
  Expected: FAIL on the deploy assertion.

- [ ] **Step 3: Prefix `site:deploy`** with `npm run site:changelog:check && `.

- [ ] **Step 4: Run and see it pass.**

- [ ] **Step 5: Commit**
```bash
git add package.json test/unit/site-changelog.test.js
git commit -m "Site deploy: refuse a changelog that is behind GitHub"
```

---

### Task 4: Merging library and feeds renderer

**Files:**
- Create: `site/src/lib/changelog-entries.mjs`
- Modify: `site/src/lib/rss.mjs`
- Test: `test/unit/changelog-entries.test.js`, `test/unit/site-changelog.test.js` (RSS tests)

**Interfaces:**
- Produces (from `changelog-entries.mjs`):
  - `PRODUCT_FILTERS = ['stable','desktop','iphone','beta','all']`
  - `mergeEntries({ desktop, beta, ios }) -> Entry[]`: adds `product: 'desktop'` to desktop entries (without mutating input), sorts by `publishedAt` descending, ties broken by product order `desktop, ios, beta` then `platform` `mac, windows, linux`.
  - `productLabel(entry) -> string`, `entryTitle(entry) -> string` (values in Global Constraints).
  - `matchesFilter(entry, filter) -> boolean`: `stable` = desktop or ios; `blanc` = desktop; `iphone` = ios; `beta` = beta; `all` = every entry; unknown filter behaves as `stable`.
  - `normalizeFilter(value) -> PRODUCT_FILTERS[number]`.
  - `allEntries()`: imports the three data files and returns `mergeEntries(...)`. The only importer of the two new data files.
- `rss.mjs`: `renderRss(releases, { title = 'Blanc Browser Changelog', link = CHANGELOG_URL, description = <current text>, itemTitle = (r) => \`Blanc ${r.version}\` } = {})`; GUID/link per item stays `release.url`. iPhone items link to the changelog anchor (`${CHANGELOG_URL}#ios-…`) as GUID, because every iPhone entry shares the App Store URL.

- [ ] **Step 1: Write the failing tests** (`test/unit/changelog-entries.test.js`):
  - `merge orders by date with a fixed tie order` (two entries with the same `publishedAt`, one desktop and one beta: desktop first; Mac before Windows on a tie).
  - `merge never mutates its inputs`.
  - `stable shows desktop and iPhone, never betas`; `all shows everything`; `an unknown filter is stable` (`normalizeFilter('bogus') === 'stable'`, `normalizeFilter(undefined) === 'stable'`).
  - `titles and labels`: one assertion per label and title in Global Constraints, including `Blanc for iPhone and iPad` for a 1.0.3 entry and `Blanc for iPhone` for 1.0.2.
  - `only the changelog reads the other products' files`: scanning `site/src/**/*.{astro,js,mjs}`, the files importing `beta-releases.json` or `ios-releases.json` are exactly `site/src/lib/changelog-entries.mjs`.
  - In `site-changelog.test.js`: `desktop RSS is byte-identical` (render with defaults from the existing fixture and compare to the snapshot taken before editing `rss.mjs`); `iPhone feed items have unique GUIDs`.

- [ ] **Step 2: Run and see them fail**
  Run: `node --test test/unit/changelog-entries.test.js test/unit/site-changelog.test.js`

- [ ] **Step 3: Implement** both files.

- [ ] **Step 4: Run and see them pass.**
  Run: `node --test test/unit/changelog-entries.test.js test/unit/site-changelog.test.js && npm run test:unit`
  Expected: PASS; full unit suite green.

- [ ] **Step 5: Commit, then open PR 1**
```bash
git add site/src/lib/changelog-entries.mjs site/src/lib/rss.mjs test/unit/changelog-entries.test.js test/unit/site-changelog.test.js
git commit -m "Changelog: merge every product's releases for the page and feeds"
```
PR 1 title: "Changelog data for every Blanc build". Body names the spec, the inventory now in the data files, and that no page changes yet. Run `/code-review` before asking for merge.

---

### Task 5: Feeds

**Files:**
- Create: `site/src/pages/changelog/all.xml.js`, `site/src/pages/changelog/beta.xml.js`, `site/src/pages/changelog/iphone.xml.js`
- `site/src/pages/changelog.xml.js` unchanged.

**Interfaces:**
- Consumes: `allEntries`, `matchesFilter`, `entryTitle` (Task 4); `renderRss` options (Task 4).
- Channel titles: "Blanc Browser Changelog — every build", "Blanc Beta Changelog", "Blanc for iPhone and iPad Changelog"; `link` = `/changelog?product=all|beta|iphone`; `itemTitle = entryTitle`.

- [ ] **Step 1: Build the site and check the feeds**
  Run: `npm --prefix site run build && ls site/dist/changelog/ && head -c 600 site/dist/changelog/beta.xml && git diff --exit-code site/src/pages/changelog.xml.js`
  Expected: `all.xml`, `beta.xml`, `iphone.xml` exist; the beta feed's first item title is the newest beta; the desktop feed's source is untouched (its output is pinned by Task 4's byte-identical test).

- [ ] **Step 2: Commit**
```bash
git add site/src/pages/changelog
git commit -m "Changelog feeds for betas, iPhone and every build"
```

---

### Task 6: The page

**Files:**
- Modify: `site/src/pages/changelog.astro`, `site/src/styles/site.css` (beside `.changelog-filter`)
- Create: `test/site/changelog-products.test.mjs` (Playwright, same pattern as `test/site/footer.test.mjs`, `BLANC_SITE_URL`)

**Interfaces:**
- Consumes: `allEntries`, `matchesFilter`, `normalizeFilter`, `productLabel`, `entryTitle`, `PRODUCT_FILTERS` (Task 4); `featureNamesForRelease`/`hasNewFeatures` apply to desktop entries only (others get `featureNames: []`, `hasNewFeatures: false`).
- Each `<article>` carries `data-product` (`desktop|ios|beta`) and keeps `data-has-features`; beta articles render with `hidden` so the page without JavaScript shows Stable.
- Hero copy (exact): heading "Every Blanc release, in one place." stays. Paragraph: "Every release of Blanc for Mac, Windows and Linux and Blanc for iPhone and iPad, newest first. Blanc Beta, the early preview built directly on Chromium, is under its own filter; the regular Blanc is the one we recommend. <a href="/changelog.xml">Subscribe via RSS</a>, or <a href="/roadmap">see what’s coming next</a>." Page `description` meta: "See what changed in every Blanc release, for desktop, iPhone and iPad, and Blanc Beta."
- Feed `<link rel="alternate">` tags for all four feeds in the head; links to them in the hero are left to the builder.
- Entry footer link: desktop keeps "full changelog · GitHub release"; betas "GitHub release"; iPhone "App Store".

- [ ] **Step 1: Write the failing browser test** `test/site/changelog-products.test.mjs`:
  - `opens on Stable`: `/changelog` shows the Stable chip pressed; no visible article has `data-product="beta"`; at least one `ios` and one `desktop` article are visible; the results line count equals the visible count.
  - `?product=beta shows only betas` and `?product=all shows everything`; `?product=bogus` behaves as Stable.
  - `a beta anchor opens its entry`: `/changelog#beta-mac-2-0-0-beta-9` ends with All pressed and that article visible and in the viewport.
  - `New features with Blanc Beta shows the empty state`: pressing Blanc Beta then New features shows `.release-empty` text "No feature releases found." and zero visible articles.
  - `choosing a chip updates the address`: clicking iPhone & iPad sets `?product=iphone` with `history.replaceState` (no reload), and Stable removes the parameter.
  - `existing anchors still work`: `/changelog#v1-52-0` shows that article under Stable.

- [ ] **Step 2: Run it against a local build and see it fail**
  Run: `npm --prefix site run build && npm --prefix site run preview -- --port 4331 &` then `BLANC_SITE_URL=http://127.0.0.1:4331 node --test test/site/changelog-products.test.mjs`
  Expected: FAIL (no Stable chip).

- [ ] **Step 3: Implement the page.** Product chips and the New features toggle are two independent controls (product is single-select; New features is an on/off filter on top). On load: read `?product`, normalize; if `location.hash` names an article the filter hides, switch to `all`. Search filters within the current product and feature selection. Product label sits in `.release-meta` under the date as `.release-product`. CSS only in `site.css`, tokens only.

- [ ] **Step 4: Run the browser test and see it pass**, then the existing site tests that touch the changelog and the site build checks.
  Run: `BLANC_SITE_URL=http://127.0.0.1:4331 node --test test/site/changelog-products.test.mjs && npm run site:build`
  Expected: PASS; build succeeds. Stop the preview server afterward.

- [ ] **Step 5: Check it by eye** in the in-app browser at 1280 px and 375 px wide, light and dark: Stable view, Blanc Beta view, an iPhone entry, a Windows beta entry. Screenshot each for the PR.

- [ ] **Step 6: Commit, then open PR 2**
```bash
git add site/src/pages/changelog.astro site/src/styles/site.css test/site/changelog-products.test.mjs
git commit -m "Changelog page: every Blanc build in one timeline, opening on stable releases"
```
PR 2 title: "Website: changelog for every Blanc build". Website-only. Include the screenshots. Run `/code-review` before asking for merge.

---

### Task 7: Keep it current from the beta flows (`chromium/next`)

**Files (on `chromium/next`):**
- Modify: `chromium/release/daily/site-pr.mjs`
- Modify: `docs/chromium-beta-release.md` (the Windows and Linux sections where the Download tile PR is described; add one line each)
- Test: the `site-pr` tests under `chromium/release/daily*.test.mjs` that cover `siteFiles`/`main`

**Interfaces:**
- In `main()`, after `siteFiles` is written and before `git add`: when `site/src/data/beta-releases.json` exists in the `main` worktree, run `node scripts/generate-site-changelog.mjs` there (with `cwd: tree`) and add `site/src/data/beta-releases.json` and `site/src/data/releases.json` to the staged files; when it doesn't exist (PR 1 not merged yet), skip.

- [ ] **Step 1: Write the failing test**: with a fake `tree` containing `site/src/data/beta-releases.json`, the staged file list includes it; without the file, the list is unchanged.
- [ ] **Step 2: Run and see it fail**: `node --test chromium/release/daily-site.test.mjs`
- [ ] **Step 3: Implement**, and add to the runbook's Windows and Linux Download-tile steps: "In the same PR, run `npm run site:changelog` and include `site/src/data/beta-releases.json`."
- [ ] **Step 4: Run the fork unit suite**: `node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs` — Expected: PASS. Do not pipe it through `tail` before pushing.
- [ ] **Step 5: Commit and push to `chromium/next`**
```bash
git add chromium/release/daily/site-pr.mjs chromium/release/daily-site.test.mjs docs/chromium-beta-release.md
git commit -m "Beta website PRs carry the changelog's beta entries"
git push origin HEAD:chromium/next
```

---

### Task 8: Deploy and record

- [ ] **Step 1:** After PR 2 merges, from a clean checkout of `origin/main` with fonts installed: `npm run site:deploy`. Expected: the changelog check passes first, then the deploy.
- [ ] **Step 2:** `npx wrangler pages deployment list --project-name=blancbrowser` shows the merge commit as Production on `main`; `https://blanc.day/changelog` opens on Stable with iPhone entries, `?product=beta` lists every beta, `https://blanc.day/changelog/beta.xml` serves.
- [ ] **Step 3:** Add a line to `CLAUDE.md` and `AGENTS.md` (same paragraph in both) under the domain/site notes: the changelog covers every build from three data files; betas and desktop come from `npm run site:changelog`, iPhone from `npm run site:ios-changelog` after each App Store release; `site:deploy` refuses a stale changelog. Open as its own small docs PR.
