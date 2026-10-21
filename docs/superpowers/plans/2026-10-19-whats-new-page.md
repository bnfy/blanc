# What's New Page (F51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a feature update, Blanc opens that release's highlight page on blanc.day once, and the Start Page's What's new pill links there too.

**Architecture:** Two pull requests. **PR A (website only)** adds a data-driven `/whats-new/<major>.<minor>` page in the Chrome-style layout, with analytics off, plus the first real page (1.38). **PR B (app)** extends the pure `src/main/whats-new.js` with a page-exists check (one `HEAD` from main), a once-per-feature-release tab, and the pill URL switch; plus spec F51 and runbook changes. PR A deploys before any release carrying PR B.

**Tech Stack:** Astro 7 site (`site/`), Playwright site suites (`test/site/`), Electron main process, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-whats-new-page-design.md`. Approved mockup: `.superpowers/brainstorm/64575-1792432344/content/layout-v4.html` (local, gitignored; the spec describes it).

## Global Constraints

- Page URL: `https://blanc.day/whats-new/<major>.<minor>` (e.g. `/whats-new/1.38`); `/whats-new` leads to the newest page, or to `/changelog` when none exist.
- Three to five highlights per page; a page exists only for a version present in `site/src/data/releases.json`.
- Page: `BaseLayout` with `analytics: false` and no newsletter prompt; slim header with the small Blanc lockup (`.site-lockup--small`), a thin divider, "What's new", and "Version X.Y · <Month D>" on the right.
- Buttons: **Learn more ↗** (only when the highlight has `learnMore`) and **Next** (wraps from last to first). No "Try it" buttons.
- Tile colors: one of the eight Spaces presets `sage, sky, iris, rose, clay, sand, slate, graphite` from `src/renderer/space-identity.js`.
- Footer line copy, exact: "Want every detail? Read the full changelog on blanc.day" linking to `/changelog#<anchor>` from `releases.json`.
- App opens the tab only when `major.minor` increased since the last run, never on a fresh install, pre-release, downgrade or unpackaged run, never as a private tab, at most once per feature release.
- The check: `HEAD https://blanc.day/whats-new/<major>.<minor>`, `redirect: 'error'`, `credentials: 'omit'`, `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`, 5 s timeout; only status 200 counts. At most one check per launch, only while the pill's 7-day window is live, only after session restore. Skipped when `bananifyServiceAllowed(url)` is false.
- New settings are device-local, never in `SYNCED_KEYS`, listed in `settings-schema/schema.json` `internalDefaults`.
- No new IPC, no `blanc://` page, no internal-page CSP change, no new Blanc-authored app strings.
- Every page's final text and media need the owner's explicit sign-off before it merges/deploys (spec, owner decision October 19, 2026).
- US spellings; site text in Blubird per site rules; any app-UI replica keeps Instrument Sans.

## Review Focus

- **Page found but every window closed** (macOS, window closed during the 5 s check): no tab can open, so the tab must stay owed; `whatsNewAfterCheck` with `canOpen: false` records the page but not `whatsNewTabRelease`. Test in Task 4.
- **Patch update after a feature release whose page was never found** (1.39.0 page missing for 7 days, then 1.39.1): a bug-fix update must not open a tab, even though one was never shown. Test in Task 4 (`whatsNewOnLaunch` sets `whatsNewTabRelease` on patch updates).
- **Legacy profile with empty `lastRunVersion` but finished setup**: counts as a feature update (tab owed). Test in Task 4.
- **Corrupt stored values** (`whatsNewTabRelease: '1.x'`, `whatsNewPageVersion: 'abc'`): sanitized to `''` on load and refused on set. Test in Task 5.
- **Phone width and no JavaScript**: every highlight readable top to bottom, no horizontal page scroll at 375 px. Test in Task 3.

---

## PR A — Website

Branch from `origin/main` as a website-only PR (only `site/`, `test/site/`, `test/unit/` data test, `docs/` paths — note `test/unit/` triggers the full CI, which is fine).

### Task 1: What's New data file and validator

**Files:**
- Create: `site/src/data/whats-new.json`
- Create: `site/src/lib/whats-new.mjs`
- Test: `test/unit/whats-new-site-data.test.js`

