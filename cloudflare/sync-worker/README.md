# blanc-sync — E2EE profile sync store

Stores only AES-GCM ciphertext for Blanc's profile sync (see `src/main/sync.js`
in the main repo). Keyed by an opaque `accountId` the client derives from a
passphrase this Worker never sees. It cannot decrypt or merge user data.
Account-locator and raw client-IP rate counters are stored in KV for up to
120 seconds. Provider logging and metadata retention require operational
verification separately.

## Deploy

**M16 deployment is on hold for the owner's separate approval.** Merging the
protocol PR does not authorize a production deployment. Before deployment,
record the storage-exposure decision below and verify the approved client and
Worker order. Never enable or change cleanup as part of this protocol update.

1. `cd cloudflare/sync-worker`
2. `wrangler kv namespace create SYNC` → paste the id into `wrangler.toml`.
3. `wrangler deploy`
4. Confirm the URL matches `SYNC_ENDPOINT` in `src/main/sync.js`.

## Storage budget

Design: `docs/superpowers/specs/2026-10-05-sync-storage-budget-design.md`.

- `seen:<accountId>` records activity. A successful upload or a read that
  finds data refreshes it, at most every 30 days; it expires after 365 days.
- `new:<UTC day>` counts new accounts. Past `NEW_ACCOUNT_DAILY_LIMIT`, a new
  account's upload gets `503 {"error":"busy"}` with `Retry-After`; existing
  accounts are never refused.
- An account-scoped Durable Object reserves every blob write against
  `ACCOUNT_STORAGE_QUOTA_BYTES` (20 MiB by default) and
  `ACCOUNT_STORAGE_MAX_STORES` (256 by default). It inventories existing KV
  blobs on first use, includes a fixed per-key allowance, serializes each
  reservation together with its KV write, and rolls a reservation back if the KV write fails. A full
  account wipe clears both KV and its quota ledger. Quota exhaustion returns
  `507 {"error":"account-quota"}` without storing the candidate blob. A
  per-Space DELETE releases its value and quota reservation after the retained
  deletion window; fixed stores remain removable only by the account wipe.
  When the client learns a Space is deleted, it immediately replaces its
  encrypted content with an empty Space blob. This frees the content bytes
  while the encrypted index keeps the final deletion for 30 days. The compact
  blob still uses one store slot until the final DELETE. Turning sharing off
  on one device makes its link dormant and frees no server storage. Closed-tab
  tombstones also remain until expiry, so removing tabs is not an immediate
  storage-recovery action. Shrinking an existing blob is allowed even if legacy
  usage or a subsequently lowered quota leaves the account above its allowance.
  Legacy inventory is eventually consistent: production activation requires a
  reviewed migration with writes quiesced and a verified complete inventory.
  This code has not performed that migration and must not be deployed until
  the owner approves its evidence. A normal first-use listing alone does not
  establish a complete charge for all pre-existing data.
- A daily Cron Trigger (04:17 UTC) deletes blobs of accounts with no marker,
  at most `CLEANUP_MAX_DELETES` per run. It does nothing unless
  `CLEANUP_ENABLED = "true"`.

Never set `CLEANUP_ENABLED` until every account has a marker:
`node scripts/backfill-seen-markers.mjs`, then
`node scripts/backfill-seen-markers.mjs --verify` must exit 0.

## Local dev

`wrangler dev` serves on http://127.0.0.1:8787; temporarily point
`SYNC_ENDPOINT` in `src/main/sync.js` there to test the app end-to-end.

## API

- `GET /v1/blob/:accountId/:store` → `{ version, blob }` | 404 | 429
- `PUT /v1/blob/:accountId/:store` `{ ifVersion, blob }` → `{ version }` | 409 | 400 | 413
- `DELETE /v1/blob/:accountId` → 204 (account wipe)
- `DELETE /v1/blob/:accountId/space-<id>` → 204 (one retired Space blob and
  its quota charge; fixed stores reject this method)
- `POST /v1/pair/:pairId` `{ blob }` → 201 | 409 `{"error":"exists"}` | 400 | 413 (4 KiB cap).
  Device pairing (design 2026-10-16): the sender parks its wrapped sync secret
  under an id derived from an eight-character code; stored with a 600 s TTL.
- `GET /v1/pair/:pairId` → `{ blob }` and the entry is deleted | 404
  `{"error":"not-found"}` | 429 past 10 pair GETs per client IP per minute.
  One-shot by design; the Worker never sees the code or any key.
- `DELETE /v1/pair/:pairId` → 204 (the sender cancelled).
  Deploy this route before any client release that offers pairing; older
  clients never call it, and a client meeting an older Worker reports
  "pairing unavailable" and falls back to name and passphrase.

