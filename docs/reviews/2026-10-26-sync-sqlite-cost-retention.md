# Shared Spaces: SQLite cost and recovery-history deployment review

**Prepared 2026-10-26; awaiting owner review.** Code reviewed:
[#1132](https://github.com/bnfy/blanc/pull/1132) at
`6921497287b4aec16a20b670a6e67d39be9f0558`, including #1136 and #1137.
This supplements the [conservative quota implementation review](../security-reviews/2026-10-25-sync-conservative-quota-implementation.md)
and approved #1134 at `a303b55f6`; it does not replace their migration gates.

**Recommendation:** retain authoritative SQLite and the conservative reservation,
but do not approve deployment from a storage-only estimate. Request costs dominate
under sustained polling. Separately approve the recovery-history policy below,
resolve the existing automatic-deletion promise, and establish an operating budget.
No deployment, merge, real-device test or PR E work is authorized by this document.
No production settings or public copy were changed in preparing it.

## 1. Storage boundary and what the quota actually bounds

Eight fixed stores remain in Workers KV. Each account's Durable Object holds
Space ciphertext and its schema-2 ledger in SQLite; a Space update and charge
commit together. This is SQLite-backed DO storage, **not D1 or legacy KV-backed
DO storage**, despite use of the storage `get`/`put` API.

The permanent fixed reservation is **8,391,120 bytes**, including historical
UTF-16 expansion, wrappers and key allowances. The 20,971,520-byte/256-slot
account limit leaves **12,580,400 bytes and 248 slots** for Space records.
Twenty-five 436,980-byte encrypted planning-guide blobs charge **19,323,470 bytes
(18.4283 MiB)** including the reservation. Twenty-three maximum-size blobs fit.
Reservation is accounting headroom, not occupied or billable storage.

SQLite page/ledger overhead, rate-limit keys, pairing, activity markers and
provider recovery history are outside that logical payload figure. An account
can overwrite its full allocation repeatedly: neither write volume nor retained
history is bounded by its current payload size. New-account admission defaults
to 10/day independently of quota; its KV counter is a coarse, non-atomic limit.
Existing accounts are not limited by that admission setting. With cleanup disabled,
10/day means nominally 3,650 additional accounts/year, continuing into later years,
not a rolling maximum of 3,650. This is not a bound against abuse.

## 2. Price basis and reproducible calculation

USD list prices checked against official documentation on 2026-10-26. Actual
Cloudflare billing plan, credits, existing usage and available allowances have
**not** been verified. Figures below assume Workers Paid standard pricing, before
tax, with this service receiving all listed monthly allowances. Allowances are
shared across the billing account; do not allocate them again to other Workers.

| Meter | Included monthly | Overage |
| --- | ---: | ---: |
| Workers subscription | — | $5/month |
| Worker requests / CPU | 10M / 30M ms | $0.30/M requests / $0.02/M ms |
| DO requests / duration | 1M / 400,000 GB-s | $0.15/M / $12.50/M GB-s |
| SQLite rows read / written | 25B / 50M | $0.001/M / $1/M |
| SQLite storage | 5 GB-month | $0.20/GB-month |
| KV reads / writes | 10M / 1M | $0.50/M / $5/M |
| KV deletes / lists | 1M each | $5/M each |
| KV storage | 1 GB-month | $0.50/GB-month |

Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).
SQLite key/value operations are row-metered, including deletes; do not apply
legacy DO 4-KiB billing units. DO duration uses allocated memory, including active
wait time; idle time eligible for hibernation is excluded. The calculator uses
0.128 GB and rounds DO excess usage up by published billing unit, conservatively.

Run `node docs/reviews/2026-10-26-sync-cost-model.cjs`. The adjacent calculator
checks the reservation and produces the tables' unrounded inputs. It is a
scenario model, not telemetry or an invoice forecast.

### Polling and write operations

Code basis: `cloudflare/sync-worker/src/index.js`, especially `bumpLimited`,
`handleGet`, `handlePut`, `AccountQuota.bootstrap` and `commitBlob`.
For established accounts, successful requests with a real client IP incur:

| Request | KV reads | KV writes | DO requests | Warm SQLite operations |
| --- | ---: | ---: | ---: | --- |
| Fixed GET | 4 | 2 | 0 | None |
| Space GET | 3 | 2 | 1 | 1 read |
| Fixed PUT | 3 | 2 | 1 | None |
| Space PUT | 2 | 1 | 1 | 1 read + 2 writes |

