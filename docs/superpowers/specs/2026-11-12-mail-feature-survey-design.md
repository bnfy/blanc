# Blanc Mail feature survey: design

Date: 2026-11-12. Status: draft for owner approval (builder check done).

## Why

The owner wants to decide what goes into Blanc Mail 1.0 from what prospective
users say they want, not from guesses. The decision with the most riding on it
is **push** (new Gmail mail appearing instantly). Push is a 1.0 requirement
today, and it drives the largest remaining release work in the Mail repository
(`bnfy/blanc-mail`, `docs/RELEASE_TASK_BOARD.md`): the macOS 14/15 push smokes
(PUSH-05), the 100-delivery latency run (PUSH-06) and the logging-sink audit
(PUSH-07). The owner has said push can be dropped from 1.0 if nobody needs it.
The other decisions the answers feed:

- whether to switch on one-click unsubscribe and timed sender mute, which are
  built but hidden in 1.0 (`MailFeatureAvailability.senderMuteAndUnsubscribe`);
- whether to keep calendar-invitation replies (accept/decline, free/busy),
  which add Calendar scopes to Google's OAuth review;
- whether something planned for after launch should move into 1.0.

1.0 supports Gmail and Proton Mail accounts only.

## Who it reaches, and who it must not

- **Must not:** email the existing Blanc Mail waitlist. Its members joined
  under a promise (privacy page `#mail-waitlist`, `MailWaitlistForm.astro`, the
  confirmation email) that the list is used only to say Blanc Mail is ready,
  possibly with an early-access invitation. Changing the privacy page now does
  not cover people who already joined. No survey email goes to the waitlist or
  the newsletter.
- **Does:** reach visitors of the Blanc Mail pages on blanc.day, through
  - a survey page anyone can open without signing up, linked from the Mail
    pages; and
  - an optional, skippable invitation to that page shown right after someone
    submits the waitlist form.

Expected volume (owner informed): the waitlist has grown about four sign-ups a
week, 18 confirmed members on 2026-11-12. Expect a few dozen answers over one
or two months: enough to see a clear lean on push, not a precise split.

## Goals

1. Show the owner whether people need push, clearly enough to make the call.
2. Rank the candidate features below by how many people pick them.
3. Show which accounts respondents would use (Gmail, Proton, both), so answers
   can be read per account type. Push is Gmail-only; Proton mail is checked
   about every 20 seconds.
4. Collect optional free-text wishes.

## Non-goals

- No email to anyone, ever, about the survey.
- No accounts, sign-in, cookies or per-person tracking.
- No public results page.
- No analytics or third-party form service.

## Anti-goals (a failure even if it works)

- Storing anything that identifies a respondent: no email address, no IP
  address, no user agent, no long-lived per-browser identifier. **Owner
  decision: anonymous, no emails stored.**
- Sending answers to any third party. **Owner decision: Blanc's own Worker
  only.**
- Wording that claims an unreleased feature exists or is coming. The options
  are phrased as wishes ("I'd want…"), never as shipped features, so they are
  not product claims under `docs/marketing-claims.md`. The page still says
  plainly that Blanc Mail isn't released yet.
- A survey that quietly keeps running after it has served its purpose.

## The questions

Order and wording are the builder's to polish; the substance is fixed.

1. **Which accounts would you use with Blanc Mail?** One choice: Gmail · Proton
   Mail · Both · Something else. (Required.) *Claude's call:* "Something
   else" keeps people with iCloud, Outlook or Fastmail from picking a wrong
   answer; the summary reports it as its own group.
2. **How quickly does new mail need to show up?** One choice, asked on its own
   because it drives the push decision:
   - Instantly, within a few seconds
   - Within a minute is fine
   - Within a few minutes is fine
   - I don't mind; I check mail when I check it
   (Required.)
