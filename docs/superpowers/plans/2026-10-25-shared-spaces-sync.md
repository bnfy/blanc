# M16 Shared Spaces Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship desktop Spaces sync as a public feature release: a per-device switch that puts a device's Spaces into one end-to-end-encrypted library on the existing sync Worker, with groups, pins, names and order the same on every device that has it on, removals applied everywhere through a synced Recently closed, and the page in front of the person never changed under them.

**Architecture:**
- The Worker gains one route pattern (`space-<32 hex>`) and three fixed stores (`spaces`, `closed`, `shared`); account DELETE lists by prefix. Nothing else in it changes.
- A pure model, `src/main/shared-spaces-model.js`, holds the protocol: per-field records with final tombstones, `mid` positions with record tags, acknowledgement by the full merge rule, the content revision, the byte budget on the encrypted blob and its admission rule, the **upload pipeline** (one ordered function from fetched blob and local state to the blob that is PUT), the sliding-window round-robin scheduler, and the recovery-copy decision. It runs under `node --test` and generates the shared iOS vectors.
- `src/main/shared-spaces.js` and `src/main/synced-closed.js` are the stores (`JsonStore`, `rebind`, export/merge/equals), added to `sync.js`'s `STORES` table the way `sends` was. The loop's "every store each pass" becomes a **request queue** fed by the scheduler, with explicit completion and cancellation semantics for every existing caller of `syncNow`.
- `main.js` gains the record↔window adapter: displayed baselines, accepted sets and deferred queues per window, applied through `createTab`/`closeTab`/navigation, plus the switch, its sheet, the sync mark and status lines, the pairing question and the recovery Space.
- A **sync fixture** that runs the real Worker handler in-process behind a local HTTP server exists from PR B on, so every PR after A carries integration evidence against the routes a real Worker serves.

**Tech Stack:** Electron main, plain JS, `node --test`, Cucumber + Playwright-Electron, Cloudflare Worker (KV), Swift vectors for the iOS port.

**Spec:** `docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md` (owner-decided D1–D9 in §14; the contract is `2026-10-24-ios-v1-companion-release-design.md` §4, §5, §7). Every section number below refers to the spec.

## Global Constraints

- **Order of deployment:** the Worker (PR A) is deployed by the owner before any client that offers the switch ships (§9). A client meeting an older Worker shows "Spaces sync isn't available yet" in Settings; **Spaces sync is unavailable, and Favorites, settings, Tab Sync and Send to device continue exactly as today.** Until PR D removes it, the switch is reachable only in unpackaged builds (`!app.isPackaged`), so no public build can offer it before the acceptance evidence exists.
- **Nothing is ever trimmed from a record another device wrote** (§5). Over budget refuses the sync of a change, never the change, always says so with accessible text, and **the last publishable state of the Space keeps syncing** (Task 7).
- **Tombstones are final** (§3.5): no code path writes `deleted: false` after `true`; reopen creates a fresh id. **Resurrection after expiry is possible**; no copy, test or UI text claims otherwise.
- **The displayed baseline is the only thing autosave diffs against** (§4.3). Deferred remote changes never advance it.
- **At most 10 GETs per device in any trailing 60 s** (§6.2), enforced by the request log; the scheduler's queue is the only thing that issues sync GETs for the Spaces stores, and the focus refresh never moves the next-class cursor.
- **Every existing `syncNow` contract survives** (Task 5): the credential/consent generation check, the drain-before-wipe barrier (`disable()` awaits `passSettled`, which now covers queued work), `sendTab`'s own-result reply, and the fixed stores' behaviour against an older Worker.
- Only the Personal profile syncs. Private tabs, splits, `blanc://` and `file://` pages never enter a record.
- Every new English string goes into all six languages in the same PR (`copy:build`, `copy:ack`); `browser-api/contract.json` and `bridges.json` change with any bridge member or payload field; boundary-file edits need `npm run audit-inventory:write`; a new `sync.json` or `settings` key follows `settings-schema/schema.json` and `settings:build`.
- F41's "never sync" line, `spec/parity-matrix.md`, the privacy label and `docs/security-assessment.md` change only in the shipping PR (PR D), never earlier.
- **Release material is prepared before the release, published as shipped only after it.** The release notes (`docs/press/release-notes/vX.Y.0.md`, drawn from `unreleased.md` in the prep PR) and the What's New page (which builds as the one *upcoming* page, undated and `noindex`, until `releases.json` lists the release) are mandatory pre-release gates per CLAUDE.md and must exist before `npm run release` starts. No marketing text, social post, comparison or claims-ledger entry describes the feature as shipped until the release and its evidence exist (`docs/marketing-claims.md`).

## Review Focus

