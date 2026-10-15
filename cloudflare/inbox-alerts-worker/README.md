# Blanc inbox alerts Worker

Resend Inboxes has no notifications of its own. This Worker receives Resend's
`inbox.email.received` webhook and emails a short notice for each new inbound
message in Blanc's support inboxes, so new mail shows up in the owner's Gmail.

- **Inboxes:** `INBOXES` in `wrangler.toml` maps each Resend inbox id to the
  label used in the notice (`support@blanc.day`, `support@blancbrowser.com`).
  The webhook is account-wide; events from any other inbox are ignored.
- **What the notice carries:** the inbox, sender, subject, attachment count,
  time received and a link to Resend. Never the body: Resend's webhook omits
  it and this Worker never fetches it. Read and reply in Resend.
- **Skipped:** outbound mail, and threads already in spam or trash.
- **Signatures:** every request must carry a valid Resend (Svix) signature,
  checked against `RESEND_WEBHOOK_SECRET` with a five-minute timestamp window.
- **Retries:** a failed send answers 502, so Resend retries the webhook; the
  send uses the webhook's `svix-id` as its Resend idempotency key, so a retry
  never sends a second notice.

## Secrets

All three live in the 1Password item **Blanc Inbox Alerts Worker** (vault Dev).
Without any of them the Worker answers 503 to every request.

| Secret | 1Password field | What it is |
| --- | --- | --- |
| `RESEND_API_KEY` | `resend_api_key` | Resend key named `blanc-inbox-alerts`, sending access, domain `blanc.day` only |
| `RESEND_WEBHOOK_SECRET` | `webhook_secret` | The `whsec_…` signing secret of the Resend webhook pointing here |
| `ALERT_TO` | `alert_to` | Where notices go |

Set or rotate one without printing it:

```sh
op read "op://Dev/Blanc Inbox Alerts Worker/resend_api_key" | npx wrangler secret put RESEND_API_KEY
```

## Deploy

```sh
cd cloudflare/inbox-alerts-worker
npx wrangler deploy
```

The Resend webhook points at `https://blanc-inbox-alerts.<account subdomain>.workers.dev/`
and subscribes only to `inbox.email.received`. Adding an inbox means adding its
id to `INBOXES` and redeploying.
