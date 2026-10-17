# Site Icons in Bang Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every bang row in the ⌘L panel shows the site's real icon, from icons the app already holds, then copies kept from Blanc's icon server, then that server on demand.

**Architecture:** A pure policy module decides whether a host may be asked for and keeps the bounded store's records; a small main-process service owns the device-level store, the request queue and the fetch through the existing favicon network reader and sanitizer; `main.js` exposes one invoke and one push event to the overlay, which draws a leading icon on bang rows and asks only for rows that stay on screen.

**Tech Stack:** Electron main process (Node `http`/`https` through `src/main/favicon-network.js`), `JsonStore` (`src/main/store.js`), sandboxed overlay renderer, `node --test`, Cucumber + Playwright-Electron acceptance.

**Spec:** `docs/superpowers/specs/2026-10-17-bang-icons-in-app-design.md` (approved October 17, 2026). Read it first; this plan argues from it.

## Global Constraints

- Server URL: `https://blanc.day/bang-icons/<host>`, `<host>` = the catalog entry's domain lowercased (as in `site/public/bang-hosts.json`, `www.` kept).
- Only the main process fetches, only through `readIconBytes` (`src/main/favicon-network.js`) and the sanitizer's 32px PNG conversion. No renderer `<img>` of a remote URL; no CSP change.
- For this endpoint: time limit 8000 ms, redirects refused (`maxRedirects: 0`).
- Never ask: bangs off; `settings.isFirstRunComplete()` false; the window's active tab private; host not in the bundled catalog; host equal to a custom bang's template host.
- 404 (or 410) = definite: no further request for that host until Blanc quits. Timeout, 5xx, network failure = retry allowed the next time the row is on screen, at least 30 000 ms after the last attempt, at most 2 retries per host per run.
- At most 4 requests in flight. The overlay asks only for rows on screen for 300 ms.
- Refresh: a stored copy older than 30 days (`30 * 24 * 60 * 60 * 1000` ms) is shown and asked for again; on 404 drop it, on failure keep it.
- Store: device scope, `bang-icons.json`, records `{host, icon, fetchedAt, usedAt}`, cap 300, least recently used dropped first; cleared on every recent-bangs clear; never synced, never in telemetry; nothing written while the active tab is private.
- No new user-visible strings. The row icon is `aria-hidden`.
- Every `window.browserAPI` change updates `browser-api/contract.json` and is followed by `npm run browser-api:build` with the regenerated vectors committed; boundary edits run `npm run audit-inventory:write`.
- App PR only. The privacy-page sentence and the `docs/marketing-claims.md` Bangs qualification ship in a separate website-only PR after the release that contains this (Task 8).

## Review Focus

- Typing fast through `!y`, `!yo`, `!you`: rows that leave the screen within 300 ms must cause no request (Task 6, test `bang icon requests wait for rows to stay on screen`).
- Switching from a private tab to a normal tab while the picker is open: the private window state is decided by main at request time, not cached in the overlay (Task 5, scenario F47-11 checks the private side; Task 4 test `request rechecks private per call`).
- The same host appearing in two windows at once: one fetch, both overlays updated (Task 4 test `a host already in flight is not fetched twice`).
- A stored icon for a host later held back on the server: the refresh 404 drops it and every open overlay falls back to the letter (Task 4 test `a refresh 404 drops the stored copy and emits null`).
- Clearing history while a fetch is in flight: the late result must not repopulate the cleared store (Task 4 test `a fetch finishing after clear is discarded`).

---

### Task 1: Network reader options for the icon server

**Files:**
- Modify: `src/main/favicon-network.js` (`readIconBytesOnce`, `readIconBytes`, exports)
- Test: `test/unit/favicon-network.test.js`

**Interfaces:**
- Produces: `readIconBytes(source, { signal, lookup, timeoutMs = 3000, maxRedirects = 5, statusResult = false })`. With `statusResult: true`, a response that is neither 200 nor a followed redirect resolves `{ status: <number> }` instead of `null`. Existing callers pass none of the new options and behave exactly as before.
- Produces: pure `responseOutcome(statusCode, location, sourceHref, { statusResult })` → `{ redirect: string } | { status: number } | 'read' | null`, used by `readIconBytesOnce` and exported for tests.

- [ ] **Step 1: Write failing tests**

