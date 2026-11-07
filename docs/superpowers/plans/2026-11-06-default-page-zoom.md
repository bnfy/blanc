# Default Page Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the owner prefers inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Settings → General → Default page zoom, and a saved-sites list, with each tab's zoom owned by Blanc rather than Chromium's host map.

**Architecture:** Every tab view runs in `isolated` zoom mode. On each main-frame commit a controller applies private memory, then the profile's `site-zoom.json`, then the default. A pure module holds the rules; a small store module holds the data; a controller module holds the Electron calls.

**Tech Stack:** Electron 44.9.3 (ECS), `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-11-06-default-page-zoom-design.md`

## Global Constraints

- Default options: 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200. Default 100.
- ⌘+/⌘− steps: 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500.
- `pageZoom` is device-level, never in `SYNCED_KEYS`. `site-zoom.json` is `scope: 'profile'`, never synced or sent anywhere, and stays when history is cleared.
- Nothing from a private tab reaches the disk.
- Blanc never writes Chromium's `Preferences`.
- Every string in all six `copy/messages` files. US spelling. CSS, not inline styles.

## Review Focus

- A tab that visited a PDF is left in `manual` mode: the next page must zoom normally (Task 3 test, Task 6 scenario).
- A zoom equal to the default must remove the entry, so the site follows later default changes (Task 1, Task 3 tests).
- A malformed `site-zoom.json` or `Preferences` must not stop a tab loading (Task 2 tests).
- A closed tab reopened inside its 30 s hold keeps a stale zoom unless re-applied (Task 3: apply on adopt).
- A quiet tab has no live contents when the default changes; it must not throw, and must wake right (Task 3 test, Task 6 scenario).

---

### Task 1: Pure rules

**Files:** Create `src/main/page-zoom.js`, `test/unit/page-zoom.test.js`.

**Produces:** `ZOOM_STEPS`, `DEFAULT_ZOOM_OPTIONS`, `normalizePageZoom(value) -> number`, `percentToLevel(percent) -> number`, `levelToPercent(level) -> integer`, `nextZoomPercent(percent, direction: 1|-1) -> number`, `siteKeyFor(url) -> string|null`, `usesDefaultZoom(url) -> boolean`, `resolveZoomPercent({ url, privateSites, savedSites, defaultPercent }) -> number`, `legacyZoomSites(preferences, internalHosts) -> { key: percent }`.

- [ ] Write tests: from every default option, repeated `nextZoomPercent` reaches 100; 83 steps to 90 going up and 80 going down; ends clamp at 25 and 500; `levelToPercent(percentToLevel(p)) === p` for every step; `siteKeyFor` gives the lowercase hostname for http(s), `blanc://newtab` for internal pages, null for `file:`, `about:blank` and junk; `usesDefaultZoom` is true for http(s) and `file:`, false for `blanc:`; `resolveZoomPercent` order is private, saved, default, and 100 for an internal page with nothing saved; `legacyZoomSites` reads numbers and `{ zoom_level }` objects under any partition key, maps `newtab` to `blanc://newtab`, skips non-finite values and returns `{}` for null or a non-object.
- [ ] Run `node --test test/unit/page-zoom.test.js`; expect failure (module missing).
- [ ] Implement. `level = log(percent / 100) / log(1.2)`. No `require('electron')`.
- [ ] Run; expect pass. Commit.

### Task 2: Setting and store

**Files:** Modify `src/main/settings.js`, `settings-schema/schema.json`. Create `src/main/site-zoom.js`, `test/unit/site-zoom.test.js`.

**Consumes:** `normalizePageZoom`, `DEFAULT_ZOOM_OPTIONS`, `legacyZoomSites`.

**Produces:** `settings.pageZoom`; `siteZoom.sites() -> { key: percent }`, `siteZoom.setSite(key, percent)`, `siteZoom.removeSite(key)`, `siteZoom.clearSites()`, `siteZoom.migrate(readPreferences: () => string|null, internalHosts)`, all acting on the active local profile.

- [ ] Write tests, using the temp `userData` pattern in existing store tests: set, remove and clear round-trip; profiles don't share (`withLocalProfile`); a corrupt file reads as empty; a stored percent outside 25–500 or a key over 253 characters is dropped; `migrate` runs once, survives `readPreferences` throwing or returning junk, and never overwrites a site already saved. Settings: `setSettings({ pageZoom: 75 })` saves; `33` and `'75'` are refused; not in `SYNCED_KEYS`; `pageZoom` in schema `internalDefaults`.
- [ ] Run; expect failure.
- [ ] Implement, following `start-page-pins.js` for the store. Add `pageZoom: 100` to `DEFAULTS`, normalize on read, whitelist on write.
- [ ] Run tests and `npm run settings:check`; expect pass. Commit.

### Task 3: Controller and tab wiring

**Files:** Create `src/main/tab-zoom.js`, `test/unit/tab-zoom.test.js`. Modify `src/main/tab-view.js`, `src/main/main.js`.

**Consumes:** Tasks 1 and 2.

