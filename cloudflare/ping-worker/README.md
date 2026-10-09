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
`mahjong` (historic: app versions before 1.20.0 offered Mahjong as a layout and
still send it). The desktop client attempts each product metric at most once per
app session and never sends a product event for a private tab.

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

Next-day return is counted per new-install cohort: an installation first seen
on UTC day D that launches again on D+1 bumps `return:d1:<D>` once, deduplicated
by a keyed-hash marker that expires after two days. `/stats` reports
`nextDayReturn.byDay` (new installs, returned next day, rate, and `complete`
once D+1 has ended) starting from `NEXT_DAY_RETURN_FIRST_COHORT` in
`src/index.js`, which must equal the UTC day the write path first deploys;
earlier cohorts are omitted rather than shown as 0%.

First-day signals: `{event:'day1_default'}` (Blanc is the default browser) and
`{event:'day1_browsed'}` (three web pages opened in regular tabs) carry only the
common launch fields. Desktop builds from `DAY_ONE_SIGNALS_MIN_VERSION` (1.31.0)
send each at most once per installation, during its first 24 hours.

- When a launch first sees an installation on that version or later, the Worker
  marks it **eligible**. Eligible installations are the comparison group, so
  installations on older or community builds, which cannot send the signals,
  never count as "didn't".
- A signal counts only for an eligible installation on its first-seen UTC day;
  otherwise the Worker replies 204 and stores nothing.
- Each group (`eligible`, `default`, `browsed`) keeps a keyed-hash marker
  `d1sig:<group>:<D>:<hash>` that expires after two days and a never-expiring
  `d1had:<group>:<D>` counter. When the installation's next-day return is
  counted, each present marker bumps `d1ret:<group>:<D>`. These keys
  deliberately avoid the `return:d1:` prefix.
- KV can serve a cached "not found" for about 60 seconds at the edge that read
  it, so a signal sent right after the launch could miss the eligible marker.
  The desktop client waits two minutes after its launch report before sending.

`/stats` adds `nextDayReturn.byDay[D].signals` from
`DAY_ONE_SIGNALS_FIRST_COHORT` (the UTC day after the deploy), read directly
for the shown days only:

```json
"signals": {
  "eligible": {"installs": 90, "returnedNextDay": 14},
  "default": {"had": 22, "returnedNextDay": 9},
  "browsed": {"had": 70, "returnedNextDay": 13}
}
```

The "didn't" group is `eligible` minus the signal, never `newInstalls` minus
it. Earlier cohorts carry no `signals` key. First-day signals are never
forwarded to GA4 and are not part of `productUsage`.

`GET /stats` is protected by `STATS_TOKEN`. If `GA_API_SECRET` is configured,
the Worker forwards the keyed installation hash and the same narrow launch and
product-event fields to GA4 (never the first-day signals). The raw UUID never
goes to Google. The response's `productUsage` object exposes event totals/by-day and recent daily/weekly/monthly active-install
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
