# Sync storage budget — design

**Date:** 2026-10-05
**Status:** Draft for owner review
**Scope:** `cloudflare/sync-worker` (v1), its deployment, and the privacy page. No desktop app change is required.

## 1. Problem

The v1 sync Worker (`cloudflare/sync-worker/src/index.js`) accepts writes from
any client that can send HTTP. It stores up to four stores per account
(`bookmarks`, `settings`, `session`, `icons`), each capped at 512 KB
(`MAX_BLOB_BYTES`), under an `accountId` the client chooses. The only throttles
are a per-IP limit of 120 requests a minute and a per-account limit of 30 GETs
a minute (`IP_RATE_LIMIT`, `RATE_LIMIT`). Nothing limits how many accounts
exist, and nothing ever expires.

So anyone can grow Bananify's KV storage without bound: a fork that keeps the
endpoint, or anyone with `curl`. PR #583 stops renamed builds from calling the
service, but it is client-side and does nothing about direct requests.

Production today (read-only KV listing, 2026-10-05): 144 keys, 138 blobs across
**42 accounts** (bookmarks 41, settings 42, session 42, icons 13). The 6 keys
with an expiration are rate-limit counters. Storage cost is effectively zero;
the exposure is the absence of any upper bound.

## 2. Decisions already made (owner, 2026-10-05)

1. **Inactive accounts are deleted after 12 months without use.** "Use" means
   any Blanc device reading or writing the account, not only uploading.
2. **When the daily budget is reached, only new accounts are refused.**
   Existing accounts keep syncing normally.
3. **Approach: a KV-only budget** (markers, a daily counter, a scheduled
   cleanup). A Durable Object accountant was rejected for now because it
   overlaps the separately approved v2 sync migration.

## 3. Why activity must include reads

The desktop client uploads Favorites and settings only when they change, but
reads every store on each sync pass (`syncOne` in `src/main/sync.js` performs a
GET before any PUT). A person who opens Blanc daily but never edits a favorite
would never upload. An expiry based on writes alone would delete that person's
data, so any successful read must count as activity.

## 4. Design

### 4.1 Activity marker

A new key per account:

```
seen:<accountId>  →  {"touchedAt": <ms since epoch>}   expirationTtl = 365 days
```

- **Set or refreshed by:** a successful PUT, and a GET that returns 200.
  A GET that returns 404 never creates a marker, so probing random account IDs
  creates nothing.
- **Refresh at most once every 30 days.** The Worker reads the marker on each
  qualifying request and rewrites it only if `touchedAt` is older than 30 days
  or the marker is missing. That keeps marker writes to about one per account
  per month instead of one per request.
- **Effect:** an account becomes eligible for deletion between 335 and 365
  days after it was last used. Public wording says "about 12 months".