**Produces:** `createTabZoom({ tabs, liveContents, settings, siteZoom, withLocalProfile, readPreferences, internalHosts })` returning `prepare(wc)`, `applyToTab(tab, wc, url?)`, `applyAll()`, `step(tab, wc, direction)`, `reset(tab, wc)`, `stepDirect(wc, direction)`, `list()`, `remove(key)`, `clear()`.

- [ ] Write tests with fake `wc` objects: `prepare` sets `isolated`; `applyToTab` restores `isolated` from `manual` and then sets the level, and skips the write when the level already matches; `step` saves and fans out only to tabs of the same profile and privacy on that host; a step landing on the default removes the entry; `reset` removes it; in `manual` mode `step` moves the level and saves nothing; a private `step` and `reset` leave `siteZoom` untouched, and `reset` in private uses the default even when a site is saved; a `file:` tab steps without saving; `applyAll` skips tabs with no live contents and tabs in `manual` mode; `remove` and `clear` re-apply to open tabs.
- [ ] Run; expect failure.
- [ ] Implement. Migrate lazily, once per profile, on first use; `readPreferences(profileId)` reads `Preferences` under `profileSessionRegistry.normal(profileId).getStoragePath()`.
- [ ] Wire: `tabZoom` joins `initTabView`'s dependencies; `wireTabView` calls `prepare(wc)` first and, in `did-navigate` after the inert check, `applyToTab(tab, wc, url)`. In `main.js`, `zoomActiveTab` and `resetZoomForActiveTab` use `step`/`reset` when the target is the tab's own contents and `stepDirect` for the sheet and Reader (⌘0 there keeps `setZoomLevel(0)`). `settings.onSettingsChanged` calls `applyAll()` when `pageZoom` changes. `createTab` calls `applyToTab` on the adopt path. Remove `ZOOM_STEP`, `ZOOM_MIN`, `ZOOM_MAX`.
- [ ] Run unit tests, then `npm run test:unit`; fix anything that pinned the old code. Commit.

### Task 4: Settings UI and bridge

**Files:** Modify `src/renderer/pages/settings.html`, `settings.js`, `src/main/pages.js`, `src/main/tab-preload.js`, `browser-api/bridges.json`, `src/main/main.js`, `copy/messages/*.json`, and `copy/i18n-scope.json` if needed.

**Consumes:** `list()`, `remove(key)`, `clear()` through `hooks.pageZoom`.

**Produces:** `pages:zoom:list`, `pages:zoom:remove`, `pages:zoom:clear` (settings host only); `bowserPages.zoom.list/remove/clear`.

- [ ] Add a `.setting` row `#pageZoomSetting` after `#islandSizeSetting`, a select filled from the option list with `Intl.NumberFormat(locale, { style: 'percent' })`, and a `#siteZoomList` `.row-list` built like `#permissionList` with Remove and Clear all. Internal keys show the `blanc://` address as stored.
- [ ] Add strings: `settings.general.pageZoom.label`, `.hint`, `settings.general.siteZoom.title`, `.hint`, `.empty`, `.clearAll`, translated in all five languages; `npm run copy:ack` per language; `npm run copy:build`.
- [ ] Run `npm run browser-api:build`, `npm run substrate:check`, `npm run audit-inventory:write`; expect a clean check. Commit.

### Task 5: Spec and docs

**Files:** Modify `spec/features.md` (F62), `spec/parity-matrix.md`, `CLAUDE.md`, and `AGENTS.md` if it mirrors that section. Create `spec/acceptance/page-zoom.feature`.

- [ ] Add F62 and a parity row (desktop PARTIAL, mobile N/A through D10). Add a short "Page zoom" paragraph to CLAUDE.md's Architecture section: the isolated mode, the `manual` trap, and why `zoomFactor` is rejected.
- [ ] Commit with Task 6.

### Task 6: Acceptance

**Files:** Create `test/desktop/steps/page-zoom.steps.js`. Modify `test/desktop/cucumber.mjs`, `src/main/test-hook.js`, and a per-PR CI job in `parity-guards.yml` so these run on pull requests.

- [ ] Write scenarios `@F62-1…`: default reaches a new tab and a `window.open` child; a change reaches an open tab with no reload; a site held at 100% under 75% survives navigation and relaunch; ⌘0 returns to the default; tabs on a host follow each other; a named profile stays separate; private zoom writes nothing; zoom works after a PDF; a quiet tab wakes at the right zoom; a `blanc://` tab stays at 100%; no host reaches `Preferences` after browsing at 75%; existing `Preferences` entries are moved across.
- [ ] Run them through a scratch config; expect pass. Run `npm run test:acceptance:dry`.
- [ ] Run the Glance zoom and Mahjong sizing scenarios, which touch zoom. Commit.

### Task 7: Finish

- [ ] Run `npm run lint`, `npm run test:unit`, `npm run substrate:check`.
- [ ] Check it by hand in a dev run on a scratch profile, with a screenshot of Settings.
- [ ] Run a code review, then open a normal PR. No issue comment.