```js
test('responseOutcome reads 200, follows redirects and reports status only on request', () => {
  assert.equal(responseOutcome(200, undefined, 'https://a.example/x', {}), 'read');
  assert.deepEqual(responseOutcome(302, '/y', 'https://a.example/x', {}), { redirect: 'https://a.example/y' });
  assert.equal(responseOutcome(404, undefined, 'https://a.example/x', {}), null);
  assert.deepEqual(responseOutcome(404, undefined, 'https://a.example/x', { statusResult: true }), { status: 404 });
  assert.deepEqual(responseOutcome(503, undefined, 'https://a.example/x', { statusResult: true }), { status: 503 });
});
test('readIconBytes keeps its defaults for existing callers', () => {
  // Source check, like the identity test: defaults stay 3000 ms and 5 redirects.
  assert.match(source, /timeoutMs = TIMEOUT_MS/);
  assert.match(source, /maxRedirects = MAX_REDIRECTS/);
});
```

- [ ] **Step 2: Run** `node --test test/unit/favicon-network.test.js` — expect FAIL (`responseOutcome` is not a function).
- [ ] **Step 3: Implement** `responseOutcome` from the existing `redirectSource` + status branch; thread `timeoutMs` into `request.setTimeout`, `maxRedirects` into the loop bound (0 → a redirect returns `null`), `statusResult` into the non-200 branch.
- [ ] **Step 4: Run** `node --test test/unit/favicon-network.test.js test/unit/favicon-sanitizer-cache.test.js test/unit/tabicons.test.js` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "favicon-network: per-call time limit, redirect bound and status result"`

### Task 2: Pure policy for bang icons

**Files:**
- Create: `src/main/bang-icons-policy.js` (no `require('electron')`)
- Modify: `src/renderer/pages/bangs.js` (add `templateHost` to `api`)
- Test: `test/unit/bang-icons-policy.test.js`

**Interfaces:**
- Produces constants: `SERVER_ORIGIN = 'https://blanc.day'`, `FETCH_TIMEOUT_MS = 8000`, `MAX_IN_FLIGHT = 4`, `RETRY_AFTER_MS = 30000`, `MAX_RETRIES_PER_RUN = 2`, `REFRESH_AFTER_MS = 2592000000`, `STORE_CAP = 300`, `VISIBLE_DELAY_MS = 300`.
- Produces: `iconUrl(host) -> string`; `catalogHostSet(catalog) -> Set<string>` (each entry's `entry[3].toLowerCase()`); `customHostSet(customBangs, Bangs) -> Set<string>` (via `Bangs.templateHost`).
- Produces: `storedState(record, now) -> 'missing' | 'fresh' | 'stale'`.
- Produces: `createRunState() -> { canAsk(host, now) -> boolean, started(host), finished(host, outcome, now) }`, `outcome ∈ 'ok' | 'not-found' | 'failed'`; tracks in-flight hosts, not-found hosts, failure count and last attempt.
- Produces: `mayFetch({ host, enabled, setupComplete, privateActive, catalogHosts, customHosts, record, run, now }) -> boolean`.
- Produces record helpers on arrays ordered most recently used first: `putRecord(records, host, icon, now) -> records` (cap `STORE_CAP`), `dropRecord(records, host) -> records`, `touchRecords(records, hosts, now) -> records`.

- [ ] **Step 1: Write failing tests**, one per rule:
  - `mayFetch refuses when bangs are off, before setup, in a private tab, for a non-catalog host and for a custom template host` (five asserts, each flipping one input from an otherwise-true baseline).
  - `mayFetch allows a missing or stale record and refuses a fresh one` (`fetchedAt` = `now - REFRESH_AFTER_MS - 1` is stale; `now - 1000` is fresh).
  - `a 404 rules a host out for the run` (`finished('h','not-found')` → `canAsk` false at any later `now`).
  - `a failure may retry twice, 30 s apart` (fail at 0 → `canAsk(h, 29999)` false, `canAsk(h, 30000)` true; after three failures, false forever).
  - `a host in flight cannot be asked again` (`started('h')` → false until `finished`).
  - `putRecord keeps 300 records, most recent first, replacing an existing host` and `touchRecords moves used hosts to the front`.
  - `templateHost is exported and returns the template's lowercased host`.
