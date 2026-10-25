# Shared Spaces quota and legacy-inventory migration plan

**Status:** Revised after the three plan findings, October 25, 2026. Documentation only; initial policy/discovery review, not implementation or execution approval.
**Code baseline:** [PR #1132 at 510f87add](https://github.com/bnfy/blanc/pull/1132), approved by the owner for code quality. That PR stays unmerged and unchanged by this plan.
**Goal:** Charge every existing profile blob before activating the account quota, preserve existing data, and make subsequent accounting independent of stale KV listings.

Preparing or approving this document does not authorize implementation of the
missing migration tools, a production read/export, deployment, maintenance,
data mutation or deletion. Worker deployment, real-device validation and PR E
remain on hold. No current production inventory has been taken for this plan.

## 1. Decisions proposed for review

| Decision | Recommendation | Consequence |
| --- | --- | --- |
| Account byte allowance | **20,971,520 bytes (20 MiB)** | Charge serialized stored blob values plus 256 bytes per key; all fixed, live, deleted and orphan blob stores count. |
| Account store allowance | **256 blob stores** | Independent of the desktop's 25 live Spaces. Empty retained Space blobs still occupy slots. |
| New-account budget | **10 per UTC day**, independently configured | Already selected by the owner. The existing KV counter is approximate under concurrency, not a strict admission counter. |
| Legacy accounts above either allowance | Preserve every blob; record the full excess; refuse growth while permitting non-growing replacements and deletion | No truncation, eviction, automatic Space selection or unlimited grandfathered growth. Existing excess is migration debt, not evidence that every account is already under the new ceiling. |
| Migration strategy | Feasibility discovery first; then a verified mutation freeze, complete private inventory and explicit ledger import | No migration implementation until a concrete inventory method passes Gate 0. Maintenance requires separate approval. |
| Incomplete or ambiguous inventory | **Do not activate** | Stable scans and elapsed time alone cannot establish completeness. No fallback to an empty or partially populated ledger. |
| Cleanup during migration | Propose pausing scheduled cleanup under explicit maintenance approval; leave it paused after activation until separately reviewed | No new expiry policy, marker backfill or cleanup deletion is part of this migration. |
| Pre-activation abort | A **60-minute full API maintenance budget**, then the reviewed read-only abort mode | Existing ciphertext can be read without seeded ledgers; uploads, erasure and pairing remain unavailable. The owner must explicitly accept that uploads may remain paused until a later approved recovery. Otherwise do not start maintenance. |
| Recovery artifacts | Temporary encrypted inventory only; **no retained ciphertext backup** | Stream ciphertext for exact byte/hash verification without retaining a recovery copy. Purge sensitive working artifacts on success, abort or cancellation, before public API traffic resumes, and no later than 60 minutes after their first creation. |

The October 5 design rejected a Durable Object accountant at that time. The
owner's October 25 requirement rejects unbounded per-account growth; this
proposal uses the accountant reviewed in PR D. It does not approve the separate
v2 authentication/protocol migration or close R3/R5.

### What the allowance covers

For every `blob:<accountId>:<store>` key, charge:

```text
UTF8_BYTE_LENGTH(exact KV value) + 256
accountBytes = sum(charges for every extant blob key)
accountStores = number of those keys
```

The stored value is the full `{version, blob}` JSON, not plaintext, a decoded
ciphertext size or `JSON.stringify(blob)` alone. The 256-byte allowance is an
accounting reserve, not a claim about Cloudflare's physical key overhead.
Charge unknown historical store suffixes too; quarantine malformed key names
for review rather than dropping their cost or deleting them. A tombstoned
Space counts until its content is compacted, and its slot counts until DELETE
succeeds. Turning sharing off and retaining closed-tab tombstones free nothing
immediately.

Rate counters, activity markers, pairing envelopes, migration metadata and
Durable Object storage/compute are outside this blob allowance and remain
separate cost and retention considerations. An over-quota response is
`507 account-quota`; the per-blob request/size limits and `413` remain unchanged.

### Sizing and cost evidence

Eight fixed stores plus 25 live Space blobs make 33 stores. At the current
512-KiB serialized-blob cap and a 36-character version, each stored wrapper adds
58 bytes. The conservative charge is:

```text
33 * (524288 + 58 + 256) = 17,311,866 bytes = 16.5099 MiB
20,971,520 - 17,311,866 = 3,659,654 bytes of remaining allowance
```

That leaves room above 33 maximally sized current stores, but not an unlimited
history of retired Spaces. At 33 current stores, the store limit leaves 223
additional slots. With a 30-day retirement window, sufficiently rapid churn
can still exhaust them. The existing status text explains that delay.

The final numerical decision needs a **new** inventory summary: account count,
total bytes/stores, maximum and p50/p95/p99 per account, accounts exceeding each
proposed limit, store-age/marker anomalies, and the size of any legacy excess.
The October 5 observation of 42 accounts / 138 blobs is historical and cannot
stand in for these measurements. Do not raise limits automatically in response
to an outlier.

For scale only, 3,650 accounts each charged the full 20 MiB represent at most
76.546048 decimal GB of charged blob storage. At the currently documented paid
KV storage price, that isolated occupancy scenario is approximately $37.77 per
month after the included 1 GB. It excludes the base subscription, requests,
Durable Object compute/rows/storage, temporary artifact storage and other account
usage. It is **not a total bill or a flood bound**: daily admission is approximate
and active accounts can persist across multiple yearly cohorts.
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

Durable Objects introduce additional compute and SQLite storage charges.
Before deployment, measure ledger sizes and request/duration/row counts in the
local rehearsal, project them using the actual account/workload inventory, and
verify the paid plan and billing alerts. Do not assume that the KV-only estimate
covers the accountant. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## 2. Deployment prerequisites missing from the approved code

`510f87add` has lazy `AccountQuota.bootstrap()` via KV list/get. It has no
maintenance gate, manifest importer, manifest verifier or authenticated operator
interface. The existing `backfill-seen-markers.mjs` writes activity markers; it
does **not** seed quota ledgers and must not be used as an inventory/import tool.
It also refreshes marker lifetimes, which is outside this migration.

After plan review and an explicit implementation go-ahead, prepare a separate
reviewed implementation:

- [ ] A durable, fail-closed migration gate with `frozen`, `seeding`, `ready`,
  `read_only_abort` and `active` states, a unique epoch, source/config identity and recorded
  transition receipts. It must survive restarts without opening traffic.
- [ ] A separately tested read-only abort implementation that needs no imported
  ledger: allow genuine blob GETs using the existing locator/rate-limit rules,
  but refuse all public mutations, pairing and Cron. Preserve data and partial
  ledgers; make no synthetic successful write or erase response. It is degraded
  service, not restored read/write Sync and not a quota-free writable rollback.
- [ ] A maintenance response of `503` with `Retry-After` for public API
  requests while frozen. Never return synthetic `404`, empty data or a success
  for a mutation that was not performed. Successful blob GETs update activity
  markers, so gate them too. Pairing stays unavailable while frozen or aborted.
- [ ] Gate every mutation source: public routes, scheduled cleanup, auxiliary
  Workers and operator scripts. Track/drain operations admitted before the
  freeze. A failed or abandoned in-flight operation blocks the drain until
  reconciled; a timer must not silently declare it complete. Older versions
  and direct KV credentials require separate inventory and fencing below.
- [ ] A local inventory/export tool, defaulting to dry-run, with explicit
  Cloudflare account/namespace/environment assertions, complete pagination,
  bounded retries and resumable progress. Production use must require a
  separately approved operation; never rely on Wrangler's local-store default.
- [ ] A private operator Worker/service-binding path for ledger import and
  verification, with independent administrative authentication. No public
  import/reset route, no admin secret in a URL, and no authority granted by
  possession of a sync account locator. Bind authority to the reviewed epoch,
  namespace and manifest hash; remove that authority after migration.
- [ ] Idempotent per-account ledger import and readback. The same manifest
  hash is a no-op; a different manifest, wrong epoch, unverified account,
  partial batch or request during active traffic is refused. Commit the full
  ledger and its verified checkpoint atomically. No partial account may become
  eligible to write. Preflight the storage API's record-size limits; an oversized
  legacy ledger blocks migration until a reviewed representation handles it.
- [ ] A durable catalogue of all inventoried legacy account ids. A missing
  legacy ledger must return retryable unavailability, not silently re-bootstrap
  from KV. After activation, a genuinely new account can initialize an empty
  ledger only under the completed migration fence and admission policy.
- [ ] Every later quota mutation, including Cron and account erasure, must
  serialize through the accountant. Use its known store keys as well as the
  inventory when deleting; a stale listing must not free charges for data still
  stored. Retain the verified empty checkpoint/account classification after a
  completed wipe. Do not reset a live ledger merely because a KV listing is
  empty. Unknown/failed deletions retain their charge and retry.

The last two requirements prevent a later reset/cleanup from undoing a verified
seed. These are proposed activation requirements, **not capabilities asserted
to exist in PR D today**. Their code needs its own tests and owner review;
approval of `510f87add` does not approve new Worker changes automatically.

## 3. Feasibility discovery and complete-inventory criterion

Cloudflare documents KV reads as eventually consistent, including cached
negative reads; visibility can take 60 seconds **or more**. Repeated scans and
a ten-minute wait are useful diagnostics, not a documented proof of a complete
snapshot. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

Before implementing migration tools or booking maintenance, obtain a documented basis for complete enumeration
and exact values at the frozen cut: for example, a provider-confirmed complete
export with a cut identifier and coverage guarantee. Do not assume Cloudflare
currently offers that export. A different method needs a written completeness
argument and review before use. An unrelated aggregate byte count or a union of
two stale listings is insufficient. If no defensible method is available, stop
at this gate and return a revised strategy for review; do not weaken the
criterion or deploy lazy bootstrap as a substitute.

### Gate 0 deliverable: selected, available inventory method

The initial review approves policy/discovery scope only. Produce a separate
feasibility record before asking for migration implementation authorization:

1. Name the actual supported method and its authoritative documentation or
   provider confirmation. Establish complete key enumeration and exact values
   for a specific frozen cut, including stale/negative reads, expirations,
   pagination, size limits and the drain of older writers. An example of an
   export that might exist is not a passing deliverable.
2. Describe the concrete interfaces, access required, expected duration/cost,
   synthetic rehearsal and independently checkable evidence. Include artifact
   deletion/key-destruction controls compatible with §5. A provider export
   retained outside our control does not qualify merely because it is complete.
3. Record remaining assumptions and a go/no-go conclusion. The owner must
   accept this method and its evidence before Gate A implementation starts.
   If no defensible method exists, mark discovery **blocked** and propose a
   revised strategy. Do not build the control plane in anticipation of a
   hypothetical completeness source.

Discovery can inspect public documentation and prepare a provider question.
It does not authorize sending that question, accessing a production account,
exporting data, implementing tools or deploying anything. Those actions need
their own explicit authorization.

The reconciled manifest must cover **all** blob keys, including orphan Spaces,
deleted Spaces, fixed stores, historical suffixes and unexpected keys. Use
paginated list/get passes to cross-check the authoritative source, completing
every cursor even when a page contains no keys. Store count and byte count
agreement alone are insufficient: compare complete key sets, exact-value byte
lengths and hashes. [KV listing](https://developers.cloudflare.com/kv/api/list-keys/).

Any missing key, conflicting hash/length, unexpected expiration, malformed
wrapper, incomplete page, changed namespace, nonzero mutation count or changed
cut invalidates the manifest. Do not replace a missing value with zero bytes or
silently reserialize malformed/older values. Preserve ciphertext without
decrypting it. No passphrase, key or plaintext is needed.

## 4. Reviewed operational sequence — not authorized to run

### Gate A: approve preparation and policy

- [ ] Gate 0 has a selected, available inventory method, a feasibility record
  and written owner acceptance. Stop here if any of those is missing.
- [ ] Owner reviews the numerical limits, legacy-excess policy, completeness
  criterion, private artifact handling, proposed maintenance and recovery plan.
- [ ] Obtain a separate implementation go-ahead, then implement and review the missing controls in §2, with the local tests in
  §6. Record the exact Worker source SHA and pinned tool versions. Keep #1132
  unmerged; changes to its approved code require a fresh review.
- [ ] Rehearse the selected inventory method and the pre-seed abort with an
  empty and a partially imported ledger. Confirm the rehearsal fits the
  maintenance budget, including export purge and fallback transition. Prepare
  the inventory-cost estimate; an oversized rehearsal requires redesign before
  maintenance is booked, not a longer unreviewed outage.

### Gate B: separate approval for production preparation and freeze

- [ ] Present the exact Worker/config refs, existing production deployment and
  bindings, all hostnames/routes (including workers.dev/version/preview URLs),
  Cron configuration, writer identities and credential access inventory.
  Keep the same KV namespace; never create an empty replacement accidentally.
- [ ] Obtain explicit owner approval for each production deployment and for
  the maintenance window, cleanup pause, read/export and ledger writes.
  Approval of this plan alone grants none of those actions.
- [ ] Before freezing, have the reviewed abort ref already deployed and tested
  locally, with a durable deadline and activation disabled. The same maintenance
  approval must authorize the conditional read-only abort at the deadline and
  cancellation/anomaly triggers. Owner and operator must be available; agree
  the escalation channel and acknowledge the degraded-service tradeoff in §5.
- [ ] Deploy the reviewed maintenance-capable Worker at 100% traffic under
  that approval. Fence all alternate writer paths and direct KV access;
  disallow old and new writers running side by side. Confirm no older invocation
  can still write, using provider/runtime evidence rather than an assumed
  propagation delay. Freeze through the durable gate and verify the in-flight
  mutation count reaches zero. Keep Cron paused. Record the cut/epoch.
- [ ] Confirm representative API requests report maintenance, with unchanged
  non-destructive client behavior. Do not use a real-device validation candidate
  or production erasure test: those remain separately held.

Do not use gradual traffic splitting for this cutover: a remaining old writer
can bypass the accountant. Pending Durable Object migrations also need the
deployment path supported by the pinned toolchain. [Cloudflare deployment guidance](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/).

### Gate C: export, reconcile and approve the inventory

- [ ] With the freeze continuously verified, obtain the complete frozen export
  and cross-checking paginated scans. Read existing `seen:` values/expirations
  separately for diagnostics; do not backfill or refresh them as migration work.
- [ ] Produce a private manifest containing: epoch, cut/provenance, source and
  namespace identities, tool versions, timestamps, each exact key/value hash,
  value byte length, expiration/metadata, account/store grouping, computed
  charge and per-account/global counts. Sort deterministically and hash the
  complete manifest. Hash/count exact ciphertext in the export stream; do not
  retain a ciphertext recovery copy. Keep customer blob values unchanged in KV.
- [ ] Independently recompute charges from exported bytes; compare complete
  key sets and hashes against the completeness source. Classify outliers and
  missing/expired markers without deletion. Check that all account ledgers fit
  the proposed import representation. Reject empty inventory unless the owner
  has independently verified that production really is empty.
- [ ] Present only aggregate distributions, outlier counts, private artifact
  references/hashes and verification receipts in the review record. Owner
  approves the actual inventory and confirms or revises the quota values.
  Do not seed an unverified subset. Resolve discrepancies only within the
  approved time budget; otherwise take the pre-authorized abort, not an
  indefinite full API outage while awaiting an owner response.

### Gate D: seed and verify, while still frozen

- [ ] Import the approved manifest into the private legacy catalogue and account
  ledgers. Copy every account/store charge, including amounts above the new
  limits. Bind every checkpoint to the epoch and approved manifest hash.
- [ ] Read every ledger back through the private interface; independently
  compare its store set, per-store sizes, totals and checkpoint against the
  manifest. Global sums and account counts must match too. Resume interrupted
  imports idempotently; never overwrite an already-active ledger.
- [ ] Perform readback through a fresh operator invocation, not an importer's
  cached success result. Prove eviction/restart behavior in the local rehearsal
  in §6; do not turn this gate into a deployed-Worker test or delete customer
  data to manufacture a production test case.
- [ ] Reconfirm the freeze, cut identity and zero mutations. Any drift requires
  a new export/reconciliation and fresh approval. Mark `ready` only when every
  account is verified. A successful schema migration alone is not a data import.

### Gate E: separately approve activation

- [ ] Present the complete evidence bundle and quota-aware rollback ref. Obtain
  explicit owner approval of the exact activation/deployment before opening
  public traffic. No destructive schema/class migration is included.
- [ ] Verify disposal of all sensitive working exports and keys under §5,
  retaining only the non-content evidence receipt. A snapshot/manifest hash
  cannot substitute for a verified purge receipt.
- [ ] Atomically mark the approved epoch active, then open traffic through the
  reviewed gate. Missing legacy checkpoints remain fail-closed. Confirm existing
  account operations use verified ledgers; ordinary new admission uses the
  independent daily budget. Check aggregate errors, quota refusals, request
  volume, accounting drift and cost alerts without logging locators or URLs.
- [ ] Keep cleanup paused until its marker inventory, ledger-aware path and
  resumption are separately reviewed and approved. Do not change marker TTLs,
  retention or user data to make the inventory appear consistent.
- [ ] Return deployment/migration evidence to the owner. **Stop:** real-device
  validation, deployed erasure checks, platform confirmations, #1132 merge and
  PR E still require their respective explicit approvals. This migration does
  not satisfy those gates.

## 5. Failure and recovery

### Pre-activation abort without seeded ledgers

The reviewed maintenance Worker must contain a `read_only_abort` path before
the freeze begins. It uses existing blob GET handling, locator authority and
rate limits without consulting imported ledgers; normal bounded activity-marker
refreshes may continue. PUT, DELETE, pairing and Cron return retryable
unavailability. Existing values and genuine absence produce the normal GET
results; no empty replacement data, successful upload or successful erasure is
invented. It cannot create or replace a blob and therefore cannot reopen
unbounded account growth.

This restores access to the current server data, **not full read/write Sync**.
Edits remain local and erasure attempts remain visibly unsuccessful/retryable.
The owner must explicitly accept the possibility of a longer upload/erasure
pause before Gate B. If full writable service must be restored on a deadline
without verified ledgers, this strategy is unsuitable: stop at Gate A and
redesign. Do not conceal that tradeoff as a guaranteed short outage.

The maintenance authorization must cover this exact conditional abort procedure:

1. Start the durable 60-minute budget at the first public maintenance response,
   including deployment/drain time, not at the beginning of import. Record the
   deadline and the operator/owner escalation channel before freezing.
2. On a verification discrepancy or cancellation, stop export/import immediately
   and abort. At minute 45, if activation is not already approved and ready,
   notify the owner and begin disposal/fallback preparation. Do not extend the
   window to wait for an approval, export or implementation fix.
3. Dispose of sensitive working artifacts under the next subsection. Mark all
   partial seeds inactive for public mutations, revoke the run's import authority
   and invalidate its epoch. Preserve customer KV values and partial ledgers;
   do not delete a namespace, reset accounting, replay backups or declare a
   stuck operation drained just to finish the abort.
4. By minute 60, enter the pre-authorized `read_only_abort` path using the same
   already-reviewed Worker; no emergency deployment or complete seed is needed.
   The durable gate/deadline must perform this safe transition if the operator
   disconnects. It never changes to `active` on a timer. Test it with zero and
   partial imported ledgers, process restart and interrupted import.
5. Confirm representative reads work and all public mutations remain refused;
   report the abort receipt and degraded-service status. Owner acknowledgement
   is required before ending operator coverage; absent acknowledgement, escalate
   over the pre-agreed channel. Only a new approved maintenance attempt, new cut
   and verified seed can enable uploads. No stale run resumes automatically.

The budget is an operational target, not permission to bypass a safety check.
If the gate or verified artifact disposal fails, keep public traffic blocked,
declare a maintenance/privacy incident and escalate immediately; never claim
that the abort succeeded. Rehearsal must show the deadline path works without
operator intervention. A known unresolved failure prevents booking maintenance.

### Temporary artifacts, erasure and terminal outcomes

The former 14-day-after-activation backup policy is removed. Migration writes
accounting state, not customer blob contents, so recovery reconstructs a ledger
from a newly verified inventory instead of restoring customer ciphertext from
a backup. No retained ciphertext backup is authorized.

Sensitive manifests, key lists, per-account hashes/lengths and transient export
buffers are protected working data. Use an encrypted ephemeral workspace with
no ordinary filesystem/cloud backup, indexing, log upload or retained provider
export. Stream values where possible; any unavoidable provider working copy
must be covered by the same disposal controls. Gate 0 must establish that the
selected method supports this even when the operator disconnects; an artifact
path with unrevocable retained keys/copies does not qualify. Destroy the working encryption keys and dispose
of all working copies; deleting a filename alone is not secure-erasure proof.
Keep a verifiable disposal receipt with only run identity, aggregate counts,
timestamps and a non-content manifest digest, not account locators or values.

| Run outcome | Disposal deadline and service consequence |
| --- | --- |
| Success / activation | Dispose before `active` opens public traffic, and within 60 minutes of first artifact creation. No export recovery copy survives activation. |
| Abort / verification failure | Dispose during the abort, before read-only service resumes, and within the same creation-based 60-minute bound. Do not wait for a future successful run. |
| Owner cancellation | Stop work immediately and use the same abort/disposal procedure and original deadline. Cancellation does not reset retention. |
| Operator disconnect / stalled run | Durable expiry revokes access/import authority and triggers the rehearsed disposal/abort path against the original deadlines. No renewal by retry or restart. |
| Disposal cannot be verified | Fail closed and escalate as an incident at the original deadline; no public reopening or claim of completed purge. Resolve and record the breach rather than silently extending retention. |

While frozen or in read-only abort, DELETE returns failure; the client must
retain its credentials and ability to retry, rather than claim that the server
copy was erased. After activation, successful account erasure must remove the
live blobs and associated account data; there is no migration recovery copy to
outlive that success or restore later. Any retained non-content accounting
checkpoint needs a documented field/retention rule and privacy review before
activation; it must not retain an erasure-recoverable ciphertext snapshot.

The current privacy policy says encrypted Sync blobs remain until a configured
client erases the server copy and that the activity marker is erased with it
(`site/src/pages/privacy.astro`, retention section). Before export authorization,
review artifact disposal, checkpoint retention and client failure messaging
against those statements. If they cannot comply, stop and obtain separate owner
approval of a corrected approach/disclosure before export or activation; do not
defer the conflict to PR E. No privacy page or PR E work is performed by this
plan. Local tests must prove no acknowledged erasure can be followed by a
restore from a migration artifact. Post-activation recovery excludes erased
accounts and never recreates their data from old checkpoints.

### Post-activation recovery

After activation, first freeze traffic and drain before investigating. Preserve
both KV data and ledgers. Repair/import only from a newly reconciled manifest
under new approval and the same temporary-artifact rules. Never replay an older
export over newer customer writes or a completed erasure, and
never restore KV and its ledger from different points in time.

The recovery Worker must preserve the quota binding, namespace, checkpoints,
schema compatibility and enforcement. Rolling back to the old quota-free
Worker would reopen unbounded growth and is not the default recovery. Do not
delete a Durable Object class or namespace to roll back. Worker code versions
do not include KV/DO data changes, so a code rollback cannot undo a seed or
restore ciphertext. [Versions and storage state](https://developers.cloudflare.com/workers/versions-and-deployments/).

R3 (bearer locator authority) and R5 (non-atomic KV reads/version checks and
unrecoverable lost writes) remain open. Inventory integrity does not create
authentication, atomic synchronization or immediately complete global erasure.

## 6. Local implementation and rehearsal acceptance

These are future prerequisites, not tests claimed to have run for this plan.
Use synthetic ciphertext and the local Worker/SQLite runtime only until the
owner separately approves production operations.

- [ ] All cursor pages, empty intermediate pages, duplicate keys, stale/missing
  values, mismatched hashes, malformed wrappers, non-ASCII byte lengths,
  unknown/orphan stores and unexpectedly empty inventory are handled explicitly.
- [ ] A scan pair can agree while omitting a known authoritative key; verification
  must refuse that manifest. Repeated scans never silently become completeness
  proof. Wrong namespace, epoch, cut, source or manifest hash is refused.
- [ ] Freeze covers GET marker refresh, PUT, DELETE, pairing and Cron; pre-freeze
  in-flight writes drain. Restart, abandoned requests, alternate routes and an
  uncooperative old writer cannot open the gate or produce a passing receipt.
- [ ] Pre-seed abort with empty and partial ledgers reaches genuine read-only
  service within the budget. Every public mutation, pairing and Cron remains
  refused; client pending work and erasure-retry credentials survive. Minute-45
  escalation, cancellation, disconnect, interrupted import, restart and minute-60
  deadline take the rehearsed path without enabling uploads or resetting charges.
- [ ] Sensitive working data is disposed of on success, abort, cancellation and
  stalled-run expiry before service reopens. Retry/restart cannot extend the
  creation-based deadline. A purge failure blocks reopening and produces an
  incident receipt. No ciphertext backup survives activation or an abort.
- [ ] Import authorization fails from public endpoints and ordinary account
  locators. Partial import, retries, interrupted batches, eviction, oversized
  ledgers and duplicate import preserve every verified charge.
- [ ] Existing excess is imported in full; growth is refused while shrink works.
  Both limits remain independent of daily admission. Missing legacy checkpoints
  fail closed; verified new accounts start correctly after activation.
- [ ] Account wipe/partial cleanup concurrent with a write, and stale listings
  after deletion, cannot reset a live ledger or drop charges for retained keys.
  A verified empty checkpoint survives restart and supports later rejoining.
- [ ] A successful erasure cannot be undone by a migration artifact/checkpoint;
  no raw locator or account content leaks into retained completion receipts.
  Checkpoint fields/retention and artifact handling pass the current-policy review.
- [ ] Local rollback rehearsal preserves enforcement and reconciles both stores;
  no schema deletion, blind backup replay or quota-free fallback occurs.

Run the new tool/Worker tests, the existing quota regressions, actual local
SQLite runtime, lint and substrate checks as applicable. Have the owner review
the implementation and rehearsal report before requesting Gate B approval.

## 7. Review evidence and decision record

The finished operational record must identify: owner approvals by gate; exact
Worker/tool/config refs; production version/binding identities; writer fence
and drain evidence; complete-inventory provenance; the non-content manifest
digest; aggregate quota distributions/excess; import/readback and artifact
disposal receipts; maintenance/deadline/abort/activation timestamps; the
pre-authorized read-only recovery ref; escalation acknowledgement; aggregate
health observations; remaining cleanup/migration limits; and the still-pending PR D platform
gates. Leave unperformed items visibly pending rather than checking them off.

**Now:** review the policy proposals and Gate 0 discovery scope. A passing,
owner-accepted feasibility record must precede any implementation authorization.
No production work is authorized or performed by this document.