**Interfaces:**
- Produces: `featureRelease(version: string): string | null` (`'1.38.0'` → `'1.38'`, invalid → `null`); `validateWhatsNew(data, releases): string[]` (error messages, empty when valid); `publishedPages(data, releases): Array<{ release, version, humanDate, anchor, highlights }>` sorted newest first, where `version`/`humanDate`/`anchor` come from the newest `releases.json` entry of that feature release's `.0` (i.e. the entry whose `version === release + '.0'`).
- Data shape:
  ```json
  {
    "firstRelease": "1.38",
    "noPage": [],
    "pages": [
      { "release": "1.38", "highlights": [
        { "id": "start-page-image", "tile": "Your own Start Page image", "title": "Make the Start Page your own",
          "body": "…", "steps": ["…"], "note": "…", "learnMore": "/features/…", "color": "rose",
          "media": { "kind": "image", "src": "/revamp/…webp", "width": 1400, "height": 1000, "alt": "…" } }
      ] }
    ]
  }
  ```
  `media.kind` is `"image"` (src, width, height, alt), `"video"` (src, poster, alt) or `"demo"` (`demo` ∈ `"spaces" | "glance" | "gestures" | "tab-drag"`). `steps`, `note`, `learnMore` optional.

- [ ] **Step 1: Write the failing test** `test/unit/whats-new-site-data.test.js` (CommonJS, dynamic `import()` of the `.mjs`), with these tests:
  - `featureRelease` maps `'1.38.0'`→`'1.38'`, `'2.0.3'`→`'2.0'`, `'1.38.0-beta.1'`→`null`, `''`→`null`.
  - `validateWhatsNew` returns `[]` for the committed file against the committed `releases.json`.
  - It reports an error for each of: a page whose `release + '.0'` is not in `releases.json`; fewer than 3 or more than 5 highlights; a color outside the eight presets; an unknown `media.kind` or `demo`; an image without `alt`/`width`/`height`; duplicate highlight `id` in a page; a `learnMore` that is not a site path (`/…`) or `https://blanc.day/…`.
  - Coverage rule: for every feature release in `releases.json` that is `>= firstRelease` (numeric compare), the release appears in `pages` or in `noPage`; a release in both is an error. (Fixture: `releases = [{version:'1.39.0'},{version:'1.38.0'}]` with only 1.38 paged → one error naming `1.39`.)
  - Every `media.src`/`poster` that starts with `/` exists under `site/public/`.

- [ ] **Step 2: Run it to see it fail**
  Run: `node --test test/unit/whats-new-site-data.test.js`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `site/src/lib/whats-new.mjs`** (pure ESM, no Astro imports; numeric version compare; presets list hard-coded is not allowed — read ids from `src/renderer/space-identity.js` via `loadSpaceIdentity` in `site/src/lib/native-island-art.mjs`, or accept `presetIds` as a parameter with the test passing the real list).

- [ ] **Step 4: Draft `site/src/data/whats-new.json` with the 1.38 page.** Three highlights drawn only from 1.38.0's release notes in `releases.json`: Your own Start Page image (rose), A Start Page color (sky), and a third 1.38 item from those notes (or a two-part split of the wallpaper features if the notes hold nothing else; ask the owner before going below three). Media: reuse existing captures in `site/public/` only; if none fits, use `"demo"` or a capture taken per the site's Retina capture rules with a `credits.txt` entry. Mark the PR description "Copy and media need owner sign-off".

- [ ] **Step 5: Run the test to see it pass**
  Run: `node --test test/unit/whats-new-site-data.test.js`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add site/src/data/whats-new.json site/src/lib/whats-new.mjs test/unit/whats-new-site-data.test.js
  git commit -m "Website: What's New data and validator"
  ```

### Task 2: Shared lockup component and the slim page header

**Files:**
- Create: `site/src/components/SiteLockup.astro` (the `<span class="site-lockup site-lockup--small">…two <img>…</span>` currently inline in `Header.astro:16-30`; prop `size: 'small' | 'display'`, default `'small'`)
- Modify: `site/src/components/Header.astro:16-30` (use `<SiteLockup />`, rendered HTML unchanged)
- Modify: `site/src/layouts/BaseLayout.astro` (new prop `chrome = 'site'`; `'bare'` omits `<Header>` and `<Footer>`)
- Create: `site/src/components/WhatsNewHeader.astro` (props `version: string` like `'1.38'`, `humanDate: string`)

**Interfaces:**
- Produces: `<SiteLockup size? />`; `<WhatsNewHeader version humanDate />` renders `<header class="wn-header">` with the lockup inside `<a href="/" aria-label="Blanc Browser home">`, a divider, `<span>What's new</span>`, and `<span class="wn-version">Version {version} · {humanDate without year}</span>`; `BaseLayout` prop `chrome: 'site' | 'bare'`.