- [ ] **Step 2: Run** `node --test test/unit/bang-icons-policy.test.js` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the module with the signatures above; add `templateHost` to the `api` object in `bangs.js`.
- [ ] **Step 4: Run** `node --test test/unit/bang-icons-policy.test.js test/unit/bangs.test.js` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "bang icons: pure request and store policy"`

### Task 3: Sanitizer entry for bytes already read

**Files:**
- Modify: `src/main/favicon-sanitizer.js`
- Test: `test/unit/favicon-sanitizer-cache.test.js`

**Interfaces:**
- Produces: `sanitizeIconBytes(contentType, bytes, signal) -> Promise<string|null>`, the existing `sanitizeFetched` exported under that name (32px PNG data URL accepted by `validIconData`, or null).

- [ ] **Step 1: Write failing test** `sanitizeIconBytes converts PNG bytes to the stored 32px data URL` using the file's existing `pngBytes` fixture: result equals `PNG_DATA`-shaped output (`validIconData` non-null); `sanitizeIconBytes('image/png', null)` is null.
- [ ] **Step 2: Run** `node --test test/unit/favicon-sanitizer-cache.test.js` — expect FAIL.
- [ ] **Step 3: Export** it.
- [ ] **Step 4: Run** the same — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "favicon-sanitizer: export the bytes-to-PNG step"`

### Task 4: Bang icon service

**Files:**
- Create: `src/main/bang-icons.js`
- Test: `test/unit/bang-icons.test.js`

**Interfaces:**
- Consumes: Task 1 `readIconBytes`, Task 2 policy, Task 3 `sanitizeIconBytes`.
- Produces: `createBangIcons({ store, readIconBytes, sanitizeIconBytes, catalogHosts, now = Date.now }) -> service`, where `store` is `{ data: { records }, update(fn) }` (main passes `new JsonStore('bang-icons', { records: [] })`, device scope).
- `service.held(host) -> { icon: string, stale: boolean } | null` (from the store).
- `service.request(hosts, ctx)`; `ctx = { enabled, setupComplete, privateActive, customHosts }`. For each host, `mayFetch` with the run state; queue at most `MAX_IN_FLIGHT` concurrent fetches of `iconUrl(host)` with `{ timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: 0, statusResult: true }`. Outcomes: bytes → sanitize → `putRecord` → emit `(host, icon)`; `{status: 404|410}` → `dropRecord` → emit `(host, null)` → `'not-found'`; anything else (null, other status, sanitize null) → `'failed'`, store untouched. Private requests write nothing (they never fetch).
- `service.touch(hosts)` (LRU on display), `service.clear()` (empties records and invalidates in-flight results), `service.onChange(fn) -> unsubscribe`.
- `service.setFetcherForTest(fn)` and `service.requestedHosts()`, used only by the test hook.

- [ ] **Step 1: Write failing tests** with a fake store and fake reader:
  - `held returns a stored icon and marks it stale after 30 days`.
  - `request fetches the server URL with the endpoint options` (asserts URL `https://blanc.day/bang-icons/www.youtube.com` and options object).
  - `a fetched icon is stored and emitted once`.
  - `a host already in flight is not fetched twice` (two `request` calls before resolve → one reader call).
  - `no more than four fetches run at once` (six hosts, reader never resolves → 4 calls).
  - `request rechecks private per call` (`privateActive: true` → no reader call; same host with `false` → one call).
  - `a refresh 404 drops the stored copy and emits null`.
  - `a refresh failure keeps the stored copy`.
  - `a fetch finishing after clear is discarded` (clear while pending → after resolve, records empty, no emit).
- [ ] **Step 2: Run** `node --test test/unit/bang-icons.test.js` — expect FAIL.
- [ ] **Step 3: Implement** the service; generation counter for `clear()`.
- [ ] **Step 4: Run** `node --test test/unit/bang-icons.test.js test/unit/bang-icons-policy.test.js` — expect PASS.
- [ ] **Step 5: Commit** `git commit -m "bang icons: main-process store and request queue"`

### Task 5: Main wiring, bridge and contract

**Files:**
- Modify: `src/main/main.js` (service creation near `bangResolver`, `chrome:bang-icons` handler beside `chrome:bangs` (~line 8500), `bang-icons:changed` broadcast beside `broadcastBangsChanged` (~line 7858), the three `settings.clearRecentBangs()` call sites (~8498, ~10775 and `src/main/test-hook.js` ~3451))
- Modify: `src/main/history.js` (export `siteIcon(key) -> string|null` from `siteIconMap`)
- Modify: `src/main/preload.js` (`bangIcons(hosts)`, `onBangIconsChanged(cb)`)
- Modify: `browser-api/contract.json`, `browser-api/generated/vectors.json` (built)
- Modify: `src/main/test-hook.js` (`stubBangIconServer(map)`, `bangIconRequests()`, `bangIconStore()`)
- Test: `test/unit/bang-icons-main.test.js` (source checks, as other main tests do), `npm run browser-api:check`

