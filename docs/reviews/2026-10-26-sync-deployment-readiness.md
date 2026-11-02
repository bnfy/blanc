# Sync deployment readiness: closed evidence gaps and future cutover checklist

Status: **configuration, checklist and retention wording approved by the owner
on October 26, 2026; not deployment approval** (see *Owner decisions*). Prepared
on `codex/sync-deployment-readiness`, from the #1168 merge `2aefa5dc8` plus
`cafa6620` (Shared Spaces hidden in packaged builds). #1132 merged into main at
22:57 UTC with that change. Worker deployment, real-device validation and PR E
remain on hold. Nothing here was deployed or uploaded, and no production
setting, schedule, alert or billing configuration was changed. Until this record
merges, main's `cloudflare/sync-worker/wrangler.toml` still has the legacy cron
and no `preview_urls` setting: don't deploy the Sync Worker from main.

Update, October 28, 2026: the M16 Worker was uploaded to production at
2026-10-27 00:39 UTC despite this hold (Cloudflare version
`ec302891-ce5f-4a29-9095-39fb6f305e1f`). It was found during the v1.44.1
release, and the owner accepted the deployed Worker as it stands; see the
[v1.44.1 incident](../release-incidents/2026-10-28-v1.44.1.md#the-sync-worker).
The rest of this record is unchanged.

This record supersedes the open-item list in
[the October 26 preflight](2026-10-26-sync-retention-preflight.md) ("What remains
before a deployment decision") as the **current status**. That preflight stays the
record of its 22:30 UTC observation; its dated findings are not current status.

## What this branch proposes

**Configuration (`cloudflare/sync-worker/wrangler.toml`), for review only:**

| Setting | Proposed | Why |
| --- | --- | --- |
| `preview_urls` | `false` | Old versions' Version URLs reach the same KV namespace and would write around the SQLite quota and erasure path. Explicit `false` disables Version URLs and aliased Version URLs; if the key is omitted, Wrangler leaves the existing (enabled) setting unchanged. |
| `workers_dev` | `true` | Keeps the production endpoint. Stated explicitly so the Version URL change can't be read as turning off `workers.dev`. Consequence: if `workers.dev` is ever turned off in the dashboard (the billing procedure's emergency suspension), the next Wrangler deploy turns it back on, so deploys stay frozen while suspended. |
| `crons` | `[]` (was `["17 4 * * *"]`) | An additional safeguard. Deploying with `crons = []` removes every cron trigger; omitting `crons` would leave the legacy trigger in place. It does **not** drain old invocations, so the removal must happen and be confirmed before cutover (phase D). |

`CLEANUP_ENABLED = "false"`, `NEW_ACCOUNT_DAILY_LIMIT = "10"`, the 20 MiB/256-slot
quota, the `ACCOUNT_QUOTA` SQLite binding and its migration, the existing `SYNC`
namespace and `invocation_logs = false` are unchanged from the reviewed candidate.
`test/unit/sync-worker-conservative-quota.test.js` now also requires the three
settings above. `cloudflare/sync-worker/README.md` no longer describes the daily
cron as part of the checked-in configuration.

**Evidence:** [`2026-10-26-sync-deployment-evidence.json`](2026-10-26-sync-deployment-evidence.json),
a sanitized snapshot observed at 22:49 UTC. Raw responses, decoded sources,
credentials and account and billing identifiers stay in the operator's private
evidence folder.

## Evidence gaps closed by the 22:49 UTC snapshot

Only authenticated management API GETs and source inspection were used. No sync
account locator, KV key listing or value, ciphertext, Durable Object instance,
runtime endpoint or log of user requests was read.

| Former gap | Evidence now | Limit |
| --- | --- | --- |
| Source bodies of the seven superseded versions were not inspected | All eight retained versions' modules were retrieved via the documented versions GET (`?include=modules`); module SHA-256s and version IDs are in the evidence JSON. Versions 4–6 share one module. | Covers retained versions only. Deleted versions and history can't be reconstructed. |
| Could an earlier version have written Space blobs or schema-1 ledgers? | No retained version has a Space route or a Durable Object binding. Every one accepts only fixed stores and rejects unknown ones: v1 `bookmarks`, `settings`; v2 adds `session`; v3–v7 add `icons`; v8 adds `sends`. | Same as above. |
| Historical blob-size units | v1–v3 checked 524,288 **UTF-16 code units**; v4–v8 check 524,288 **UTF-8 bytes**. The four stores ever accepted under the UTF-16 check are exactly the candidate's `OLD_CHARACTER_STORES` (bookmarks, settings, session, icons), the four reserved at three times the size. This supports keeping the 8,391,120-byte/eight-slot permanent reservation. | It shows the reservation's assumption holds for retained versions; it isn't a data inventory. |
| KV namespace identity | All eight versions bind the same namespace as the candidate's `SYNC`. | — |
| Isolated branch Preview inventory | The branch Preview API returned complete, successful, zero-item inventories for all ten current Workers, and the Sync dashboard showed "Create your first Preview". Worker names and modification times matched the earlier ten-Worker inventory, whose binding check found only `blanc-sync` binding the Sync namespace and no service binding targeting it. | Dated snapshot; refresh at cutover (A2). |
| Out-of-band writers, imports or deleted Sync resources | Operator attestation, October 26: **"None known; only reviewed deployments."** | An attestation, not independent proof reconstructing deleted history. |
| Provider recovery and backup retention | The owner **accepted the stated uncertainty**: Cloudflare documents 30-day SQLite recovery, but no immediate purge mechanism or maximum physical backup retention has been established, and production Sync data is never restored with point-in-time recovery. | Risk acceptance only. It doesn't publish copy or authorize deployment. The provider questions in the cost review remain unsent. |
| Current production state | Unchanged from 22:30: deployment `a816832c…`, version `106160ef…` at 100%, cleanup enabled, daily admission 100, cron `17 4 * * *`, `workers.dev` and Version URLs enabled, no Sync Durable Object namespace. | Dated; re-read at A2 and G1. |

## Still not performed

These are operational prerequisites. Each needs its own explicit owner
authorization, and none has been done:

1. **Version URL shutdown and verification** (phase C), including an inventory of
   aliases. The evidence JSON records one Version URL per version and no alias
   inventory.
2. **Cron removal and drain** (phase D).
3. **Billing alerts and monitoring** (phase E). The $10 and $30 alerts exist, but
   their delivery is untested. No $50 alert exists, and monitoring isn't active.
4. **Publication of the approved backend retention wording** (#1168's draft at
   `b177a35da`), timed with phase D (phase B).
5. **Deployment approval and the deployment itself** (phases F and G). After that,
   and only when separately authorized: exact-head real-device and platform checks,
   and active-server erasure checks.

## Future cutover checklist

Not executed. Steps are written for the operator. Record every observation
(time, request, result, response hash where relevant) in the private evidence
folder. No step uses an account locator, credentials in a URL, sync payloads, a
test account, or the blob or erase routes. **Any stop condition means stop,
leave production as it is at that point, and return for review.**

### Phase 0: authorization and freeze

- Written owner approval naming the phases, the exact candidate SHA and the window.
- No other `blanc-sync` deploys or setting changes during the window; one reachable
  operator for all of it.

### Phase A: refresh (read-only)

A1. **Exact head.** Clean checkout of the approved SHA. Confirm in
`wrangler.toml`: `SYNC` id `0e6ba79c73d64d77bbb76886666c33d5`;
`ACCOUNT_STORAGE_QUOTA_BYTES = "20971520"`; `ACCOUNT_STORAGE_MAX_STORES = "256"`;
`NEW_ACCOUNT_DAILY_LIMIT = "10"`; `CLEANUP_ENABLED = "false"`; the `ACCOUNT_QUOTA`
binding and `v1-account-quota` `new_sqlite_classes` migration;
`invocation_logs = false`; `workers_dev = true`; `preview_urls = false`;
`crons = []`. Then:
- run `node --test test/unit/sync-worker-conservative-quota.test.js test/unit/sync-worker-budget.test.js`;
- run `npm run lint`;
- run the pinned Wrangler 4.144.0 `deploy --dry-run` with `WRANGLER_SEND_METRICS=false` and a private `--outdir`.

A2. **Production identity.** Re-read the same metadata as the evidence JSON:
- active deployment and version;
- cleanup, admission, cron, `workers.dev` and Version URL settings;
- Durable Object namespaces, which must still include no AccountQuota namespace;
- the versions list; any version not in the JSON needs its modules retrieved and checked as above;
- the branch Preview inventory of every Worker;
- every Worker's bindings, which must show only `blanc-sync` binding `SYNC` and no service binding to it;
- routes and custom domains;
- **every Version URL and alias**.

Stop if anything differs from the evidence JSON without an explanation.

### Phase B: retention copy, coordinated with phase D

Prepare the approved backend wording as a reviewed site change before phase D,
and publish it promptly after D6 passes, no later than the end of phase G.
Removing the cron in phase D makes today's promise ("deleted after about 12
months") untrue, while the new wording ("automatic deletion … is currently
paused") is true from then on, even if the cutover is later aborted. Don't start
phase D unless the copy is ready, and don't re-add the cron after publishing
without first reverting the copy.

### Phase C: Version URL shutdown, before any candidate upload

C1. Record the inventory from A2: every version's Version URL and every alias.

C2. Before probing, identify from the retained legacy source what the legacy
Worker returns for `GET /` (its own unknown-route response). Don't probe
production to learn this.

C3. Dashboard: Workers & Pages → `blanc-sync` → Settings → Domains & Routes →
Version URLs → **Disable**. Don't touch `workers.dev`.

C4. Management GET of the script's subdomain settings: expect `enabled = true`
and `previews_enabled = false`.

C5. Send one `GET /` to every inventoried Version URL and alias. **Pass:** a
response generated by the platform (Cloudflare's own page or error for a
disabled URL), distinguishable from C2's response. **Fail:** any response
generated by the Worker, including its unknown-route 404, or any 2xx.

C6. Send one `GET /` to the production `workers.dev` URL. It must still produce
the Worker's own C2 response.

**Stop** if:
- `previews_enabled` isn't `false`;
- any URL fails C5, or a response can't be classified;
- the inventory is incomplete.

Don't upload the candidate. Version URLs off is a safe resting state for the
legacy service.

### Phase D: remove the legacy cleanup trigger and drain it

Facts this relies on (Cloudflare docs):
- trigger changes take up to 15 minutes to propagate;
- a scheduled invocation has a 15-minute wall-time limit;
- Cron Events lists the 100 most recent invocations and can take up to 30 minutes to show new events.

D1. **Window.** Choose T0 outside 03:30–05:00 UTC. The legacy cron fires at
04:17 UTC, and its invocation ends by 04:32 at the latest. With T0 at or after
05:00, the last invocation has already finished. With T0 at or before 03:30, the
next fire time is more than 45 minutes away, well beyond the propagation delay.

D2. **Before T0.** Open Settings → Trigger Events → View events. Record the
latest invocation's scheduled time and status. It must show as finished (success
or failure). If that run was less than 45 minutes ago, wait.

