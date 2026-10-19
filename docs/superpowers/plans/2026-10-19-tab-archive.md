# Tab Archive (F52) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically archive idle loose tabs into a saved, per-profile Archive that the person can search and restore. Off by default.

**Architecture:** A pure policy module (`src/main/tab-archive.js`, like `tab-sleep.js`) decides which tabs are eligible and what an entry may hold. A profile-scoped `JsonStore` (`src/main/archive.js`, like `history.js`) keeps the entries. `main.js` adds a `lastViewedAt` clock saved in session meta, runs an archive pass on the existing 30-second Quiet Tabs timer, and closes archived tabs through `closeTab(id, { record: false })`. Restoring works from the ⌘L Quick Switcher and from a new Archived view in the History sheet.

**Tech Stack:** Electron main process (CommonJS), `node --test` unit tests, Cucumber + Playwright-Electron acceptance through `src/main/test-hook.js`, the generated copy, settings and browser-api substrates.

**Spec:** `docs/superpowers/specs/2026-10-19-tab-archive-design.md`

## Global Constraints

- Setting key `tabArchive`, enum `off|12h|1d|7d|30d`, default `off`, device-local (not in `SYNCED_KEYS`).
- Delays: `12h` = 43 200 000 ms, `1d` = 86 400 000, `7d` = 604 800 000, `30d` = 2 592 000 000. `TAB_ARCHIVE_DELAY_MS` in `tab-archive.js` is the only place that maps ids to ms.
- Archive entries expire after 30 days (`ARCHIVE_TTL_MS = 2_592_000_000`). Cap is 500 per profile (`MAX_ARCHIVE_ENTRIES`); past the cap the oldest entry is dropped.
- Grace is 10 minutes (`ARCHIVE_GRACE_MS = 600_000`) after launch, resume, or a change to `tabArchive`. Batch limit is 20 per window per sweep (`ARCHIVE_PER_SWEEP = 20`).
- An entry holds exactly `id, url, title, favicon, customTitle?, archivedAt, lastViewedAt, spaceName?`. Never a snapshot, page state, back stack or opener.
- Never synced. Private tabs are never archived and never see the Archive.
- Clear History (all three paths) also clears the Archive.
- English copy goes in `copy/messages/en.json`. Translations into `de`, `es`, `fr`, `pt-BR` and `it` land in the same PR and are acknowledged with `npm run copy:ack -- <locale> <keys>`. Never hand-edit generated `strings.*.js`. User-facing words: **Archive**, **archived**.
- Exact English copy, from the spec:
  - Setting label: `Archive inactive tabs`; options `Off`, `After 12 hours`, `After 1 day`, `After 7 days`, `After 30 days`.
  - Setting hint: `Blanc closes loose tabs you haven't opened in a while and keeps them in your Archive for 30 days. Pinned tabs and tab groups are never archived.`
  - Slash hint `/archive`: `See tabs Blanc archived for you`.
  - Switcher row marker: `Archived`.
- No website, roadmap or social claim until a public release ships it (`docs/marketing-claims.md`).

## Review Focus

1. **A laptop that was closed for two weeks** reopens with every loose tab past its delay: nothing may be archived for 10 minutes, then at most 20 per window per sweep, oldest first. Tests go in Task 2 (grace, limit) and Task 6 (resume resets grace).
2. **A `lastViewedAt` in the future** (system clock moved backwards) must make the tab ineligible, never throw, and never count as "very idle". Test in Task 2.
3. **The same URL archived twice:** the Archive keeps both entries, and the Quick Switcher shows one row, because of the existing url-keyed dedup. Restoring removes only that entry. Tests in Task 4 and Task 7.
4. **A double click on Restore** (or restore from two windows at once): the second call returns `false` and opens nothing. Test in Task 6.
5. **A renamed tab (F46)** comes back from the Archive with its custom name. Test in Task 6.

---

### Task 1: Ratify F52 in `spec/`

**Files:**
- Modify: `spec/features.md` (append `## F52 — Tab Archive (desktop)` after F51)
- Modify: `spec/parity-matrix.md` (F52 row: desktop `PLANNED`, iOS `—`, Android `—`)
- Create: `spec/acceptance/tab-archive.feature` (scenarios from spec §7, tagged `@desktop @backlog` until Task 6 makes them runnable)