**Interfaces:**
- Consumes: Task 4 service.
- Produces IPC `chrome:bang-icons` (invoke, `hosts: string[]`, at most 40 strings, each ≤ 253 chars, lowercased) → `{ [host]: string }`: for each host, `heldVisitIcon(host)` (history `siteIcon(topSiteKey('https://' + host))`, then the first Favorite with that key and a favicon, then a live non-private tab of the current profile with that key, mirroring the `topSites` merge at ~10845) else `service.held(host)?.icon`. Then `service.touch` the hosts answered from the store, and `service.request` the hosts with no visit icon, with `ctx` built in main: `enabled: settings.getSettings().bangsEnabled`, `setupComplete: settings.isFirstRunComplete()`, `privateActive: tabs.get(rt().activeTabId)?.private === true`, `customHosts: customHostSet(settings.getSettings().customBangs, Bangs)`.
- Produces push `bang-icons:changed` `{ host: string, icon: string|null }` to every live overlay view.
- Produces `clearRecentBangsAndIcons()` in main: `settings.clearRecentBangs(); bangIcons.clear();`, replacing the two `main.js` call sites. `test-hook.js` receives the service through its install options and calls `bangIcons.clear()` beside its own `settings.clearRecentBangs()`.
- Contract types: `BangIconMap` (object, string → PNG data URL), `BangIconChange` (`{host, icon}`); members `bangIcons` (invoke, group `search`) and `onBangIconsChanged` (event).
- Test hook (test mode only): `stubBangIconServer({ [host]: 'png' | 'not-found' | 'fail' })` swaps the service fetcher; `bangIconRequests()` returns hosts asked, in order; `bangIconStore()` returns stored hosts.

- [ ] **Step 1: Write failing source tests**: `chrome:bang-icons decides private from main's tab model` (handler body contains `rt().activeTabId` and `.private`), `every recent-bangs clear also clears bang icons` (in `main.js`, `settings.clearRecentBangs()` appears only inside `clearRecentBangsAndIcons`), `the bang icon store is device scope and never synced` (`'bang-icons'` not in `SYNCED_KEYS`, JsonStore call has no `scope: 'profile'`).
- [ ] **Step 2: Run** `node --test test/unit/bang-icons-main.test.js` — expect FAIL.
- [ ] **Step 3: Implement** the wiring, preload members and contract entries.
- [ ] **Step 4: Run** `npm run browser-api:build`, then `npm run browser-api:check`, `npm run audit-inventory:write`, `npm run audit-inventory:check`, `node --test test/unit/bang-icons-main.test.js test/unit/history*.test.js` — expect PASS; review the vectors diff.
- [ ] **Step 5: Commit** `git commit -m "bang icons: chrome IPC, push event and history clear"`

### Task 6: Icons on the overlay's bang rows

**Files:**
- Modify: `src/renderer/overlay.js` (`bangResults` hint gains `domain` and `custom`; `bangRow`, `bangPickRow`; new `bangIconHost`, `paintBangIcon`, visibility batching; subscription in setup near ~3138)
- Modify: `src/renderer/styles.css` only if the leading `.favicon` slot needs spacing inside bang rows (no inline styles beyond the existing `setFavicon` background image)
- Test: `test/unit/bangs-overlay.test.js`

**Interfaces:**
- Consumes: `window.browserAPI.bangIcons(hosts)` and `onBangIconsChanged(cb)` (Task 5).
- Hint result gains `domain` (from `Bangs.findBang(code, BangsCatalog, bangsState.custom)`) and `custom`.
- Each bang row starts with a `span` passed to `setFavicon(span, { url: 'https://' + domain, favicon })`, carrying `data-bang-host` (lowercased domain) and `aria-hidden="true"`. `favicon` comes from the overlay's `bangIconCache` (`Map<host, string>`), filled from invoke answers and push events; a push with `icon: null` deletes the entry. A change repaints matching `[data-bang-host]` rows in place without `renderList()`.
- Visibility: one `IntersectionObserver` with root `islandList`; a host whose row stays intersecting `VISIBLE_DELAY_MS` (300) is added to a batch flushed on the next animation frame as one `bangIcons` call; rows removed before 300 ms cancel their timer. Hosts already in `bangIconCache` are still sent (so main can refresh stale copies) but at most once per overlay open.