D3. **T0.** Dashboard: Triggers → the `17 4 * * *` trigger → ⋮ → **Delete**.
Upload no code and change nothing else. Don't use `CLEANUP_ENABLED` or a legacy
redeploy to stop cleanup: either would upload a new legacy version. Cloudflare
recommends managing triggers through the Wrangler config. The dashboard is used
here so no code is uploaded before the candidate, and the candidate's
`crons = []` keeps the trigger removed afterwards.

D4. **T0 + 1 minute.** Management GET of the schedules: it must return none.

D5. **At or after T0 + 30 minutes.** Schedules still empty, Cron Events show
nothing after the D2 invocation, and the active deployment is unchanged.

D6. **Positive confirmation.** Let the next 04:17 UTC pass. At or after 04:50
UTC, Cron Events must show no invocation that day and the schedules must still
be empty. Only then may phase G start. Skipping D6 needs an explicit owner
decision.

**Stop** if:
- any invocation appears after T0, or any invocation is unfinished;
- the schedules aren't empty;
- the events can't be read;
- the deployment changed.

Don't re-add the trigger. Report instead.

### Phase E: billing observation, ready before deployment

Under the approved $50/cycle shared Workers, KV and Durable Objects usage
budget, with intervention thresholds at $10, $30 and $50:

