# Conservative quota implementation — candidate review

Implements the owner-approved [plan #1134 at a303b55f6](https://github.com/bnfy/blanc/pull/1134)
on a separate branch from approved #1132 at
`510f87addcc4d5bfe28015c0e11f725a04a1c0db`. This is local candidate evidence,
not production or release evidence. #1132 remains unmerged. Worker deployment,
real-device validation and PR E remain on hold.

## Accounting and capacity

Schema 1 initializes from durable state, with no KV inventory. Eight fixed
reservations cover every historical fixed-store combination and the old
UTF-16 cap: four times `(3 * 524288 + 58 + 256)` plus four times
`(524288 + 58 + 256)` = **8,391,120 bytes**. Fixed reservations never shrink.
The remaining allowance is 12,580,400 bytes and 248 dynamic slots under the
unchanged 20-MiB/256-slot settings. Twenty-three full-cap Space blobs fit;
twenty-five at the measured 436,980-byte envelope guide charge 19,323,470 bytes
(18.4283 MiB). Reserved headroom does not itself occupy KV storage.

Each dynamic key reserves bytes and a slot durably before external I/O, under
one account request queue. Successful replacement settles to the new size.
Failed or interrupted writes retain their high-water charge and key. Eviction
reloads the same schema; unknown schemas and invalid limits fail closed.
Cleanup is configured off and unconditionally skips when quota is bound;
there is no generic reset endpoint. Daily new-account admission remains 10,
independent of byte/slot capacity. R3 bearer-locator authority, approximate
admission counters and R5 non-atomic version checks remain open.

## Erasure and uncertain outcomes

Account erasure deletes eight fixed keys and every durable dynamic key directly.
Listing supplements these addresses but cannot remove them or reset accounting.
Partial failure retains the complete map and blocks writes until a retried wipe
succeeds. Failed individual DELETEs retain a retryable deletion intent. Only
successful deletion releases a dynamic reservation; only a completed wipe
clears the ledger. Later writes are still possible: this adds no global fencing.

**Availability limitation for review:** an unresolved PUT intent returns 503
on further mutation of that key and on account erasure, even if the first
attempt failed before mutation. A post-write durable-finalization failure also
leaves this conservative intent. Missing/stale KV reads cannot prove that an
earlier larger write will not arrive. This candidate has no automatic outcome
reconciliation or operator reset, so ordinary retry does not clear that state.
Other keys remain usable, and clients retain erasure credentials on failure.
Resolving an uncertain intent needs a separately reviewed recovery mechanism;
the code never reports a successful wipe while forgetting a possibly late write.

## Local evidence and recovery

`sync-worker-conservative-quota.test.js` covers all 256 fixed-key combinations
with inventory unavailable, historical Unicode and late old fixed writes,
capacity exhaustion, successful shrink/delete, interrupted persistence,
KV errors before/after mutation, delayed writes after errors, finalization
failure, partial erasure across eviction, empty cleanup and unknown schema.
The other Worker tests preserve request/conflict/rate-limit behavior. The local
fixture runs the actual handler and accountant; its quota setup now includes
the permanent reserve. Native F57-7 verifies refusal and immediate compaction
recovery. The checked-in Wrangler/SQLite runtime verifies the 23-blob capacity,
fixed writes while full, eviction, compaction, selective deletion and wiping.
An additional disposable Miniflare KV/SQLite probe seeds all 256 legacy subsets
in real KV while the accountant's inventory methods throw, then seeds historical
Unicode and a late larger fixed overwrite. The probe is test-only and creates
no deployed seed or ledger-read route.
Exact completed validation counts are recorded in the draft PR description.

Recovery rehearsal retains schema/binding and changes only limits to
8,391,120 bytes/eight slots. Fixed service and shrinking replacements continue;
new dynamic keys/growth are refused without dropping existing reservations.
The candidate commit plus these configuration overrides is the local recovery
reference; its production use still needs explicit operator authorization.

Before deployment approval, recheck all deployed/preview versions, namespace
writers and absence of pre-existing quota state; obtain the owner's confirmation
that no out-of-schema imports/writes are known. Keep the production namespace,
use one 100% cutover with cleanup disabled, and ensure prior cleanup is no
longer in flight. No export, ciphertext backup, freeze or production mutation
was performed by this implementation.