- [ ] **Step 1: Write failing tests** (lifted functions, per the file's pattern): `the bang hint carries the site's domain and custom flag`; `bang rows start with an aria-hidden favicon tagged with the host`; `bang icon requests wait for rows to stay on screen` (fake observer + fake timers: a row removed at 299 ms sends nothing; one kept to 300 ms sends one batch); `a pushed null icon falls back to the letter`. Each lifted function asserts it was found (lifted tests fail open otherwise).
- [ ] **Step 2: Run** `node --test test/unit/bangs-overlay.test.js` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test test/unit/bangs-overlay.test.js` and `npm run lint` — expect PASS. Relaunch `npm start` (chrome documents load once) and check by eye: bare `!`, `!yt`, a private tab, a custom bang.
- [ ] **Step 5: Commit** `git commit -m "overlay: site icons on bang rows"`

### Task 7: Acceptance scenarios and platform spec

**Files:**
- Modify: `spec/acceptance/island-and-commands.feature` (F47-10 to F47-13)
- Modify: `test/desktop/steps/bangs.steps.js`
- Modify: `spec/features.md` (F47 section: an **Icons** bullet and the new test files in its test list), `spec/parity-matrix.md` if it lists F47 sub-behaviors

**Interfaces:**
- Consumes: Task 5 test hooks.

- [ ] **Step 1: Write the scenarios:**
  - `@F47-10` Picker rows show icons from Blanc's server, each site asked once: stub all popular hosts `png`; type `!`; every Popular row shows an icon; close and reopen; `bangIconRequests()` has each host once.
  - `@F47-11` A private tab never asks the server: from a private tab type `!`; requests empty; rows show letters.
  - `@F47-12` A custom bang is never asked for: add custom bang `!mine` → `https://intranet.example/?q=%s`; type `!mine`; requests empty.
  - `@F47-13` Clearing history clears bang icons: after F47-10's state, clear history; `bangIconStore()` empty; type `!` again; each host asked again.
- [ ] **Step 2: Run** `npm run test:acceptance:dry` — expect undefined steps; then bind the steps.
- [ ] **Step 3: Run** `npm run test:acceptance:desktop -- --tags @F47` — expect PASS. Compare any unrelated failure against `main` before assuming it's new.
- [ ] **Step 4: Update** the F47 text in `spec/features.md` with the spec's platform-neutral contract (order of sources; catalog hosts only; never private, never custom, nothing before setup; device store cleared with recent bangs).
- [ ] **Step 5: Run** `npm run test:unit`, `npm run substrate:check`, `npm run lint` — expect PASS. **Commit** `git commit -m "F47: acceptance scenarios and spec for bang row icons"`

### Task 8: Before and after the release (owner items, then a website-only PR)

Not part of the app PR.

- [ ] **Before the release:** the owner confirms in the Cloudflare console that the rate rule on `blanc.day/bang-icons/*` lets one IP make about 30 requests within a few seconds (a first bare `!` on a new profile) without a block. Code can't check this.

The rest happens only after a public release contains Tasks 1–7.

**Files:**
- Modify: `site/src/pages/privacy.astro` (Browsing the web with Blanc → **Favicons**, and its *Last updated* date)
- Modify: `docs/marketing-claims.md` (Bangs entry)

- [ ] **Step 1:** Add the privacy sentence the spec describes: bang rows in the ⌘L panel can ask Blanc's icon server at blanc.day for a bang site's icon when the app doesn't already hold one, and refresh a kept icon after about 30 days; the server sees the IP address and that site's name and keeps nothing about the person; the app keeps only the PNG on the device, clears it with history in any profile, and never asks from private tabs, for custom bangs, or before setup is saved.
- [ ] **Step 2:** Add the Bangs qualification from that release's version on: row icons can come from Blanc's icon server; never call bangs fully offline.
- [ ] **Step 3:** Run `node --test test/unit/public-truth.test.js test/unit/security-controls.test.js test/unit/site-*.test.js`; open the PR; deploy only with the owner's go-ahead.