E1. The owner confirms that the existing $10 and $30 alerts go to the intended
operator addresses. Record that they did; don't copy the addresses.

E2. Add a $50 Budget Alert: Manage Account → Billing → Billable Usage → Set
Budget Alert (or Notifications → Add → Budget Alert).

E3. Delivery. Cloudflare documents email delivery but no test send. Budget
alerts are computed daily from the previous day's usage, so they arrive the day
after a threshold is crossed, and they fire once per billing cycle. Record
delivery as **unverified**. The daily 16:00 UTC review for the first seven days
is the primary control.

E4. Record the current-cycle baseline, and confirm access to Billable Usage and
to the Worker, KV and Durable Objects metrics.

E5. Put the seven daily reviews in the calendar with a named operator.

### Phase F: deployment approval

Separate written owner approval naming the SHA and the window, after reviewing
the A–E evidence. The approved retention wording and the accepted provider
uncertainty must be the ones in force.

### Phase G: cutover, one 100% deployment

G1. Re-check A2 quickly: nothing changed, `previews_enabled = false` and the
schedules are empty.

G2. Run the pinned Wrangler 4.144.0 `deploy` once from the clean checkout, with
`--config cloudflare/sync-worker/wrangler.toml`. Don't use gradual deployments
or a percentage split.