- [ ] **Step 1: Run the header suite before the change** (baseline): build and preview the site on a free port (see memory: 4322 may belong to another project), then `BLANC_SITE_URL=http://127.0.0.1:<port> node --test test/site/header.test.mjs` → PASS.
- [ ] **Step 2: Extract `SiteLockup.astro`, switch `Header.astro` to it, add `chrome` to `BaseLayout`, create `WhatsNewHeader.astro`.** Styles for the header live in the page's stylesheet (Task 3), not inline.
- [ ] **Step 3: Re-run** `npm run site:build` and the header suite → PASS. Confirm the homepage's `<header>` markup is unchanged: save `site/dist/index.html`'s `<header …>…</header>` before Step 2 and `diff` it against the rebuilt one (expected: no difference).
- [ ] **Step 4: Commit** `git commit -m "Website: shared lockup component and bare layout"`

### Task 3: The `/whats-new` pages

**Files:**
- Create: `site/src/pages/whats-new/[release].astro` (`getStaticPaths` from `publishedPages()`; throws when `validateWhatsNew()` returns errors)
- Create: `site/src/pages/whats-new/index.astro` (noindex; `<meta http-equiv="refresh" content="0; url=/whats-new/<newest>">` plus a visible link; to `/changelog` when no pages)
- Create: `site/src/components/WhatsNewHighlight.astro` (one highlight: text column + media panel; `demo` maps to `SpacesDemo compact`, `GlanceDemo compact`, `GestureDemo compact`, `TabDragFigure`)
- Create: `site/src/styles/whats-new.css`
- Create: `site/src/scripts/whats-new.js` (progressive enhancement)
- Modify: `site/scripts/verify-seo.mjs` (add `/whats-new` to `NOINDEX_ROUTES`; leave release pages indexable with `social: 'standard'`)
- Test: `test/site/whats-new-page.test.mjs`

**Interfaces:**
- Consumes: `publishedPages`, `validateWhatsNew` (Task 1); `WhatsNewHeader`, `BaseLayout chrome="bare"` (Task 2).
- DOM contract the script and tests rely on: `<main class="wn" data-release="1.38">`; each highlight `<section class="wn-highlight" id="<id>" aria-labelledby="<id>-title">`; tiles `<nav class="wn-tiles" aria-label="Highlights">` holding `<button class="wn-tile" aria-controls="<id>" aria-current="true|false" data-color="<preset>">`; `<button class="wn-next">Next</button>` per highlight; footer `<p class="wn-changelog">`.

Behavior: without JS every section shows in order and the tile row is hidden. With JS (`.wn.is-enhanced`), only the current section shows; tile click, Next (wraps), and Left/Right arrow keys while focus is in the tile row change it; the URL hash follows the current id and an incoming hash selects it. Videos: `muted playsinline loop`, autoplay only when `prefers-reduced-motion: no-preference`, with a replay button; under reduced motion show the poster with a play button. Below 760 px the stage stacks and the tile row scrolls horizontally inside itself.

