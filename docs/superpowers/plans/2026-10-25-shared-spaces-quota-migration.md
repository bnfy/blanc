# Shared Spaces quota plan: conservative eight-store reservations

**Status:** Revised for owner review, October 25, 2026. Documentation only.
**Code baseline:** [PR #1132 at 510f87add](https://github.com/bnfy/blanc/pull/1132), approved code, still unmerged.
**Goal:** Bound legacy storage without measuring it exactly, and account for every new Space blob before writing it.

The owner authorized read-only production verification and this plan revision.
No Worker or configuration was deployed, no customer ciphertext was read or
exported, and no production data was changed. Implementation of this proposal
needs a separate go-ahead and code review. Worker deployment, real-device
validation, #1132 merge and PR E remain on hold.

This replaces the previous freeze/export/import plan. There is no provider
snapshot prerequisite, maintenance gate, legacy-account catalogue, manifest
importer, planned full outage or read-only abort mode. No customer-data backup
or export artifact is created, so there is no migration backup to retain or
restore after a customer erases the server copy.

## 1. Verified production basis and its limits

Read-only inspection found production deployment
`a816832c-cb3d-42ee-867c-17b74e5557fe` serving version
`106160ef-42e6-4499-bf4f-e3c72937774e` at 100%, deployed October 25 at
13:40:13 UTC. Its downloaded code allows exactly `bookmarks`, `settings`,
`session`, `icons` and `sends`; it rejects storeless writes, unknown stores,
`spaces`, `closed`, `shared` and `space-<id>` writes. It has no quota binding.
The three M16 fixed stores and dynamic Space route have not appeared in any of
the eight recorded deployments/available versions inspected.

All eight versions' code was downloaded and checked locally. The three oldest
counted the blob's **UTF-16 code units**, not its UTF-8 bytes. Four stores could
have received such values: `bookmarks`, `settings`, `session`, `icons`. A
512-Ki-code-unit JSON value can occupy nearly 1.5 MiB of UTF-8, so simply
reserving eight times 512 KiB would not cover every possible legacy value.
No claim is made that any customer actually has an oversized Unicode value.

Current binding inspection found only `blanc-sync` using the production Sync
namespace among the ten visible Workers, each with one production environment.
A paginated **key-metadata-only** scan observed only the four older store
suffixes and no Space keys. That is a positive observation, not a completeness
proof. The quota proof uses finite historical routes and conservative byte
bounds, not the scan's counts or apparent absence of a key.

The [verification record](../../security-reviews/2026-10-25-sync-legacy-store-verification.md)
contains version/source hashes, size semantics, binding scope and local checks.
These observations cannot prove that a trusted administrator never used direct
KV access or a now-deleted external writer. Before deployment, the owner must
confirm no such out-of-schema import/write is known, and the operator must
recheck deployed/preview versions and namespace writers. Any contrary evidence
invalidates this bounded-store strategy and requires a revised plan; do not
ignore an exceptional key or quietly increase the allowance.

## 2. Proposed limits and permanent fixed-store reserve

| Setting | Proposal |
| --- | --- |
| Account allowance | **20,971,520 bytes (20 MiB)** of conservatively charged blob storage |
| Store allowance | **256 slots**: eight permanently reserved fixed slots plus at most 248 tracked dynamic slots |
| New-account budget | **10 per UTC day**, independently configured, as already selected by the owner |
| Cleanup | Deploy with cleanup disabled; resumption requires separate review/approval |

Production currently has `NEW_ACCOUNT_DAILY_LIMIT=100` and cleanup enabled.
Nothing was changed during verification. The proposed deployment must explicitly
set 10 and disable cleanup; do not confuse those future settings with live state.
The KV new-account counter remains approximate under concurrency.

Reserve these eight slots on **every first initialization**, without a KV
list or read. A reservation exists even if its key has never existed.

| Reserved names | Slots | Maximum blob representation used for safety | Charged bytes per slot |
| --- | ---: | ---: | ---: |
| `bookmarks`, `settings`, `session`, `icons` | 4 | `3 * 524288` UTF-8 bytes, covering the historical character limit | `1,573,178` |
| `sends`, `spaces`, `closed`, `shared` | 4 | `524288` UTF-8 bytes | `524,602` |

Each charge adds the stored JSON wrapper's 58 bytes (36-character version)
and a 256-byte key allowance. The allowance is accounting headroom, not a
measurement of Cloudflare's physical metadata. Ordinary E2EE blobs are ASCII,
but the old server accepted arbitrary object values, so the larger bound must
cover non-ASCII inputs too.

```text
fixedReserve = 4 * (3 * 524288 + 58 + 256)
             + 4 * (524288 + 58 + 256)
             = 8,391,120 bytes = 8.0024 MiB
dynamicAllowance = 20,971,520 - 8,391,120 = 12,580,400 bytes

chargedBytes = fixedReserve + sum(dynamicReservedValueBytes + 256)
chargedSlots = 8 + numberOfTrackedDynamicKeys
```

The fixed reserve is **permanent while the account is in use**. A missing or
stale GET, a small successful overwrite, compaction or a single-store deletion
must not shrink it or free one of its slots. Retaining it also covers an old
fixed-store write that was already in flight at cutover. Do not introduce an
automatic "learn actual fixed sizes" optimization in this rollout.

## 3. Capacity and cost consequences to approve

The reserve deliberately charges more than an ordinary account stores. A
quota refusal can occur below 20 MiB of actual values; unused reservation is
not occupied KV data and creates no KV storage charge by itself.

At the current measured encrypted-envelope planning guide, 25 Space blobs from
320-KiB plaintext fit:

```text
8,391,120 + 25 * (436980 + 58 + 256)
  = 19,323,470 bytes = 18.4283 MiB
```

This is a planning example, not a guarantee for every 500-tab Space. Long URLs,
names, position keys and retained tab tombstones change the size. Only **23**
Space blobs at the full 512-KiB blob cap fit simultaneously with this reserve;
25 full-cap blobs would charge 21,506,170 bytes and be refused. The desktop's
25-Space cap is a maximum count, not a promise that all can reach the byte cap.
Do not silently raise the proposed account allowance to hide that tradeoff.

Deleted/orphan Space blobs count until removed. Deleting a Space compacts its
content immediately, freeing tracked dynamic bytes; its slot remains for the
30-day index-tombstone window. Turning sharing off frees nothing. The eight
fixed reservations remain even after their content is empty.

At the published paid KV storage rate, an illustrative 3,650 accounts each
charged 20 MiB represent at most 76.546048 decimal GB of charged blob storage,
about $37.77/month beyond the included 1 GB. This excludes subscriptions,
requests, DO compute/rows/storage and other namespace usage. It is not a total
bill or a flood bound; admission is approximate and active cohorts accumulate.
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/),
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
Check actual workload/DO costs and billing alerts before a deployment request;
no production ciphertext inventory is needed to make this reservation safe.