G3. Verify by management GETs:
- one new deployment, its single version at 100%;
- the AccountQuota namespace exists and is SQLite-backed;
- bindings `SYNC` (same id) and `ACCOUNT_QUOTA`;
- vars 10, 20971520, 256 and cleanup `false`;
- no schedules;
- `previews_enabled = false` and `workers.dev` enabled;
- invocation logs off;
- the new version's Version URL gives a platform response, as in C5.

G4. No data probes or test accounts. Those remain held.

### Phase H: after cutover

- Run the billing procedure's daily reviews.
- Publish the backend copy if phase B hasn't already.
- Run real-device, platform and active-server erasure checks only when separately authorized.

### Recovery rules

- **Never roll back to KV-only code.** Legacy versions don't know the SQLite
  ledger or the Space records, and they would bypass the quota and erasure path.
  Recover forward only, preserving schema 2 and the authoritative SQLite data.
- For runaway cost or misbehaviour, follow the billing procedure's step 6:
  disable `workers.dev` in the dashboard and freeze deploys. The config says
  `workers_dev = true` and would re-enable the route.
- A stop in phase C or D leaves Version URLs off or the cron removed. Both are
  safe resting states for the legacy Worker.

## Owner decisions

Approved by the owner on October 26, 2026, after reviewing this record:

1. The three configuration settings, including removing the cron as an
   additional safeguard.
2. This checklist, including the D6 wait and the C5 pass criterion.
3. The backend retention wording drafted in #1168 (`b177a35da`), for publication
   with phase D as phase B describes. It is not published yet.
4. The provider-retention uncertainty stays accepted as stated. The provider
   questions remain unsent.

**Not approved:** the Worker deployment and every production step in phases C–G.
Each still needs the separate written authorization in phase 0 and phase F,
naming the exact candidate SHA and the window. The held real-device and erasure
checks and PR E remain on hold.

## Sources

- [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/): `preview_urls = false` disables Version URLs and aliased Version URLs; omitting it leaves the setting unchanged; dashboard steps.
- [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/): a dashboard-disabled route is re-enabled by the next Wrangler deploy unless the config says `workers_dev = false`.
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/): `crons = []` removes all triggers, and omission leaves them; changes take up to 15 minutes to propagate; Cron Events lists the 100 most recent invocations and may lag up to 30 minutes.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and the [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/): 15-minute wall time per scheduled invocation.
- [Versions GET with modules](https://developers.cloudflare.com/api/typescript/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/): source retrieval for the evidence JSON.
- [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) and [KV deletion](https://developers.cloudflare.com/kv/api/delete-key-value-pairs/): recovery window and propagation, as in the preflight.
- [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/): email notification, daily calculation, once per cycle.
- Repository: [retention preflight](2026-10-26-sync-retention-preflight.md), [cost and retention review](2026-10-26-sync-sqlite-cost-retention.md), [billing budget and procedure](2026-10-26-sync-billing-budget.md), [conservative quota review](../security-reviews/2026-10-25-sync-conservative-quota-implementation.md).
