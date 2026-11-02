# Sync: a cheap "what changed" check

Date: 2026-11-02. Status: draft for the owner's review. Nothing here is built.

## Why

On November 2, 2026 the owner saved a new Space on the Mac and it took about two minutes to appear on the iPhone. Two queues of about a minute each caused it:

1. **The Mac waited for its request window.** A routine desktop pass downloads every store, about 10 GETs, which is the whole client window of 10 GETs per 60 s (`sync-scheduler.js`; background work may use 9, M16 amendment of 2026-10-31). A new Space's upload needed 2–3 more GETs, so it waited for the next minute. That part is fixed separately in [#1293](https://github.com/bnfy/blanc/pull/1293): a Space no device has uploaded is sent without its download, outside the window, and needs one GET in all.
2. **The other device only looks once a minute.** With the Spaces switch on, the iPhone runs a full pass every 60 s while Blanc is in front (`startForegroundChecks` in `ios/Blanc/Blanc/Sync/SyncEngine.swift`, gated on `spacesConsent`). Desktop runs one every 60 s always (`setInterval` in `sync.js` `init()`). Each pass downloads every store whether or not anything changed, so neither app can look more often: the Worker allows 30 GETs per account per minute across all devices (`RATE_LIMIT` in `cloudflare/sync-worker/src/index.js`), and three devices at 10 a minute already reach it.

The Worker has no way to say "nothing changed": no ETag, no version listing, no conditional GET. This design adds one.

## Goal

A change to Spaces, Favorites, settings, sent tabs or recently closed tabs made on one device reaches another device that has Blanc open in **about 15 seconds**, while each device makes **fewer** requests than today. Open tabs (`session`, `icons`) keep arriving within about a minute, as now (see "Open tabs" below).

## Non-goals

- Push (APNs, WebSockets, Durable Object hibernation sockets). Polling a cheap check is enough for 15 s, needs no new infrastructure or permissions, and works on every platform.
- Background delivery on iPhone. iOS background refresh (`BackgroundRefresh`, M18 §6) stays as it is; the check applies while Blanc is in front.
- Changing the encryption, store names, merge rules or the Space index format.

## Anti-goals

- Revealing anything to the server or to a holder of an account locator that they can't already learn. In particular, the response must not list Space ids.
- Breaking older clients or older Workers. Either side may be older, and sync must keep working as it does today.
- Spending more requests, KV writes or Durable Object work per device than today in the steady state.
- A slow or failing check blocking sync. Any failure falls back to today's once-a-minute pass.
- A rollback of the Worker losing data written while the new version ran.

## Constraints (from the code as it stands)