3. **Which would matter most to you? Pick up to three.** (Optional; zero to
   three.)
   1. One-click unsubscribe, and muting a sender for a while
   2. Accepting or declining calendar invitations from the email
   3. Grouping conversations you've set aside into named piles (Sets)
   4. Snooze, Send Later and reusable templates
   5. Rules that sort mail automatically, and a vacation auto-reply
   6. Saved searches and stronger search
   7. Showing remote images only for senders you trust
   8. Printing or saving a conversation as a PDF, and opening a conversation
      in its own window
   9. Proton drafts that also appear in Proton's own apps

   Options 1–5 are built in some form (1 hidden for 1.0; 3 still in
   provider testing); 6–9 are post-launch ideas (Mail `AGENTS.md`,
   Mimestream-informed sequence; Proton drafts are on this Mac only by the
   owner's 2026-11-11 decision). The page must not say which are built.
4. **Anything else you'd want?** Free text, optional, at most 500 characters,
   with a note under it: please don't include personal details.

## How it's built

### Worker (owner decisions: Blanc's own Worker; its own Worker with logs off)

A new, separate Worker (for example `cloudflare/mail-survey-worker`, name
`blanc-mail-survey`), not an extension of `cloudflare/newsletter-worker`.
**Owner decision (2026-11-12):** the newsletter Worker has Workers Logs on for
every route (`[observability] enabled = true`), whose request logs can hold a
respondent's IP and user agent; the survey Worker turns observability and
Logpush off so "no IP or browser details are kept" is true end to end. It has:

- Its own KV namespace (no shared prefixes with any other list) and its own
  admin token in a new 1Password item (vault Dev).
- `POST /mail-survey`: accepts one answer set, validates it strictly (known
  choice ids only, at most three features, free text trimmed and capped at
  500 characters, no other fields), and stores it.
  - The same `Origin` allowlist as the newsletter Worker's forms.
  - The same hidden honeypot field (`website`) the forms use; a filled
    honeypot returns the same success response and stores nothing.
  - A per-IP rate limit modeled on the newsletter Worker's. The IP is used
    only for the limit window and is never written with, or linkable to, an
    answer.
- Each record holds only the answers and the ISO week it was received (for
  example `2026-W46`), under a random key. **Owner decision (2026-11-12):**
  the week, not the day, because at about four waitlist sign-ups a week a day
  could match an answer to one sign-up in the signup alerts.
- `GET /mail-survey/summary` (admin token): counts per account choice, per
  speed choice, per feature, the speed breakdown split by account choice, and
  the free-text answers with their dates. No raw per-respondent export beyond
  that.
- `DELETE /mail-survey/answers?confirm=delete-all` (admin token): deletes every
  answer, the purge used when the survey closes.
- Survey open/closed is a Worker `[vars]` flag. When closed, `POST
  /mail-survey` answers that the survey has closed and stores nothing.
- The site's CSP gains the new Worker's origin where the page posts to it
  (`connect-src`, since the page uses fetch), on the survey page's own
  `_headers` block only.

### Site

- A survey page at `blanc.day/mail/survey` (exact path the builder's call),
  built like the other Mail pages, posting to the survey Worker with the same
  fetch/JSON pattern as `MailWaitlistForm.astro`.
- Linked from the Mail pages, and offered as an optional, skippable next step
  after a successful waitlist submission. Skipping changes nothing about the
  waitlist.
- *Claude's call:* needs JavaScript, exactly like `MailWaitlistForm.astro`
  (fetch/JSON, a `noscript` note asking to turn JavaScript on). No Worker-served
  result page.
- *Claude's call:* no analytics or chat on the survey page: build it with
  analytics off (`analytics={false}` or a dedicated layout), give it its own
  `_headers` block like `/privacy` (no Crisp, no Google Analytics origins), and
  put no tracking attribute on the invitation link after the waitlist form.
- When the survey is closed, the page says so and shows no form, and the links
  to it come down. *Claude's call:* the page reads a site-side flag that the
  closing deploy flips; the Worker's own flag refuses posts regardless, so a
  stale page can never store an answer.

### Invitation card on the Mail page (owner decisions, 2026-11-12)

The owner found the survey link too easy to miss and chose a corner card
(option C of three mockups) that appears as soon as `blanc.day/mail` opens:

- Black-and-gold card, bottom right ("Help shape Blanc Mail"), asking the
  survey's first question, "Which accounts would you use?", with the four
  account choices as chips and a close button. Only on `/mail`, and only
  while the survey is open.
- **Phones (owner's choice A of three mockups, 2026-11-12, replacing an
  earlier pick of a compact bar):** the same card along the bottom edge, clear
  of the chat button's corner. It never covers a waitlist form: while one is
  behind it, the card waits out of sight, and it appears once the form scrolls
  clear (usually after the first scroll). So on phones it is not instant.
- A chip opens `/mail/survey?account=<id>` with that answer preselected; the
  link carries only that id. Nothing is sent until the survey is submitted.
- Closing it hides it for 7 days (owner). *Claude's calls:* tapping a chip
  also hides it for 7 days; submitting the survey hides it for good.
- The memory is one `localStorage` entry in the visitor's browser
  (`blanc-mail-survey-invite-v1`), like the newsletter card's, disclosed in the
  privacy page's survey section; storage failures just show the card.
- It is a non-modal dialog that never takes focus, doesn't overlap the
  privacy-choices card, and appears without motion under Reduce Motion.

### Announcing Proton (owner decision, 2026-11-12)

The account question is the first public mention of Proton Mail on blanc.day,
whose Mail pages today describe a Gmail client. The owner chose to announce it
with the survey: the Mail pages state that Blanc Mail 1.0 is planned to support
Gmail and Proton Mail, before or together with the survey going live. That copy
is a claim about an unreleased product, so it follows `docs/marketing-claims.md`
and the Mail pages' existing coming-soon framing, is recorded in a claims
ledger, and needs the owner's sign-off on the exact wording. Mail's Proton
support is merged on `bnfy/blanc-mail` main (P1–P5 and Sets, November 2026);
its real-Bridge checklists are only partly run, so the copy must not promise
specific Proton features.

### Privacy and claims

- Add a "Blanc Mail survey (optional, anonymous)" section to `privacy.astro`,
  stating exactly what is stored (answers and the week), that no email, IP or
  browser details are kept (the survey Worker keeps no request logs), that a
  short-lived per-IP counter limits abuse,
  that answers are used only to decide what goes into Blanc Mail 1.0, and that
  all answers are deleted when that decision is made.
- The survey page, the Worker contract and the privacy section change together,
  like the waitlist triad (`site/CLAUDE.md`).
- Record every sentence of the new page in a claims ledger, as
  `site/CLAUDE.md` requires for site copy.

### Results

The owner reads results through Claude, which calls the summary endpoint with
the admin token and reports counts, the push split by account type and the
free text. No addresses exist to print.

## Closing (owner decision: close once the 1.0 scope is decided)

When the owner records the 1.0 scope decision:

1. Turn the Worker flag to closed and deploy.
2. Take the summary one last time and record the result (counts only, plus a
   paraphrase of themes in the free text) in the Mail repository with the 1.0
   scope decision.
3. Purge every answer with the delete endpoint and confirm the prefix is empty.
4. Remove the survey links from the Mail pages; the survey page shows "closed"
   or is removed, and the privacy section is updated to say the survey has
   closed and its answers were deleted.

## Constraints

- Website-only PR, separate from app work (`docs/` and `site/` paths only, plus
  the Worker under `cloudflare/`; confirm whether `cloudflare/` changes skip
  the Electron CI jobs or not).
- Unit tests for the new survey Worker, modeled on the existing
  `test/unit/newsletter-worker.test.js`, including: honeypot stores nothing,
  oversize or unknown fields are refused, more than three features refused,
  closed flag refuses, summary and purge need the admin token, and no stored
  record contains an IP, email or user agent; plus a guard that the survey
  Worker's `wrangler.toml` keeps observability and Logpush off.
- Deploying the Worker and the site are separate steps that need the owner's
  go-ahead.
- **Owner decision (2026-11-12): wait for the next release.** `main` holds the
  unreleased homepage Spaces demo, and site deploys are on hold until a public
  release ships #1450 and #1454. Build and merge the survey, then let it go
  live with the first site deploy after that release; never deploy `main`
  early for it. The Worker can be deployed before then, with its flag closed
  until the page is live. Closing needs a site deploy too, and follows the
  same rule.
- US spelling.

## Left to the builder

- Exact page path, layout and copy polish within the wording above.
- KV key format and the summary's JSON shape.
- Rate-limit thresholds, matched to the waitlist's.
- Whether the post-waitlist invitation is a link in the success message or a
  separate step.