- **Deleted by:** `DELETE` (the user's "erase server copy") removes the marker
  along with the blobs.

**Rejected alternative: an expiry on the blobs themselves.** KV can only
extend an expiry by rewriting the value. Rewriting a blob during a GET races
with a concurrent PUT from another device: the GET could write back the older
blob and silently lose the newer upload. The separate marker never rewrites
user data.

### 4.2 Daily new-account budget

- A PUT counts as a **new account** when its account has no `seen:` marker.
  The first PUT of a new device's first sync creates the marker, so that
  device's other three stores are not counted again.
- A counter key `new:<UTC day>` (expirationTtl 2 days) is read before the
  write. If it has reached `NEW_ACCOUNT_DAILY_LIMIT`, the Worker returns
  **503** with `{"error":"busy"}` and `Retry-After` set to the seconds until
  00:00 UTC. Nothing is stored.
- Otherwise the PUT proceeds and the counter is incremented.
- **Proposed limit: 100 new accounts per UTC day**, configured as a `[vars]`
  value in `wrangler.toml`. Production has 42 accounts in total since launch.
- KV has no atomic increment, so concurrent requests can under-count, the same
  known limitation `bumpLimited` already documents. The budget is an
  order-of-magnitude bound, not an exact one.
- Existing accounts are never refused by this budget. Their size is already
  bounded at 4 × 512 KB = 2 MB.

### 4.3 Daily cleanup

A Cron Trigger (`[triggers] crons = ["17 4 * * *"]`, once a day at 04:17 UTC)
runs a `scheduled` handler:

1. List every `seen:` key (paginated) into a set of live account IDs.
2. List every `blob:` key (paginated). For each blob whose account is not in
   the set, delete it.
3. Stop after `CLEANUP_MAX_DELETES` deletions per run (proposed 1,000) and
   continue the next day. A sudden expiry of many accounts cannot exhaust one
   invocation.

The handler does nothing unless `CLEANUP_ENABLED = "true"`, which is set only
after the backfill in §5 is verified.

KV listings are eventually consistent. A marker written seconds before a run
might not appear in the listing yet. That can only affect an account whose
marker had already lapsed and was refreshed in the same minute, an account
that was already past the 12-month line, and the client re-uploads in that
case (§6).

### 4.4 Unchanged

The per-IP and per-account rate limits, blob size caps, the store list, the
optimistic-concurrency protocol, and the 404/409/413/429 responses are
unchanged. The Worker still cannot read or merge any content.

## 5. Rollout

Deleting user data is irreversible, so cleanup is enabled last.

1. **Deploy the Worker** with markers and the budget, and `CLEANUP_ENABLED`
   unset. From this point, active accounts start creating markers on their own.
2. **Backfill markers** for every existing account with a one-time script
   (`cloudflare/sync-worker/scripts/backfill-seen-markers.mjs`). It lists
   `blob:` keys with `--remote`, derives the account IDs, writes a `seen:`
   marker for each with the full 365-day TTL, and refuses to write anything if
   the listing returns zero accounts. This is the same guard that caught
   wrangler's local-store default during the ping-worker backfill.
3. **Verify:** the number of `seen:` keys equals the number of distinct
   accounts in `blob:` keys. Record both counts in the PR.
4. **Enable cleanup** by setting `CLEANUP_ENABLED = "true"` and redeploying.
   The first run should delete nothing; confirm that in the Worker logs.

Each production deploy needs the owner's explicit "deploy".

**Also before deploying (owner, Cloudflare dashboard):** confirm the account is
on the Workers Paid plan (the free plan allows only 1,000 KV writes a day), and
that a billing notification exists. The ping Worker's README already lists a
billing notification as a deployment requirement.

## 6. What users see

- **Existing users:** nothing changes.
- **A new user on a day the budget is exhausted:** setup completes locally,
  but the first upload is refused. The current app maps any 5xx to "Sync server
  error — try again later." (`describe` in `src/main/sync.js`) and retries on
  the next change or launch. No app release is required. A dedicated "Sync is
  busy, try again tomorrow" message is an optional later app change.
- **Someone returning after more than about 12 months:** their server copy is
  gone. Their first sync pass gets 404s and uploads the local Favorites and
  settings from that device, as it does for a new account. Data that exists
  only on the server, with no device holding it, is lost. That is the intended
  effect of the expiry.

## 7. Cost bound

Using Cloudflare's published Workers Paid pricing for KV (stored data
$0.50/GB-month beyond 1 GB included; writes $5.00/million beyond 1 million
included; checked 2026-10-05 at developers.cloudflare.com/kv/platform/pricing):

- **Worst case under a sustained flood:** 100 new accounts a day × 2 MB = about
  200 MB a day. With 12-month expiry, storage peaks at roughly 73 GB, about
  **$36 a month**. A limit of 50 halves that.
- **Marker overhead for real users:** about one write per account a month, plus
  one extra read per request. Negligible at the current scale.
- **Cleanup:** one listing pass a day; at 100,000 accounts that is roughly 500
  list requests a day, within the 1 million included each month.

## 8. Testing

Worker unit tests in `test/unit/`, following `sync-worker-limits.test.js`
(imports the Worker source and runs it against an in-memory KV stand-in):

- A 200 GET creates a missing marker; a 404 GET does not.
- A marker younger than 30 days is not rewritten; an older one is.
- A PUT to an account with no marker increments the day's counter; a PUT to an
  account with a marker does not.
- At the limit, a new-account PUT gets 503 `busy` with `Retry-After` and
  stores nothing, while a PUT to an existing account succeeds.
- `DELETE` removes the marker.
- `scheduled` deletes blobs only for accounts without a marker, respects
  `CLEANUP_MAX_DELETES`, and does nothing when `CLEANUP_ENABLED` is unset.
- The backfill script refuses to write when the listing is empty.

## 9. Privacy page and claims

`site/src/pages/privacy.astro` currently says nothing about how long sync data
is kept. After cleanup is enabled, add to the Sync paragraph: an account that
no Blanc device has used for about 12 months is deleted from the server
automatically, and the user can still erase it sooner. Per
`docs/marketing-claims.md`, publish this only once the behavior is live in
production, and deploy the site through the normal reviewed path.

## 10. Out of scope

- Authenticating sync clients or distinguishing official builds. A desktop app
  cannot prove its identity to a server.
- The separately approved v2 authenticated protocol and Durable Object
  migration. That project should adopt equivalent budget and expiry rules.
- Per-account size limits beyond the existing 512 KB per store.
- Changes to the desktop app.
