# Blanc Mail Feature Survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An anonymous Blanc Mail feature survey on blanc.day's Mail pages, stored by its own log-free Cloudflare Worker, to decide the Blanc Mail 1.0 scope (push above all).

**Architecture:** A new Worker, `cloudflare/mail-survey-worker` (`blanc-mail-survey`), validates and stores answers in its own KV namespace with request logging off, and serves an admin-only summary and purge. A static Astro page, `/mail/survey`, posts to it with fetch/JSON like `MailWaitlistForm.astro`; a build-time site flag controls whether the page, its links and the post-waitlist invitation are shown. The Mail pages announce Proton support (owner-approved wording), and the privacy page gains a survey section.

**Tech Stack:** Cloudflare Workers (ES modules, KV, the `[[ratelimits]]` binding), Astro static site (`site/`), `node:test` unit tests in `test/unit/`.

**Spec:** `docs/superpowers/specs/2026-11-12-mail-feature-survey-design.md`

## Global Constraints

- Anonymous: no stored record, key or summary may contain an email address, IP address, user agent or long-lived per-browser identifier.
- Answers go only to `blanc-mail-survey`; no third-party form, analytics or chat on the survey page or on the invitation link.
- The survey Worker keeps request logging off: `[observability] enabled = false` and no Logpush.
- Never email the waitlist or the newsletter about the survey.
- Option text is phrased as wishes and never says which features are built.
- Free text: trimmed, at most 500 characters (code points); the page says not to include personal details.
- At most three features per answer.
- Survey page needs JavaScript (no Worker-served result page), like `MailWaitlistForm.astro`.
- Site deploy waits for the first public release containing #1450 and #1454 (`site/CLAUDE.md`, spec "Constraints"); never deploy `main` early for this. The Worker may deploy earlier with `SURVEY_OPEN = "false"`.
- The survey page, the Worker contract and the privacy section change together.
- No `Co-Authored-By` model trailer in commits to `bnfy/blanc`. US spelling.

**Fixed answer ids** (shared by Worker, page and tests):

| Question | Ids |
| --- | --- |
| `account` (required) | `gmail`, `proton`, `both`, `other` |
| `speed` (required) | `instant`, `minute`, `few-minutes`, `whenever` |
| `features` (0–3, no repeats) | `unsubscribe-mute`, `calendar-replies`, `sets`, `snooze-send-later-templates`, `rules-vacation`, `saved-search`, `trusted-images`, `print-pdf-windows`, `proton-drafts` |
| `note` (optional) | string, ≤ 500 code points after trimming |

## Review Focus

1. A feature id sent twice (`["sets","sets"]`) must be refused, not counted twice. Test in Task 1.
2. A body that isn't JSON, or JSON that isn't an object, must get 400, never 500. Test in Task 2.
3. `SURVEY_OPEN` set to anything other than the exact string `"true"` (missing, `"TRUE"`, `"1"`) must count as closed. Test in Task 2.
4. More than one KV page of answers (over 1,000) must still be fully counted by the summary and fully removed by the purge. Test in Task 2.
5. A note that is only whitespace must be stored as no note, and one over 500 characters refused rather than silently cut. Test in Task 1.

---

### Task 1: Answer validation and summary (pure module)

**Files:**
- Create: `cloudflare/mail-survey-worker/src/survey.js`
- Test: `test/unit/mail-survey.test.js`

**Interfaces:**
- Produces:
  - `export const CHOICES` = `{ account: [...], speed: [...], features: [...] }` with the ids above, in that order.
  - `export const MAX_FEATURES = 3`, `export const MAX_NOTE = 500`.
  - `export function parseAnswer(body: unknown): { ok: true, answer: { account, speed, features: string[], note: string|null } } | { ok: false, reason: string }`
  - `export function summarize(records: Array<{ day: string, account, speed, features, note }>, open: boolean): { open, total, accounts: Record<id,n>, speed: Record<id,n>, speedByAccount: Record<accountId, Record<speedId,n>>, features: Record<id,n>, notes: Array<{ day, text }> }` — every id present with 0 when unused; notes in date order.