`accountId` is 64 hex chars; `store` is one of `bookmarks`, `settings`,
`session` (tab sync — per-device open-tab snapshots), `icons` (optional
source-rasterized tab favicons, kept separate for mixed-client compatibility
and budget isolation), or `sends` (Send to device: each device's presence
and the pages it sent, docs/superpowers/specs/2026-10-24-ios-m7b-send-to-device-design.md).
Deploy `sends` before any client release that offers sending; a client
meeting an older Worker gets `404 unknown store` and says sending isn't
available yet. The M16 protocol additionally serves `spaces` (the library index), `closed`
(per-device Recently closed), `shared` (the F27 deduplication sidecar), and
`space-<32 lowercase hex>` (one immutable Space id per blob). Malformed or
unknown store names return `404 unknown store`. Account DELETE directly deletes
every known fixed-store key and adds the `blob:<accountId>:` keys returned across
all listing pages, including orphan Space blobs. It removes the activity marker
only after those deletions succeed; it does not depend on the index. Direct
fixed-store deletion does not depend on listing freshness. KV may still omit a
dynamic Space key from a stale listing, and concurrent writes can recreate keys;
the v1 protocol does not provide an atomic, immediately complete account wipe.

Deploy these routes before a client release offers the Spaces switch. A client
meeting an older Worker reports "Spaces sync isn't available yet"; Favorites,
settings, Tab Sync and Send to device continue to use their existing routes.
Every store is ciphertext like the rest. No
separate credentials: possession of `accountId` is the bearer storage
capability, permitting retrieval, replacement and deletion of ciphertext.
Its resistance to guessing depends on the handle/passphrase and KDF. This
known R3 risk remains open; the v1 size hardening adds no authentication.
A per-client-IP limit (120/min, all methods) is the anti-guessing
throttle — each passphrase guess derives a fresh `accountId`, so the
per-`accountId` GET limit (30/min) is only anti-hammering of a single account.

PUT requests are capped at 513 KiB of streamed UTF-8 bytes before parsing,
including ignored fields. The serialized blob remains capped at 512 KiB,
also in UTF-8 bytes. A declared oversized Content-Length rejects early;
missing or misleading lengths do not bypass the stream cap. Over-limit
streams are cancelled with 413 before a blob is stored. Routes, encryption,
derivation, conflict and version response shapes remain v1-compatible.

KV counters and version checks are non-atomic. Two same-version writes can
both succeed, losing one write; a pending write can recreate data after a
DELETE. Client reconciliation does not guarantee recovery. Strict concurrency,
deletion fencing and authenticated migration are separate v2 work.

## M16 storage scenarios and deployment decision

The desktop's 25 **live** Spaces limit is not the server quota. Deleted and
orphan blobs count against the separate account-wide byte and store limits.
`NEW_ACCOUNT_DAILY_LIMIT` starts at 10 and remains independently configurable;
changing it does not change an existing account's storage allowance. R3/R5 and
the underlying KV version race remain unchanged.

Using the **historical pricing assumption** in the October 5 storage design
($0.50 per decimal GB-month after 1 GB included), the following is an occupancy
scenario, **not a worst-case or flood bound**. Assume 33 blobs/account (25 current
Space blobs, three M16 fixed stores and the five pre-existing stores), every
blob at 524,288 bytes, and 365 days of new accounts retained simultaneously.
That is 17,301,504 bytes/account = 16.5 MiB. Stored-value wrappers, other keys,
request charges and any price changes are excluded.

| New accounts/day | Accounts after 365 days | Stored decimal GB | Approximate storage/month |
|---|---:|---:|---:|
| 100 | 36,500 | 631.50 | $315.25 |
| 50 | 18,250 | 315.75 | $157.38 |
| 25 | 9,125 | 157.88 | $78.44 |

Arithmetic: `33 * 524288 * dailyAccounts * 365 / 1e9`; price is
`max(0, GB - 1) * 0.50`. More than 25 historical Space ids changes this scenario:
1,000 capped Space blobs plus eight fixed blobs is 504 MiB per account, even
if only 25 Spaces are live. That was the pre-quota exposure; the Worker now
refuses growth beyond the configured 20 MiB or 256-store account ceilings.

The October 5 listing measured 42 accounts and 138 blobs; it is historical,
not a new production measurement. The design estimates 150–220 KiB for a
500-tab Space; actual encrypted sizes depend on URLs, names, position keys and
tombstones and must be measured. Neither those estimates nor the old listing
predict current usage. Likewise, one changed Space PUT plus an index PUT,
periodic reads, and paginated account deletion are workload assumptions—not
a guarantee of staying within an included request allowance. At page size P,
a wipe listing N keys needs approximately `ceil(N/P)` listings, deletion of the
union of those keys and the eight fixed-store keys, and marker deletion. Missing
fixed keys can therefore add up to eight delete calls; retries add requests.

The owner rejected unbounded per-account growth and selected the quota above,
separately selecting a daily new-account limit of 10. Both implementation and
limits require review before deployment. The former four-store/$36 scenario is
historical and does not bound M16 storage. The full deployment gate remains in
the approved M16 plan; merging this code does not authorize deployment.
