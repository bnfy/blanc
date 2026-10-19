# Tab Archive: tidy away idle tabs (F52)

**Date:** 2026-10-19
**Status:** draft for the owner's review. The owner decided D1–D4 on 2026-10-19 (§9). §10 lists what is still open. No implementation plan yet.
**Builds on:** [Quiet Tabs](2026-08-09-quiet-tabs-design.md) (F31: idle tracking, eligibility, the sweep) and [Reopen Closed Tab](2026-08-16-reopen-closed-tab-design.md) (closed entries, the ⌘L Recently closed band).
**Reference:** Arc's auto-archive of "Today" tabs (12 hours, 1 day, 7 days or 30 days; pinned tabs and Favorites are never archived; archived tabs can be searched and restored). Arc has been in maintenance mode since May 2025. This feature is one of the Arc habits that people coming from Arc lose when they switch to Blanc. F45 already imports their Spaces.

## 1. Problem

Blanc frees the *memory* of tabs nobody looks at (Quiet Tabs), but not the *clutter*. A quiet tab still takes up a row, a dot and a Quick Switcher result for as long as the person leaves it open. Recently closed is an undo buffer, not an archive: it lasts one hour, holds 25 entries and is never saved to disk (`closed-tabs.js`, `CLOSED_ENTRY_TTL_MS`). People coming from Arc expect loose tabs to clear themselves away and still be findable.

## 2. Behavior contract

### 2.1 The setting

Settings → General, directly under **Quiet inactive tabs**:

> **Archive inactive tabs**: Off · After 12 hours · After 1 day · After 7 days · After 30 days
> *Hint:* Blanc closes loose tabs you haven't opened in a while and keeps them in your Archive for 30 days. Pinned tabs and tab groups are never archived.

- Key `tabArchive`, enum `off|12h|1d|7d|30d`, default **`off`** (D1).
- **Device-local**, like `tabSleep`. It is not in `SYNCED_KEYS`, because closing tabs is a decision about this machine's windows.
- Turning it Off stops future archiving. It never restores or deletes anything already archived.
- **New profiles** are offered the choice once, during first-run onboarding (F36), preset to **After 7 days**; declining leaves it Off (D1). Existing profiles are never asked and never switched on by an update.

### 2.2 What can be archived (D3)

A tab is a candidate only if **all** of these hold:

1. It is **ungrouped** and **not pinned**. Pinned tabs and tabs in a group count as organized by the person, as in Arc.
2. It is **not private**. Private tabs are never recorded anywhere (F4).
3. It is not the window's active tab and not the tab shown in Glance (`visibleTabIds`).
4. It has not been **viewed** for at least the chosen delay (§2.3).
5. It is not doing anything the person would miss: not audible, not muted with media (`usedMedia`), not capturing or blocking a display share, no pending permission prompt, no live popup child, not loading or waking.
6. It holds no unsaved work. A live tab must pass the existing `probeTabDirty` check (changed form controls, `designMode`, picture-in-picture) and have no `beforeunload` listener. A quiet tab already passed that probe when it went quiet. A quiet tab that kept its view for `sessionStorage` (Quiet Tabs §storage-bearing) is still eligible, because its renderer holds no unsaved controls.

Unlike Quiet Tabs, opener families are **not** exempt: archiving is a close, and Blanc already closes either side of a family on request.

A blank `blanc://newtab` tab that meets 1–5 is simply **closed**, with no archive entry, as Arc does.

### 2.3 The idle clock

Quiet Tabs' `lastActiveAt` is not usable as is. It isn't saved across relaunches, and it is deliberately re-stamped after a clock jump (`restampBackgroundTabs`), so a suspended laptop doesn't quiet everything at once. A seven-day archive needs a clock that survives both:

- A new tab field **`lastViewedAt`** (wall-clock ms) is stamped whenever the tab becomes the active tab of a focused window, and when it is created.
- It is saved in `session.json`'s per-tab `meta` (v2 `windows[]` entries only, never the flat rollback mirror), beside `title`/`favicon`. A restored tab keeps its saved value. A tab with no saved value (upgrading profiles, older session files) is stamped at restore time, so nobody's existing tabs are archived on their first launch after the update.
- Tabs that enter a window from a saved Space are stamped at that moment. Spaces don't store `lastViewedAt`, and a space the person just opened was, by definition, just viewed.
- Clock jumps do **not** re-stamp `lastViewedAt`. Instead, the **launch and resume grace** (§2.4) prevents a burst right after the person comes back.

### 2.4 The sweep

- Archiving runs on the existing 30-second Quiet Tabs sweep timer, as a separate pass (`runArchiveSweep`) after `runSleepSweep`, with the same skip conditions: quitting, persistence suspended, startup navigation gate active.
- **Grace:** no tab is archived during the first **10 minutes** after launch, after resume from sleep (the same clock-jump detection Quiet Tabs uses), or after the setting changes. Coming back to a laptop after a week should give the person a moment to see their tabs, not an empty window.
- **Batch limit:** at most **20 tabs per window per sweep**, oldest-viewed first. This avoids a single huge UI change and spreads the work out.
- The offline guard from Quiet Tabs doesn't apply: archiving needs no network.