- [ ] **Step 1: Write failing tests** in `test/unit/mail-survey.test.js` (CommonJS test file importing the ES module via `pathToFileURL`, like `test/unit/newsletter-worker.test.js`):
  - `parseAnswer accepts a full answer` → `{account:'gmail', speed:'minute', features:['sets','saved-search'], note:' Fast search '}` returns `ok: true` with `note === 'Fast search'`.
  - `parseAnswer requires account and speed` → missing either gives `ok: false`.
  - `parseAnswer refuses unknown ids and extra fields` → `account:'icloud'`, a feature `'push'`, and an extra key `email` each give `ok: false`.
  - `parseAnswer refuses more than three features and repeats` → four ids, and `['sets','sets']`, each `ok: false`; `[]` and a missing `features` are `ok: true` with `features: []`.
  - `parseAnswer treats a blank note as none and refuses a long one` → `'   '` gives `note: null`; `'x'.repeat(500)` ok; `'x'.repeat(501)` `ok: false`; a 500-emoji string ok (code points, not UTF-16 units).
  - `parseAnswer refuses non-objects` → `null`, `[]`, `'a'` each `ok: false`.
  - `summarize counts every id, splits speed by account and keeps notes` → three records give exact counts, zeros for unused ids, `speedByAccount.gmail.instant === 1`, notes sorted by `day`, `total === 3`, `open` echoed.

- [ ] **Step 2: Run** `node --test test/unit/mail-survey.test.js` — expect FAIL (module not found).

- [ ] **Step 3: Implement** `cloudflare/mail-survey-worker/src/survey.js` with the exports above. Count note length with `[...note].length`. Ignore the `website` honeypot key in `parseAnswer` (Task 2 handles it before parsing); every other unknown key is a refusal.

- [ ] **Step 4: Run** `node --test test/unit/mail-survey.test.js` — expect PASS.

- [ ] **Step 5: Commit** `git add cloudflare/mail-survey-worker/src/survey.js test/unit/mail-survey.test.js && git commit -m "Validate and summarize Blanc Mail survey answers"`

### Task 2: The survey Worker

**Files:**
- Create: `cloudflare/mail-survey-worker/src/index.js`, `cloudflare/mail-survey-worker/wrangler.toml`, `cloudflare/mail-survey-worker/package.json`, `cloudflare/mail-survey-worker/README.md`
- Modify: `test/unit/mail-survey.test.js`