- [ ] **Step 1:** Write the F52 contract in `features.md`, summarizing spec §2 (setting, eligibility, clock, sweep, restore, expiry, clear) in the style of F31/F48.
- [ ] **Step 2:** Add the matrix row and the feature file with these scenarios: *Archive an idle loose tab*; *Pinned and grouped tabs are never archived*; *Restore from the Quick Switcher*; *Restore from the History sheet*; *Clearing history empties the Archive*; *Idle time survives a relaunch*; *Nothing is archived during the grace period*.
- [ ] **Step 3:** Run `npm run test:acceptance:dry`. Expected: passes (backlog scenarios are excluded from `runnable`).
- [ ] **Step 4:** Commit: `spec: ratify F52 Tab Archive`.

### Task 2: Pure policy module

**Files:**
- Create: `src/main/tab-archive.js`
- Test: `test/unit/tab-archive.test.js`

**Interfaces:**
- Produces:
  - `TAB_ARCHIVE_DELAY_MS: { off: null, '12h': number, '1d': number, '7d': number, '30d': number }`
  - `ARCHIVE_TTL_MS`, `MAX_ARCHIVE_ENTRIES`, `ARCHIVE_GRACE_MS`, `ARCHIVE_PER_SWEEP` (values in Global Constraints)
  - `archiveCandidates(tabList, { now, thresholdMs, activeTabId, visibleTabIds = Set, permissionPendingTabIds = Set, popupChildCounts = Map, graceUntil = 0, perSweepLimit = ARCHIVE_PER_SWEEP }) -> Array<{ id: string, closeOnly: boolean }>`, oldest `lastViewedAt` first, ties by `tabList` index. `closeOnly` is true for `blanc://newtab` tabs.
  - `buildArchiveEntry(tab, { now, spaceName = null }) -> ArchiveEntry | null` (null for private or non-http(s) URLs)
  - `expireArchive(entries, { now, ttlMs = ARCHIVE_TTL_MS, cap = MAX_ARCHIVE_ENTRIES }) -> ArchiveEntry[]`, newest first
  - `projectArchive(entries) -> Array<{ id, url, title, favicon, archivedAt, spaceName }>`, where `title` is `customTitle || title`
  - `searchArchive(entries, query) -> ArchiveEntry[]` (case-insensitive substring over title, customTitle and url; an empty query returns everything)

No `require('electron')`. The clock is always injected.

- [ ] **Step 1: Write the failing tests.** Each is a `test(...)` with these assertions:
  - `returns nothing when thresholdMs is null` → `[]`.
  - `returns nothing before graceUntil` → `now = 1000, graceUntil = 2000` → `[]`.
  - `archives only ungrouped unpinned non-private tabs`: tabs that are `{pinned:true}`, `{groupId:'g1'}` and `{private:true}`, all idle → none returned. A plain idle tab → returned.
  - `skips active, Glance-visible, audible, usedMedia, capturing, displayShareBlocking, loading, waking, prompt-pending and popup-parent tabs`: one tab per condition → none returned.
  - `does not exempt opener families`: an idle tab whose `openerTabId` is a live tab → returned.
  - `marks blanc://newtab as closeOnly`: `{ url: 'blanc://newtab/', lastViewedAt: 0 }` → `[{ id, closeOnly: true }]`.
  - `treats a future lastViewedAt as not idle`: `lastViewedAt = now + 60_000` → `[]`, no throw.
  - `treats a missing lastViewedAt as not idle` → `[]`.
  - `orders oldest-viewed first and stops at perSweepLimit`: 25 idle tabs → exactly 20, oldest first.
  - `buildArchiveEntry keeps only allow-listed keys`: give it a tab carrying `snapshot`, `pageState`, `openerTabId`, `groupId`, `customTitle:'Mine'` → `Object.keys(entry).sort()` deep-equals `['archivedAt','customTitle','favicon','id','lastViewedAt','spaceName','title','url']`.
  - `buildArchiveEntry refuses private and non-http tabs` → `null`.
  - `expireArchive drops entries older than 30 days and keeps the newest 500`.
  - `projectArchive prefers customTitle and omits lastViewedAt`.
  - `searchArchive matches title, customTitle and url, ignoring case`.
- [ ] **Step 2:** Run `node --test test/unit/tab-archive.test.js`. Expected: FAIL (`Cannot find module './tab-archive'`).
- [ ] **Step 3:** Implement the module. Mirror `sleepCandidates` in `tab-sleep.js` for the field checks. Entry ids are `arch-<archivedAt>-<seq>`. The favicon goes through `validFavicon` from `bookmark-validate.js`, which is what `persistableFavicon` uses. `customTitle` goes through `normalizeTabName`.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit: `Tab Archive: pure eligibility and entry policy`.