1. A remote navigation of the active tab is deferred, the window keeps showing the old page, and autosave publishes **nothing** for that tab meanwhile (Task 8 test `deferred nav: displayed window diffs to nothing`).
2. A fetched `deleted: false` with a later clock never clears a pending `deleted: true` (Task 1 test `acknowledgement by the full rule`).
3. `mid` is never called with `a ≥ b`: the model asserts it, and constructed concurrent inserts into one gap produce distinct, correctly placed keys (Task 1 tests `concurrent inserts into one gap`, `insert between the two`).
4. **A long-stale replica's absent records never reach an upload, not even through its own pending set** (Task 2 test `recovery records cannot leak into the upload through the pending set`); they go to the recovery Space, which is idempotent and created even with 25 Spaces present (Task 9 tests, Task 11 scenario `kept on this device`).
5. The scheduler never exceeds 10 GETs in any trailing 60 s across a simulated hour, including a restart and a backwards clock jump, and one-request passes with a focus event before each still serve I, S, F, R in turn (Task 5 tests `sliding window`, `one request per pass with focus events`).
6. **Queued work obeys the generation and the drain barrier**: a Space write waiting for the window is cancelled, not run, when the account changes or `disable()` runs, and an account-wide DELETE never races a queued PUT (Task 5 tests `pending PUT then account-wide DELETE`, `account switch while a request waits`).
7. The budget check measures `JSON.stringify(encrypt(...))`: a 400 KiB plaintext is refused and 320 KiB accepted, with the numbers computed by the test (Task 1 test `budget on the encrypted blob`); **over budget, the last publishable state keeps syncing and the unsynced change is retained and retried** (Task 7 tests).
8. Turning the switch off, editing, and turning it on again rejoins without duplicating the library and with the edits' own clocks (Task 11 scenario `rejoin after edits`).
9. The two-Electron scenarios (Task 11) converge through the real Worker handler, not a simulation of it.

---

## PR A: the protocol — Worker, pure model, vectors

### Task 1: Pure model: records, merge, positions, tombstones, acknowledgement, budget

**Files:** `src/main/shared-spaces-model.js` (new), `test/unit/shared-spaces-model.test.js` (new), `scripts/build-ios-sync-vectors.cjs`, `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json`, `test/unit/ios-sync-vectors.test.js`

**Interfaces:**
- `field(v, c, by)`, `mergeField(a, b, name)` (§3.3; `deleted` is true-wins), `mergeRecord`, `mergeBlob(local, remote)`; all pure, symmetric, idempotent.
- `mid(a, b)` exactly as §3.4, throwing if `a ≥ b` (both non-empty); `tagOf(id)` (hex digits → `1`–`g`); `keyFor(a, b, id)`; `validKey(key, id)`; `orderOf(records)` (valid keys by key, invalid after them by id).
- `acknowledged(fetched, pending, name)` ⇔ `mergeField(fetched, pending, name)` equals `fetched` (§3.8).
- `revisionOf(blob)` (§6.1: first 16 hex of SHA-256 over `canonical(blob)`).
- `blobFits(blob, encryptFn)` measuring `JSON.stringify(encryptFn(JSON.stringify(blob)))` against `524288 - 4096`; `liveTabCount`, `LIMITS = { tabsPerSpace: 500, spaces: 25, plaintextGuide: 320 * 1024 }`.
- `expireTombstones(blob, now)` (30 days); `sanitizeBlob`, `sanitizeIndex` (drop bad ids, repair identity fields as `workspaces-model` does, cap URL/title/name).
- Record shapes for Space index entries, groups and tabs with `nav`, `name`, `pinned`, `groupId`, `pos`, `deleted` (§3.1–3.2).

- [ ] Write failing tests:
  - `merge is commutative, associative and idempotent` (random blobs, three-way);
  - `deleted true wins in both orders; no later edit revives`;
  - `a tab in a tombstoned group is ungrouped on every replica` (tab move racing group delete, both orders);
  - `mid examples from §3.4` (`a1`/`a11` → `a10i`, and the rest), `mid on 200,000 random pairs keeps a < m < b and validity`, `mid throws outside its precondition`;
  - `concurrent inserts into one gap` (two records, same neighbours → distinct keys, both between), `insert between the two` (valid), `a key with a wrong tag is unpositioned`;
  - `acknowledgement by the full rule` (equal, older, newer-by-other, tie on `by`, and `deleted: false` with a later clock never clears a pending `true`);
  - `budget on the encrypted blob` (400 KiB refused, 320 KiB accepted, figures computed with `encrypt`), `tombstones count against the budget`;
  - `revision changes on any content change` (including a slow-clock edit and a tombstone expiry) and `is stable for identical content`;
  - `sanitize drops junk ids and caps strings`.
- [ ] Implement the model. No `require('electron')`.
- [ ] Add vector groups to `scripts/build-ios-sync-vectors.cjs`: positions (every §3.4 example, a fixed list of 1,000 random pairs, tags of fixed ids, the constructed collision cases and the invalid-key cases), per-field merge and ties, `deleted` true-wins, acknowledgement, revision, budget. Regenerate `sync-vectors.json`; `test/unit/ios-sync-vectors.test.js` must pass.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 2: Pure model: the upload pipeline (pending set, recovery decision, admission, index publication)

**Files:** `src/main/shared-spaces-model.js`, `test/unit/shared-spaces-model.test.js`, `scripts/build-ios-sync-vectors.cjs` (a `pipeline` vector group), `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json`

