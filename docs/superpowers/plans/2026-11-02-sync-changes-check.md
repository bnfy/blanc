# Sync "what changed" check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Another device's change to Spaces, Favorites, settings, sent or recently closed tabs reaches a device with Blanc open in about 15 s, with fewer requests than today.

**Architecture:** The sync Worker's per-account Durable Object (`AccountQuota`) becomes the source for fixed-store reads, conflict checks and a new versions list (`GET /v1/versions/<accountId>`), while KV stays written for rollback. Desktop and iPhone remember each fixed store's version, poll the versions list every 15 s while in front, and download only stores that moved; a 5-minute full pass and a 1-minute retry pass remain as safety nets, and any failure falls back to today's 1-minute pass.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite) + KV, wrangler 4.144.0 test harness; Electron main process (Node, `node --test`); Swift/XCTest for Blanc for iPhone.

**Spec:** `docs/superpowers/specs/2026-11-02-sync-changes-check-design.md` (approved by the owner 2026-11-02; decision 1, reads from the Durable Object, decided yes).

**Shape:** three parts, each its own PR, in this order. Part A (Worker) ships first and alone; the owner deploys it. Part B (desktop) starts after [#1293](https://github.com/bnfy/blanc/pull/1293) merges, because it builds on that PR's `noGet` queue flag. Part C (iPhone) can start once Part A is merged, in parallel with Part B, and shares Part B's Task B1 vectors.

## Global Constraints

- Fixed stores, exactly: `bookmarks`, `settings`, `session`, `icons`, `sends`, `closed`, `shared`, `spaces`. Space blobs (`space-<32 hex>`) are never listed by the versions endpoint.
- Response shape: `{"v":1,"stores":{<8 fixed stores>: "<version>" | null}}`, or `{"v":1,"stores":null}` when the account has no ledger. Reading never creates a ledger.
- KV is still written on every fixed-store PUT (rollback must lose nothing).
- Throttles on the new endpoint: per-IP (`IP_RATE_LIMIT`, 120/min) first, then per-account (`RATE_LIMIT`, 30/min), the same counters as a GET.
- Client intervals: check every 15 s while in front (desktop: a Blanc window focused; otherwise every 60 s; iPhone: scene active and Spaces switch on); full pass every 5 min and on launch, sync turned on, wake; retry pass every 1 min; `session`/`icons` fetched at most once per 60 s; check retried 10 min after a fallback.
- Class R: at most 5 Space re-reads per full pass, continuing from the R item cursor.
- The scheduler's default answers and the shared scheduler vectors must not change.
- Older Worker (`404 not found` on the endpoint), `stores:null`, 5xx, network error or unparsable body → today's 1-minute full pass. `429` → today's backoff, checks pause until the window recovers.
- No deploy, merge or release without the owner's explicit yes. US spelling, plain language.

## Review Focus

- **A stale KV read on the writer's own Cloudflare location** must not be served after a PUT: a GET right after a PUT returns the new value even when KV still returns the old one (Task A1).
- **Two devices saving the same fixed store at once** must not lose either write: a PUT whose `ifVersion` matches stale KV but not the object's copy gets 409 (Task A1).
- **An account written only before this deploy** (KV-only fixed stores, no object copies) must still read, write and list versions correctly, copying each store into the object once (Tasks A1, A2).
- **The check racing a write**, where the GET returns a version other than the one the check named, must fetch that store again at the next check, not loop or give up (Tasks B1, B4, C2).
- **A device whose window is full** must skip the check rather than queue it, and must not use the Choose Spaces sheet's reserved request (Tasks B3, C5).

---

## Part A: Worker (one PR)

### Task A1: Fixed stores are read and compared in the Durable Object

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js` (`handleGet`, `readBlob`, `handlePut`, `AccountQuota.handle` paths `/read` and `/write`)
- Modify: `test/support/sync-quota.cjs` (`blobView`: `locate`/`entries`/`delete` also cover the object's `fixed:<store>` copies, so a test that loses a fixed store loses both)
- Test: `cloudflare/sync-worker/test/runtime.test.mjs`, `test/unit/sync-worker-fixed-reads.test.js` (new, against `test/desktop/support/sync-fixture.js`)

**Interfaces:**
- Produces: object storage key `fixed:<store>` holding the stored JSON string `{"version","blob"}` for each fixed store; object `/read` accepts fixed stores and returns `{record}`; object `/write` for a fixed store takes `{accountId, store, stored, ifVersion}` and answers `409 {error:'conflict', version}` on mismatch.
- Produces: `async fixedRecord(store) -> record|null` on `AccountQuota`: the object's copy, or, when absent and a ledger exists, the KV value copied into `fixed:<store>` (exactly once). With no ledger it reads KV without copying.

- [ ] **Step 1: Write the failing tests** in `test/unit/sync-worker-fixed-reads.test.js`:
  - `a GET right after a PUT returns the new value even when KV is stale`. Inject `{type:'stale', store:'settings'}` after a first PUT, PUT again, then GET → `version` equals the second PUT's.
  - `a PUT whose ifVersion matches only stale KV is refused`. Device A PUTs v1, and a stale KV still shows v0 for B. B PUTs with `ifVersion: v0` → 409 with `version: v1`.
  - `a KV-only fixed store is copied into the object once`. Seed `blob:<acct>:bookmarks` in fixture KV with a ledger present, GET twice → both 200, and exactly one KV read of that key.
  - `an unknown account's GET creates no object storage`. A GET of `settings` for a fresh account → 404, and `quotaStates` holds no ledger.
  - `KV keeps every fixed-store value`. After 3 PUTs, the KV record equals the last PUT.
- [ ] **Step 2: Run it to see them fail.** `node --test test/unit/sync-worker-fixed-reads.test.js`. Expected: the stale and conflict cases FAIL.
- [ ] **Step 3: Implement.** `handleGet` for a fixed store calls the object's `/read` when `env.ACCOUNT_QUOTA` is bound (else KV as today). `handlePut` skips its KV `ifVersion` read when the object is bound and passes `ifVersion` to `/write`. In `/write` for a fixed store, compare against `fixedRecord(store)`, then transactionally put `fixed:<store>`, and only then write KV. Leave the ledger and quota untouched for fixed stores (their reservation is permanent).
- [ ] **Step 4: Add a runtime case** to `runtime.test.mjs`: `fixed stores read from the object survive eviction`. PUT `settings`, `evictDurableObject`, GET → same version.
- [ ] **Step 5: Run both.** `node --test test/unit/sync-worker-*.test.js test/unit/sync-*.test.js` and `npm --prefix cloudflare/sync-worker run test:runtime`. Expected: PASS, including the existing `sync-worker-atomic-spaces` and `sync-worker-backfill` tests.
- [ ] **Step 6: Commit** `Sync Worker: read and compare fixed stores in the account object`.

### Task A2: `GET /v1/versions/<accountId>`

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js` (route in `fetch`, `handleVersions`, object path `/versions`)
- Modify: `cloudflare/sync-worker/README.md` (endpoint, response, throttles, rollback note), `docs/superpowers/specs/2026-10-05-sync-storage-budget-design.md` (a dated note that fixed stores now also live in the object)
- Test: `test/unit/sync-worker-versions.test.js` (new), `cloudflare/sync-worker/test/runtime.test.mjs`

**Interfaces:**
- Consumes: `fixedRecord(store)` from Task A1.
- Produces: `GET /v1/versions/<64 hex>` → 200 `{"v":1,"stores":{…}|null}`; `429 {error:'rate-limited'}`; any other method → 405.

- [ ] **Step 1: Write the failing tests:**
  - `versions name every fixed store and nothing else`. After PUTs of `settings` and `spaces` plus one `space-…` blob → `Object.keys(stores).sort()` equals the 8 fixed names, `stores.settings` equals the PUT's version, `stores.bookmarks === null`, and no key starts with `space-`.
  - `an unknown account gets stores:null and no ledger`.
  - `a version moves on every PUT and stays put otherwise`.
  - `the check counts against both throttles`. 30 checks in a minute → the 31st is 429. The per-IP limit applies first.
  - `a KV-only store is listed from its KV version and copied once` (reuses A1's seeding).
  - `delete-account empties the list` → `stores:null`.
- [ ] **Step 2: Run it to see them fail.** `node --test test/unit/sync-worker-versions.test.js`. Expected: 404 on the route.
- [ ] **Step 3: Implement** the route before the `/v1/blob` match; call `ipRateLimited`, then `rateLimited`, then the object's `/versions`. With no ledger it answers `{v:1,stores:null}`, otherwise each store from `fixedRecord`. It never calls `bootstrap`.
- [ ] **Step 4: Runtime case** `versions survive eviction and match GET versions`.
- [ ] **Step 5: Run** the Worker and sync unit tests and `test:runtime`. Expected: PASS. Then `npm run lint`.
- [ ] **Step 6: Commit** `Sync Worker: list fixed-store versions for a cheap change check`, then open the Part A PR stating that deployment is the owner's step and that current clients are unaffected.

---

## Part B: Desktop (one PR, after #1293 merges)

### Task B1: The pure "what to fetch" rule, with shared vectors

**Files:**
- Create: `src/main/sync-changes.js` (no `require('electron')`)
- Modify: `scripts/build-ios-sync-vectors.cjs` (a `changes` section in `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json`)
- Test: `test/unit/sync-changes.test.js`

**Interfaces:**
- Produces: `FIXED_STORES` (the 8 names, in the order above); `changedStores({named, seen, now, lastOpenTabsFetch}) -> {fetch: string[], deferred: string[]}`. `named`/`seen` are `{[store]: string|null}`. A store is fetched when `named[store] !== seen[store]`. `session` and `icons` go to `deferred` instead when `now - lastOpenTabsFetch < 60000`. A `named` of `null` means "doesn't exist": fetch only if `seen` isn't null. `confirmFetched({named, fetchedVersion, store}) -> boolean`: true when the fetched version equals the named one, otherwise the store stays changed.
- Produces: `CHECK_MS = 15000`, `BACKGROUND_CHECK_MS = 60000`, `FULL_PASS_MS = 300000`, `RETRY_PASS_MS = 60000`, `CHECK_RETRY_AFTER_MS = 600000`, `OPEN_TABS_MS = 60000`, `R_PER_PASS = 5`.

- [ ] **Step 1: Write the failing tests:** `unchanged stores are not fetched`; `a moved store is fetched`; `a store that appeared or vanished is fetched`; `open tabs wait for their minute` (`session` moved at `now - lastOpenTabsFetch = 20000` → in `deferred`; at `61000` → in `fetch`); `a raced read stays changed` (`confirmFetched` false when the versions differ).
- [ ] **Step 2: Run it to see them fail.** `node --test test/unit/sync-changes.test.js`. Expected: module not found.
- [ ] **Step 3: Implement** both functions and the constants.
- [ ] **Step 4: Add the vectors.** About 8 cases from the tests above go into the vectors script under `changes`. Run `npm run ios:sync-vectors:build`, then `npm run ios:sync-vectors:check`. Expected: the check passes and the diff adds only `changes`.
- [ ] **Step 5: Commit** `Sync: the rule for which stores a change check fetches`.

### Task B2: Remember each fixed store's version

**Files:**
- Modify: `src/main/sync.js` (`syncOne`: record `version` after a 200 GET and after a successful PUT's `{version}`; account switch and `disable()` clear it)
- Test: `test/unit/sync-seen-versions.test.js` (new, using `test/unit/support/sync-device.js` and the fixture)

**Interfaces:**
- Produces: `sync.json` field `seenVersions: {accountId, stores: {[store]: string|null}}`; `seenVersions()` returns the `stores` map for the current account, or `{}`.

- [ ] **Step 1: Write the failing tests:** `a GET and a PUT record the store's version`; `a missing store records null`; `another account or sync turned off starts empty`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** in `syncOne` (fixed stores only; Space blobs keep their own `rev`).
- [ ] **Step 4: Run** `node --test test/unit/sync*.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `Sync: remember the version of each fixed store`.

### Task B3: The check request in the queue

**Files:**
- Modify: `src/main/sync-request-queue.js` (an op flag `skipIfBusy`), `src/main/sync.js` (`checkVersions()`)
- Test: `test/unit/sync-request-queue.test.js`, `test/unit/sync-check.test.js` (new)

**Interfaces:**
- Consumes: `seenVersions()` (B2), `changedStores` (B1).
- Produces: queue op `{class:'C', item:'versions', skipIfBusy:true, run}`. It runs before rotation work and is charged normally. If `canRequest({reserve:true})` is false it resolves `{outcome:{skipped:true}}` without running.
- Produces: `async checkVersions() -> {supported:boolean, named?:object}`. GET `/v1/versions/<accountId>`. `404` (body `not found`), `stores:null`, 5xx, a network error or a bad body → `{supported:false}`. A 429 throws `rate-limited`, as for any request.

- [ ] **Step 1: Write the failing tests:** `a check runs ahead of waiting rotation work`; `a check on a full window is skipped, not queued` (9 recorded → `skipped:true`, nothing waits); `a check never uses the reserved request`; `an older Worker reads as unsupported` (fixture endpoint off); `stores:null reads as unsupported`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Give `sync-fixture.js` an option `versions:false` that answers that path `404 not found`, to act as an older Worker.
- [ ] **Step 4: Run** the queue, scheduler and sync tests. Expected: PASS, and `node scripts/build-ios-sync-vectors.cjs --check` reports the scheduler vectors unchanged.
- [ ] **Step 5: Commit** `Sync: a versions check that never waits on the window`.

### Task B4: Check often, fetch what changed, keep the safety nets

**Files:**
- Modify: `src/main/sync.js` (`init()` timers, `refreshSession`, `syncNow` class R cap, a new `setForeground(focused)`), `src/main/main.js` (call `sync.setForeground` on `browser-window-focus`/`browser-window-blur`)
- Test: `test/unit/sync-check-cadence.test.js` (new, with virtual clocks from `test/unit/support/sync-device.js`), `test/unit/sync-spaces-integration.test.js`
- Modify: `docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md` (a dated amendment: the check, the 5-minute pass, class R capped at 5 per pass) and `spec/` parity notes for F57 if they state the 1-minute cadence

**Interfaces:**
- Consumes: B1–B3.
- Produces: `setForeground(focused: boolean)`. The timers: a check every `CHECK_MS` when focused and `BACKGROUND_CHECK_MS` otherwise. When the check is supported, a full pass every `FULL_PASS_MS` and a retry pass every `RETRY_PASS_MS`. When it isn't, today's 60 s full pass, with the check tried again after `CHECK_RETRY_AFTER_MS`. The retry pass enqueues only Space blobs with a pending set or `failedAt`, the `spaces` index when it has a pending receipt, and fixed stores whose last upload failed.

- [ ] **Step 1: Write the failing tests:**
  - `a Space made on B reaches focused A within one check` (two devices, virtual clock: A has the Space within 15 s).
  - `nothing changed downloads nothing but the check` (one minute focused → only `GET versions` requests).
  - `open tabs arrive within a minute, not every check`.
  - `a pending upload still retries every minute`.
  - `an older Worker keeps the minute pass` (endpoint off → a full pass each 60 s).
  - `a full pass re-reads at most five Space blobs and continues next time` (12 Spaces → 5, 5, 2 class R GETs over three passes).
  - `a raced read is fetched again at the next check` (stale KV injected on B's read).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Replace the 60 s `setInterval` with one ticker that chooses check, retry or full pass. `refreshSession` starts with `checkVersions()` and falls back to its current fixed downloads when unsupported. `syncNow(names)` is the fetch path for changed stores. Cap class R enqueues at `R_PER_PASS`, continuing from the scheduler's `R` cursor.
- [ ] **Step 4: Run** the whole unit suite (`npm run test:unit`), `npm run lint` and `npm run audit-inventory:write` if `sync.js` is a boundary file. Expected: PASS, no unrelated diffs.
- [ ] **Step 5: Add the acceptance scenario** `F57-24` to `spec/acceptance/` with its desktop steps: a Space made on device B appears on device A within 20 s with the fixture's endpoint on, and within 70 s with it off. Run it alone through a scratch cucumber config whose `paths` lists only that feature (passing a feature path to `-c test/desktop/cucumber.mjs` still runs the whole suite), then `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F57"`. Expected: all pass.
- [ ] **Step 6: Commit** `Sync: check for changes every 15 seconds and fetch only what moved`, then open the Part B PR.

---

## Part C: iPhone (one PR, after Part A merges)

### Task C1: Versions client, remembered versions and the shared rule

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncWorkerClient.swift` (`func versions(_ accountId: String) async throws -> [String: String?]?`, where `nil` means unsupported), `ios/Blanc/Blanc/Sync/SyncStateStore.swift` (`seenVersions: [String: String?]` with `seenAccountId`)
- Create: `ios/Blanc/Blanc/Sync/SyncChanges.swift` (Swift port of B1's `changedStores` and `confirmFetched`, with the same constants)
- Test: `ios/Blanc/BlancTests/Sync/SyncChangesTests.swift` (replays the `changes` vectors from `sync-vectors.json`), `SyncWorkerClientTests` cases for 200, `stores:null`, 404 `not found`, 429 and a bad body

- [ ] **Step 1: Write the failing tests** (the vectors replay and the client cases above).
- [ ] **Step 2: Run them to see them fail.** `xcodebuild test -scheme Blanc -only-testing:BlancTests/SyncChangesTests` on an iPhone simulator.
- [ ] **Step 3: Implement.** Record the version on every fixed-store GET and PUT, and clear it on account change and sign-out.
- [ ] **Step 4: Run** the BlancTests Sync group. Expected: PASS.
- [ ] **Step 5: Commit** `iOS sync: versions client and the shared change rule`.

### Task C2: `syncFixed` fetches only the stores that changed

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncEngine.swift` (`readFixed`, `syncFixed`: an `only: Set<SyncStore>?` parameter, `nil` meaning all)
- Test: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`

**Interfaces:**
- Produces: `syncFixed(_ snap: AccountSnapshot, consent: Bool, only: Set<SyncStore>? = nil)`. With `only`, it reads just those stores. It applies the settings-missing rule (`accountGone`) only when it actually read `settings`. It keeps the order of its dependent writes: the session upload before the sidecar binding, and presence into sends.

- [ ] **Step 1: Write the failing tests:**
  - `only settings reads one store`;
  - `a missing settings ends the account only when settings was read`;
  - `a changed session still updates the sidecar binding after its upload`;
  - `a raced read stays changed for the next check`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the Sync tests. Expected: PASS, including the existing full-pass tests (`only: nil`).
- [ ] **Step 5: Commit** `iOS sync: fetch only the fixed stores that changed`.

### Task C3: The iPhone's cadence

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncRequestQueue.swift` (a check op that runs before rotation work and is skipped when the window is full), `ios/Blanc/Blanc/Sync/SyncEngine.swift` (`startForegroundChecks`, `appDidBecomeActive`, the class R cap of 5 per pass)
- Test: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`, `SyncRequestQueueTests.swift`

**Interfaces:**
- Consumes: C1, C2.
- Produces: with the Spaces switch on and the scene active: a check every 15 s, a retry pass every 60 s and a full pass every 5 minutes. When the check is unsupported, today's 60 s full pass, with the check tried again after 10 minutes. With the switch off, no periodic requests in front, as today. `appDidBecomeActive` checks first.

- [ ] **Step 1: Write the failing tests:**
  - `foreground checks every 15 s and fetches only what moved`;
  - `a check on a full window is skipped`;
  - `no checks with the Spaces switch off`;
  - `an older Worker keeps the minute pass`;
  - `a full pass re-reads at most five Space blobs`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Use the existing `foregroundWait` seam for the timers.
- [ ] **Step 4: Run** all BlancTests. Expected: PASS.
- [ ] **Step 5: Hand check on two devices.** Run a packaged Mac build of Part B (`npm run dist:dir`) and a Debug build installed on the iPhone, both against the deployed Worker. A new Space on the Mac should appear on the open iPhone in under about 20 s. Record the result in the PR.
- [ ] **Step 6: Commit** `iOS sync: check for changes every 15 seconds while in front`, then open the Part C PR.
