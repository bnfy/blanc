# blanc-ping

Collector for Blanc's optional launch measurement. The app setting is off by
default and no development build sends a ping.

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

There are no URLs, searches, page content, names, accounts, email addresses,
or precise locations. The raw installation UUID is HMACed immediately with
`INSTALL_HASH_SECRET`; only the keyed hash reaches KV or the optional GA4
mirror. If that secret is missing, unique-install counting fails closed.

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

Every accepted event increments aggregate launch totals. The keyed installation
hash is used in expiring daily/weekly/monthly `seen` markers so active installs
can be deduplicated. Daily markers expire after about 90 days; weekly and
monthly markers after about 13 months. Aggregate counters do not expire.

`GET /stats` is protected by `STATS_TOKEN`. If `GA_API_SECRET` is configured,
the Worker forwards the keyed installation hash and the same narrow event
fields to GA4. The raw UUID never goes to Google.

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
`PING_ENDPOINT` in `src/main/telemetry.js`, send one disposable valid event,
verify a replay does not increment totals, and confirm an invalid payload is
rejected without sensitive log fields.

Retrieve aggregate statistics with:

```sh
curl -H "Authorization: Bearer <STATS_TOKEN>" \
  https://blanc-ping.bnfy-441.workers.dev/stats
```
