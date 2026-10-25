# M16 Shared Spaces Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship desktop Spaces sync as a public feature release: a per-device switch that puts a device's Spaces into one end-to-end-encrypted library on the existing sync Worker, with groups, pins, names and order the same on every device that has it on, removals applied everywhere through a synced Recently closed, and the page in front of the person never changed under them.

**Architecture:**
- The Worker gains one route pattern (`space-<32 hex>`) and three fixed stores (`spaces`, `closed`, `shared`); account DELETE lists by prefix. Nothing else in it changes.
- A pure model, `src/main/shared-spaces-model.js`, holds the protocol: per-field records with final tombstones, `mid` positions with record tags, acknowledgement by the full merge rule, the content revision, the byte budget on the encrypted blob, the sliding-window round-robin scheduler, and the recovery-copy decision. It runs under `node --test` and generates the shared iOS vectors.
- `src/main/shared-spaces.js` and `src/main/synced-closed.js` are the stores (`JsonStore`, `rebind`, export/merge/equals), added to `sync.js`'s `STORES` table the way `sends` was, with the loop's "every store each pass" replaced by the scheduler.
- `main.js` gains the record↔window adapter: displayed baselines, accepted sets and deferred queues per window, applied through `createTab`/`closeTab`/navigation, plus the switch, its sheet, the sync mark and status lines, the pairing question and the recovery Space.

**Tech Stack:** Electron main, plain JS, `node --test`, Cucumber + Playwright-Electron, Cloudflare Worker (KV), Swift vectors for the iOS port.

**Spec:** `docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md` (owner-decided D1–D9 in §14; the contract is `2026-10-24-ios-v1-companion-release-design.md` §4, §5, §7). Every section number below refers to the spec.

## Global Constraints

- **Order of deployment:** the Worker (PR A) is deployed by the owner before any client that offers the switch ships (§9). A client meeting an older Worker says "Spaces sync isn't available yet" and syncs nothing.
- **Nothing is ever trimmed from a record another device wrote** (§5). Over budget refuses the sync of a change, never the change, and always says so with accessible text.
- **Tombstones are final** (§3.5): no code path writes `deleted: false` after `true`; reopen creates a fresh id. **Resurrection after expiry is possible**; no copy, test or UI text claims otherwise.
- **The displayed baseline is the only thing autosave diffs against** (§4.3). Deferred remote changes never advance it.
- **At most 10 GETs per device in any trailing 60 s** (§6.2), enforced by the request log; the scheduler is the only thing that issues sync GETs for these stores, and the focus refresh never moves the next-class cursor.
- Only the Personal profile syncs. Private tabs, splits, `blanc://` and `file://` pages never enter a record.
- Every new English string goes into all six languages in the same PR (`copy:build`, `copy:ack`); `browser-api/contract.json` and `bridges.json` change with any bridge member or payload field; boundary-file edits need `npm run audit-inventory:write`; a new `sync.json` or `settings` key follows `settings-schema/schema.json` and `settings:build`.
- F41's "never sync" line, `spec/parity-matrix.md`, the privacy label and `docs/security-assessment.md` change only in the shipping PR (PR D), never earlier.
- No marketing, release note or What's New text until the release exists and its evidence backs it (`docs/marketing-claims.md`).

## Review Focus

1. A remote navigation of the active tab is deferred, the window keeps showing the old page, and autosave publishes **nothing** for that tab meanwhile (Task 7 test `deferred nav: displayed window diffs to nothing`).
2. A fetched `deleted: false` with a later clock never clears a pending `deleted: true` (Task 1 test `acknowledgement by the full rule`).
3. `mid` is never called with `a ≥ b`: the model asserts it, and constructed concurrent inserts into one gap produce distinct, correctly placed keys (Task 1 tests `concurrent inserts into one gap`, `insert between the two`).
4. The scheduler never exceeds 10 GETs in any trailing 60 s across a simulated hour, including a restart and a backwards clock jump, and one-request passes with a focus event before each still serve I, S, F, R in turn (Task 5 tests `sliding window`, `one request per pass with focus events`).
5. The budget check measures `JSON.stringify(encrypt(...))`: a 400 KiB plaintext is refused and 320 KiB accepted, with the numbers computed by the test (Task 1 test `budget on the encrypted blob`).
6. Turning the switch off, editing, and turning it on again rejoins without duplicating the library and with the edits' own clocks (Task 10 scenario `rejoin after edits`).
7. A long-stale replica's absent records go to the recovery Space, which is idempotent and created even with 25 Spaces present (Task 8 tests, Task 10 scenario `kept on this device`).

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