### Task 3: The `tabArchive` setting

**Files:**
- Modify: `settings-schema/schema.json` (`$tabArchiveDelays` note, `tabArchiveDelays`, default `"tabArchive": "off"`, the key row marked device-local), then run `npm run settings:build`
- Modify: `src/main/settings.js` (`TAB_ARCHIVE_DELAYS`, `DEFAULTS.tabArchive = 'off'`, read sanitize next to line 490, write whitelist next to line 582; not in `SYNCED_KEYS`)
- Modify: `src/renderer/pages/settings.html` + `settings.js` (a `#tabArchiveSetting` row directly after `#tabSleepSetting`, same markup pattern)
- Modify: `copy/messages/*.json` (keys `settings.general.tabArchive.{label,hint,off,12h,1d,7d,30d}`), then run `npm run copy:build`
- Test: `test/unit/tab-archive-settings.test.js` (model it on `tab-sleep-settings.test.js`)

**Interfaces:**
- Produces: `settings.getSettings().tabArchive` ∈ `TAB_ARCHIVE_DELAYS`. A `settings-changed` broadcast carrying `tabArchive` is what Task 6 uses to reset the grace.

- [ ] **Step 1: Write the failing tests:** `defaults to off`; `rejects an unknown id on read and on write`; `is not a synced key` (`SYNCED_KEYS` excludes it); `the settings page lists exactly off,12h,1d,7d,30d in that order`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement as listed under Files, with the copy from Global Constraints. Write the five translations and run `copy:ack` for each locale.
- [ ] **Step 4:** Run the test, then `npm run substrate:check` and `npm run copy:check`. Expected: all PASS.
- [ ] **Step 5:** Commit: `Tab Archive: device-local setting, off by default`.

### Task 4: The Archive store and clearing it with history

**Files:**
- Create: `src/main/archive.js`
- Modify: `src/main/main.js` (`chrome:history-clear` near line 9072 and `onHistoryCleared` near line 11492 also call `archive.clearArchive()`)
- Modify: `src/main/test-hook.js` (both `history.clearHistory()` sites near lines 912 and 3492 also clear the Archive)
- Test: `test/unit/archive-store.test.js` (wait with `test/unit/support/wait-for-json.js`; settle stores with `test/unit/support/track-json-stores.js`, as other JsonStore tests do)