- **Fixed stores** (`bookmarks`, `settings`, `session`, `icons`, `sends`, `closed`, `shared`, and the `spaces` index) live in KV under `blob:<account>:<store>`. Each value carries a random `version` (`crypto.randomUUID()` on every PUT).
- **KV is eventually consistent, including at the reader's own location.** A KV read is cached at the Cloudflare location that served it, for up to about 60 s. The writer's own PUT reads KV first for its `ifVersion` check (`handlePut` → `readBlob`), so the old value is cached at that location. The Durable Object then writes the new value. A Mac and an iPhone on the same home network usually reach the same location, so the phone can read the old value for up to a minute after the Mac wrote the new one. This is exactly the reported case, so **a check alone can't reach 15 s while fixed stores are read from KV**.
- **The fixed-store `ifVersion` check also reads KV at the edge**, and the object's `/write` for fixed stores doesn't compare at all. A stale read followed by a PUT passes that check and can overwrite a newer value. That race exists today; fetching right after another device writes, which the check encourages, would make it more likely.
- **Space blobs** (`space-<32 hex>`) live only in the account's `AccountQuota` Durable Object (SQLite), strongly consistent, read and written there.
- **Every PUT already goes through the account's Durable Object** in production (`ACCOUNT_QUOTA` is bound in `wrangler.toml`; `handlePut` calls `/write` for fixed stores too, and the object then writes KV). The object is serialized per account. The quota ledger already reserves eight fixed slots at their maximum size (`FIXED_RESERVATION_BYTES`), so holding fixed-store copies in the object changes no account's quota.
- **Space blob changes are already signaled by the index.** Each index entry carries a revision hint (`rev`, `revAt`, `revBy`) that the publisher updates after the blob lands, and class S fetches Space blobs whose `rev` differs from the local copy (shared-spaces spec §5). So clients only need to know when one of the **eight fixed stores** changed.
- **The request window** (10 GETs per trailing 60 s) and its class rotation (I, S, F, R) are shared with iOS through the scheduler vectors; their default answers must not change. The reserved last request for the Choose Spaces sheet (`canRequest({reserve:true})`) exists on desktop only; iOS `SyncScheduler.canRequest()` takes no reserve.
- **Class R** re-reads every Space blob to catch a lost index write. It gets about a quarter of the window, and its reads carry over from pass to pass: re-reading 25 Spaces takes about 10 minutes at the full rate (shared-spaces spec, "What to fetch").
- **The iPhone has no per-store operation.** `syncFixed` reads all fixed stores together, treats a missing `settings` read as a deleted account, and its writes depend on one another (the sidecar binding comes from the uploaded session; presence goes into sends).
- An unknown account must not create Durable Object storage on a read (the `/read` path returns `{record:null}` without bootstrapping a ledger). The check must keep that rule.
- The per-IP throttle (120 requests a minute) is the anti-guessing defense and must cover the new endpoint.

## The design

### Worker, part 1: fixed stores are read and compared in the Durable Object

*The owner chose this on 2026-11-02 (decision 1).* This is what makes 15 s reachable.

- On every fixed-store `/write`, the object compares `ifVersion` against its own record, then keeps the new value in its storage as well as writing KV. KV stays written, so a rollback to the current Worker still finds every value (the rollback anti-goal).
- A fixed-store GET reads from the object when the object holds that store, and from KV otherwise. "Otherwise" means an account whose store hasn't been written since this deploy. The first such read copies the KV value into the object, so from then on the object is the source.
- The edge `ifVersion` check in `handlePut` stays for the KV-only case and is no longer what decides a conflict once the object holds the store. The lost-update race above goes away.

### Worker, part 2: `GET /v1/versions/<accountId>`

A new read-only endpoint. Response, 200:

```json
{ "v": 1, "stores": { "bookmarks": "…uuid…", "settings": "…", "session": "…", "icons": null,
                      "sends": "…", "closed": "…", "shared": "…", "spaces": "…" } }
```

- One entry per fixed store: the current `version` string, or `null` when the store doesn't exist. Space blobs are never listed.
- `"stores": null` means the account has no ledger yet (no PUT since the Durable Object rollout, or an unknown locator). Clients treat it as "the check can't help" and keep today's minute pass until a later check returns a map. Reading never creates a ledger.
- The object answers from the versions it holds. For a store it doesn't hold yet, it copies the KV value once, as in part 1, and answers from that.
- Throttles: the per-IP limit first (as for every `/v1/blob` request), then the per-account GET limit (`RATE_LIMIT`, 30 a minute). A check costs the same as one GET and saves many. *(My call: no separate budget.)*
- An older Worker answers this path with `404 not found`. Clients read that as "unsupported".

### Clients: check often, download only what changed

The same behavior on desktop (`src/main/sync.js`, `sync-request-queue.js`) and iPhone (`SyncEngine.swift`), except where noted:

1. **Remember versions.** Each device persists the last version it read or wrote for each fixed store, per account (desktop: `sync.json`; iPhone: the sync state store). A GET or a successful PUT updates it. Switching accounts or turning sync off clears it.
2. **When to check.** The check runs whenever today's periodic pass would run:
   - Desktop: every 15 s while a Blanc window is focused, and every 60 s otherwise.
   - iPhone: every 15 s while the scene is active and the Spaces switch is on, which is the same gate as today's minute pass. With the switch off, the iPhone makes no periodic requests in front, as today.

   *(My call on the intervals; see decision 2.)*