**Interfaces:**
- `applyLocalEdits(pending, edits)` → the pending set with the edits added as complete `{v, c, by}` writes (§3.8).
- `recoveryDecision({ localBlob, fetchedBlob, lastMergeAt, now })` → `{ keep: Set<recordId>, recover: Set<recordId> }` (§3.9): records the fetched blob lacks are `recover` when `lastMergeAt` is older than 30 days (or has never been set for a Space that has records locally and remotely), else `keep`.
- **`pushPlan(input)` is the one upload pipeline**, and `shared-spaces.js` calls nothing else to build a PUT. Input: `{ fetchedBlob, fetchedVersion, localBlob, pending, lastMergeAt, now, deviceId, encryptFn, lastPublishable }`. `localBlob` is **every retained local record of the Space** (the store's merged copy, not only the fields in `pending`); `lastMergeAt` is the Space's **pre-fetch** merge stamp, read before this pass's GET and passed in unchanged. Output: `{ upload: { blob, rev } | null, pendingAfter, recover, unsynced: Set<recordId>, mergedBlob, nextLastMergeAt, indexEntry, reason }`. Its stages, in this order and no other:
  1. **Preserve the pre-fetch stamp.** Classification uses the `lastMergeAt` passed in; `nextLastMergeAt = now` is returned for the caller to store only after the merge below succeeds, never before.
  2. **Classify** with `recoveryDecision` over `localBlob` against `fetchedBlob`.
  3. **Exclude recovery records and their pending writes.** Every record in `recover`, and every entry of `pending` that writes a field of such a record (including the `nav`/`pos`/`name` writes that created it), is removed from what follows and returned in `recover`. Nothing in `recover` is in `upload` or `pendingAfter`.
  4. **Merge eligible local state**: `mergedBlob = mergeBlob(fetchedBlob, localBlob minus recover)`, field by field (§3.3).
  5. **Settle acknowledgements**: `pendingAfter = settlePending(pending minus recover, fetchedBlob)` by the full rule (§3.8); the surviving writes are replayed into `mergedBlob`.
  6. **Construct and validate the upload**: `sanitizeBlob`, `expireTombstones`, the `mid` preconditions, the 500-live-tab limit, then **admission** (`admit`, below). A fitting blob is `upload` with `rev = revisionOf(blob)`; `reason` is `null`. When `mergedBlob` equals `fetchedBlob` after replay, `upload` is `null` (nothing to PUT).
  7. **Index publication**: `indexEntry` is the `spaces` entry `{ id, name, rev, ... }` the caller writes **only after the blob PUT succeeds**; until the index PUT succeeds that entry stays in the pending set as an index write and is retried on later passes (§3.6). A blob PUT that fails leaves `pending` as it was before this pass (the caller discards `pendingAfter`).
- `admit({ candidate, lastPublishable, changes, encryptFn })` → `{ blob, unsynced, reason }`: when `candidate` fits it is the blob; otherwise the device's **own** new writes are removed one change at a time, newest first, until the result fits or only `lastPublishable` plus every other device's content remains; the removed writes are `unsynced` (they stay in `pendingAfter`, marked so the row can show its dot) and `reason` names the cause (`full`, `tombstones` when expiring tombstones would make room, `tabs` for the 500 limit). Another device's content is never removed; a blob that arrives already over budget is merged and kept whole.
- `settlePending(pending, fetchedBlob)` → pending minus acknowledged writes.

- [ ] Write failing tests:
  - `pipeline stages run in order` (a recording `encryptFn` and spies show classify → exclude → merge → settle → construct → index entry, and that `nextLastMergeAt` is returned, not applied);
  - `pre-fetch stamp decides classification` (a stamp refreshed during the pass would turn `recover` into `keep`; the pipeline uses the value passed in);
  - `recovery records cannot leak into the upload through the pending set` (a long-stale replica with a pending `nav` write that created a record the fetched blob lacks: the record is in `recover`, absent from `upload` and from `pendingAfter`);
  - `recent replica publishes absent records as new work`; `long-stale replica recovers them`;
  - `retained local records that are not pending still merge` (a field this device never edited but holds from an older merge is carried, never dropped, never re-clocked);
  - `pending-set replay converges` (two devices PUT from the same version; the loser replays and both converge);
  - `the unrecoverable case stays lost` (a write cleared from pending then dropped upstream is not recovered; asserted so the claim stays honest);
  - `resurrection after expiry` (a replica that merged within the window but missed a tombstone brings the record back after 31 days; asserted);
  - `index entry follows the blob` (no `indexEntry` applied when the blob PUT is reported failed; the entry is retried from pending on the next plan; the `rev` matches the uploaded blob);
  - `admission removes only this device's newest writes` (another device's over-budget content stays; the removed writes are `unsynced` and still pending; `reason` is `tombstones` when expiry would make room);
  - `nothing to upload when the merge equals the fetched blob`.
- [ ] Implement. Add the `pipeline` vector group (a fixed fetched blob, local blob, pending set and stamp with the expected `upload`, `pendingAfter`, `recover` and `unsynced`). Run `npm run test:unit`. Expected: PASS. Commit.

### Task 3: The Worker serves per-Space stores

**Files:** `cloudflare/sync-worker/src/index.js`, `cloudflare/sync-worker/README.md`, `docs/superpowers/specs/2026-10-05-sync-storage-budget-design.md` (§7 addendum), `test/unit/sync-worker-limits.test.js`, `test/unit/sync-worker-spaces.test.js` (new)

**Interfaces:**
- Store segment accepts `[a-z]+` or `space-[0-9a-f]{32}`; `STORES` gains `spaces`, `closed`, `shared`. Any other `space-…` spelling (wrong length, uppercase, a missing id) is `404 unknown store`.
- `handleDelete` lists `blob:<accountId>:` by prefix (`listNames`, the trailing colon included so `blob:abc:` never matches account `abcd`) across every listing page and deletes every key, then the `seen:` marker. Orphan Space blobs (no index entry) are included because the listing, not the index, drives it.
- Blob cap (`MAX_BLOB_BYTES` 524,288), request cap, per-account GET limit (30 per fixed minute), per-IP limit, markers and the daily new-account budget are unchanged and apply to the new stores.

- [ ] Write failing tests (the Worker is imported as `sync-worker-limits.test.js` does, with the in-memory KV stand-in given a **page size of 2** so listings span pages):
  - `space-<id> GET/PUT round-trip with versions and 409`;
  - `space-<bad id> is unknown store` (31 and 33 hex digits, uppercase, `space-`, `spaces-<id>`);
  - `spaces, closed and shared are served; other new names stay unknown`;
  - `account DELETE removes every blob across listing pages` (30 Space blobs plus the fixed stores, page size 2);
  - `account DELETE removes orphan Space blobs` (a blob with no index entry);
  - `account DELETE preserves another account's keys` (accounts `abc` and `abcd`, both with Space blobs);
  - `account DELETE removes the activity marker`;
  - `blob cap, request cap and 413 are unchanged for space stores`;
  - `per-account GET limit counts space GETs` (31 GETs across space stores in one minute → 429);
  - `cleanup still lists by prefix and treats space blobs like any blob`.
- [ ] Implement. Document the pattern and the three names in the README's API section, with the "deploy before any client that offers the switch" line and the degrade behaviour (§9).
- [ ] **Recompute the storage cost bound** and record it in the README and as an addendum to the budget design's §7. The budget design assumed 4 stores × 512 KB = 2 MB per account. With 25 Spaces, the index, `closed`, `shared` and the existing 5 stores an account can hold **33 blobs, about 16.5 MiB** at the cap. Record, with the arithmetic shown:
  - the worst case under the existing flood bound (100 new accounts a day × 17.3 MB ≈ 1.7 GB a day; 12-month peak ≈ 630 GB; ≈ $315 a month at the $0.50/GB-month rate the budget design cites, against its $36), and the same at `NEW_ACCOUNT_DAILY_LIMIT` 50 and 25;
  - the expected case from the production listing the budget design reports (42 accounts) and the spec's §5 record sizes (a Space of 500 typical tabs is 150–220 KiB; most Spaces are far smaller), so that the owner sees both numbers;
  - write volume: one PUT per changed Space per pass plus the index, inside the 1 million included writes at the current scale, and the DELETE's listing calls.
  - **The owner decides before deploy** whether to lower `NEW_ACCOUNT_DAILY_LIMIT` (a `wrangler.toml` variable, no code) given the new worst case; the plan does not change the limit itself.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Gate A → B: Worker review and deploy (owner's action)

- [ ] The owner reviews Task 3's tests, the README changes and the recomputed cost bound, and decides on `NEW_ACCOUNT_DAILY_LIMIT`.
- [ ] After PR A merges, the owner runs `wrangler deploy` from `cloudflare/sync-worker` and confirms `GET /v1/blob/<test account>/space-<32 hex>` answers 404 `not found` rather than `unknown store`, and `GET …/space-xyz` still answers `unknown store`.
- [ ] Record the deploy (date, Worker version id) in the release's incident file when it is created.

---

## PR B: desktop stores, the sync loop and the fixture

### Task 4: The `shared-spaces` and `synced-closed` stores

**Files:** `src/main/shared-spaces.js` (new), `src/main/synced-closed.js` (new), `src/main/synced-closed-model.js` (new), `test/unit/shared-spaces-store.test.js`, `test/unit/synced-closed-model.test.js`, `src/main/sync.js` (STORES entries only)

**Interfaces:**
- `shared-spaces.js`: a profile-scoped `JsonStore('shared-spaces', { accountId, index, blobs: {<spaceId>: {blob, rev, mergedAt, lastPublishable}}, pending: {<spaceId>: …}, windows: {<runtimeId>: {displayed, accepted, deferred}}, requestLog: [], nextClass, cursors })`; `rebind(accountId)`; `exportIndex/mergeIndex`, `exportSpace(id)/mergeSpace(id, remote)` (export calls `pushPlan` and nothing else; merge stores `mergedBlob`, `rev`, `nextLastMergeAt` and `lastPublishable` together), `equals`; `hasPublishableContent` (never a presence-only write); `onChanged(fn)`, `onRemoteChanged(fn)`.
- `synced-closed-model.js`: the `sends` shape with `{id, url, title, closedAt, spaceId}` items, 24 h / 25 per device, 30-day entry prune, daily heartbeat, 64 KiB budget, `inbox` of other devices' rows, `dismissed` (§7). `synced-closed.js` mirrors `sends.js`.
- `sync.js`: `STORES` gains `spaces`, `closed`, `shared` as optional entries, and a dynamic kind for `space-<id>` expanded from the merged index. The pass still fetches everything at this task; the scheduler replaces that in Task 5.

- [ ] Write failing tests: `rebind clears another account's data`, `export never creates a store without content`, `export is pushPlan's upload and stores pendingAfter only after the PUT is reported ok`, `mergeSpace keeps the full merged blob, the revision and the merge stamp together`, `synced-closed keeps 25 per device for 24 h and prunes at 30 days`, `own closes are not listed from the synced copy`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 5: The sliding-window scheduler, its request queue, and every caller's contract

**Files:** `src/main/sync-scheduler.js` (new, pure), `test/unit/sync-scheduler.test.js` (new), `src/main/sync.js` (`syncNow` runs its requests through the queue), `test/unit/sync-queue-callers.test.js` (new), existing `test/unit/sync-*.test.js` (must keep passing unchanged)

**Interfaces:**
- `createScheduler({ limit: 10, windowMs: 60000, log, nextClass, cursors, now, monotonic })` with `canRequest()`, `record()`, `next(work)` → `{ class, item }` or null, advancing the item cursor and the next-class cursor after every request (§6.2); `markIndexDue()` for the focus refresh (never moves the cursor); `onRateLimited()` (window 10 → 5, floor 3, five-minute recovery one step per clean minute).
- `work` is `{ I: boolean, S: spaceId[], F: storeName[], R: spaceId[] }` built by `sync.js` from the merged index, pending sets and `rev` differences; 409 retries re-enter as class S items.
- Persistence of `log` (wall-clock), `nextClass` and `cursors` in `shared-spaces.json`; on start, entries younger than 60 s or in the future count as live for 60 s of monotonic time.
- **The request queue and what its callers can rely on.** Every sync request (fixed stores included) is a queued operation with a state `waiting → running → done | cancelled`:
  - **Requested work runs ahead of the rotation.** A pass that names stores (`sendTab(['sends'])`, `refreshSession`, Sync Now, `enable`'s first pass, the heartbeats) enqueues those requests as *requested*; the rotation fills what the window has left. Requested work that finds the window exhausted **waits** for the window to free (the log says exactly when) rather than being refused, so an existing caller sees the same outcome it does today, later.
  - **Completion:** `syncNow(names)` resolves only when every request it enqueued is `done` or `cancelled`, and `passSettled` covers the whole queue, so `disable()`'s drain barrier keeps its meaning. `onOutcome(name, outcome, error)` fires once per request; a cancelled request reports `error = SyncError('cancelled:<reason>')`.
  - **Cancellation reasons**, each a test: `generation` (the account identity or a consent changed: `syncGen` is snapshotted at enqueue, a stale item is cancelled, never run), `suspended` (`disable()` is draining: waiting items are cancelled, running ones finish and are then checked against the generation as today), `disabled`, `consent-off` (the Spaces switch went off before a queued Spaces write ran: the write is cancelled and its pending set kept, dormant), `unavailable` (the Worker answered `404 unknown store` for a Spaces store: every queued Spaces request is cancelled and the Spaces classes leave the rotation until the optional-store retry (`OPTIONAL_MISSING_RETRY_MS`) finds the store).
  - **Status:** the queue exposes `{ waiting, running, windowFreesAt, backoff }` for the Settings status lines ("Sync is busy; retrying", "Checking for changes is slowed by rate limiting").
  - **Fixed stores keep today's semantics.** `bookmarks`, `settings`, `session`, `icons` and `sends` are requested work when a caller names them, class F in the rotation otherwise; `tabSyncStoreReady`, the readiness skip, `ranRequiredStore`, `skippedRequiredSelected`, `lastSyncedAt`/`lastError` stamping and `pendingNames` coalescing are unchanged. Against an older Worker the Spaces stores are `unavailable` and the fixed stores have the whole window.
  - `sendTab`'s contract is unchanged: it waits out the running pass, runs its own requested `sends` pass, hears its own PUT's outcome, and replies `sent`, `unavailable`, `failed` or `invalid`; a request cancelled for any reason is `failed`, and the item is taken back out of this device's entry as today.

- [ ] Write failing tests (scheduler):
  - `sliding window`: over a simulated hour with unlimited work, no trailing 60 s window holds more than 10 requests; the same across a simulated restart and a wall clock that jumps back; two and three simulated devices never exceed 20 and 30 in any fixed minute bucket;
  - `round robin across requests`: with work in every class and one request allowed per pass, 1,000 passes serve I, S, F, R in turn, none starved;
  - `one request per pass with focus events`: a focus event before every pass only marks I as due; R still gets one in four;
  - `empty classes yield their turn`; `409 retry is a class S request`; `backoff lowers the window and recovers`; `class R completes a rotation within the stated bound at each rate`;
  - `requested work runs ahead of the rotation and still counts in the window`.
- [ ] Write failing tests (callers, with the fake `net.fetch` the existing sync tests use):
  - `Send to device with an exhausted window` (ten Spaces GETs in the last minute: the send waits until the window frees, then runs, and replies `sent`; `onOutcome` fired once);
  - `account switch while a request waits` (`enable` with a new passphrase while a Spaces PUT is queued: the PUT is cancelled with `generation`, nothing is PUT under the new account);
  - `disable while a request waits` (`disable()` cancels waiting items with `suspended`, awaits the running one, and resolves; no request runs after it resolves);
  - `pending PUT then account-wide DELETE` (`disable({ wipeRemote: true })` with a Spaces PUT queued and one on the wire: the DELETE is sent only after the wire PUT settles, the queued PUT never runs, and `wipeDecision` still governs credential clearing);
  - `Spaces consent off before a queued write` (the write is cancelled with `consent-off`, its pending set survives, the Space is dormant);
  - `older Worker` (a `404 unknown store` for `spaces`: Favorites, settings, Tab Sync and Send to device complete in the same pass; the Spaces classes leave the rotation; the status is "Spaces sync isn't available yet");
  - `generation checks preserved` (`syncGen` bumps mid-pass strand the running request as today, now also cancelling the queue);
  - `drain-before-wipe barrier preserved` (`sync-wipe-race.test.js`'s scenario with queued Spaces work added, unchanged assertions).
- [ ] Implement; wire `syncNow` to enqueue requested work first and spend what the window allows on the rotation, stopping when the window is empty; the focus refresh calls `markIndexDue`. Every existing `test/unit/sync-*.test.js` passes unchanged.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 6: Capture ↔ record translation and local state

**Files:** `src/main/shared-spaces-adapter.js` (new, pure), `src/main/workspaces-model.js` (`sharedId`, `tabIds`, `sharedLink`, `recoveredFrom` columns), `src/main/main.js` (`workspaceCapture` carries `tabIds`), `test/unit/shared-spaces-adapter.test.js`, `test/unit/workspaces-model.test.js`

**Interfaces:**
- `diffWindow(displayedBaseline, windowState, now, deviceId, ids)` → `{ edits, nextBaseline }` (§4.2): new tabs get ids and `mid` keys, changed fields become clocked writes, missing tabs become `deleted: true`.
- `planApply(displayedBaseline, mergedBlob, protectedTabIds)` → `{ apply: [...rows of §4.3], accept: [...], nextBaseline }` where protected changes go to `accept` and leave the baseline untouched.
- `workspaces-model`: the three new optional columns, zipped with `urls`; older records load without them.

- [ ] Write failing tests: `new tab gets id and key after its neighbour`, `navigation is a nav edit, not a close`, `missing tab is a tombstone`, `plan applies unprotected changes and accepts protected ones without moving the baseline`, `deferred nav: displayed window diffs to nothing`, `unrelated local close publishes only itself while a remote close is deferred`, `local edit of the deferred field supersedes it by clock`, `older capture without the columns loads`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 7: Budget admission in the live Space

**Files:** `src/main/shared-spaces.js` (admission state per Space), `src/main/shared-spaces-adapter.js` (`unsyncedTabIds`), `src/main/main.js` (the status payload), `test/unit/shared-spaces-admission.test.js` (new)

**Interfaces:**
- Per Space the store keeps `lastPublishable` (the last blob that passed `admit`), `unsynced` (the pending writes `admit` removed, in order) and `reason`. Every pass re-runs `admit` on the current merge plus the unsynced writes **in their original order**, so a change that didn't fit is retried whenever capacity frees: a tombstone expiring, another device removing content, a navigation to a shorter URL, a local close whose tombstone is smaller than the record it replaces.
- `unsyncedTabIds(space)` → the tab ids whose writes are unsynced, for the row dot ("Not synced: this Space is full") and the Spaces menu line ("This Space is full for sync: {count} tabs stay on this device", with "Closed tabs free their room after 30 days" when `reason` is `tombstones`).
- Admission never touches the window: the tab opens, navigates or closes as usual; only its sync is held.

- [ ] Write failing tests:
  - `long-URL navigation over budget` (a full Space; the active tab navigates to a 2,048-unit URL: the navigation shows, the `nav` write is unsynced, the tab carries the dot, the last publishable state is what the next pass PUTs);
  - `position-key growth` (500 inserts into one gap at the budget's edge: the inserts that don't fit are unsynced in order, the earlier ones sync, and a later `mid` with the stored neighbours is still valid);
  - `concurrent additions` (a blob arrives already over budget from another device: merged whole, shown in full, this device's next addition is unsynced, nothing of the other device's is removed);
  - `tombstones hold room` (closing tabs frees nothing until expiry; the reason is `tombstones`; after the test clock passes 30 days the unsynced writes are admitted in order);
  - `500 live tabs` (the 501st tab opens, is unsynced with reason `tabs`, and syncs after a close's tombstone is counted as not live);
  - `transient 26 Spaces` (two devices create at once: both sync, the menu says "26 of 25 Spaces are shared", creation of a 27th is refused with the reason);
  - `retry when capacity frees` (an unsynced write is admitted on the first pass after room appears, and the dot clears).
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 7b: The sync fixture on the real Worker handler, and the first integration tests

**Files:** `test/desktop/support/sync-fixture.js` (new), `test/unit/sync-fixture-contract.test.js` (new), `test/unit/sync-spaces-integration.test.js` (new), `src/main/sync.js` (acceptance-only `BLANC_TEST_SYNC_ENDPOINT`, honoured only when `!app.isPackaged && process.env.BLANC_TEST === '1'`)

**Interfaces:**
- The fixture **imports `cloudflare/sync-worker/src/index.js`** and serves its `fetch` export behind a local `http` server over an in-memory KV stand-in (the one `sync-worker-limits.test.js` uses, with listing pages), so the routes, status codes, versions and limits are the Worker's own, not a re-implementation. Fault modes, each switchable per request from the test: **two same-version PUTs both succeed** (R5, as the Worker really behaves: the stand-in's version check is the Worker's), **stale reads** (serve a previous version of a key for the next N GETs), **a successful write disappears** (acknowledge a PUT with 200, then drop the key), **a lost index write** (drop the next PUT to `spaces` after acknowledging it), `429` for N requests, `404 unknown store` for the Spaces stores (an older Worker), a network error for N requests.
- `sync-fixture-contract.test.js` runs a scripted sequence (round-trips, 409, 413, 429, DELETE, the Space pattern) directly against the imported handler and through the fixture's HTTP server and asserts identical status codes, bodies and stored keys, so the fixture cannot drift from the Worker.
- `sync-spaces-integration.test.js` runs `sync.js` (as the existing sync tests load it, with `safeStorage` stubbed) against the fixture: two `sync.js` instances with separate stores and one key converge a Space through the queue, the request log stays under the window, a 409 replays the pending set, a lost index write is caught by reconciliation, a disappearing write stays lost and is asserted so.

- [ ] Write the contract test and the integration tests (failing); implement the fixture and the endpoint override.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

---

## PR C: the window, the switch and the surfaces

PR C merges with the switch **unpackaged-only**: `isSharedSpacesOffered()` returns false when `app.isPackaged`, and Settings → Sync shows no switch, mark or pairing question in a public build. PR D removes the guard.

### Task 8: Applying records to live windows

**Files:** `src/main/main.js` (the adapter: `applySharedSpaceChanges(runtime)`, protected-tab detection, deferred queue, echo suppression, hooks in `setActiveTab`, `closeTab`, window close, Space leave, cold start), `test/unit/shared-spaces-main.test.js` (lifted source, as `tab-context-glance-availability.test.js` does)

**Interfaces:**
- Protected tabs: the active tab of each window showing the Space and every visible split pane (§4.4), focus or not.
- Apply rows of §4.3 through `createTab({ asleep: true, … })`, `closeTab(id)` with recording on (D5: the live view is parked), `navigateTabToAddress`, `syncTabLayout`; a Space tombstone leaves the Space as Delete does; applied tabs are marked for the pass so the broadcast yields no edit.
- Deferred changes apply on tab switch, own close, window close, Space leave and cold start; superseded ones are dropped.

- [ ] Write failing tests: `remote new tab is created quiet at its position`, `remote tombstone closes into Recently closed with the view parked`, `active tab's change is deferred in an unfocused window too`, `deferred change applies on tab switch and advances the baseline`, `cold start applies the accepted set`, `applied change produces no echo edit`, `set-aside Space applies everything at once`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 9: The switch, the sheet, dormant links, rejoin and the recovery Space

**Files:** `src/main/main.js`, `src/main/sync.js` (`setSyncSpaces(on)`; `syncSpaces` in `sync.json` beside `syncTabs`; bumps `syncGen` like `setSyncTabs` so queued Spaces work is cancelled with `consent-off`), `src/main/preload.js`, `browser-api/contract.json`, `browser-api/bridges.json`, `src/renderer/pages/settings.*`, `src/renderer/workspace-ui.js` (the sheet), `copy/messages/*.json`, `settings-schema/schema.json`, tests

**Interfaces:**
- Settings → Sync: "Keep Spaces and groups in sync on this device" with its two lines (§1), beside "Share this device's open tabs"; off by default; an update never turns it on; absent entirely in packaged builds until PR D.
- The switch-on sheet (§4.6, D2, D3): Spaces with tab counts, the library's room, ticked by default when they fit, oversized ones greyed with the reason and "Split this Space…"; Rejoin / Add as a copy for dormant Spaces; refuses a ticked set over 25.
- Off: `sharedLink: dormant`, records keep being maintained (Task 6's diff runs; nothing uploads).
- Recovery Space (§3.9): `recoveredFrom`, one per shared Space, deduped by `tabId`, flushed before records drop, exempt from the local 25 cap; the Spaces menu's one-time note. It consumes `pushPlan`'s `recover` set (Task 2) and nothing else decides what is recovered.

- [ ] Write failing tests: `switch on uploads chosen Spaces with fresh ids and clocks of now`, `two "Work" stay two`, `oversized Space is refused and offered a split`, `off keeps dormant copies and maintains clocked edits`, `off cancels queued Spaces writes and keeps their pending set`, `rejoin fetches first, merges with the edits' own clocks and pushes pending`, `add as a copy stamps new ids`, `recovery is idempotent across a crash between flush and drop`, `recovery succeeds with 25 local Spaces`, `the ticked set over 25 is refused`, `packaged build offers no switch`.
- [ ] Implement; `npm run browser-api:build`, `settings:build`, `copy:build`, `copy:ack` for all six languages.
- [ ] Run `npm run test:unit` and `npm run substrate:check`. Expected: PASS. Commit.

### Task 10: Sync mark, status lines, Recently closed band, dedupe sidecar, pairing question, first scenarios

**Files:** `src/renderer/overlay.js`, `src/renderer/workspace-ui.js`, `src/renderer/styles.css`, `src/main/main.js`, `src/main/shared-spaces.js` (the `shared` sidecar), `src/main/tabsync.js`/`tabicons.js` (hide occurrences), `copy/messages/*.json`, `src/main/test-hook.js` (acceptance-only: the derived key, the fixture endpoint, a peer-device driver that writes blobs with the pure model), `spec/acceptance/shared-spaces.feature` (new, `@F57`), `test/desktop/steps/shared-spaces.steps.js`, `test/desktop/cucumber.mjs`, tests

**Interfaces:**
- Sync mark on shared Spaces with accessible state text: Shared / Waiting to upload / Not synced since {time} / Full for sync / Spaces sync isn't available (D8, §10); the Space-full status line and its tombstone variant; "{count} of 25 Spaces are shared"; "Sync is busy; retrying" and "Checking for changes is slowed by rate limiting" from the queue's status (Task 5); a "not synced" dot on an over-budget tab row with accessible text (§5, Task 7).
- One Recently closed band (D6, §7): own entries once, remote rows "Closed on {device}", Forget hides locally, Clear all clears own entry and hides remote rows; copy never claims form-content recovery for remote rows.
- `shared` sidecar (§8): published with the F27 entry's `updatedAt` and tab indices; applied only when clocks match and the Space is visible; otherwise everything visible.
- Pairing question (§4.7, D9): once per paired device while this device's switch is off, by the device's name, with the account-wide line; Turn on opens the sheet.
- **First acceptance scenarios in this PR**, against the Task 7b fixture, with the in-process peer driver (the F27 scenarios' `injectRemoteDevices` is the precedent): the switch-on sheet; a tab from B appears quiet; a close on B parks the view and the band shows "Closed on B" once; a navigation on B defers on the active tab and autosave publishes nothing meanwhile; an older Worker shows "isn't available yet" while Favorites still sync.

- [ ] Write failing unit tests: `mark state text for each state`, `stale sidecar leaves tabs visible`, `matching sidecar hides exactly the listed occurrences and never a same-URL unshared tab`, `own close is listed once`, `pairing question asked once and only while the switch is off`.
- [ ] Write the five scenarios above and bind their steps; add them to the `runnable` profile.
- [ ] Implement; run the pseudo-locale sweep (`npm run test:i18n:desktop`) over the new copy.
- [ ] Run `npm run test:unit`, `npm run test:acceptance:dry` and `npm run test:acceptance:desktop` on Linux. Expected: PASS. Commit.

---

## PR D: acceptance, records, security review, the switch in packaged builds

### Task 11: Two-device scenarios, two complete clients, crashes

**Files:** `spec/acceptance/shared-spaces.feature`, `test/desktop/steps/shared-spaces.steps.js`, `test/desktop/support/hooks.js` (`launchPeerApp`: a second Electron instance with its own userData, the same fixture endpoint and the same derived key; closed in `After`), `test/desktop/support/sync-fixture.js` (fault modes used from steps), `src/main/main.js` (remove the packaged-build guard from Task 9)

**Interfaces:**
- The in-process peer driver covers the breadth; **two complete clients** (two Electron instances against one fixture) cover the convergence core, because a simulated peer cannot stand in for a second real client's queue, baselines and timing.

- [ ] Write the remaining scenarios of spec §13 with the peer driver: two "Work"; cold start applies a deferred close; Space-full shows, names the tombstone case, clears after expiry (test clock); off, edit, on again rejoins without duplicating; a replica stale past the retention gets "kept on this device" with 25 Spaces present and a second stale merge adds nothing; a 429 slows every class evenly and recovers; a lost index write is caught by reconciliation (test clock); two same-version PUTs both succeed and the loser's pending set replays; a stale read does not roll a Space back; a disappearing write stays lost and the status says "Not synced since"; a shared tab shows once and a same-URL unshared tab still; a stale sidecar leaves tabs visible.
- [ ] Write the two-client scenarios (`@two-clients`, Linux CI): a tab opened on A appears quiet on B and vice versa within the window; a close on A lands in B's band once; a navigation of B's active tab from A defers until B switches tabs; both turned off, edited, and on again converge without duplicates; both windows' request logs stay under 10 per trailing minute and the fixture's per-account counter never sees 429.
- [ ] Add the crash scenarios with `crashAndRelaunch`: a merge then SIGKILL before the next save; a deferred change applying at cold start; a crash between the blob write and the index write (the index entry is retried from pending; the Space is reachable or retried, never half).
- [ ] Remove the packaged-build guard; `packaged build offers no switch` becomes `packaged build offers the switch`.
- [ ] Bind the steps; add the ids to the `runnable` profile; run `npm run test:acceptance:dry` and `npm run test:acceptance:desktop` on Linux (the `@two-clients` scenarios included). Expected: PASS. Commit.

### Task 12: Spec, parity, privacy and security records

**Files:** `spec/features.md` (F41: replace "never sync"; add F57 Shared Spaces), `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17), `site/` privacy label text (in this PR only), `docs/security-assessment.md` (a shared-Spaces row under Profile Sync, R3/R5 stated), `test/unit/*` claim tests that read those files

- [ ] Update the records; run `npm run test:unit` (the ledger tests) and `npm run site:build`'s SEO checks if the privacy page changed. Expected: PASS. Commit.
- [ ] Security review against `docs/security-assessment.md` R3/R5 (§12): what travels, consent, the bearer-locator statement, the non-atomic statement, the hostile-navigation path through the deferred queue and the navigation guards, the queue's cancellation reasons against a credential change. Record the sign-off in the assessment.

---

## PR E: release preparation, platform validation, release

### Task 13: Release preparation (before `npm run release`)

- [ ] **Prep PR** as for v1.43.1: bump `version` in `package.json` (and the `electron` devDependency if Chromium moved), create `docs/press/release-notes/vX.Y.0.md` from `docs/press/release-notes/unreleased.md` including only what the release commit contains, with the shared-Spaces bullets **bold-named** so `site:whats-new` can turn them into highlights; the next `MIGRATION_BASE_VERSION` and its unit-test assertion. This is upcoming material, labelled as such; nothing in it is published as shipped.
- [ ] **By-hand two-device check against the deployed Worker**, from the merged build: switch on with two Spaces, open one on a second desktop, close a tab on each side, navigate the active tab on one side and watch the other defer, turn the switch off and on again, turn sync off with "erase server copy" and confirm the Space blobs are gone. Record the observations for the release's incident file.
- [ ] **Windows and Linux candidate validation:** `gh workflow run release-windows-linux.yml --ref <candidate branch> -f mode=validation -f platform=windows` and the same for `linux`; install the private artifacts and repeat the two-device check on each (a Windows or Linux desktop paired with a Mac). Record the runs' ids. Installing proves packaged behaviour, not the updater handoff.
- [ ] **Affected-machine confirmation:** the owner confirms, in writing, the by-hand check on every platform the release ships to before the shipping merge, tag or release. If a platform's check is waived, record the missing evidence and risk and the written approval, not a pass.
- [ ] **What's New page:** after the prep PR merges, `npm run site:whats-new -- --release X.Y` (reads the prepared `vX.Y.0.md`), captures from the merged build, owner sign-off on final text and media, the website-only PR, `npm run site:deploy`, and `https://blanc.day/whats-new/X.Y` answering 200 to a redirect-free HEAD. The page builds as the upcoming page (no date, `noindex`, out of the sitemap) until `releases.json` lists the release. `release.sh` refuses the feature release otherwise.

### Task 14: The feature release and its records

- [ ] `npm run release` per `docs/release-verification.md` and the releasing-blanc skill (read immediately before); the complete post-publication protocol (fresh-download manifest, checksum and Sigstore checks; Gatekeeper, strict deep codesign, Developer ID and stapled ticket; `prerelease-smoke.yml` against the exact tag).
- [ ] Records: public baseline, release incident (with the Gate A→B Worker deploy, the validation run ids and the affected-machine confirmations), `releases.json`, roadmap, bangs pin; the claims ledger for the new feature, now backed by the release. Only now may marketing describe Spaces sync as shipped.
- [ ] macOS and Windows updater handoffs stay pending until each is observed from the immediately preceding public Blanc through **Restart Now**.