## 4. Required implementation — not performed by this plan

This is more than replacing `bootstrap()`'s list with eight GETs. The existing
accountant would replace a fixed reservation with a smaller measured value,
undoing the safety margin. The following must be implemented and reviewed on a
separate branch based on the approved code; #1132 stays unchanged meanwhile.

- [ ] Introduce a versioned ledger schema with eight fixed reservations and a
  map of dynamically reserved keys. First-use initialization performs **no KV
  inventory**. Eviction/restart loads the durable ledger rather than resetting
  charges. Unexpected existing schema/binding state fails closed for review.
- [ ] Fixed-store writes always retain their prescribed reserve and slot;
  apply current request/blob byte limits normally. The reserve is not an actual
  value: do not create placeholder KV blobs, mutate customer ciphertext or
  rewrite legacy values just to make their sizes match current limits.
- [ ] All dynamic PUTs reserve sufficient stored-value bytes and a slot in
  durable state **before KV I/O**, serialized per account. Keep the key/charge
  across crashes and uncertain write outcomes. A failure that might have stored
  the value must not free its reservation merely because a subsequent GET is
  missing or stale. Test failure both before mutation and after mutation.
- [ ] A successful serialized replacement/compaction may settle a tracked
  dynamic charge to its new stored size only when no earlier uncertain larger
  write can still land. Otherwise retain the conservative charge and report a
  retryable failure. Successful single-Space DELETE releases that dynamic
  charge/slot; failed or uncertain deletion retains it. Fixed slots never release.
- [ ] Account erasure addresses all eight fixed keys plus **every dynamic key
  known to the ledger**, independent of KV listing freshness. Do not acknowledge
  success or reset accounting after partial failure. A completed serialized wipe
  may clear the ledger; later initialization recreates the same eight reserves.
  A late fixed-only legacy write is still covered; new dynamic writes must reserve
  again. This does not add deletion fencing against another device's later write.
- [ ] No Cron/reset path may discard a live ledger because a listing is empty.
  Cleanup remains disabled in this rollout. Any future cleanup must use
  ledger-aware deletion and preserve reservations for retained/uncertain keys;
  that work and its enablement require separate review.
- [ ] Keep `507 account-quota` distinct from 413 and 429. Preserve local edits
  and retry behavior. Explain reserved headroom in technical/help records rather
  than asserting that quota exhaustion proves 20 MiB of actual ciphertext exists.