3. **The check goes first.** When a check is due, it runs before rotation work: it is charged to the window like a GET but doesn't wait behind background requests. On desktop it leaves the Choose Spaces sheet's reserved request alone. If the window has no room at all, the check is skipped until the next interval, never queued. This is decided in the queue, not the scheduler, so the scheduler vectors don't change. *(My call.)*
4. **Fetch what changed.**
   - For each fixed store whose named version differs from the remembered one, the client fetches that store: desktop through its ordinary merge-first operation in the usual class (F for the seven, I for `spaces`). When `spaces` changes, class S then fetches the Space blobs whose revision hint moved.
   - On iPhone, `syncFixed` is restructured to fetch only the changed stores. It keeps its order and the writes that depend on one another, and it still treats a missing `settings` as a deleted account only when it actually read `settings`. *(My call; this is the bulk of the iPhone work.)*
   - If a fetched version differs from the version the check named (a read that raced a newer write), the store stays marked changed and is fetched again at the next check.
5. **Open tabs.** `session` and `icons` change as often as every 15 s on an active desktop (`TAB_PUBLISH_DEBOUNCE_MS`). Fetching them on every check would cost more requests than today, so a changed `session` or `icons` is fetched at most once a minute, as desktop's focus refresh does today. *(My call: the "fewer requests" anti-goal wins over 15 s for open tabs.)*
6. **Uploads and retries stay on a one-minute beat.** Local changes upload exactly as today (debounces, merge-first GET, `ifVersion`). A one-minute retry pass keeps replaying what is pending or failed: Space fields waiting to upload, `spacesRetryAt`, missing optional stores and failed offline uploads. It downloads only what those retries need. *(My call.)*
7. **Safety pass.** While the check works, the full pass (every store, plus class R) runs every **5 minutes** instead of every minute, and also on launch, on sync turned on and on wake from sleep. Class R is paced: each full pass re-reads at most **5** Space blobs (half the window), continuing from where the last pass stopped (the R item cursor), which leaves room for checks and changes. A lost index write is therefore found within the time class R takes to come round to that Space: about 25 minutes for 25 Spaces, against about 10 today. *(My call; see decision 3.)*
8. **Fallback.** If the check answers `404` (older Worker), `stores: null`, a 5xx, a network error or anything it can't parse, the client runs today's once-a-minute full pass. It tries the check again after 10 minutes, or at the next launch or account change. A `429` lowers the window as today (backoff), and checks pause until the window recovers.
9. **Focus refresh.** Desktop's focus refresh (`refreshSession`) and the iPhone's `appDidBecomeActive` start with a check, then fetch what changed, instead of fixed downloads of session, icons, settings and sends.

### What it costs

Per device, with Blanc in front, 25 shared Spaces and nothing changing:

| | Today | With the check |
|---|---|---|
| GETs a minute | about 10, plus class R reads | 4 checks + about 1.6 fixed-store reads and 1 class R read (the 5-minute pass) ≈ 6.6 |
| Time for another device's Space or Favorites change to arrive | up to about 60 s, plus any window wait | about 15 s |
| Time for another device's open tabs to arrive | up to about 60 s | up to about 60 s |
| Durable Object requests a minute | only on writes and Space reads | 4 checks + fixed-store reads, each a single storage read |

Today class R adds up to a quarter of the window on top; with the check it is capped at 5 reads per pass. The KV rate counters (`rl:` and `ip:`, a get and a put each per request) follow the request count. With three devices open, the account's checks use 12 of its 30 GETs a minute.

### Privacy

The endpoint returns random version strings for eight fixed store names that every account has, plus nulls. A holder of an account locator can already GET each store and see its version, so the check reveals nothing new: no Space ids, no sizes, no device names, and nothing about content, which stays end-to-end encrypted. It adds no logging. Copies of the fixed stores in the object are the same ciphertext KV already holds, under the same account.