### Task 2: Pure model: pending set, replay, recovery decision

**Files:** `src/main/shared-spaces-model.js`, `test/unit/shared-spaces-model.test.js`

**Interfaces:**
- `applyLocalEdits(pending, edits)`, `pushPlan(fetchedBlob, pending)` → the blob to PUT; `settlePending(pending, fetchedBlob)` → pending minus acknowledged writes (§3.8).
- `recoveryDecision({ localBlob, fetchedBlob, lastMergeAt, now })` → `{ keep, recover }` (§3.9): records the fetched blob lacks are `recover` when `lastMergeAt` is older than 30 days, else `keep`.

- [ ] Write failing tests:
  - `pending-set replay converges` (two devices PUT from the same version; the loser replays and both converge);
  - `the unrecoverable case stays lost` (a write cleared from pending then dropped upstream is not recovered; asserted so the claim stays honest);
  - `resurrection after expiry` (a replica that merged within the window but missed a tombstone brings the record back after 31 days; asserted);
  - `a long-stale replica recovers absent records instead of publishing them`; `a recent replica publishes its absent records as new`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 3: The Worker serves per-Space stores

**Files:** `cloudflare/sync-worker/src/index.js`, `cloudflare/sync-worker/README.md`, `test/unit/sync-worker-limits.test.js`, `test/unit/sync-worker-spaces.test.js` (new)

**Interfaces:**
- Store segment accepts `[a-z]+` or `space-[0-9a-f]{32}`; `STORES` gains `spaces`, `closed`, `shared`.
- `handleDelete` lists `blob:<accountId>:` by prefix (`listNames`) and deletes every key.

- [ ] Write failing tests (the Worker is imported as the existing limits test does): `space-<id> GET/PUT round-trip`, `space-<bad id> is unknown store`, `spaces/closed/shared are served`, `account DELETE removes space blobs`, `blob cap unchanged for space stores`, `cleanup still lists by prefix`.
- [ ] Implement. Document the pattern and the three names in the README's API section, with the "deploy before any client that offers the switch" line and the degrade behaviour (§9).
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

---

## PR B: desktop stores and the sync loop

### Task 4: The `shared-spaces` and `synced-closed` stores

**Files:** `src/main/shared-spaces.js` (new), `src/main/synced-closed.js` (new), `src/main/synced-closed-model.js` (new), `test/unit/shared-spaces-store.test.js`, `test/unit/synced-closed-model.test.js`, `src/main/sync.js` (STORES entries only)

**Interfaces:**
- `shared-spaces.js`: a profile-scoped `JsonStore('shared-spaces', { accountId, index, blobs: {<spaceId>: {blob, rev, mergedAt}}, pending: {<spaceId>: …}, windows: {<runtimeId>: {displayed, accepted, deferred}}, requestLog: [], nextClass, cursors })`; `rebind(accountId)`; `exportIndex/mergeIndex`, `exportSpace(id)/mergeSpace(id, remote)`, `equals`; `hasPublishableContent` (never a presence-only write); `onChanged(fn)`, `onRemoteChanged(fn)`.
- `synced-closed-model.js`: the `sends` shape with `{id, url, title, closedAt, spaceId}` items, 24 h / 25 per device, 30-day entry prune, daily heartbeat, 64 KiB budget, `inbox` of other devices' rows, `dismissed` (§7). `synced-closed.js` mirrors `sends.js`.
- `sync.js`: `STORES` gains `spaces`, `closed`, `shared` as optional entries, and a dynamic kind for `space-<id>` expanded from the merged index. The pass still fetches everything at this task; the scheduler replaces that in Task 5.