There are no legacy-account imports, inventory checkpoints, raw-locator lists
or ciphertext backups. Ledger metadata must still follow the reviewed erasure
and privacy rules; a schema change is not permission to retain erased account
content. R3 bearer-locator authority and R5 non-atomic KV/version behavior remain
open. The quota protects storage growth; it does not make sync atomic or prove
immediately complete global erasure.

## 5. Local regression and rehearsal acceptance

Future implementation must pass these tests before requesting deployment:

- [ ] Seed real local KV with every combination of the eight fixed stores;
  force stale/null reads and incomplete/throwing listings. Initialization still
  reserves all eight slots, and requires neither method to succeed.
- [ ] Use the downloaded old route behavior or equivalent vectors to seed
  Unicode values near the historical UTF-16 cap. Prove actual UTF-8 bytes plus
  wrappers are covered; ordinary eight-times-512-KiB charging must fail this test.
- [ ] Assert fixed charges cannot decrease on missing reads, smaller writes,
  deletion, restart or eviction. Interleave an old larger fixed write after
  initialization/smaller writes and verify the upper bound still holds.
- [ ] Fill dynamic storage to the remaining byte and slot limits, including
  orphan and retired keys. Refuse growth without data loss; compaction and
  confirmed deletion free only the correct dynamic charge.
- [ ] Test interrupted reservation persistence, KV write-before-error, ambiguous
  completion, failed deletion, partial account wipe and retry across eviction.
  No path undercounts extant dynamic values or forgets a possibly stored key.
- [ ] Make KV listings omit every dynamic key during erasure. Direct deletion
  from the ledger still addresses them all; a failed deletion keeps accounting
  and the client's erasure-retry credentials. No backup can restore erased data.
- [ ] An empty cleanup listing cannot reset a populated ledger. Assert the
  rollout configuration disables Cron cleanup and sets the independent daily
  limit to 10. Ordinary fixed-store sync works when dynamic capacity is full.
- [ ] Run existing quota/cache/retirement tests, full unit suite, actual local
  SQLite Worker runtime, lint and substrate checks. Rehearse mixed old fixed-only
  and new tracked dynamic clients locally. Record exact code/config refs and
  the capacity examples above; no production or real-device test is authorized.

## 6. Review, cutover and recovery gates

### A. Policy and implementation review

- [ ] Owner reviews the permanent eight-slot reserve, historical UTF-16 bounds,
  effective dynamic capacity and proposed 20-MiB/256-slot limits.
- [ ] Obtain a separate implementation go-ahead; implement §4 and pass §5.
  Return the changed Worker code for review. The approved `510f87add` does not
  automatically approve these new accounting/erasure changes.

### B. Separate approval for a single 100% cutover

- [ ] Recheck deployed and uploaded/preview version sets, every namespace writer,
  bindings and absence of a previously deployed quota ledger. Confirm the
  inspected finite legacy-store history still applies, including direct operator
  writes/imports. New evidence of an unreserved legacy store or larger bound
  stops deployment and requires a revised reservation proof.
- [ ] Present exact Worker/config/tool refs, production namespace identity,
  local test evidence, expected capacity/cost and the quota-preserving recovery
  ref. Keep the existing KV namespace. Obtain explicit deployment approval.
- [ ] Under that approval only, deploy at 100%, with no gradual traffic split,
  daily new-account limit 10 and cleanup disabled. No export, maintenance freeze
  or account-by-account migration is performed. Fixed-store reservations cover
  the allowed legacy keys before any dynamic write can be accepted.
  Confirm an old scheduled cleanup is not still in flight; disabling future
  Cron triggers does not cancel an already-running invocation. This does not
  require stopping ordinary fixed-store traffic.
- [ ] Verify the actual deployment/binding/config identity through read-only
  control-plane inspection; use aggregate error/quota/cost observations without
  logging account locators or URLs. A changed quota/namespace or writer scope
  invalidates the reviewed deployment evidence.

### C. Recovery and continuing holds

The reviewed recovery code must preserve the ledger namespace/schema and its
charges. It can refuse new dynamic writes while continuing fixed-store service
under the permanent reservations. It must not reset the accountant, estimate
usage from a stale listing or open an unmetered dynamic write route. Existing
customer data stays in place; no snapshot restoration is involved. Rehearse
this behavior locally before cutover. A failed deployment is reported and
recovered under the operator's explicit authorization, not by silently raising
limits or bypassing quota enforcement.

After any future deployment, stop for the owner: real-device validation,
deployed erasure checks, platform confirmations, #1132 merge and PR E remain
separate held work. No gate is waived by approval of this plan.

**Review packet:** production verification record, proposed reserve arithmetic
and capacity tradeoff, implementation/test refs once authorized, future exact
deployment/recovery identities, and visibly pending owner approvals. No customer
ciphertext, complete key lists or raw account locators belong in the packet.
