# blanc-ping

Collector for Blanc's anonymous launch ping (Settings → "Help improve
Blanc", on by default, opt-out). Receives `POST /ping` with
`{installId, sessionId, version, platform, arch}` and tallies counts in Workers KV.
`GET /stats` (bearer-token gated) returns launch totals **and** active-user
metrics.

`installId` is a random per-install token the client mints once and reuses
(see `src/main/telemetry.js`). It maps to a device install, never a person —
no name, account, IP, or browsing data is stored beside it. The Worker uses
it only to dedupe repeat launches into distinct active users:

- **Launches** — every ping bumps `total`, `day:<date>`, `version:<v>`,
  `platform:<p>`. Ten launches by one person count as ten.
- **Active users** — the first ping from an install in a given
  day/week/month sets a `seen:<scope>:<bucket>:<installId>` flag and bumps
  that period's `active:<scope>:<bucket>` unique counter. Those counters
  never expire (they're the growth history); the `seen:*` flags carry TTLs
  (~3 months daily, ~13 months weekly, ~26 months monthly) so KV stays
  bounded while still allowing month-over-month retention.

Scaling note: `/stats` retention lists all `seen:month:*` keys for the
current and previous month and intersects them, capped at 50k ids per month
(the response flags `truncated: true` past that). At Blanc's scale this is
fine; a much larger install base would want HyperLogLog sketches or a
downstream store instead.

## Deploy

Requires a Cloudflare account and `wrangler` (installed on demand via `npx`,
no need to add it as a repo dependency).

```
cd cloudflare/ping-worker
npx wrangler login                              # opens a browser to authorize
npx wrangler kv namespace create PINGS          # copy the returned id into wrangler.toml
npx wrangler secret put STATS_TOKEN             # pick any long random string, save it somewhere safe
npx wrangler secret put INSTALL_HASH_SECRET     # long random string; HMAC key for install ids — without it, unique-install counting is skipped (fail closed)
npx wrangler secret put GA_API_SECRET           # optional: GA4 Measurement Protocol API secret; when set, pings are mirrored to GA as app_launch events
npx wrangler deploy
```

`wrangler deploy` prints the live URL, something like
`https://blanc-ping.<your-subdomain>.workers.dev`. Update
`PING_ENDPOINT` in `src/main/telemetry.js` (in the repo root) to
`<that-url>/ping`.

To attach it to `api.blancbrowser.com` instead of the `workers.dev`
subdomain, add a route in the Cloudflare dashboard (Workers & Pages →
blanc-ping → Settings → Triggers → Custom Domains) once
`blancbrowser.com`'s DNS is on Cloudflare.

## Checking the numbers

```
curl -H "Authorization: Bearer <STATS_TOKEN>" https://<worker-url>/stats
```

Returns JSON like:

```json
{
  "launches": {
    "total": 420,
    "byDay": { "2026-07-05": 30, "2026-07-06": 28 },
    "byVersion": { "0.12.0": 400, "0.11.0": 20 },
    "byPlatform": { "darwin": 300, "win32": 90, "linux": 30 }
  },
  "activeUsers": {
    "daily":   { "2026-07-07": 41, "2026-07-08": 44 },
    "weekly":  { "2026-W27": 180, "2026-W28": 190 },
    "monthly": { "2026-06": 610, "2026-07": 655 }
  },
  "retention": {
    "cohortMonth": "2026-06",
    "returnedInMonth": "2026-07",
    "cohortSize": 610,
    "returned": 402,
    "rate": 0.659,
    "truncated": false
  }
}
```

`launches.*` count every launch; `activeUsers.*` count distinct installs per
period (the last 30 days / 12 weeks / 12 months). `retention` is what share
of last month's active installs came back this month.