- [ ] **Step 1: Write the failing Playwright suite** `test/site/whats-new-page.test.mjs` (pattern of `test/site/bangs-page.test.mjs`: route-abort off-origin requests, `measurement-consent-v2` denied), tests:
  - `the 1.38 page shows the lockup header, the version line and the first highlight` — header contains `.site-lockup`, text "What's new", "Version 1.38 · October 18"; exactly one visible `.wn-highlight`.
  - `tiles, Next and arrow keys move between highlights and Next wraps` — click tile 2 → section 2 visible and `aria-current="true"`; Next from last → first; ArrowRight in tile row → next; hash updates.
  - `a hash opens that highlight` — load `/whats-new/1.38#<second id>` → second visible.
  - `no analytics, no consent banner, no newsletter prompt` — no request to any path containing `site.js`, no consent element, no newsletter element.
  - `the changelog link points at the release anchor` — `.wn-changelog a[href="/changelog#v1-38-0"]` with the exact footer copy.
  - `without scripting every highlight reads in order` — `javaScriptEnabled: false` → all sections visible, in data order.
  - `at phone width nothing overflows` — 375×812: `document.documentElement.scrollWidth <= 375`.
  - `/whats-new leads to the newest page` — after navigation, URL path is `/whats-new/1.38`; page has `robots` noindex.