### Rollout

1. **Worker first.** Both parts are additive. Existing GET/PUT/DELETE behavior is unchanged for current clients, and KV stays written for rollback. The owner approves and runs the deployment, following the README's deployment checklist (`docs/reviews/2026-10-26-sync-deployment-readiness.md`).
2. **Clients next.** Desktop and iPhone gain the check in a release each. Either works against the old Worker through the fallback.
3. **No flag day.** Mixed versions are fine: an older client never sends the check, and its writes still go through the object, so newer clients' checks see them.

### Testing

- **Worker** (`cloudflare/sync-worker/test/runtime.test.mjs`):
  - versions after PUTs of each fixed store; `null` for absent stores; `stores:null` without creating a ledger for an unknown account;
  - the first read copies a KV-only store into the object exactly once;
  - a fixed-store PUT with a stale `ifVersion` gets 409 from the object even when KV at the edge is stale;
  - a GET right after a PUT returns the new value;
  - KV still holds every value written (rollback);
  - delete-account clears everything; both throttles apply; an older client's GET/PUT is unchanged.
- **Shared vectors:** a small set of "versions named / versions remembered → stores to fetch" cases, generated once and replayed by desktop and iOS tests, like the scheduler vectors.
- **Desktop unit and integration** against `test/desktop/support/sync-fixture.js`, which runs the real Worker and so gets the endpoint automatically. It gains a switch that turns the endpoint off, to act as an older Worker. Cases:
  - a change on device B reaches device A within one check interval;
  - unchanged stores are not downloaded;
  - a raced read is fetched again at the next check;
  - the fallback to minute passes;
  - the check never uses the reserved request;
  - session and icons are fetched at most once a minute;
  - pending uploads still retry every minute.
- **iOS unit tests** for the same cases, plus the restructured `syncFixed` (each store alone, the settings-missing rule, the sidecar and presence order). The two-device check is then repeated by hand: a new Space on the Mac reaching an open iPhone in under about 20 s.
- **Acceptance:** an F57 scenario where a Space made on device B appears on device A within 20 s with the fixture's endpoint on, and within 70 s with it off.

## Decisions for the owner

1. **Read fixed stores from the Durable Object (Worker, part 1).** *Decided by the owner, 2026-11-02: yes.* Without it, a change on the Mac could still take up to a minute to reach a phone on the same network, because of KV's cache. With it, the Worker change is bigger (a copy of each fixed store in the object, the conflict check moved there), but 15 s holds and an existing lost-update race goes away.
2. **The 15 s interval while Blanc is in front.** Shorter means faster arrival and more checks: 10 s is 6 a minute per device, and three devices would use 18 of the account's 30 GETs on checks alone. 15 s is my recommendation.
3. **The 5-minute safety pass with class R capped at 5 Space re-reads per pass.** A lost index write would be noticed in about 25 minutes for 25 Spaces instead of about 10.
4. **Deploying the Worker**, once the implementation is reviewed.

## Calls I made (check these while reading)

- Polling a cheap check rather than push.
- Fixed stores only, with Space changes learned from the index hints, so no Space ids leave the encrypted index.
- The versions and fixed-store copies live in the existing `AccountQuota` object, filled on first read for older accounts; KV stays written for rollback.
- The check counts against the per-account GET limit rather than getting its own budget.
- The check goes before rotation work, is skipped (not queued) when the window is full, and never uses the sheet's reserved request.
- Desktop checks every 15 s only while a Blanc window is focused, otherwise every 60 s; the iPhone keeps today's gate (in front, Spaces switch on).
- Open tabs stay at once a minute.
- A one-minute retry pass for pending and failed uploads.
- The iPhone's `syncFixed` is restructured to fetch only changed stores.

## Later (not in this design)

- PUT without the merge-first GET when the check shows a store unchanged since this device last read it (`ifVersion` keeps it safe), which would cut each upload to one request.
- iPhone parity for #1293 (a Space made on the phone still downloads first and waits its turn).
