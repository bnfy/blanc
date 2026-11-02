# Sync retention wording and read-only production preflight

Status: **draft for owner review; not deployment approval**. Prepared October 26,
2026 against shipping candidate `4fc5712e788e1822ff4d22106e6a54e86a263287`
(the merge of #1159). #1132 remains open and unmerged. Worker deployment,
real-device validation and PR E remain on hold. This document changes neither
public copy nor production configuration.

> **Current status:** see [Sync deployment readiness](2026-10-26-sync-deployment-readiness.md).
> It records which of the open items below the 22:49 UTC follow-up closed, and
> the future cutover checklist. The findings here are a dated 22:30 UTC snapshot.

## Proposed backend-only copy

These replacements must be reviewed and coordinated with an eventual authorized
backend cutover. They must not go live now: production still runs automatic
inactivity cleanup. Publishing them at PR E alone would be too late if the Worker
changes earlier. This backend-only update must not advertise Shared Spaces.

In `site/src/pages/privacy.astro`, **Sync (off by default)**, replace only the
final sentence promising deletion after about 12 months with:

> Encrypted Sync data remains in active storage until you erase the server copy;
> automatic deletion of inactive accounts is currently paused. See Retention and
> deletion for erasure and provider recovery history.

In **Retention and deletion**, replace the encrypted-sync list item with:

> Encrypted Sync data remains in active storage until you erase the server copy.
> Automatic deletion of inactive accounts is currently paused. Turning off Sync
> without erasing leaves the server copy in place. A successful erase removes the
> active server copy, but cached encrypted values in Cloudflare KV may remain
> readable while deletion propagates across its network. This propagation is
> separate from provider recovery history and backups. If erasure fails, it
> remains pending and you can retry.
> Other devices with Sync enabled can upload data again. Cloudflare documents
> recovery of SQLite storage to points within the preceding 30 days. Deleted
> encrypted data may remain in that recovery history. Bananify does not use
> point-in-time recovery to restore production Sync data. We have not established
> an immediate purge mechanism or a maximum physical retention period across all
> provider backups, so we do not promise either. An activity marker records only
> when the account was last used, is refreshed at most monthly, expires after a
> year without refresh, and is removed when the account is erased. Its expiry
> does not delete the encrypted data while automatic cleanup is paused. A count
> of new Sync accounts per UTC day is kept for two days to limit server load.
> Sync is not a backup; keep a device containing the source data.

Proposed accompanying FAQ entry (new entry; no current retention FAQ was found
in `site/src/data/support-questions.json`):

**What happens when I turn off Sync or erase the server copy?**

> Turning off Sync without erasing leaves the encrypted server copy in place.
> Choose the erase option to remove the active copy. Cached encrypted values in
> Cloudflare KV may remain readable while deletion propagates across its network.
> This is separate from provider recovery history and backups. If erasure fails, Blanc
> keeps the credentials needed to retry and offers Try again. Devices that still
> have Sync enabled can upload data again. Automatic deletion of inactive Sync
> accounts is paused. Cloudflare provides SQLite recovery history covering the
> preceding 30 days, so deleting the active copy does not establish immediate
> deletion from provider history or backups. Bananify does not restore production
> Sync data from that history. See the Privacy Policy for the retention limits we
> have and have not established.

The FAQ's retry UI describes the candidate, not today's public desktop. Stage it
with the desktop version that contains that UI; the backend privacy replacement
must not depend on that release. Until then, use “If erasure fails, retry from the
configured device” instead of the sentence about credentials and Try again.
Neither variant is approved for publication by this document.

The 30 days describes the documented recovery window, **not a verified physical
purge deadline**. Provider questions in the cost/retention review remain unsent
and unanswered. Before deployment, obtain an answer or the owner's explicit
acceptance of this stated uncertainty. The approved no-PITR-restore policy
applies to the entire production Sync namespace, avoiding restoration of erased
accounts along with others.

PR E must separately cover the unreleased Shared Spaces payload, exclusions,
last-shareable-page behavior, dormant local copies, tombstones and account quota.
It remains on hold. The existing cost review's proposed paragraph is superseded
by the more explicit draft above, subject to owner review.

## Production observation: October 26, 2026, approximately 22:30–22:33 UTC

Only authenticated Cloudflare management API **GETs** were made. No sync account
locator, KV key listing/value, ciphertext, Durable Object instance, live request
log, erase endpoint, runtime probe or test account was accessed. No upload,
configuration change, preview creation, cron change, migration or deployment ran.
Raw metadata/source responses remain outside the repository; credentials and
account identifiers are not included here.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Active production deployment | `a816832c-cb3d-42ee-867c-17b74e5557fe`, created October 25 13:40:13 UTC; version `106160ef-42e6-4499-bf4f-e3c72937774e` at 100% | Single legacy version, no gradual split |
| Live source | Downloaded successfully using script content/v2; source allows only `bookmarks`, `settings`, `session`, `icons`, `sends`; unknown stores return 404; no `space-<id>` route | Current production is more restrictive than the eight-store reservation |
| Live byte bound | Serialized blob checked with TextEncoder against 524,288 bytes; request cap 525,312 bytes | Current production has a byte check; historical UTF-16 allowance remains conservatively reserved |
| KV identity | Live binding and all eight retained versions use the same namespace as the candidate's `SYNC` binding | Namespace identity matches; no data inventory needed |
| Current configuration | Compatibility date July 1, 2026; daily new-account limit **100**; cleanup enabled; max 1,000 deletes; invocation logs off | Candidate intentionally changes daily limit to **10** and cleanup to **false** |
| Cron | `17 4 * * *` remains configured | Daily schedule is active; this inspection cannot prove that no prior invocation is in flight |
| Version inventory | API returned all eight versions, numbered 1–8, total_count 8; deployment history also returned eight records | Retained metadata inspected, not an assertion about deleted history |
| Retained version bindings | Every version has only KV and, on later versions, cleanup/admission plaintext bindings; none has a Durable Object binding | No AccountQuota/schema-1 deployment visible in retained bindings |
| Durable Object namespaces | Complete response: five namespaces, all for other services; no AccountQuota or blanc-sync namespace | No current Sync DO namespace; does not prove no namespace was ever deleted |
| Other Workers | Ten scripts and their current binding sets inspected; only blanc-sync binds the Sync KV namespace; no service binding targets blanc-sync | No additional writer found among these current Workers |
| Service environments | Each of the ten services returned only production | No additional legacy service environment found |
| Routes | blanc-sync has no zone route or custom domain in the inspected metadata; workers.dev enabled | No additional Sync ingress found in those inventories |
| Version URLs | Preview URLs enabled; all eight retained versions report has_preview=true | Old versions are possible writers to the same KV resources; do not treat them as isolated test storage |

Downloaded live content response SHA-256:
`56c6609fded3c91d8a7f1fa5018252f4730e2f574d300e0e666cb0dcb60316cb`.
This hashes the returned multipart content, not a reproducible source bundle.
The active version's script etag is
`f5573782a6eca1aa9668d5d18927cee013b191887a023a61a497db197bdf8969`.

## What remains before a deployment decision

This is a **qualified preflight, not a clean deployment sign-off**:

1. Close the remaining writer/history evidence gaps. Historical source bodies
   were not inspected for all seven superseded versions. Current service
   environments and Version URLs are not a complete inventory of the newer
   isolated branch Preview product. Verify its dashboard inventory and any
   bindings before cutover. Confirm with the operator that no direct/manual KV
   import, removed deployment/namespace or external writer introduced Space keys
   or schema-1 data. No data listing is requested as a substitute for that
   history; the conservative plan avoids an eventually consistent inventory.
   Unexpected evidence requires review, not an empty-ledger reset or deletion.
2. Disable Version URLs before the candidate cutover, under separate explicit
   operator authorization. Prepare and review a configuration change setting
   top-level `preview_urls = false` in `cloudflare/sync-worker/wrangler.toml`;
   omission preserves the currently enabled setting. Keep the production
   workers.dev endpoint enabled. Apply the Version URL disable through the
   dashboard before uploading the candidate, then carry the explicit false
   setting in the reviewed candidate configuration so subsequent deployments
   preserve it. Verify management metadata reports `previews_enabled=false`
   and that every inventoried old Version URL and alias is blocked by the
   platform, rather than merely returning the Worker's own unknown-route 404. Use
   requests without account locators, credentials or sync payloads; do not call
   blob or erase routes. Record the URL inventory, verification time and results
   in the private operator evidence. If any URL remains reachable, the inventory
   is incomplete, or either verification fails, **stop before candidate upload
   or cutover** and return for review. Do not deploy a candidate preview against
   production resources. This does not close the separate isolated branch Preview
   inventory gap in item 1. No configuration change or URL probe is authorized or
   performed by this document.
3. Approve the retention replacements and provider-history uncertainty (or
   obtain provider clarification), then coordinate the public backend wording
   with deployment. Until then, keep current public wording and Worker unchanged.
4. At authorized cutover, re-read the exact candidate head/configuration and
   production identity. Use the same KV namespace, SQLite AccountQuota migration,
   20 MiB/256-store allowance, fixed reservation 8,391,120 bytes/eight slots,
   daily admission 10, cleanup false, invocation logs off, explicit
   `preview_urls = false` with item 2's shutdown evidence, and one 100% rollout.
   Establish old cleanup is no longer running; a cron configuration read alone
   does not prove this. Preserve schema 2/SQLite on any recovery; never roll back
   to KV-only code. These are future operator steps, not actions performed here.
5. Activate and verify the approved billing observation/alert procedure under
   separate authorization. The $50 usage budget is approved; alerts are not a
   cap, existing alert delivery has not been tested, and monitoring is not active.
6. Obtain separate explicit Worker deployment approval. Afterwards, only when
   authorized, perform the held exact-head real-device/platform and active-server
   erasure checks. Neither this metadata preflight nor local Gate D replaces them.
   #1132 remains unmerged and PR E remains on hold.

## Sources and verification

- [SQLite storage/PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/): preceding-30-day recovery window; not evidence of physical purge.
- [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/): versions use their existing resources.
- [KV deletion](https://developers.cloudflare.com/kv/api/delete-key-value-pairs/): successful deletion can take time to propagate across the global network.
- [Preview resource isolation](https://developers.cloudflare.com/workers/previews/resources/): isolated Previews are distinct; service bindings may still reach production.
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/): code/config versions do not version underlying stored data.
- Repository candidate: `cloudflare/sync-worker/wrangler.toml` and `src/index.js`;
  [approved cost/retention review](2026-10-26-sync-sqlite-cost-retention.md),
  [billing procedure](2026-10-26-sync-billing-budget.md), and
  [conservative quota review](../security-reviews/2026-10-25-sync-conservative-quota-implementation.md).

Validation: management metadata/source inspection and documentation diff check.
No runtime code or public site was changed; no new runtime tests are needed for
this draft. Evidence is a dated snapshot and must be refreshed at cutover.
