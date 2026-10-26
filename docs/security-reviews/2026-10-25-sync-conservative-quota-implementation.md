# Conservative quota implementation — revised candidate review

Implements [plan #1134 at a303b55f6](https://github.com/bnfy/blanc/pull/1134)
on a separate branch from approved #1132 at
`510f87addcc4d5bfe28015c0e11f725a04a1c0db`. The owner additionally authorized
**authoritative SQLite storage for Space blobs on October 26**, addressing
#1137’s uncertain-upload recovery finding. This amends the plan’s dynamic KV
write mechanism; the eight-store reservation policy and capacity remain intact.

#1132 remains unchanged and unmerged. Worker deployment, real-device validation
and PR E remain on hold. This is candidate/local evidence, not release evidence.

## Storage boundary and quota

Schema 2 stores each encrypted Space representation under `blob:space-<id>`
in its account SQLite database. The same transaction writes its byte charge
into `ledger`. The value is authoritative, not a backup or a KV mirror. Fixed
stores, activity/admission counters and pairing retain their existing KV paths.
The external route/encryption/version response shapes are unchanged. Version
checks still precede the write, so same-version concurrent writers can both
succeed; this does not claim to close R3 bearer authority or all R5 lost writes.

Eight permanent fixed reservations cover historical UTF-16 bounds without a KV
inventory: four times `(3 * 524288 + 58 + 256)` plus four times
`(524288 + 58 + 256)` = **8,391,120 bytes**. The unchanged 20-MiB/256-slot limit
leaves 12,580,400 bytes and 248 dynamic slots. Twenty-three full-cap Space blobs
fit; twenty-five at the 436,980-byte envelope guide charge 19,323,470 bytes
(18.4283 MiB). Reserved headroom is not actual occupied storage.

SQLite ciphertext plus quota settle atomically for both upload and compaction.
A failure before commit leaves neither new value nor new charge. A lost response
after commit leaves both; eviction/retry reloads the complete pair. There is no
uncertain intent that needs resetting, no inference from a missing/stale KV read,
and no untracked external Space write that could arrive after its charge is freed.
Each stored value is below the existing 512-KiB blob cap plus its 58-byte wrapper;
the ledger contains metadata only, not an aggregate multi-megabyte value.

## Erasure and missing binding

Selective Space deletion atomically removes ciphertext and its charge. Account
wipe first persists `erasing`, blocks writes and directly deletes all eight fixed
KV keys plus known legacy addresses. Listing is supplementary only. Any KV
failure retains the complete SQLite database for retry. Only after those deletes
succeed does SQLite deleteAll atomically clear ciphertext and ledger. A failed
final deletion can be retried across eviction; failure never clears client wipe
credentials. Later requests and legacy fixed-only writes can still recreate data:
this adds no global deletion fence against another device.

Without ACCOUNT_QUOTA, Space reads/writes, selective deletion and account wipe
return 503, without touching ciphertext. Fixed-store sync can continue. Cleanup
is disabled and quota-bound Cron always skips; generic reset is unavailable.
Unknown schemas, including the undeployed schema 1, fail closed rather than
silently migrating or erasing ciphertext.

## Provider retention and recovery gates

[Cloudflare’s SQLite API documentation](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
describes atomic deleteAll and up to 30 days of provider PITR history. A 204
proves deletion from active storage, not immediate provider-history purge.
Local tests cannot exercise PITR. Blanc adds no restore/export endpoint or
backup artifact; restoring erased accounts is prohibited. Before deployment,
review provider retention and restoration policy; privacy/FAQ copy must accurately
state the boundary before release. The prior KV-only cost scenario does not price
SQLite row operations, storage or compute; review those costs and billing alerts.

Before deployment approval, recheck all production/preview versions and writers,
no existing Space/DO deployment, and no out-of-schema imports. Keep the existing
KV namespace, use one 100% cutover, cleanup disabled, and ensure old cleanup is
not still running. An existing schema-1 namespace requires a separately reviewed
migration; this implementation does not import one.

A future recovery must retain **schema 2 and authoritative SQLite data**. Local
rehearsal limits capacity to 8,391,120 bytes/eight slots: fixed service and
shrinking replacements continue, new dynamic keys/growth fail without forgetting
stored data. Rolling back to KV-only code would strand SQLite ciphertext and is
prohibited. Use the reviewed candidate code plus those configuration overrides
as the recovery reference, only under separate operator authorization.

## Validation

Regression coverage includes all 256 fixed-store subsets, historical Unicode,
late fixed writes, capacity/compaction/churn, upload failure before/after commit,
rollback between ciphertext and ledger writes, eviction and retry, failed
selective deletion, failed final wipe, partial KV wipe and missing binding.
The actual Wrangler/SQLite runtime checks capacity, eviction, compaction and
wipe. A disposable real KV/SQLite probe additionally tests all 256 legacy subsets
and injected failures before/after native transaction commit, then successful
retry and erasure. Its fault/inspection routes exist only in the test module.

The fixture observes both backends explicitly; normal protocol operations run
the real handler/accountant. Stale and disappearing-write cases are explicit
fault injections, not a claim that SQLite normally loses acknowledged commits.
The draft PR description records exact completed local validation counts and
reviewed source commit. No production mutation or real-device test is performed.
