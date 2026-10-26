# Verified Cloudflare billing and approved Sync operating budget

Prepared October 26, 2026, from the authenticated BNFY dashboard and read-only
Cloudflare API queries. The owner approved #1159 at `8fa787a55`, then explicitly
approved the $50 budget and intervention procedure in this chat on October 26
and requested this repository record.

**Approved:** the budget scope, thresholds and procedure below. **Still held:**
#1132 merging, Worker deployment, real-device validation and PR E. This record
implements no operational change. Alert configuration and monitoring are not
active merely because their procedure is approved. Admission changes, emergency
suspension and restoration retain their explicit owner-authorization steps.

## Verified billing

- Workers Paid is active; both the account default and deployed `blanc-sync`
  Worker use Standard pricing.
- Current usage cycle: October 17–November 16, 2026. Dashboard observation:
  October 17–26, 10 of 31 cycle days. It reports $0.00 usage cost and projected
  cycle cost, with all listed meters within included tiers.
- October 17 invoice, marked Paid in the dashboard: Workers Paid $5 plus Basic
  Load Balancing $5 = $10. Other products/domain invoices are separate. A zero
  usage charge is not a zero total Cloudflare bill.
- Existing account-wide budget alerts: $10 and $30, one recipient each. Delivery
  was not tested and recipient details were not copied. Alerts were not edited.

Current cycle dashboard totals (rounded as displayed):

| Meter | Usage so far | Monthly included | Approximate remaining |
| --- | ---: | ---: | ---: |
| Worker requests | 206.42k | 10M | 9.794M |
| Worker CPU | 3.96M ms | 30M ms | 26.04M ms |
| KV reads | 195.74k | 10M | 9.804M |
| KV writes | 109.39k | 1M | 890.61k |
| KV deletes / lists | 52 / 500 | 1M each | Almost all |
| DO requests | 16.91k | 1M | 983.09k |
| DO duration | 76.29 GB-s | 400,000 GB-s | 399,923.71 GB-s |
| SQLite rows read | 16.96k | 25B | Almost all |
| SQLite rows written | 16.87k | 50M | Almost all |