The GET writes are per-IP and per-account rate-limit counters. Short TTL does
not remove their operation cost. Fixed PUT includes its actual KV blob write.
Cold objects also read the ledger; first initialization writes one. An empty
Space GET does not create a ledger, but still consumes upstream counters and a DO
request. Local fixtures without a client IP omit an important production cost.

Illustrative sustained workload: two devices/account, eight hours/day, 30 days;
eight fixed and two Space GETs/minute/device; 20 Space PUTs and 40 fixed PUTs per
device/day (including index writes). This uses the client's ten-GET ceiling for
every active minute, **not an assertion of average use**. Assume 5 ms Worker CPU
and 100 ms active DO time/request. Cold-ledger reads are included conservatively.

| Active accounts all month | KV writes/month | Traffic + $5 base | With 1 s DO time instead |
| --- | ---: | ---: | ---: |
| 10 | 5.82M | $29.62 | $29.62 |
| 100 | 58.2M | $350.16 | $362.66 |
| 1,000 | 582M | $3,591.69 | $3,679.19 |

These exclude storage, occasional marker/admission operations, deletion, pairing,
retries, rejected traffic, logging and other account services. They are neither
upper bounds nor total bill quotations. At 100 accounts, modeled KV writes alone
cost $286; SQLite row usage remains within allowances in all three examples.
Even ignoring all other work, one account in this scenario generates 576,000
GET-related KV writes/month: **$2.88 at marginal write price**. If all allowances
are already consumed, that cost applies from the first additional write.

Duration is a sensitivity, not measured latency. Serial external-KV waits and
retries can increase it; concurrent calls to the same object can overlap. No
persistent sockets or timers are intended here. High request rates or traffic
from many IPs can greatly exceed these benign scenarios. Existing limits and
admission do not establish a global request or dollar ceiling.

### Occupied-storage illustration, independent of active usage