**Interfaces:**
- Consumes: `buildArchiveEntry`, `expireArchive`, `projectArchive`, `searchArchive` (Task 2).
- Produces (profile-scoped, `new JsonStore('archive', { version: 1, entries: [] }, { scope: 'profile' })`):
  - `addEntries(entries: ArchiveEntry[], now: number) -> void` (prepends, then `expireArchive`)
  - `listArchive({ query = '', now }) -> ProjectedEntry[]` (expires on read)
  - `takeEntry(id) -> ArchiveEntry | null` (removes and returns; `null` when it's already gone)
  - `forgetEntry(id) -> boolean`, `clearArchive() -> void`

- [ ] **Step 1: Write the failing tests:** `adds and lists newest first`; `keeps two entries for the same URL`; `takeEntry returns the entry once and null the second time`; `listArchive drops entries past 30 days`; `clearArchive empties the file`; `a named profile writes under profiles/<id>/archive.json`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the store and wire the four clear sites.
- [ ] **Step 4:** Run it, plus `node --test test/unit/history-*.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Tab Archive: per-profile store, cleared with history`.

### Task 5: `lastViewedAt`, saved across relaunches

**Files:**
- Modify: `src/main/main.js` (stamp `tab.lastViewedAt = Date.now()` wherever `lastActiveAt` is stamped for a tab becoming active in a focused window, about lines 6758, 6993, 7094, 7135 and 5927; and at creation, line 6738)
- Modify: `src/main/session-snapshot.js` (`sessionTabMeta` writes `lastViewedAt` when finite; `metaAfterHistoryClear` keeps it, since it's a timestamp and not page content)
- Modify: `src/main/session-restore.js` (restored tab takes `meta.lastViewedAt` when finite and `<= now`, else `now`)
- Modify: wherever Spaces brings tabs into a window: stamp `now` (the spec says Spaces don't store it)
- Test: `test/unit/session-snapshot.test.js` and `test/unit/session-restore.test.js` (add cases)

**Interfaces:**
- Produces: `tab.lastViewedAt: number` (ms epoch) on every non-private tab record. Never re-stamped by `restampBackgroundTabs`.

- [ ] **Step 1: Write the failing tests:** `sessionTabMeta writes lastViewedAt`; `the flat rollback mirror never carries lastViewedAt`; `metaAfterHistoryClear keeps lastViewedAt`; `restore uses a saved lastViewedAt`; `restore stamps now when it's missing or in the future`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `node --test test/unit/session-*.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Tab Archive: a saved per-tab last-viewed clock`.

### Task 6: The archive sweep and restore in main

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/test-hook.js` (add `setTabViewedSince(id, msAgo)`, `runArchiveSweep()`, `setArchiveGraceUntil(ms)`, `archiveEntries()`, `restoreArchived(id)`)
- Modify: `spec/acceptance/tab-archive.feature` (drop `@backlog`) and add steps under `test/desktop/steps/`
- Test: acceptance via `npm run test:acceptance:desktop -- --tags @tab-archive`

**Interfaces:**
- Consumes: Tasks 2, 4 and 5; `closeTab(id, { record: false })` (line 7364); `probeTabDirty(tab, wc)`; `liveContents(tab)`.
- Produces:
  - `runArchiveSweep() -> Promise<{ archived: string[], closed: string[], skippedReason: string | null }>` (skips: `quitting`, `persistence-suspended`, `startup-gate`, `off`, `grace`)
  - `restoreArchivedEntry(entryId) -> boolean` (`archive.takeEntry`; `null` → `false`; otherwise create a new ungrouped tab at the end of the current window, select it, load the URL, apply `customTitle`)
  - module-level `archiveGraceUntil`, set to `Date.now() + ARCHIVE_GRACE_MS` at startup, in the `powerMonitor` `resume` handler (line ~12108), and when `tabArchive` changes

- [ ] **Step 1: Write failing acceptance scenarios** (bound to the test hook): idle loose tab → archived and listed; pinned + grouped idle tabs stay; inside the grace period → `skippedReason: 'grace'`; a live tab with a typed form value → not archived; restore → tab opens at the end, entry gone, a second `restoreArchived` with the same id returns `false`; a renamed tab restores with its name; relaunch keeps `lastViewedAt` (backdate, restart, sweep → archived).
- [ ] **Step 2:** Run them. Expected: FAIL (hooks missing).
- [ ] **Step 3:** Implement `runArchiveSweep`. Call it from the existing 30-second interval, inside the same `forEachWindowRuntime` callback, after `runSleepSweep` settles. For each candidate: skip it if `liveContents(tab)` exists and `probeTabDirty` reports dirty or a `beforeunload` listener. Collect entries with `buildArchiveEntry(tab, { now, spaceName: current space name or null })`. Call `archive.addEntries` once, then `closeTab(id, { record: false, selectReplacement: false })` for each tab, including `closeOnly` tabs, which add no entry. Private windows never run the sweep.
- [ ] **Step 4:** Implement `restoreArchivedEntry` and the hooks.
- [ ] **Step 5:** Run the scenarios. Expected: PASS. Also run `node --test test/unit/tab-sleep*.test.js test/unit/closed-tabs*.test.js` to show Quiet Tabs and Recently closed are unchanged.
- [ ] **Step 6:** Commit: `Tab Archive: archive idle loose tabs and restore them`.

### Task 7: Archived rows in the Quick Switcher

**Files:**
- Modify: `src/main/main.js` (`chromeHandle('chrome:archive-list', () => archive.listArchive({ now }))` returns `[]` for a private active tab; `chromeHandle('chrome:archive-restore', (id) => restoreArchivedEntry(String(id)))`)
- Modify: `src/main/preload.js` (`archiveList()`, `archiveRestore(id)`), `browser-api/contract.json`, then run `npm run browser-api:build` and commit the regenerated vectors
- Modify: `src/renderer/overlay.js` (`archivedEntries` loaded alongside `historyEntries`; in `switcherResults`, push `{ kind: 'archived', title, sub: \`${stripUrl(url)} · ${t('result.archived')}\`, url, tab: { url, favicon }, entryId, score: s + 0.02 }`, between remote (+0.05) and history (+0); picking it calls `archiveRestore(entryId)`)
- Modify: `copy/messages/*.json` (`result.archived`: `Archived`)
- Test: `test/unit/overlay-archived-results.test.js` (vm-loaded `overlay.js`, following the existing switcher tests; make sure assertions fail closed, per the source-lifted test caveat)

**Interfaces:**
- Consumes: `archive.listArchive`, `restoreArchivedEntry` (Tasks 4 and 6).
- Produces: switcher result kind `'archived'`, deduplicated by `url` like favorites and history.

- [ ] **Step 1: Write the failing tests:** `an archived entry ranks below remote tabs and above history`; `a history row for the same URL is dropped in favor of the archived row`; `two archived entries with the same URL show one row`; `a private tab's switcher shows no archived rows`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement as listed under Files.
- [ ] **Step 4:** Run the tests, `npm run browser-api:check` and `npm run copy:check`. Expected: PASS.
- [ ] **Step 5:** Commit: `Tab Archive: archived tabs in the Quick Switcher`.

### Task 8: The Archived view in the History sheet and `/archive`

**Files:**
- Modify: `src/main/pages.js` (`handle('pages:archive:list'|'pages:archive:restore'|'pages:archive:forget'|'pages:archive:clear', 'history', …)`, next to the `pages:history:*` handlers at line 327)
- Modify: `src/main/tab-preload.js` (`bowserPages.archive{List,Restore,Forget,Clear}`), `browser-api/bridges.json` (four channels, hosts `["history"]`), then `npm run browser-api:build`
- Modify: `src/renderer/pages/history.html` + `history.js` + `pages.css` (an **Archived** toggle next to the visit list; rows with Restore and Forget; a Clear Archive button; search uses `pages:archive:list({ query })`)
- Modify: `copy/slash-commands.json` (`/archive`), `src/renderer/overlay.js` + `src/renderer/pages/shortcuts.js` (`['/archive', 'slash.archive.hint']`; the command opens `blanc://history/?view=archived`), then `npm run copy:build`
- Modify: `copy/messages/*.json` (`slash.archive.hint` and `history.archived.*` for the toggle, empty state, Restore, Forget and Clear Archive)
- Test: `test/unit/history-archived-view.test.js`; extend the acceptance feature with *Restore from the History sheet* and *Clearing history empties the Archive*

**Interfaces:**
- Consumes: `archive.listArchive`, `archive.forgetEntry`, `archive.clearArchive`, `restoreArchivedEntry`.

- [ ] **Step 1: Write the failing tests:** `pages:archive:* refuse any host but history` (the `pages.js` sender check); `?view=archived opens the Archived view`; `Clear Archive empties the list`; the two acceptance scenarios.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the CSS in `pages.css` classes, with no inline styles.
- [ ] **Step 4:** Run the tests, `npm run browser-api:check`, `npm run substrate:check` and `npm run copy:check`. Expected: PASS.
- [ ] **Step 5:** Relaunch `npm start`, open the History sheet, and check the Archived view in light and dark. Take before/after screenshots for the PR.
- [ ] **Step 6:** Commit: `Tab Archive: Archived view in History and /archive`.

### Task 9: Onboarding offer (blocked on spec Q1 and Q2)

**Do not start until the owner answers spec §10 Q1 and Q2.** First show two or three mockups, using real CSS, of where the offer sits in the six-step walkthrough, and, if Q2 is yes, of the one-time "Blanc archived N tabs · View" capsule. Once one is chosen:

**Files:** `src/renderer/pages/onboarding.js` and its step markup; `copy/messages/*.json`; `spec/acceptance/onboarding.feature`; if Q2 is yes, a device-local `archiveNoticeShown` setting and the capsule.

- [ ] **Step 1:** Write the failing acceptance scenario: *A fresh profile is offered Archive preset to 7 days; accepting it sets `tabArchive` to `7d`; declining leaves it `off`; an existing profile is never shown the offer.*
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the chosen design.
- [ ] **Step 4:** Run `npm run test:acceptance:desktop -- --tags @onboarding`. Expected: PASS.
- [ ] **Step 5:** Commit: `Tab Archive: offer it during onboarding`.

### Task 10: Full verification and PR

- [ ] **Step 1:** Run `npm run lint`, `npm run test:unit`, `npm run substrate:check`, `npm run browser-api:check`, `npm run copy:check` and `npm run test:acceptance:desktop`. Expected: all pass. If an acceptance failure looks environmental, compare against `main` before blaming this branch.
- [ ] **Step 2:** In a packaged build (`npm run dist:dir`) with a copy of a real profile: with the setting Off, nothing changes; set it to 12h, backdate with a dev build's hook, and check that the batch archives and restores.
- [ ] **Step 3:** Update `spec/parity-matrix.md` F52 desktop to `PARTIAL` until it ships in a public release.
- [ ] **Step 4:** Open the PR. The description lists the spec, the decisions D1–D4, any open Q1/Q2 outcome, and the fact that there are no website claims until release.