### 2.5 What archiving does

For each candidate, in one step:

1. Build an archive entry (§3) and add it to the profile's Archive.
2. Close the tab through the normal `closeTab` path, but **without** recording a Recently closed entry and without parking a held view. Recently closed stays the person's own undo buffer.
3. Drop the tab's `sleepSnapshots` entry, as any close does.

Apart from the one-time first-archive notice (D6), there is no toast or notice. The Archive is where to look (§4).

### 2.6 Restoring

Restoring an archived tab opens it as a **new ungrouped tab** at the end of the current window's order, selects it, loads its URL fresh (no page state, no back stack), and removes the entry from the Archive. Each profile has its own Archive (§3.1), so a window only ever lists and restores its own profile's entries. Within a profile, the entry opens in the window it is restored from, even if that window shows a different Space from the one it was archived in.

### 2.7 Expiry and clearing

- Entries expire **30 days** after they were archived (D2). The Archive is capped at **500 entries per profile**; past the cap, the oldest entry is dropped. Unlike Quiet Tabs' snapshot cap, which refuses new snapshots, dropping the oldest entry here is safe, because every entry is also in History.
- **Clear History** (Settings, `/clear`, the History page) also clears the Archive. An archive entry is browsing history, and keeping one after the person cleared history would break that promise.
- Deleting a named profile removes its Archive along with the rest of `profiles/<id>/`.

## 3. Data

### 3.1 Store

One `JsonStore` per local profile, like `history.json`: `archive.json` in `userData` for Personal and `profiles/<id>/archive.json` for named profiles. It uses the same owner-only atomic writes and debounced off-thread saves.

```json
{ "version": 1, "entries": [
  { "id": "arch-…", "url": "https://…", "title": "…", "favicon": "data:image/png;base64,…",
    "archivedAt": 1792540800000, "lastViewedAt": 1791936000000, "spaceName": "Research" }
] }
```

- **Only** `url`, `title`, `favicon` (the same `persistableFavicon` bound session meta uses), `customTitle` when the tab had one (F46), timestamps, and `spaceName` for display. **Never** a navigation snapshot, page state, back stack, opener, or anything else from `sleepSnapshots` or closed-tab entries. Those can carry POST bodies (Reopen Closed Tab §2.1.1) and must never reach disk.
- `spaceName` is a display label only; it doesn't decide where a restore goes.
- **Never synced.** Profile Sync remains Favorites, settings and opt-in tab snapshots. The Archive is in the same class as history.

### 3.2 Pure policy module

`src/main/tab-archive.js`. No `require('electron')`, injected clock, unit-tested (precedent: `tab-sleep.js`, `closed-tabs.js`):

- `TAB_ARCHIVE_DELAY_MS`: the only setting-id → milliseconds mapping (`off` → `null`).
- `archiveCandidates(tabList, { now, thresholdMs, activeTabId, visibleTabIds, permissionPendingTabIds, popupChildCounts, graceUntil, perSweepLimit })` → ids, oldest-viewed first. It reads durable tab fields only. The dirty probe is async and impure, so `main.js` runs it on each candidate and skips any that fail.
- `buildArchiveEntry(tab, { now, spaceName })` copies only the allow-listed fields.
- `expireArchive(entries, { now, ttlMs, cap })`, `projectArchive(entries)` (what a renderer may see: `{id, url, title, favicon, archivedAt, spaceName}`), `searchArchive(entries, query)` using the same loose matching as the Quick Switcher.

`main.js` owns the sweep, the close, `lastViewedAt` stamping and the IPC.

## 4. Surfaces

Archive gets no new band in the ⌘L panel. It already holds tabs, groups and Recently closed, and another band would crowd it.

- **Quick Switcher:** typing in ⌘L matches archived entries too, ranked below open tabs and Favorites and above plain History, each row marked **Archived**. Picking one restores it (§2.6). A history result for the same URL is deduplicated in favor of the archived row.
- **History sheet:** `blanc://history` gets an **Archived** view next to the visit list, with search, **Restore**, **Forget** (per entry) and **Clear Archive**. It is the same utility sheet, so it needs no new page or utility-page classification.
- **Slash command:** `/archive` opens that Archived view. Hint: "See tabs Blanc archived for you". It is added through `copy/slash-commands.json` → `slash:build`, with every language updated in the same PR.
- **Settings:** the row in §2.1.
- **Onboarding:** the offer in §2.1, as a compact choice in the "Meet the island" step (D5). It is mocked up before it's built, with two or three layout options shown first.
- **First-archive notice:** the one-time "Blanc archived {count} tabs · View Archive" notice (D6), also mocked up first.