- [ ] Write failing tests: `rebind clears another account's data`, `export never creates a store without content`, `mergeSpace keeps the full merged blob and the revision`, `synced-closed keeps 25 per device for 24 h and prunes at 30 days`, `own closes are not listed from the synced copy`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 5: The sliding-window round-robin scheduler

**Files:** `src/main/sync-scheduler.js` (new, pure), `test/unit/sync-scheduler.test.js` (new), `src/main/sync.js` (`syncNow` uses it)

**Interfaces:**
- `createScheduler({ limit: 10, windowMs: 60000, log, nextClass, cursors, now, monotonic })` with `canRequest()`, `record()`, `next(work)` → `{ class, item }` or null, advancing the item cursor and the next-class cursor after every request (§6.2); `markIndexDue()` for the focus refresh (never moves the cursor); `onRateLimited()` (window 10 → 5, floor 3, five-minute recovery one step per clean minute).
- `work` is `{ I: boolean, S: spaceId[], F: storeName[], R: spaceId[] }` built by `sync.js` from the merged index, pending sets and `rev` differences; 409 retries re-enter as class S items.
- Persistence of `log` (wall-clock), `nextClass` and `cursors` in `shared-spaces.json`; on start, entries younger than 60 s or in the future count as live for 60 s of monotonic time.

- [ ] Write failing tests:
  - `sliding window`: over a simulated hour with unlimited work, no trailing 60 s window holds more than 10 requests; the same across a simulated restart and a wall clock that jumps back; two and three simulated devices never exceed 20 and 30 in any fixed minute bucket;
  - `round robin across requests`: with work in every class and one request allowed per pass, 1,000 passes serve I, S, F, R in turn, none starved;
  - `one request per pass with focus events`: a focus event before every pass only marks I as due; R still gets one in four;
  - `empty classes yield their turn`; `409 retry is a class S request`; `backoff lowers the window and recovers`; `class R completes a rotation within the stated bound at each rate`.
- [ ] Implement; wire `syncNow` to spend only what the scheduler allows and to stop when the window is empty; the focus refresh calls `markIndexDue`. Existing sync tests must keep passing (the fixed stores are class F).
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 6: Capture ↔ record translation and local state

**Files:** `src/main/shared-spaces-adapter.js` (new, pure), `src/main/workspaces-model.js` (`sharedId`, `tabIds`, `sharedLink`, `recoveredFrom` columns), `src/main/main.js` (`workspaceCapture` carries `tabIds`), `test/unit/shared-spaces-adapter.test.js`, `test/unit/workspaces-model.test.js`

**Interfaces:**
- `diffWindow(displayedBaseline, windowState, now, deviceId, ids)` → `{ edits, nextBaseline }` (§4.2): new tabs get ids and `mid` keys, changed fields become clocked writes, missing tabs become `deleted: true`.
- `planApply(displayedBaseline, mergedBlob, protectedTabIds)` → `{ apply: [...rows of §4.3], accept: [...], nextBaseline }` where protected changes go to `accept` and leave the baseline untouched.
- `workspaces-model`: the three new optional columns, zipped with `urls`; older records load without them.

- [ ] Write failing tests: `new tab gets id and key after its neighbour`, `navigation is a nav edit, not a close`, `missing tab is a tombstone`, `plan applies unprotected changes and accepts protected ones without moving the baseline`, `deferred nav: displayed window diffs to nothing`, `unrelated local close publishes only itself while a remote close is deferred`, `local edit of the deferred field supersedes it by clock`, `older capture without the columns loads`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

---

## PR C: the window, the switch and the surfaces

### Task 7: Applying records to live windows

**Files:** `src/main/main.js` (the adapter: `applySharedSpaceChanges(runtime)`, protected-tab detection, deferred queue, echo suppression, hooks in `setActiveTab`, `closeTab`, window close, Space leave, cold start), `test/unit/shared-spaces-main.test.js` (lifted source, as `tab-context-glance-availability.test.js` does)

**Interfaces:**
- Protected tabs: the active tab of each window showing the Space and every visible split pane (§4.4), focus or not.
- Apply rows of §4.3 through `createTab({ asleep: true, … })`, `closeTab(id)` with recording on (D5: the live view is parked), `navigateTabToAddress`, `syncTabLayout`; a Space tombstone leaves the Space as Delete does; applied tabs are marked for the pass so the broadcast yields no edit.
- Deferred changes apply on tab switch, own close, window close, Space leave and cold start; superseded ones are dropped.