**Interfaces:**
- Consumes: `parseAnswer`, `summarize`, `CHOICES` from Task 1.
- Produces: Worker origin `https://blanc-mail-survey.bnfy-441.workers.dev` (the account's workers.dev subdomain, as for `blanc-newsletter`), routes:
  - `OPTIONS /mail-survey` → CORS preflight for allowed origins.
  - `POST /mail-survey` → `200 {ok:true}`; `400 {error:'invalid'}`; `403 {error:'origin denied'}`; `410 {closed:true}`; `429 {error:'rate limited'}`; `503` when the rate limiter binding is missing.
  - `GET /mail-survey/summary` (Bearer admin token) → `summarize(...)` JSON.
  - `DELETE /mail-survey/answers?confirm=delete-all` (Bearer admin token) → `{deleted:n}`; without the exact `confirm` value → 400.
- Bindings: KV `SURVEY` (new namespace), ratelimit `SURVEY_RATE_LIMITER` (`limit = 4`, `period = 60`, a new `namespace_id`), secret `ADMIN_TOKEN`, var `SURVEY_OPEN`.

- [ ] **Step 1: Write failing tests** in `test/unit/mail-survey.test.js`, reusing the `FakeKV` and `FakeRateLimiter` shapes from `test/unit/newsletter-worker.test.js` (copy them; don't import across test files):
  - `posting from blanc.day stores one anonymous answer` → open env, valid body, `CF-Connecting-IP: 203.0.113.20`, `User-Agent: test-agent`; 200; exactly one KV key; its key and value contain none of `203.0.113.20`, `test-agent`, `@`; value has `day` matching `/^\d{4}-\d{2}-\d{2}$/` and no other time field.
  - `other origins, closed survey and bad bodies store nothing` → `Origin: https://evil.example` 403; `SURVEY_OPEN` of `undefined`, `'false'`, `'TRUE'`, `'1'` each 410; a non-JSON body and a JSON array each 400; KV empty after all.
  - `a filled honeypot looks accepted but stores nothing` → `website: 'x'` gives 200, KV empty.
  - `the fifth post in a minute is rate limited, and a missing limiter fails closed` → posts 1–4 200, 5th 429; env without `SURVEY_RATE_LIMITER` gives 503 and stores nothing.
  - `summary and purge need the admin token and handle many pages` → no token / wrong token / env without `ADMIN_TOKEN` each 401 or 403 and no change; with the token and 1,005 stored answers, summary `total === 1005`; `DELETE` without `confirm=delete-all` 400; with it `{deleted:1005}` and KV empty.
  - `the survey Worker keeps request logging off and matches the site's origins` → read `wrangler.toml`: `[observability]` with `enabled = false`, no `logpush = true`; the Worker's allowed-origin set equals the newsletter Worker's `ALLOWED_ORIGINS` (parse both source files).

- [ ] **Step 2: Run** `node --test test/unit/mail-survey.test.js` — expect the new tests to FAIL.

- [ ] **Step 3: Implement** `src/index.js` (`export default { fetch(request, env) }`):
  - Open only when `env.SURVEY_OPEN === 'true'`.
  - Honeypot check (`website` non-empty → 200, no write) happens after origin, open and rate-limit checks.
  - Rate limit with `env.SURVEY_RATE_LIMITER.limit({ key: 'survey:' + ip })`; never write the IP to KV.
  - Store `answer:<random 32-byte base64url token>` → JSON `{ day, account, speed, features, note }`, `day` = UTC date of receipt.
  - Admin check: fail closed when `ADMIN_TOKEN` is unset; compare SHA-256 digests of the presented and expected tokens.
  - List and delete through every KV page (`list_complete`/`cursor`).

  `wrangler.toml`: `name = "blanc-mail-survey"`, `main = "src/index.js"`, the KV and ratelimit bindings, `[vars] SURVEY_OPEN = "false"`, `[observability] enabled = false`, with a comment saying why logging is off (spec "Worker"). `package.json` mirrors `cloudflare/newsletter-worker/package.json` with a plain `wrangler deploy` script. `README.md`: what is stored and not, the routes, setup (KV namespace create, `ADMIN_TOKEN` from a new 1Password item "Blanc Mail Survey Admin" in vault Dev), how to read the summary, and the closing runbook from the spec's "Closing" section.

- [ ] **Step 4: Run** `node --test test/unit/mail-survey.test.js` — expect PASS.

- [ ] **Step 5: Commit** `git add cloudflare/mail-survey-worker test/unit/mail-survey.test.js && git commit -m "Add the log-free Blanc Mail survey Worker"`

### Task 3: The survey page and its site flag

**Files:**
- Create: `site/src/data/mail-survey.json`, `site/src/components/MailSurveyForm.astro`, `site/src/pages/mail/survey.astro`
- Modify: `site/public/_headers`, `site/src/styles/mail.css`
- Test: `test/unit/mail-survey-site.test.js`

**Interfaces:**
- Consumes: the Task 2 origin and `POST /mail-survey` responses; `CHOICES` ids (the page hard-codes the same ids; the test checks they match `survey.js`).
- Produces: `site/src/data/mail-survey.json` = `{ "open": true }` (the site flag later tasks read); page URL `/mail/survey`.

- [ ] **Step 1: Write failing tests** in `test/unit/mail-survey-site.test.js` (static source checks, like the waitlist contract test in `test/unit/newsletter-worker.test.js`):
  - `the survey page posts only to the survey Worker, without analytics` → `survey.astro` uses `analytics={false}` and `social="none"`; `MailSurveyForm.astro` contains `'https://blanc-mail-survey.bnfy-441.workers.dev/mail-survey'`, `method="post"`, the hidden `website` honeypot with `tabindex="-1" autocomplete="off" aria-hidden="true"`, a submit button that starts `disabled`, a `noscript` note, and no `data-track`.
  - `the page offers exactly the Worker's ids` → every id in `CHOICES` (imported from `survey.js`) appears as an input `value`, and no other values appear; the note textarea has `maxlength="500"`.
  - `the page carries the spec's privacy wording` → contains `anonymous`, `Please don't include personal details`, a link to `/privacy#mail-survey`, and none of the words `built`, `coming`, `available` in option labels.
  - `the survey page has its own headers block` → `_headers` has a `/mail/survey` block that detaches the global CSP (`! Content-Security-Policy`), allows `connect-src` the survey Worker origin, and names no Crisp or Google Analytics origin.
  - `a closed survey shows no form` → when `mail-survey.json` is `{ "open": false }` the page renders the closed message branch (assert the component branches on the imported flag; the closed copy is "This survey has closed. Thank you to everyone who answered.").

- [ ] **Step 2: Run** `node --test test/unit/mail-survey-site.test.js` — expect FAIL.

- [ ] **Step 3: Implement.** `survey.astro`: `BaseLayout` with `title="Blanc Mail survey"`, `path="/mail/survey"`, `header="legal" analytics={false} social="none"`, `MailBar`, and either `MailSurveyForm` or the closed message from the flag. `MailSurveyForm.astro`: the four questions with the spec's wording and order (spec "The questions"), radio groups for `account`/`speed`, checkboxes for `features` with a script that disables unchecked boxes once three are chosen, the note textarea with the personal-details warning, and a fetch/JSON submit modeled on `MailWaitlistForm.astro`'s script (status line; 200 thanks and hides the form; 410 shows the closed message; 400 "Please answer the first two questions."; anything else "We couldn't save that just now. Please try again later."). Intro line: "Blanc Mail isn't released yet. Tell us what matters to you, anonymously; it takes about a minute." Style in `mail.css` with existing Mail tokens.

- [ ] **Step 4: Run** `node --test test/unit/mail-survey-site.test.js` and `npm --prefix site run build` — expect PASS and a built `dist/mail/survey.html`.

- [ ] **Step 5: Commit** `git add site/src/data/mail-survey.json site/src/components/MailSurveyForm.astro site/src/pages/mail/survey.astro site/public/_headers site/src/styles/mail.css test/unit/mail-survey-site.test.js && git commit -m "Add the anonymous Blanc Mail survey page"`

### Task 4: Privacy disclosure

**Files:**
- Modify: `site/src/pages/privacy.astro` (after the `#mail-waitlist` section; the retention list), `site/CLAUDE.md` (a "Blanc Mail survey" paragraph after the waitlist one)
- Modify: `test/unit/mail-survey-site.test.js`

- [ ] **Step 1: Write failing test** `the privacy page describes the survey contract` → `privacy.astro` contains `<h3 id="mail-survey">Blanc Mail survey (optional, anonymous)</h3>`, `no email address, IP address or browser details`, `keeps no request logs`, `only to decide what goes into Blanc Mail 1.0`, and a retention bullet containing `deleted when that decision is made`.

- [ ] **Step 2: Run** the test — expect FAIL.

- [ ] **Step 3: Write the section.** Two paragraphs: what is stored (your answers and the day you sent them, in a separate Bananify Worker that keeps no request logs; no email address, IP address or browser details), the short-lived per-IP counter that limits abuse and is never stored with an answer, the purpose (only to decide what goes into Blanc Mail 1.0), and deletion (every answer is deleted when that decision is made; the free-text box asks you not to include personal details). Add the retention bullet. Add the `site/CLAUDE.md` paragraph: page, component, Worker, privacy section change together; the site flag; the closing runbook lives in the Worker README.

- [ ] **Step 4: Run** `node --test test/unit/mail-survey-site.test.js test/unit/newsletter-worker.test.js` — expect PASS (the waitlist contract test must still pass).

- [ ] **Step 5: Commit** `git commit -am "Disclose the Blanc Mail survey on the privacy page"`

### Task 5: Proton announcement, links and the post-waitlist invitation

**Files:**
- Modify: `site/src/pages/mail.astro` (line 21 "Gmail first" tile, line 63 `description`, line 87 lead; a survey link near the waitlist), `site/src/components/MailWaitlistForm.astro` (success message)
- Create: `docs/website-mail-claims-2026-11-12.md`
- Modify: `test/unit/mail-survey-site.test.js`

- [ ] **Step 1: Draft the Proton wording and stop for the owner.** Propose replacements for the three Gmail-only lines saying Blanc Mail 1.0 is planned to support Gmail and Proton Mail, inside the page's existing coming-soon framing and without promising specific Proton features (spec "Announcing Proton"). Show the owner the exact before/after lines and wait for explicit approval. Do not commit unapproved wording.

- [ ] **Step 2: Write failing tests:**
  - `the Mail page names both providers and links the open survey` → `mail.astro` contains the approved Proton wording and `href="/mail/survey"` inside a branch on `mail-survey.json`'s `open`.
  - `joining the waitlist offers the survey without tracking` → `MailWaitlistForm.astro`'s success path adds a link to `/mail/survey` only when the flag is open, with no `data-track` on it.
  - `every new Mail page sentence has a ledger row` → each sentence added to `mail.astro`, `survey.astro` and `MailSurveyForm.astro` appears verbatim in `docs/website-mail-claims-2026-11-12.md`.

- [ ] **Step 3: Implement** the approved wording, the link (one short line: "Help shape Blanc Mail: tell us what you'd want, anonymously."), and the invitation in the waitlist success message ("While you're here, you can tell us what you'd want in Blanc Mail." linking to `/mail/survey`). Write `docs/website-mail-claims-2026-11-12.md` in the format of `docs/website-mail-claims-2026-10-12.md`: the Proton lines with evidence in `bnfy/blanc-mail` (Proton P1–P5 and Sets merged; real-Bridge checklists partly run) and verdict Qualified, and the survey lines marked as labels/questions, not product claims.

- [ ] **Step 4: Run** `node --test test/unit/mail-survey-site.test.js test/unit/newsletter-worker.test.js test/unit/site-mail-screens.test.js test/unit/site-eyebrows.test.js` and `npm --prefix site run build` — expect PASS.

- [ ] **Step 5: Commit** `git add site/src/pages/mail.astro site/src/components/MailWaitlistForm.astro docs/website-mail-claims-2026-11-12.md test/unit/mail-survey-site.test.js && git commit -m "Announce Proton support and invite visitors to the Mail survey"`

### Task 6: Review, PR and handoff (no deploys)

- [ ] **Step 1:** Run `npm run test:unit` and `npm run lint`; expect PASS.
- [ ] **Step 2:** Run the `code-review` skill on the branch; fix or report its findings.
- [ ] **Step 3:** Open one PR. It changes `cloudflare/`, so the Electron jobs will run; that's expected. The PR body states that nothing is deployed, the Worker deploy and site deploy are separate owner-approved steps, and the site deploy waits for the release containing #1450 and #1454.
- [ ] **Step 4 (after merge, with the owner's go-ahead):** create the KV namespace and the 1Password admin token, deploy `blanc-mail-survey` with `SURVEY_OPEN = "false"`, check `POST` answers 410 and the summary answers with the token. Switch `SURVEY_OPEN` to `"true"` only in the same window as the site deploy that publishes `/mail/survey`.
