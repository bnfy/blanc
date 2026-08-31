# blanc-ping

Collector for Blanc's optional bounded usage measurement. A fresh profile
presents the app setting on but must save that choice before any event; it can
be turned off before continuing or later in Settings. No development build
sends an event.

`POST /ping` accepts the exact current payload:

```json
{
  "installId": "random UUID",
  "sessionId": 123,
  "version": "1.1.1",
  "platform": "darwin",
  "arch": "arm64",
  "osVersion": "26"
}
```

`POST /event` accepts the same six client fields plus exactly one fixed product
event. Mahjong is reported only after the first real free-tile move:

```json
{
  "installId": "random UUID",
  "sessionId": 123,
  "version": "1.1.1",
  "platform": "darwin",
  "arch": "arm64",
  "osVersion": "26",
  "event": "mahjong_play"
}
```

A rendered start-page layout uses `"event": "newtab_layout"` and a `layout`
value strictly allowlisted to `ledger`, `billboard`, `shelf`, `tally`, or
`mahjong`. The desktop client attempts each product metric at most once per app
session and never sends a product event for a private tab.

There are no URLs, searches, page content, game state, custom labels, names,
accounts, email addresses, or precise locations. The raw installation UUID is
HMACed immediately with `INSTALL_HASH_SECRET`; only the keyed hash reaches KV
or the optional GA4 mirror. If that secret is missing, unique-install counting
fails closed while aggregate totals continue.

## Abuse and cost controls

- A valid Cloudflare edge client address is required.
- Bodies are capped at 2 KiB and fields use strict allowlists and formats.
- Each edge-observed IP is limited to 20 attempts per minute.
- Exact installation/session replays are deduplicated for two days.
- `PING_DAILY_LIMIT` caps accepted daily attempts (250,000 by default).
- Rejections emit structured reason-only logs, not request bodies or IDs.

KV counters are best effort, not an atomic billing boundary. Also configure a
Cloudflare route-level rate-limit/WAF rule and a billing notification before
production. The daily Worker cap is a backstop, not a substitute for those
edge controls.

## Retention

Every accepted launch increments aggregate launch totals. Each accepted product
event increments only its fixed metric's total and UTC-day counter. The keyed
installation hash is used in expiring daily/weekly/monthly seen markers so
active installs can be deduplicated for launches, Mahjong, and each individual
layout. Daily markers expire after about 90 days; weekly and monthly markers
after about 13 months. Aggregate counters do not expire.

`GET /stats` is protected by `STATS_TOKEN`. If `GA_API_SECRET` is configured,
the Worker forwards the keyed installation hash and the same narrow event
fields to GA4. The raw UUID never goes to Google. The response's `productUsage`
object exposes event totals/by-day and recent daily/weekly/monthly active-install
counts for Mahjong and each start-page layout.

## Deploy

```sh
cd cloudflare/ping-worker
op run --env-file=../.env.1password -- npx wrangler secret put STATS_TOKEN
op run --env-file=../.env.1password -- npx wrangler secret put INSTALL_HASH_SECRET
# Optional only when the privacy-approved GA mirror is desired:
op run --env-file=../.env.1password -- npx wrangler secret put GA_API_SECRET
op run --env-file=../.env.1password -- npx wrangler deploy
```

Then configure and test the route-level rate/cost controls, confirm
both `PING_ENDPOINT` and `EVENT_ENDPOINT` in `src/main/telemetry.js`, send one
disposable valid launch and product event, verify replays do not increment
totals, and confirm invalid event/layout values are rejected without sensitive
log fields.

Retrieve aggregate statistics with:

```sh
curl -H "Authorization: Bearer <STATS_TOKEN>" \
  https://blanc-ping.bnfy-441.workers.dev/stats
```