All new strings go in `copy/messages/en.json` and are translated into `de`, `es`, `fr`, `pt-BR` and `it` in the same PR. User-facing copy says **Archive** and **archived**, never "sweep" or "candidate".

## 5. IPC and contracts

- `pages:archive:list`, `pages:archive:restore`, `pages:archive:forget`, `pages:archive:clear`: `pages.js` handlers allowing only the history host; listed in `browser-api/bridges.json` with the same host list, and exposed in `tab-preload.js`'s `bowserPages`.
- The Quick Switcher's result union gains an `archived` kind. That changes a `chrome:*` invoke result, so `browser-api/contract.json` needs the matching edit and `npm run browser-api:build`.
- `chrome:archive-restore` (overlay → main) takes an entry id only; main looks the entry up in the sender's profile store.
- Settings: `settings-schema/schema.json` gains `tabArchiveDelays` and the `tabArchive` key, then `settings:build`. `substrate:check` guards the desktop default.

## 6. Invariants

1. Pinned, grouped, private, active, Glance-visible, audible, capturing, prompt-pending and dirty tabs are never archived.
2. Nothing beyond the §3.1 allow-list is written to `archive.json`. A unit test feeds a tab carrying a snapshot, a POST page state and an opener, and checks the entry's exact key set.
3. An update never turns archiving on, and the first launch after enabling it, or after any launch or resume, archives nothing for 10 minutes.
4. Clear History empties every Archive for that profile, and leaves no restorable title behind.
5. Archiving never creates a Recently closed entry, and Recently closed never feeds the Archive.
6. A private window never shows the Archive in its Quick Switcher.

## 7. Testing

- **Unit** (`test/unit/tab-archive.test.js`): candidate rules one by one (including newtab close-only), grace, batch limit ordering, entry allow-list, expiry and cap, search, projection.
- **Settings and substrate:** enum and default checks via the existing schema tests.
- **Acceptance** (`spec/acceptance/tab-archive.feature`, desktop steps through `test-hook.js`, which gets a `setLastViewedAt(tabId, msAgo)` and a `runArchiveSweep()` like the existing `/sleep` hooks): archive an idle loose tab; never a pinned or grouped one; restore from the Quick Switcher; restore from the History sheet; clear history empties the Archive; relaunch keeps `lastViewedAt`; no archiving inside the grace period.
- **Manual,** in a packaged build with a real profile: an upgrade from 1.38/1.39 leaves tabs alone with the setting Off; set it to 12h and move the test hook's clock to see a batch archive and restore.

## 8. Deliberately excluded

- **Archiving groups or pinned tabs** (D3). A later option could add groups.
- **Archiving inside saved Spaces that aren't open.** Their tabs aren't in a window and have no live clock.
- **Syncing the Archive** to other devices.
- **Restoring the back stack or page state.** Recently closed already covers the "I just closed that" case.
- **A per-tab "never archive" flag.** Pinning or grouping already says that.
- **Any AI or automatic grouping by meaning.** That would break `docs/marketing-claims.md`. The rule here is time-based only.

## 9. Decisions (owner, 2026-10-19)

- **D1:** Off by default; new profiles are offered it in onboarding (preset 7 days); existing profiles are never asked.
- **D2:** A new saved, per-profile Archive with a 30-day expiry, searchable from the Quick Switcher. Recently closed isn't reused.
- **D3:** Only ungrouped, unpinned tabs.
- **D4:** Delays of 12 hours, 1 day, 7 days and 30 days; idle time counts across relaunches.
- **D5 (was Q1):** The Tab Archive offer goes in the existing "Meet the island" onboarding step, not a seventh step, as a compact choice beneath the Island explanation, preset to After 7 days. If the person doesn't opt in, Tab Archive stays Off.
- **D6 (was Q2):** A one-time notice per local profile after the first successful archive, reading "Blanc archived {count} tabs" with a **View Archive** action. It shows only when at least one tab was actually added to the Archive (`archived.length >= 1`; an idle blank New Tab closed without an entry doesn't count), its state is per profile and never synced, and it never shows again once it is dismissed or acted on. View Archive opens `blanc://history/?view=archived`.

## 10. Open questions

Q1 and Q2 were answered on 2026-10-19 and are now D5 and D6 (§9).

- **Q3. ⌘W in Arc archives rather than closes.** Out of scope here. Blanc's close stays a close with Recently closed as undo.

## 11. Obligations elsewhere

- `spec/`: add **F52 Tab Archive** to `features.md` and `parity-matrix.md` (desktop PLANNED; mobile `—` until a mobile spec), plus `spec/acceptance/tab-archive.feature`. Ratify it in a paired commit, per the parity spec-first rule.
- `docs/marketing-claims.md`: no website, roadmap or social claim until a public release ships it.
- What's New: if it ships, draft the release's page with `npm run site:whats-new`; the owner signs off on the text and media.
- Site roadmap (`site/src/data/roadmap.json`): adding it as a public "Next" item is the owner's call. This spec doesn't do it.

