# Blanc Mail survey Worker

`blanc-mail-survey` stores answers to the anonymous Blanc Mail feature survey
on `blanc.day/mail/survey`, so the owner can decide what goes into Blanc Mail
1.0. Spec: `docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md`.

## What it keeps, and what it never keeps

- Each answer is one KV record under a random `answer:` key holding the
  account choice, the speed choice, up to three feature ids, an optional note
  of at most 500 characters, and the day (UTC date) it arrived.
- No email address, IP address, user agent or other browser details are
  stored. The per-IP limit (4 answers a minute) uses Cloudflare's rate-limit
  binding, which keeps its own short-lived counters; the IP never reaches KV.
- Request logging is off (`[observability] enabled = false`) because Workers
  Logs would record each respondent's IP and user agent. Don't turn it on or
  add Logpush.
- This is a separate Worker on purpose: the newsletter Worker logs requests.
- Answers are used only to decide what goes into Blanc Mail 1.0, then deleted
  (see Closing). The survey page, this Worker and the privacy page's
  `#mail-survey` section describe one contract; change them together.

## Routes

| Route | Who | Result |
| --- | --- | --- |
| `OPTIONS /mail-survey` | the site | CORS preflight for the site's origins |
| `POST /mail-survey` | the site | `200 {ok:true}`; `400` invalid (including a body over 4,096 characters); `403` other origin; `410 {closed:true}` when closed or full; `429` rate limited or no IP; `503` without the rate limiter or when storage fails |
| `GET /mail-survey/summary` | admin | counts per account, speed, speed by account and feature, plus the notes with their days |
| `DELETE /mail-survey/answers?confirm=delete-all` | admin | deletes up to 900 answers, `{deleted:n, remaining:m}`; repeat until `remaining` is 0 |

`SURVEY_OPEN` must be exactly `"true"` to accept answers; anything else is
closed. The survey also stops at 900 stored answers (`MAX_ANSWERS`), far above
the few dozen expected: that bounds what one abusive visitor can add, and keeps
each summary or purge inside one request's 1,000 KV operations. Each answer
costs one KV list (the cap check) and one write; on Workers' free plan both
are limited to 1,000 a day, which is far above the expected volume. The
summary reports `truncated: true` if a burst slipped answers past the cap. A filled
`website` honeypot gets the normal success reply and stores nothing.

## Setup (once, with the owner's go-ahead)

```sh
cd cloudflare/mail-survey-worker
npx wrangler@4 kv namespace create SURVEY   # paste the id into wrangler.toml
op item create --vault Dev --category password --title "Blanc Mail Survey Admin" --generate-password
op read 'op://Dev/Blanc Mail Survey Admin/password' | npx wrangler@4 secret put ADMIN_TOKEN
npx wrangler@4 deploy                        # deploys closed (SURVEY_OPEN = "false")
```

Check it: a `POST /mail-survey` from `https://blanc.day` answers `410`, and
the summary answers with the token.

## Going live

The site ships the survey closed: `site/src/data/mail-survey.json` is
`{ "open": false }`, so `/mail` shows no survey link and the waitlist shows no
invitation. To open it, in one window:

1. Recheck the Proton lines in `docs/website-mail-claims-2026-11-12.md`
   against the signed Mail build.
2. Merge one PR that sets `mail-survey.json` to `{ "open": true }` and
   `SURVEY_OPEN = "true"` in `wrangler.toml` together
   (`test/unit/mail-survey-site.test.js` fails if the two disagree).
3. Deploy the Worker; check a test answer lands and then purge it.
4. Deploy the site. The site deploy waits for the first public release
   containing #1450 and #1454 (`site/CLAUDE.md`).

## Reading the results

```sh
ADMIN="Authorization: Bearer $(op read 'op://Dev/Blanc Mail Survey Admin/password')"
curl -s -H "$ADMIN" https://blanc-mail-survey.bnfy-441.workers.dev/mail-survey/summary
```

## Closing (once the 1.0 scope is decided)

1. Set `SURVEY_OPEN = "false"` and deploy.
2. Take the summary one last time and record the result (counts only, plus a
   paraphrase of the themes in the notes) in the Blanc Mail repository with
   the 1.0 scope decision.
3. Purge every answer, repeating until `remaining` is 0, and confirm none
   remain:
   ```sh
   curl -s -X DELETE -H "$ADMIN" \
     "https://blanc-mail-survey.bnfy-441.workers.dev/mail-survey/answers?confirm=delete-all"
   curl -s -H "$ADMIN" https://blanc-mail-survey.bnfy-441.workers.dev/mail-survey/summary   # total: 0
   ```
4. Set `site/src/data/mail-survey.json` to `{ "open": false }`, so the page
   shows that the survey has closed and its links come down; update the
   privacy page's `#mail-survey` section to say the survey closed and its
   answers were deleted; deploy the site.
