# blanc-newsletter

Signup store behind the newsletter form in blancbrowser.com's footer
(`site/src/components/NewsletterForm.astro`). Receives `POST /subscribe` with
`{email}` and keeps `sub:<email>` → `{ts}` in Workers KV — the address and
when it arrived, nothing else. No IPs at rest (the per-IP rate-limit keys
expire within two minutes), no names, no tracking, and signing up is
idempotent: re-subscribing keeps the original record and returns the same
response, so nothing leaks about whether an address was already on the list.

This Worker only keeps the list — it sends nothing. Actually mailing the
newsletter means exporting the list (below) into whatever does the sending.
Two consequences to stay honest about:

- **No double opt-in (yet).** Sending a confirmation email needs an email
  provider; when one is chosen, confirmation belongs there (or as a
  `pending:` state here). Until then anyone can enter any address, which is
  why every sent mail must carry an unsubscribe path.
- **Unsubscribe is manual in v1.** Requests arrive at
  `support@blancbrowser.com` (linked from every mail and the privacy
  policy); remove the address with the `DELETE` endpoint below. A proper
  self-serve link comes with the sending provider.

Anti-abuse, in order: CORS restricted to `blancbrowser.com` (+ Astro's
localhost dev origin), a visually-hidden `website` honeypot field (a filled
honeypot gets a 200 and writes nothing), a per-IP limit of 6 subscribes per
minute, and loose email-shape validation capped at 254 chars.

## Deploy

Requires a Cloudflare account and `wrangler` (installed on demand via `npx`,
no need to add it as a repo dependency).

```
cd cloudflare/newsletter-worker
npx wrangler login                                 # opens a browser to authorize
npx wrangler kv namespace create SUBSCRIBERS       # copy the returned id into wrangler.toml
npx wrangler secret put ADMIN_TOKEN                # pick any long random string, save it somewhere safe
npx wrangler deploy
```

`wrangler deploy` prints the live URL, something like
`https://blanc-newsletter.<your-subdomain>.workers.dev`. The footer form
posts to the `NEWSLETTER_ENDPOINT` constant in
`site/src/components/Footer.astro` — update it if the URL differs, then
redeploy the site.

To attach it to `api.blancbrowser.com` instead of the `workers.dev`
subdomain, add a route in the Cloudflare dashboard (Workers & Pages →
blanc-newsletter → Settings → Triggers → Custom Domains) once
`blancbrowser.com`'s DNS is on Cloudflare. Note the form's endpoint constant
lives in `NewsletterForm.astro`, not here — changing the URL means a site
redeploy too.

## Exporting the list

```
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://<worker-url>/subscribers
```

Returns JSON like:

```json
{
  "count": 2,
  "subscribers": [
    { "email": "a@example.com", "ts": "2026-07-23T10:00:00.000Z" },
    { "email": "b@example.com", "ts": "2026-07-24T09:30:00.000Z" }
  ]
}
```

## Removing an address (unsubscribe / data deletion)

```
curl -X DELETE -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "https://<worker-url>/subscriber?email=a@example.com"
```

204 either way — removing an address that isn't on the list is a no-op.
Do this promptly for any unsubscribe or deletion request; the privacy
policy promises it.