Assume each stored account actually occupies the historical fixed-store maximum
of 8,389,072 bytes, plus 25 normal Space blobs with wrappers. Add an **illustrative
10% SQLite overhead plus 12 KiB/account**. This is not a measured fragmentation
bound. The [DO FAQ](https://developers.cloudflare.com/durable-objects/reference/faq/)
notes small database/metadata overhead even for an empty database.

| Stored accounts | KV GB | SQLite GB | Storage/month after allowances |
| --- | ---: | ---: | ---: |
| 300 | 2.52 | 3.61 | $0.76 |
| 3,650 | 30.62 | 43.91 | $22.61 |
| 10,950 | 91.86 | 131.74 | $70.83 |

These are steady occupancy for an entire month, not charges for accounts that
arrive gradually during it. Add existing accounts. Absent fixed keys are not
charged merely because reserved. Actual Space payloads may be larger or smaller.
Do not multiply this table by 30 for PITR or assume a separate backup price:
no separately priced PITR meter was identified in the cited pricing table;
confirm treatment of history and storage accounting with the provider before
claiming an all-inclusive storage cap.

## 3. Recovery, deletion and privacy boundary

Cloudflare documents restoration of both SQL and key/value data to a point in
the preceding 30 days. SQLite `deleteAll` atomically clears the active database.
PITR is unavailable in local development, so the passing local wipe tests cannot
prove provider-history deletion. [SQLite API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

The [storage guidance](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
requires `deleteAll` to remove residual metadata and stop storage billing.
That is **not evidence of immediate destruction of recovery history**. The cited
public material does not establish whether `deleteAll` invalidates old bookmarks,
an early-purge mechanism, a configurable shorter window, or a maximum physical
purge time across provider backups. Treat erased ciphertext as potentially
recoverable through provider history for up to 30 days; do not describe 30 days
as a verified physical-destruction deadline.

Application behavior at the reviewed head:

- A completed account wipe removes the active fixed KV data and then clears
  SQLite. A failed wipe keeps `erasing` and credentials for retry; writes remain
  blocked and Settings offers Try again. This is active-service deletion only.
- Space deletion first compacts its payload; its marker/slot survives the 30-day
  application tombstone period before retirement. This period is distinct from
  provider history: compaction and final deletion can each have older versions.
- Restoring SQLite could revive ciphertext, charges and an earlier `erasing`
  value, while fixed KV data remains at a different point in time. Restoring
  only the ledger would also break authoritative accounting.
- Other configured devices can subsequently upload again. Successful wipe is
  not a permanent ban on reusing the account locator. Ciphertext is still
  encrypted; the server does not obtain the client's decryption key.

**Recommended initial policy:** prohibit PITR restores for the entire production
sync namespace, not only accounts believed to have been erased. There is no
independent complete erasure ledger with which to prove a restore is safe. Add no
restore/export endpoint, bookmark log or backup artifact. Restrict deploy and
storage privileges to operators who need them. This policy is operational, not a
technical guarantee that the provider or a privileged operator cannot restore.
Any future restoration requires a new reviewed protocol for deletion fences,
SQLite/KV consistency, quota and user consent. Never recover by rolling back to
KV-only code; preserve schema 2 and authoritative SQLite.

Provider questions for the deployment review (prepared, **not sent**):

1. After SQLite `deleteAll`, can pre-delete data still be restored, by whom, and
   for how long? Is there a supported irreversible purge or shorter retention?
2. What retention/deletion commitments cover replicas, PITR and other backups
   after active deletion? Distinguish recovery availability from physical purge.
3. Is PITR history included in SQLite stored-data billing? How are overwritten
   large key/value rows, fragmentation, metadata and `deleteAll` accounted for?

A documented response is needed before offering a stronger deletion deadline.
Alternatively the owner can explicitly accept the conservative, unresolved
provider-history boundary; that acceptance must not turn into a factual purge
claim. Neither local tests nor a test restore would establish physical purge.

## 4. Public promise conflict and proposed wording (unpublished)

`site/src/pages/privacy.astro` currently promises automatic account deletion after
about 12 months in both Sync and Retention sections. The candidate has
`CLEANUP_ENABLED=false`, and quota-bound cron skips cleanup even if that flag is
changed. Therefore **the existing promise cannot remain unchanged at Worker
cutover**, which affects fixed-store users too. Merely deferring all privacy work
to PR E leaves a deployment-time mismatch.

Choose before deployment: implement and review safe quota-aware inactivity
cleanup, or explicitly approve accurate revised retention copy to accompany the
backend change. This review recommends the latter for the initial deployment,
without advertising unreleased Shared Spaces. No public edit is made here.

Proposed backend-retention wording, subject to provider answer and owner review:

> Encrypted sync data remains in active storage until you erase the server copy.
> Automatic deletion of inactive accounts is currently paused. A successful erase
> removes the active server copy. Cloudflare provides recovery history for SQLite
> storage covering the preceding 30 days; older encrypted versions may remain in
> that history after deletion. We do not use that history to restore erased data.
> We do not promise immediate physical deletion from all provider backups. Other
> devices with Sync enabled can upload data again.

PR E must separately update privacy and FAQ for Shared Spaces: encrypted eligible
tab URLs/titles, groups, ordering, pins and custom names; exclusions; the last
shareable page rule; account quota versus per-item budget; local dormant copies;
and deletion/tombstone/history distinctions. Describe 20 MiB as the **server's
accounting allowance including reserved fixed-store capacity**, not 20 MiB of
freely usable Space data. Public copy/media remains unapproved and unpublished.

## 5. Decisions and deployment evidence still required

| Item | Recommendation / evidence needed | Status |
| --- | --- | --- |
| Storage architecture | Keep SQLite atomic Space writes and conservative fixed reservation | Existing owner direction; retained |
| Operating budget | Record actual billing tier, remaining shared allowances and recent aggregate KV/Worker usage; owner selects monthly USD ceiling | Not approved/verified |
| Cost monitoring | Proposed warning at 50%, intervention review at 80%, daily projected month-end cost; measure KV writes, DO duration/rows/storage and rejected traffic | Proposal, not configured |
| Intervention | At threshold, owner reviews traffic controls or pauses new admission; existing-account load can persist, so this alone cannot cap costs | No automatic action authorized |
| Recovery history | Adopt no-PITR-restore policy; resolve provider questions or explicitly accept stated uncertainty | Awaiting review |
| Retention promise | Approve backend copy revision or safe cleanup implementation before cutover | Deployment blocker |
| Production preflight | Reconfirm all deployed/preview writers, no preexisting Space/schema-1 data, same KV namespace; one 100% cutover and old cleanup stopped | Not repeated in this review |
| Remaining gates | #1132 stays unmerged; deployment approval, subsequent real-device/platform and server-erasure evidence, then separate PR E approval | All on hold |

Billing alerts are notifications, not a demonstrated hard spending cap. Do not
claim the 10/day admission limit makes the service cost-safe. Consider replacing
per-request KV rate-limit writes only through a separate reviewed change that
preserves abuse protection; this document does not silently change that design.

Validation performed for this review: source-path operation accounting;
calculator assertions for reservation and request counts; regenerated scenario
values; documentation diff check. Existing local Gate D evidence belongs to
`692149728`, not to a deployed environment. No remote probe, provider support
message, paid resource creation, release, public claim or configuration change
was performed.
