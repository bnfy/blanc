# blanc-newsletter

Consent-first newsletter enrollment for `blancbrowser.com`. An address is not
a subscriber until its owner follows a one-time confirmation link delivered by
Resend.

## Data and abuse controls

- `POST /subscribe` accepts only the production site origin (plus the local
  Astro development origin), validates and normalizes the address, and returns
  an enumeration-resistant generic response.
- A pending record contains the address, request time, and opaque confirmation
  and unsubscribe material. It expires after 24 hours.
- Resend receives the address only to deliver the confirmation message.
- `GET /confirm?token=...` creates `sub:<email>` only after possession of the
  mailbox is demonstrated.
- Confirmed records contain the address, confirmation time, and an opaque
  unsubscribe token. `GET /unsubscribe?token=...` deletes the record.
- A valid address caught by the honeypot enters a separate `hp:` quarantine
  for at most 30 days. It is exported for manual review of autofill false
  positives, but never mailed or subscribed without a clean re-submission and
  mailbox confirmation.
- Per-IP rate-limit keys expire after two minutes; per-address confirmation
  cooldown keys use an HMAC of the address and expire after ten minutes.
- Missing mail or token secrets make enrollment return 503. There is no
  consent-bypassing fallback.

The export includes an unsubscribe URL for every confirmed address and a
separate `quarantined` review list. Any release-notes sending process must use
only `subscribers` and include the exact one-click URL in each message.

## Deploy

The Resend sending domain must be verified before deploy. `NEWSLETTER_FROM` in
`wrangler.toml` must be an address on that domain. `deploy.mjs` retrieves the
domain from Resend's authenticated `GET /domains/:domain_id` API and refuses to
run Wrangler unless its status is exactly `verified` and it covers the sender
host. Do not bypass this gate with a direct `wrangler deploy`.

Required Worker secrets:

- `ADMIN_TOKEN` — protects export and administrative removal;
- `NEWSLETTER_TOKEN_SECRET` — HMAC key for address cooldowns;
- `RESEND_API_KEY` — restricted Resend key for confirmation delivery.

The deployment process also requires `RESEND_DEPLOY_API_KEY` (a full-access
Resend key capable of retrieving domain status) and `RESEND_DOMAIN_ID` in its
local environment. Map both from 1Password for the `op run` invocation; do not
put the key in a committed file or shell history. The full-access deploy key is
local preflight authority only: never install it as a Worker secret. The Worker
keeps the separate restricted `RESEND_API_KEY` for confirmation delivery.

Run credentialed commands through the 1Password-backed Cloudflare environment:

```sh
cd cloudflare/newsletter-worker

op run --env-file=../.env.1password -- npx wrangler secret put ADMIN_TOKEN
op run --env-file=../.env.1password -- npx wrangler secret put NEWSLETTER_TOKEN_SECRET
op run --env-file=../.env.1password -- npx wrangler secret put RESEND_API_KEY
op run --env-file=../.env.1password -- npm run deploy
```

After deploy, test from `https://blancbrowser.com`, confirm delivery, follow the
link, export the record, and follow its unsubscribe URL. A release must not
publish the revised newsletter/privacy claims until this end-to-end check
passes in production.

## Export confirmed subscribers

```sh
curl -H "Authorization: Bearer $(op read 'op://Dev/Blanc Newsletter Admin/password')" \
  https://blanc-newsletter.bnfy-441.workers.dev/subscribers
```

The response separates confirmed recipients from the manual-review quarantine:

```json
{
  "count": 1,
  "subscribers": [{
    "email": "a@example.com",
    "ts": "2026-08-12T10:00:00.000Z",
    "unsubscribeUrl": "https://blanc-newsletter.bnfy-441.workers.dev/unsubscribe?token=..."
  }],
  "quarantined": [{
    "email": "possible-autofill@example.com",
    "ts": "2026-08-12T10:05:00.000Z"
  }]
}
```

Never send to `quarantined`. A plausible autofill false positive can be
rescued only by a new clean `/subscribe` request and the normal confirmation
link; bot entries expire automatically.

## Administrative deletion

```sh
curl -X DELETE \
  -H "Authorization: Bearer $(op read 'op://Dev/Blanc Newsletter Admin/password')" \
  "https://blanc-newsletter.bnfy-441.workers.dev/subscriber?email=a@example.com"
```

The endpoint returns 204 whether or not the address existed and deletes the
confirmed record, associated unsubscribe lookup, and quarantine record when
present.