KV/SQLite storage displayed as 0 GB-months is rounded; it does not prove no data.
The separate analytics query showed 19,564,135 bytes across all KV namespaces on
October 25 (sum of each namespace's daily maximum), including 5,626,771 bytes in
SYNC. Existing DO namespaces belong to tab import and another app; no production
AccountQuota namespace appeared in the namespace listing. That listing alone is
not the full production-writer/migration preflight.

## Separate analytics window

October 1–25 UTC, excluding partial October 26: approximately 391,028 account
Worker requests, of which 67,757 were `blanc-sync`; 497,030 KV reads, 312,290
writes, 100 deletes and 1,460 lists across the account. SYNC contributed 229,740
reads, 133,390 writes, 70 deletes and 40 lists. These are adaptive analytics,
which may be sampled; they are not invoice line items. The dashboard billing
cycle is different, so do not subtract these totals from current-cycle allowances.

The aggregate analytics API temporarily throttled further billable-CPU and
SQLite-storage queries. The authenticated billing dashboard supplied the needed
cycle totals instead; no retries or access expansion were needed.

## Approved initial $50 usage ceiling

Use **$50 per actual billing cycle for Workers + KV + Durable Objects usage
charges across this shared account**, excluding fixed subscriptions, tax,
domains and other products. This deliberately includes existing applications'
consumption of these shared allowances. It is an operational ceiling requiring
intervention, not a provider-enforced cap. Keep the $5 Workers subscription
separate; do not describe $55 as the entire Cloudflare account bill.

The current run rate is well inside allowances. A straight 31-day projection of
the 10 observed days gives 339,109 KV writes and 12.276M Worker CPU-ms. These are
illustrative projections, not forecasts; daily traffic and provider reporting
lag can change them.

Applying the approved cost model's sustained workload to that projected shared
baseline (two devices/account, eight hours/day, ten GETs/minute/device, 20 Space
and 40 fixed PUTs/device/day, 5 ms Worker CPU, 100 ms DO duration/request) for a
full 31-day cycle gives:

| Additional heavily active accounts | Estimated operations usage charge |
| --- | ---: |
| 0 | $0.00 |
| 10 | $27.77 |
| 15 | $45.91 |
| 100 | $359.53 |

Storage, exceptional requests and reporting uncertainty still need headroom.
This does not impose a user cap or predict average activity. It shows why an
unrestricted launch cannot be justified from today's small bill. Keep admission
at the separately approved 10/day initially; reassess it using measured traffic
before public rollout. New-account admission alone does not control existing
users' polling costs.

## Approved monitoring and intervention procedure

Owner: Anthony. Approval covers this operating procedure and its thresholds;
it does not grant an agent standing authority to deploy, change admission,
suspend or restore service. Those actions need the separate authorization
specified below. Raising the budget also requires an explicit owner decision.

1. Before deployment, confirm the existing alert recipients, add/test a $50
   critical usage alert, record the current-cycle baseline and verify access to
   billing/namespace/Worker metrics. Alerts are account-wide; triage other
   products before attributing their cost to Sync. No alert has been added now.
2. Review once daily at 16:00 UTC during the first seven days after eventual
   deployment. Use current-cycle billed usage plus 24-hour and seven-day rates,
   track KV writes first, then Worker CPU/requests, DO duration/rows/storage.
   Reconcile namespace analytics with billing; billing is authoritative. Record
   aggregate counts only, without account locators, IP addresses or ciphertext.
3. At $10 actual usage, or projected component cost above $25, investigate within
   one business day. At $30 actual, projected cost above $40, or a material sudden
   traffic spike, notify the owner immediately and check hourly until explained.
   Use the larger of current average and trailing-day projected burn, with an
   explicit warning when a deployment burst makes projection unreliable.
4. If Sync is driving that escalation, recommend pausing new account admission
   (`NEW_ACCOUNT_DAILY_LIMIT=0`) under separately authorized deployment/change
   control. This preserves stored data but can also affect accounts whose activity
   marker expired; do not promise it is invisible to every returning user.
   It will not reduce existing-account GET traffic, so measure the next hour.
5. At $50 actual component usage, or projected crossing within 24 hours, obtain an
   immediate owner decision: accept a named higher ceiling, apply a reviewed
   traffic fix, or temporarily suspend the Sync endpoint. Never silently increase
   the ceiling or assume pausing admission is sufficient.
6. Emergency suspension, only if specifically authorized: disable the public
   `blanc-sync` workers.dev route through its Domains & Routes controls; inspect
   all other production/preview routes and ensure traffic is not bypassing it.
   Preserve the Worker, bindings, KV and SQLite data. Sync and remote erasure are
   unavailable during suspension. Verify invocation growth drops. Do not delete
   storage, rotate locators, use PITR, or roll back to KV-only code. Freeze deploys
   while suspended: Wrangler can re-enable workers.dev on the next deploy unless
   configuration explicitly keeps it off.
7. Restore service only after owner approval of the cause, fix and revised burn
   estimate, with retained-data/merge checks and observation. A budget incident
   never authorizes release work, marketing or a storage purge.

Cloudflare budget alerts do not stop spending and may arrive after costs accrue.
The procedure needs a reachable operator; there is no guaranteed $50 hard cap.
No scheduled monitoring or incident action was activated by this repository update.

## Sources and evidence

- Authenticated dashboard: Billing / Subscriptions, Billable usage, Budget Alerts,
  and Invoices; read October 26, 2026. Current billing totals are rounded UI values.
- Latest paid invoice downloaded for verification, held locally only:
  October 17, 2026 paid invoice, pages 7–8. The full invoice is retained locally;
  it is not committed because it includes unrelated billing and personal details.
- Read-only API: workers/settings, workers/account-settings,
  workers/scripts/blanc-sync/settings, durable_objects/namespaces and GraphQL
  KV/Worker/DO aggregate datasets. No sync blob contents were fetched.
- [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
- [Cloudflare workers.dev controls](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Approved scenario model](2026-10-26-sync-cost-model.cjs).
- [Sanitized billing evidence and projection inputs](2026-10-26-sync-billing-evidence.json).
  Dashboard values are rounded as displayed. API aggregates exclude partial
  October 26 and use a different date window; neither is silently substituted
  for the other. Raw API responses, credentials, account identifiers, invoice
  files, payment details and billing addresses are not committed.

All holds remain: #1132 unmerged; Worker deployment, real-device validation and
PR E require their separate approvals. The budget/procedure approval does not
satisfy the provider-retention or public-copy gates.