- [ ] Write failing tests: `remote new tab is created quiet at its position`, `remote tombstone closes into Recently closed with the view parked`, `active tab's change is deferred in an unfocused window too`, `deferred change applies on tab switch and advances the baseline`, `cold start applies the accepted set`, `applied change produces no echo edit`, `set-aside Space applies everything at once`.
- [ ] Implement. Run `npm run test:unit`. Expected: PASS. Commit.

### Task 8: The switch, the sheet, dormant links, rejoin and the recovery Space

**Files:** `src/main/main.js`, `src/main/sync.js` (`setSyncSpaces(on)`; `syncSpaces` in `sync.json` beside `syncTabs`), `src/main/preload.js`, `browser-api/contract.json`, `browser-api/bridges.json`, `src/renderer/pages/settings.*`, `src/renderer/workspace-ui.js` (the sheet), `copy/messages/*.json`, `settings-schema/schema.json`, tests

**Interfaces:**
- Settings → Sync: "Keep Spaces and groups in sync on this device" with its two lines (§1), beside "Share this device's open tabs"; off by default; an update never turns it on.
- The switch-on sheet (§4.6, D2, D3): Spaces with tab counts, the library's room, ticked by default when they fit, oversized ones greyed with the reason and "Split this Space…"; Rejoin / Add as a copy for dormant Spaces; refuses a ticked set over 25.
- Off: `sharedLink: dormant`, records keep being maintained (Task 6's diff runs; nothing uploads).
- Recovery Space (§3.9): `recoveredFrom`, one per shared Space, deduped by `tabId`, flushed before records drop, exempt from the local 25 cap; the Spaces menu's one-time note.

- [ ] Write failing tests: `switch on uploads chosen Spaces with fresh ids and clocks of now`, `two "Work" stay two`, `oversized Space is refused and offered a split`, `off keeps dormant copies and maintains clocked edits`, `rejoin fetches first, merges with the edits' own clocks and pushes pending`, `add as a copy stamps new ids`, `recovery is idempotent across a crash between flush and drop`, `recovery succeeds with 25 local Spaces`, `the ticked set over 25 is refused`.
- [ ] Implement; `npm run browser-api:build`, `settings:build`, `copy:build`, `copy:ack` for all six languages.
- [ ] Run `npm run test:unit` and `npm run substrate:check`. Expected: PASS. Commit.

### Task 9: Sync mark, status lines, Recently closed band, dedupe sidecar, pairing question

**Files:** `src/renderer/overlay.js`, `src/renderer/workspace-ui.js`, `src/renderer/styles.css`, `src/main/main.js`, `src/main/shared-spaces.js` (the `shared` sidecar), `src/main/tabsync.js`/`tabicons.js` (hide occurrences), `copy/messages/*.json`, tests

**Interfaces:**
- Sync mark on shared Spaces with accessible state text: Shared / Waiting to upload / Not synced since {time} / Full for sync / Spaces sync isn't available (D8, §10); the Space-full status line and its tombstone variant; "{count} of 25 Spaces are shared"; "Sync is busy; retrying"; "Checking for changes is slowed by rate limiting"; a "not synced" dot on an over-budget tab row with accessible text (§5).
- One Recently closed band (D6, §7): own entries once, remote rows "Closed on {device}", Forget hides locally, Clear all clears own entry and hides remote rows; copy never claims form-content recovery for remote rows.
- `shared` sidecar (§8): published with the F27 entry's `updatedAt` and tab indices; applied only when clocks match and the Space is visible; otherwise everything visible.
- Pairing question (§4.7, D9): once per paired device while this device's switch is off, by the device's name, with the account-wide line; Turn on opens the sheet.

- [ ] Write failing tests: `mark state text for each state`, `stale sidecar leaves tabs visible`, `matching sidecar hides exactly the listed occurrences and never a same-URL unshared tab`, `own close is listed once`, `pairing question asked once and only while the switch is off`.
- [ ] Implement; run the pseudo-locale sweep (`npm run test:i18n:desktop`) over the new copy.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

---

## PR D: acceptance, records, security review

### Task 10: A sync fixture and two-device scenarios

**Files:** `test/desktop/support/sync-fixture.js` (new: a local HTTP server implementing the Worker's v1 API, with fault injection for 409, 413, 429 and a lost index write), `src/main/sync.js` (acceptance-only `BLANC_TEST_SYNC_ENDPOINT`, honoured only when `!app.isPackaged && BLANC_TEST === '1'`), `src/main/test-hook.js` (acceptance-only: the derived key and a peer-device driver that writes blobs with the pure model), `spec/acceptance/shared-spaces.feature` (new, `@F57`), `test/desktop/steps/shared-spaces.steps.js`, `test/desktop/cucumber.mjs`

**Interfaces:**
- The fixture serves the real routes against an in-memory map and can be told to lose the next index write, answer 429 for N requests, or 404 the space stores (an "older Worker").
- The peer driver plays "device B" in-process: it encrypts with the same key and writes records through `shared-spaces-model`, so scenarios can open, close and navigate tabs "on B" without a second Electron instance. The F27 scenarios' `injectRemoteDevices` is the precedent for a simulated peer.

- [ ] Write the scenarios of spec §13 (acceptance list): the switch-on sheet; two "Work"; a tab from B appears quiet; a close on B parks the view and the band shows "Closed on B" once; a navigation on B defers on the active tab in an unfocused window and autosave publishes nothing meanwhile; cold start applies a deferred close; Space-full shows, names the tombstone case, clears after expiry (test clock); off, edit, on again rejoins without duplicating; a replica stale past the retention gets "kept on this device" with 25 Spaces present and a second stale merge adds nothing; an older Worker shows "isn't available yet"; a 429 slows every class evenly and recovers; a lost index write is caught by reconciliation (test clock); a shared tab shows once and a same-URL unshared tab still; a stale sidecar leaves tabs visible.
- [ ] Add the crash scenarios with `crashAndRelaunch`: a merge then SIGKILL before the next save; a deferred change applying at cold start; a crash between the blob write and the index write.
- [ ] Bind the steps; add the ids to the `runnable` profile; run `npm run test:acceptance:dry` and `npm run test:acceptance:desktop` on Linux. Expected: PASS. Commit.

### Task 11: Spec, parity, privacy and security records

**Files:** `spec/features.md` (F41: replace "never sync"; add F57 Shared Spaces), `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17), `site/` privacy label text (in the shipping PR only), `docs/security-assessment.md` (a shared-Spaces row under Profile Sync, R3/R5 stated), `test/unit/*` claim tests that read those files

- [ ] Update the records; run `npm run test:unit` (the ledger tests) and `npm run site:build`'s SEO checks if the privacy page changed. Expected: PASS. Commit.
- [ ] Security review against `docs/security-assessment.md` R3/R5 (§12): what travels, consent, the bearer-locator statement, the non-atomic statement, the hostile-navigation path through the deferred queue and the navigation guards. Record the sign-off in the assessment.

---

## PR E: deploy, release

### Task 12: Worker deploy (owner's action) and by-hand checks

- [ ] Owner runs `wrangler deploy` from `cloudflare/sync-worker` after PR A merges and confirms `GET /v1/blob/<test account>/space-<id>` answers 404 "not found" rather than "unknown store".
- [ ] A desktop built from PR C against the deployed Worker: switch on with two Spaces, open one on a second desktop, close a tab on each side, navigate the active tab on one side and watch the other defer, turn the switch off and on again. Record the observations in the release's incident file.

### Task 13: What's New page and the feature release

- [ ] After the shipping PR merges: `npm run site:whats-new -- --release X.Y`, captures from the merged build, owner sign-off on text and media; merge the website-only PR; `npm run site:deploy`; confirm `https://blanc.day/whats-new/X.Y` answers 200 (CLAUDE.md's feature-release gate).
- [ ] `npm run release` per `docs/release-verification.md` and the releasing-blanc skill; the full post-publication protocol; updater handoffs pending until observed.
- [ ] Records: public baseline, release incident, `releases.json`, roadmap, bangs pin; the claims ledger for the new feature.