- [ ] **Step 2: Build, preview on a free port, run it** → FAIL (404s).
- [ ] **Step 3: Implement the pages, component, CSS (tokens on the page root; Sunrise background `#f8f2e8`-family from the site's existing tokens; tile washes derived from the preset hex), and script.**
- [ ] **Step 4: Run** `npm run site:build` (includes `check:seo`) → PASS; run the new suite and `test/site/header.test.mjs` → PASS.
- [ ] **Step 5: Show the owner the rendered 1.38 page** (screenshots at desktop and phone width, light rendering) and get explicit sign-off on text and media. Apply requested changes. Do not merge without it.
- [ ] **Step 6: Commit** `git commit -m "Website: What's New page"`; open PR A; after merge, deploy with `npm run site:deploy` per `CLAUDE.md` and confirm `https://blanc.day/whats-new/1.38` answers `HEAD` with 200 and no redirect (`curl -sI`).

---

## PR B — App

Branch from `origin/main` after PR A merges.

### Task 4: Decision logic in `whats-new.js`

**Files:**
- Modify: `src/main/whats-new.js`
- Test: `test/unit/whats-new.test.js`

**Interfaces:**
- Produces (all exported):
  - `WHATS_NEW_PAGE_ORIGIN = 'https://blanc.day'`
  - `featureRelease(version: string): string | null` — same contract as Task 1's.
  - `whatsNewPageUrl(version: string): string` → `https://blanc.day/whats-new/1.39`
  - `whatsNewOnLaunch(settings, { version, now, firstRunComplete })` — existing; additionally, whenever the version changes it sets `whatsNewPageVersion: ''`; it sets `whatsNewTabRelease: featureRelease(version)` when the launch is a fresh install or an update within the same `major.minor` (bug-fix), and leaves `whatsNewTabRelease` untouched for a feature update (tab owed).
  - `whatsNewCheckDue(settings, { version, now }): boolean` — true iff the pill window is live for `version` (same conditions as `whatsNewState` returning non-null) and `settings.whatsNewPageVersion !== version`.
  - `whatsNewAfterCheck(settings, { version, found, canOpen }): { patch: object | null, openUrl: string | null }` — `found` false → `{ patch: null, openUrl: null }`. `found` true → `patch.whatsNewPageVersion = version`; and if `canOpen` and `settings.whatsNewTabRelease !== featureRelease(version)`: also `whatsNewTabRelease: featureRelease(version)`, `whatsNewVersion: ''`, and `openUrl = whatsNewPageUrl(version)`.
  - `whatsNewState(settings, { version, now })` — url is `whatsNewPageUrl(version)` when `settings.whatsNewPageVersion === version`, else the existing changelog anchor.

- [ ] **Step 1: Update existing assertions and add failing tests** in `test/unit/whats-new.test.js`:
  - Existing `deepEqual`s on `whatsNewOnLaunch` gain `whatsNewPageVersion: ''` (and `whatsNewTabRelease` where the new rule sets it).
  - `a feature update owes a tab; a bug-fix update and a fresh install do not` — `1.38.2→1.39.0`: patch has no `whatsNewTabRelease`; `1.39.0→1.39.1`: `whatsNewTabRelease: '1.39'`; fresh install `1.39.0`: `whatsNewTabRelease: '1.39'`; legacy (`lastRunVersion: ''`, setup done) `1.39.0`: no `whatsNewTabRelease`.
  - `the page check runs only while the pill is live and the page is not yet found` — due on day 1; not due after 7 days; not due when `whatsNewVersion: ''`; not due when `whatsNewPageVersion === version`.
  - `a found page opens the tab once and points the pill at it` — `whatsNewAfterCheck({ whatsNewTabRelease: '1.38' }, { version: '1.39.0', found: true, canOpen: true })` → `{ patch: { whatsNewPageVersion: '1.39.0', whatsNewTabRelease: '1.39', whatsNewVersion: '' }, openUrl: 'https://blanc.day/whats-new/1.39' }`; same with `whatsNewTabRelease: '1.39'` → `openUrl: null`, patch only `whatsNewPageVersion`.
  - `with no window the tab stays owed` — `canOpen: false` → patch only `whatsNewPageVersion`, `openUrl: null`.
  - `a missing page changes nothing` — `found: false` → `{ patch: null, openUrl: null }`.
  - `the pill links to the page once it is found` — `whatsNewState({ whatsNewVersion: '1.39.1', whatsNewSince: NOW, whatsNewPageVersion: '1.39.1' }, { version: '1.39.1', now: NOW })` url `https://blanc.day/whats-new/1.39`.
  - `the page URL matches the site route` — `whatsNewPageUrl('1.38.0')` equals `https://blanc.day/whats-new/` + the `release` of the first entry of `site/src/data/whats-new.json` `pages` (keeps app and site routes in step).
- [ ] **Step 2: Run** `node --test test/unit/whats-new.test.js` → FAIL.
- [ ] **Step 3: Implement** in `src/main/whats-new.js`; update the file's header comment to describe the two new fields.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "What's New: owe a tab per feature release and point the pill at the page"`

### Task 5: Settings fields

**Files:**
- Modify: `src/main/settings.js` (DEFAULTS near `:283`; load validation near `:459`; `setSettings` cleaning near `:549`)
- Modify: `settings-schema/schema.json` (`internalDefaults` += `whatsNewPageVersion`, `whatsNewTabRelease`)
- Test: `test/unit/whats-new.test.js` (wiring test) and the settings unit test that covers `lastRunVersion` (find with `grep -ln "lastRunVersion" test/unit`)

**Interfaces:**
- Produces: `settings.whatsNewPageVersion: string` (`''` or `APP_VERSION_RE`), `settings.whatsNewTabRelease: string` (`''` or `/^\d+\.\d+$/`), both default `''`.

- [ ] **Step 1: Failing tests** — extend the wiring test's key loop to `['lastRunVersion', 'whatsNewVersion', 'whatsNewSince', 'whatsNewPageVersion', 'whatsNewTabRelease']` (schema + DEFAULTS + not in `SYNCED_KEYS`); in the settings test: loading `{ whatsNewTabRelease: '1.x', whatsNewPageVersion: 'abc' }` yields `''` for both; `setSettings({ whatsNewTabRelease: '1.39' })` keeps it, `setSettings({ whatsNewTabRelease: '1.39.0' })` is ignored.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; run `npm run settings:check`.
- [ ] **Step 4: Run** the two test files and `npm run settings:check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Settings: device-local What's New page and tab state"`

### Task 6: The page check and opening the tab

**Files:**
- Create: `src/main/whats-new-check.js`
- Modify: `src/main/main.js` (import near `:237`; new `maybeOpenWhatsNew()` near `maybeSendLaunchPing` `:1719`; call it right after `maybeSendLaunchPing();` in `releaseStartup` near `:12601`)
- Test: `test/unit/whats-new-check.test.js`, wiring assertions in `test/unit/whats-new.test.js`

**Interfaces:**
- Consumes: Task 4 functions; `bananifyServiceAllowed` (`src/main/bananify-services.js`).
- Produces: `checkWhatsNewPage(url: string, { fetch, timeoutMs = 5000 }): Promise<boolean>` — `fetch(url, { method: 'HEAD', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal })`; `true` only for `status === 200`; any rejection, abort or other status → `false`; never throws.

- [ ] **Step 1: Failing tests** `test/unit/whats-new-check.test.js` with an injected fake `fetch`: 200 → true; 404 → false; 301 → false; rejection → false; a fetch that never settles → false after `timeoutMs: 20`; the init passed equals the options above with `method: 'HEAD'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `whats-new-check.js` (no `require('electron')`). **Step 4: Run** → PASS.
- [ ] **Step 5: Wire main.** `maybeOpenWhatsNew()` is `async`, guarded by a module-level `whatsNewCheckStarted` flag and `app.isPackaged`; reads `version = app.getVersion()`; returns unless `whatsNewCheckDue(...)` and `bananifyServiceAllowed(whatsNewPageUrl(version))`; awaits `checkWhatsNewPage(url, { fetch: net.fetch })`; then `whatsNewAfterCheck(settings.getSettings(), { version, found, canOpen: !isQuitting && hasLiveWindow() })`; applies `patch` with `settings.setSettings`, calls `broadcastStartPageStatus()`, and when `openUrl` opens it in the focused window: `withWindowRuntime(focusedRuntime ?? primaryRuntime, () => setActiveTab(createTab(openUrl), { focusContent: true }))`. Call site: `maybeOpenWhatsNew().catch(() => {});` directly after `maybeSendLaunchPing();`.
- [ ] **Step 6: Wiring assertions** added to `main, the bridge and the start page are wired together`: main matches `/maybeSendLaunchPing\(\);\s*maybeOpenWhatsNew\(\)\.catch/`, `/checkWhatsNewPage\(url, \{ fetch: net\.fetch \}\)/`, `/canOpen: !isQuitting && hasLiveWindow\(\)/`, and `/if \(!app\.isPackaged \|\| whatsNewCheckStarted\) return;/`.
- [ ] **Step 7: Run** `node --test test/unit/whats-new.test.js test/unit/whats-new-check.test.js` and `npm run lint` → PASS. Run `npm run audit-inventory:check`; if it flags `main.js`/new files, run `npm run audit-inventory:write` and include the diff.
- [ ] **Step 8: Packaged check.** `npm run dist:dir`; in a scratch userData copy whose `settings.json` has `lastRunVersion` set to the previous minor's `.0` and finished setup, launch the packaged app once with the current version: confirm one new active tab at `blanc.day/whats-new/<minor>` (only once the site has that page; until then temporarily point the check at `/whats-new/1.38` in a local, uncommitted edit and revert it). Relaunch: no second tab; the pill is gone. Record what was and wasn't verified in the PR.
- [ ] **Step 9: Commit** `git commit -m "Open the What's New page once after a feature update"`

### Task 7: Spec, runbook and privacy wording

**Files:**
- Modify: `spec/features.md` (append `## F51 — What's New page (desktop)` after F50, same shape: behavior bullets, privacy, portability `src/main/whats-new.js`, acceptance `test/unit/whats-new.test.js`, `test/unit/whats-new-check.test.js`, `test/site/whats-new-page.test.mjs`)
- Modify: `spec/parity-matrix.md` (F51 row after F50: `| F51 | What's New page | PARTIAL | N/A | N/A | Desktop only. Opens blanc.day's page for a feature release once after the update, only when the page exists; the Start Page pill links to it. | — |`)
- Modify: `CLAUDE.md` and `AGENTS.md` (release completion paragraph: after `site/src/data/releases.json`, add "the release's What's New page in `site/src/data/whats-new.json` (or its `noPage` entry), which needs the owner's explicit sign-off on its final text and media before it deploys")
- Modify: `.claude/skills/releasing-blanc/SKILL.md` (same step in its post-publication list)
- Test: `test/unit/release-manifest.test.js` must still pass (it reads the skill)

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Run** `node --test test/unit/release-manifest.test.js test/unit/whats-new.test.js` and `npm run test:acceptance:dry` → PASS.
- [ ] **Step 3: Commit** `git commit -m "Spec F51 and release runbook: What's New page"`; open PR B. Note in the PR that the privacy policy sentence below ships in the post-release site update of the first release containing PR B (it describes app behavior, so it can't publish before that release):
  > **What's New.** After an update that adds features, Blanc asks blanc.day whether that release's What's New page exists, at most once per launch for up to seven days, and opens it once in a new tab. The request sends no cookies, and the page runs no analytics.
  Add it under the **Updates** bullet in `site/src/pages/privacy.astro` and bump "Last updated" at that time.
