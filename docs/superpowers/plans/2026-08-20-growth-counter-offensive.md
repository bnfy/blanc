# Growth Counter-Offensive Implementation Plan

> **Licensing supersession (2026-08-30).** Blanc adopted the MIT License on
> 2026-08-30, reversing the 2026-08-20 decision to remain `UNLICENSED`.
> Historical sections below may still quote the earlier decision; they are not
> current instructions or approved public copy. Current execution follows the
> MIT rule in Global Constraints and the terms in `LICENSE`,
> `THIRD-PARTY-NOTICES.md`, and `ASSET-LICENSE.md`.

> **Owner reschedule (2026-08-30).** The official launch sequence now runs
> Monday, September 7 through Thursday, September 10, with Show HN on
> **Tuesday, September 8, 2026**. The previous August 31–September 3 calendar
> and the `0de37a1` pre-launch merge-freeze anchor are retired. A bounded
> backlog-cleanup window precedes a new release-backed freeze; the reschedule
> itself does not authorize a merge, release, or evidence waiver.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire the five discovery channels Blanc has never used — in one concentrated week, with measurement restored and the payment path proven first — so the September cohort is large enough for retention to become a real question.

**Architecture:** Four phases. Phase 0 clears real lead times (AlternativeTo's paid priority review; Product Hunt personal-account access; Google Ads verification) and de-risks the spike. Phase 1 builds reusable assets. Phase 1.5 closes the selected backlog, runs the approved immutable pre-launch release train, proves its final launch release, refreshes release-bound assets, and starts a new freeze. Phase 2 fires evergreen listings, then argumentative communities, then Product Hunt across four days so neither one-shot card is spent on untested copy.

**Tech Stack:** Astro 7 (`site/`), Cloudflare Pages, GA4 (property 544287080), Polar.sh (Patron checkout), `blanc-ping` Worker stats, `gh` CLI.

**Source spec:** [2026-08-20-growth-counter-offensive-design.md](../specs/2026-08-20-growth-counter-offensive-design.md)

## Execution status — August 31, 2026

- Blanc v1.11.0 is the current public baseline. It was published from
  `e3ab5b6` at `2026-08-31T19:34:52Z`; publication, the authenticated manifest,
  native platform gates, logged-out download smoke, and the authenticated
  public Linux AppImage launch/render check passed. See
  `docs/release-incidents/2026-08-31-v1.11.0.md`.
- The exact public v1.10.0 → v1.11.0 updater handoff passed on macOS, including
  strict post-update signature and Gatekeeper checks. The corresponding Windows
  handoff and the v1.11.0 48-hour soak remain open. The earlier v1.9.1 → v1.10.0
  handoffs, trust checks, Linux smoke, and soak remain valid historical v1.10.0
  evidence; they do not satisfy the replacement launch release's remaining
  adjacent-version gate.
- Task 8's Island demo was recorded on August 30 from installed packaged public
  v1.10.0. Its 20.50-second MP4 and sub-8-MiB GIF remain immutable in
  `0cc0c57`, but they are no longer launch-ready because v1.11.0 ships the
  revised Blanc mark. **OWNER DECISION 2026-08-31:** because more releases are
  likely before launch week, do not recapture the demo or Product Hunt stills
  for v1.11.0. Refresh them once, from the final selected launch release, after
  its required evidence is complete.

## Superseded execution status — August 28, 2026

- Blanc v1.9.1 is the current public baseline. Its signed/notarized macOS
  artifacts, signed Windows artifacts, authenticated Linux AppImage, updater
  metadata, checksums, SBOM, Sigstore material, and provenance attestations were
  published from `09ae98c`; see
  `docs/release-incidents/2026-08-26-v1.9.1.md`.
- Publication and logged-out download smoke passed, but publication is not the
  updater handoff. The real public **v1.9.0 → v1.9.1 Restart Now** flow on
  macOS passed on August 27 and the corresponding Windows handoff passed on
  August 28. A fresh authenticated download of the public v1.9.1 AppImage also
  passed its Ubuntu launch/render/version check.
- v1.9.1 was published at **2026-08-26 04:29:03 UTC**. Its 48-hour soak deadline
  of **2026-08-28 04:29:03 UTC** (**August 28, 12:29:03 a.m. ET**) elapsed and
  was verified at `2026-08-28T14:32:38Z`. All three platform follow-up checks
  are now complete.
- AlternativeTo approved Blanc at **2026-08-25 02:04 a.m. ET**. The canonical
  listing is `https://alternativeto.net/software/blanc/`; a signed-out browser
  check passed on August 27 with the listing title, six alternatives, and
  `Sign In` control visible. Automated clients still receive AlternativeTo's
  Cloudflare challenge, so do not use `curl` as the availability check.
- Tasks 2–6 and 8–10 are complete. Google Ads verification moved entirely
  into the live account's `Completed tasks` section on August 27, with no
  pending, in-review, or action-required state; the Blanc campaign is serving.
- Task 8's complete 20-second Island demo was captured from the packaged public
  v1.9.1 app on August 27 and exported in both MP4 and GIF form.

## Owner legend

Most of this plan cannot be executed by an agent. Every task is tagged:

- **`owner`** — requires the human: account creation, real payment, posting under a personal identity, OAuth sign-in.
- **`agent`** — can be drafted, built, and verified by an agent.
- **`agent-drafts / owner-publishes`** — agent produces the artifact; human clicks publish and engages.

An agent must **never** create accounts, enter payment details, or post to a
community on the owner's behalf. Those steps are marked and must stop for the human.

## Global Constraints

- **Feature freeze is in effect for the whole of Phase 2.** No feature releases during launch week.
- **Ship one proven launch release as-is.** No telemetry or feature changes
  during launch week; Patron stays in the launch narrative. v1.11.0 is the
  public baseline, and any later product/runtime, dependency,
  packaging, or release-workflow merge during backlog cleanup requires a new
  immutable launch release. Never describe newer `main` behavior as shipped.
- **The backlog-cleanup window is open only before the new freeze.** PRs #238
  and #205 and the held dependency PRs may be reviewed in this window, but this
  reschedule is not merge approval. Apply their ordinary tests, platform gates,
  issue-specific evidence, and the required explicit affected-machine owner
  confirmation. Close dead ideas instead of merging them merely to reduce a
  count.
- **Finish the release train with the launch release by Friday, September 4 at
  3:00 p.m. ET.** The owner expects more than one post-v1.10.0 release. Every
  published version is immutable and must complete its publication,
  macOS/Windows/Linux, manifest, download, and incident-record evidence. Every
  updater handoff starts in the immediately preceding public version; skipping
  an intermediate version does not prove the real update chain. Only the final
  selected launch release must complete the launch's fresh ≥48-hour soak, and
  any later replacement restarts that clock. The Friday cutoff leaves a full
  extra day before Monday's baseline. Missing it moves the launch again; it
  never shortens or waives the soak.
- **Freeze the final launch state through the Show HN post.** After the release
  and its release-bound copy/assets are committed, append a
  `launch-freeze-start` record containing the exact `origin/main` anchor,
  release tag, and release-tag SHA to the launch log. From that point until Show
  HN is live, `origin/main` may advance only for launch evidence, launch copy,
  and their regression guards. The old `0de37a1` anchor is historical and must
  not be reused.
- **Channel order is not negotiable:** evergreen listings → Show HN → Reddit → Product Hunt.
- **No retention experiments this cycle.** n=27 cannot support one. The checkpoint is Oct 1.
- **Adding a site page REQUIRES adding its path to `MANIFEST` in `site/src/pages/sitemap.xml.js`** — the sitemap endpoint asserts the manifest matches discovered pages exactly and **fails the build** otherwise.
- **Site deploys use `npm run site:deploy`** (includes the mandatory `--branch=main`). After deploying, confirm Wrangler reports `Environment: Production`, `Branch: main`, and the expected source SHA.
- **Never hand-edit `site/src/data/releases.json`** — it is generated by `npm run site:changelog`.
- **Licence: RESOLVED 2026-08-30 — MIT.** Blanc's Bananify
  Creative-owned code and documentation are open source under the MIT License.
  Modification, redistribution, and third-party builds are permitted. Public
  copy must preserve the two carve-outs: bundled filter lists retain their CC
  BY-SA 3.0+ attribution/share-alike obligations, and the Blanc name and logo
  remain reserved trademarks. Do not reintroduce `UNLICENSED` or
  “source-available, not open source” wording.
- **Public copy attributes to Bananify (the studio).** Keep the owner's personal name and home city off the marketing site. The press-release quote is the deliberate exception and stays personally attributed.
- **The memory benchmark figures are pinned** by `test/unit/public-truth.test.js` across `site/src/components/MemoryChart.astro`, `docs/press/fact-sheet.md`, and the committed run. Never change one alone. Both qualifications must travel with the numbers: Brave is the fair peer, and the gap is not only blocking.
- **Internal site links are root-relative and extensionless** (`/faq`, not `/faq.html`).
- **Launch evidence never enters the repository.** `bnfy/blanc` is a **public** repo. The evidence log records real-purchase confirmations, licence-activation counts, and account handles — none of which belong in public git history. It lives outside the tree, next to the existing analytics series:

  ```bash
  export LAUNCH_LOG="$HOME/.claude/scheduled-tasks/blanc-daily-analytics/launch-accounts.jsonl"
  ```

  Export it once per shell before running any step that appends to it. Only `launch-urls.md` and `launch-copy.md` — both public-safe — are committed.
- **Never run `git add -A` in this plan.** Stage explicit paths only. A blanket add is what would sweep the evidence log (or a stray build artifact) into a public commit.

---

## Phase 0 — Prep (ordered: lead times, then de-risking, then the release)

### Task 1: Submit the AlternativeTo listing (with priority review)

**Owner:** `owner` — account creation and a $5 payment.

**Status: APPROVED 2026-08-25.** The submission, paid priority review, six
alternatives, approval email, and canonical listing URL are recorded. AlternativeTo's current
FAQ requires email verification—not account age—and says paid priority
submissions are usually reviewed within 1–2 business days, or up to a week in
busy periods. The approved description predates Blanc's August 30 adoption of
the MIT License; Task 11 Step 2 corrects that public source-status sentence
after the pre-launch baseline and verifies the result signed out.

**Why in Phase 0, not launch week:** The plan originally claimed a seven-day
account-age requirement. **That is false** — it came from a stale line in
`docs/press-outreach-plan.md`. AlternativeTo's actual FAQ requires only **email
verification** before submitting. The real constraint is the opposite kind: a
normal submission *"usually sits in our backlog for at least a few months
before anyone looks at it."* A $5 one-time priority review returns a verdict in
**1–2 business days**. So this must be submitted and reviewed **before** launch
week, or the channel simply will not exist during it.

- [x] **Step 1: Create the account and verify the email**

Register at https://alternativeto.net/ under a Blanc/Bananify identity, not a
personal one. Verify the email — that is the only gate on submitting.

- [x] **Step 2: Submit Blanc with the CLEAN canonical URL**

Use `https://blancbrowser.com` — **no `?ref=` tag.** AlternativeTo's FAQ is
explicit that tagged official URLs are discouraged: *"many of our users are
against tracking and want to see a clean official URL only."* A tagged URL
risks the listing itself.

Attribution for this channel comes from HTTP referrer data instead, which is
what their FAQ recommends and what GA4 already records.

File Blanc as an alternative to: Chrome, Arc, Brave, Vivaldi, Opera, Zen. State
plainly that its Bananify Creative-owned code is open source under the MIT
License. If licensing detail is requested, preserve the bundled filter lists'
CC BY-SA 3.0+ terms and the reserved Blanc name/logo trademarks.

- [x] **Step 3: Buy the $5 priority review**

Without it the listing will not be looked at for months. With it, expect a
verdict in 1–2 business days.

- [x] **Step 4: Record the submission**

```bash
mkdir -p "$(dirname "$LAUNCH_LOG")"
echo '{"date":"YYYY-MM-DD","channel":"alternativeto","submitted":true,"priorityReviewPaid":true,"status":"pending","url":"https://blancbrowser.com"}' \
  >> "$LAUNCH_LOG"
```

- [x] **Step 5: Confirm it is live before launch week**

AlternativeTo approved Blanc at 2:04 a.m. ET on August 25. Canonical listing:
`https://alternativeto.net/software/blanc/`. A signed-out browser check passed
on August 27: the page rendered the Blanc listing, six alternatives, and a
`Sign In` control. Automated clients still hit AlternativeTo's Cloudflare
challenge; the approval email remains the moderation evidence.

---

### Task 2: Restore measurement

**Owner:** `owner` for the GA4 reconnect (OAuth sign-in); `agent` for the ref scheme.

**Why:** GA4 has been unreadable for days — `list_connected_browsers` returns empty, so the daily digest has skipped site traffic repeatedly. Launching the largest traffic event in Blanc's history without measurement wastes it twice: no read on which channel worked, and no baseline for the next attempt.

**Interfaces:**
- Produces: the canonical tagged URL set used verbatim by Tasks 11–14.

- [x] **Step 1: Reconnect Claude in Chrome, then confirm GA4 loads**

Connect the extension, then open the GA4 reporting hub for property 544287080:
`https://analytics.google.com/analytics/web/?authuser=1#/p544287080/reports/reportinghub`

If a sign-in wall appears, the owner signs in personally — an agent must not.

- [x] **Step 2: Verify GA4 is recording NOW, with a live Realtime event**

A non-zero count for the last 7 days proves the tag worked *at some point*, not
that it works today. Open the **Realtime** report, then load
`https://blancbrowser.com/?ref=selftest` in a normal browser and accept the
consent banner. Confirm the visit appears in Realtime within ~30 seconds.

The property has an active internal-traffic exclusion, so a known internal
network can produce a false failure. If a local visit does not appear, repeat
the check from an external network (for example, a phone with Wi-Fi off). On
2026-08-22, two local `?ref=selftest` sessions appeared after a longer than
expected delay, producing two active users, four `user_engagement` events, and
the `/` page path in Realtime.

If it does not appear, the tag is broken and every `?ref=` value in this plan
measures nothing. Fix it before continuing.

Note the consent gate: `site/src/scripts/site.js` loads gtag with
`analytics_storage: 'denied'` by default, so a visitor who declines the banner
contributes only cookieless modelling signal. Channel landings are therefore a
**floor**, never a full count.

- [x] **Step 3: Write down the canonical tagged URLs**

One value per channel, used verbatim everywhere. No variants — a typo splits the data.

```
Show HN        https://github.com/bnfy/blanc          (see Task 12 — NOT the marketing root)
Reddit         https://blancbrowser.com
Product Hunt   https://blancbrowser.com/?ref=ph
AlternativeTo  https://blancbrowser.com                (clean — tags risk the listing)
BetaList       https://blancbrowser.com/?ref=betalist
```

Two of these deliberately carry no tag:

- **AlternativeTo** forbids it in practice — their FAQ says users want a clean
  official URL. Attribution comes from HTTP referrer instead.
- **Show HN** points at the repository, not the marketing site, because HN's
  Show HN rules say *"Don't post landing pages or fundraisers."* GitHub's own
  referrer data covers attribution here:

```bash
gh api repos/bnfy/blanc/traffic/popular/referrers
```

```bash
mkdir -p docs/superpowers/plans/assets
cat > docs/superpowers/plans/assets/launch-urls.md <<'URLS'
# Canonical tagged launch URLs — use verbatim, no variants

| Channel | URL | Attribution |
|---|---|---|
| Show HN | https://github.com/bnfy/blanc | GitHub referrer traffic |
| Reddit | https://blancbrowser.com | HTTP referrer; clean URL conservatively satisfies no-referral-link rules |
| Product Hunt | https://blancbrowser.com/?ref=ph | GA4 landing page |
| AlternativeTo | https://blancbrowser.com | HTTP referrer (tags discouraged) |
| BetaList | https://blancbrowser.com/?ref=betalist | GA4 landing page |

A variant (`?ref=HN`, `?ref=hackernews`) splits the data and cannot be merged
retroactively in GA4's landing-page report. Copy these exactly.
URLS
git add docs/superpowers/plans/assets/launch-urls.md
git commit -m "docs: canonical tagged launch URLs for the growth counter-offensive"
```

- [x] **Step 4: Confirm the independent fallback exists**

GA4 has been flaky. The independent read is the existing series, which does not
depend on Google at all:

```bash
tail -3 /Users/anthonyjloria/.claude/scheduled-tasks/blanc-daily-analytics/downloads-history.jsonl
```

Confirm the daily digest is still appending rows. Only `valid:true` rows are usable
as a baseline. **This is the measurement of record if GA4 fails again.**

- [x] **Step 5: Write down what this measurement CANNOT do**

Be explicit now, so Task 15 does not promise a number that cannot exist.

Nothing in `site/src/scripts/site.js` reads or stores `?ref` — grep confirms no
`URLSearchParams`, no `location.search` anywhere in `site/src`. The download CTA
has its `href` replaced with the GitHub asset URL, so the tag does not travel to
the download either. **GA4 is the only thing that ever observes the tag**, and
the GitHub fallback is a single global total with no channel dimension.

Therefore:

| Question | Answerable? |
|---|---|
| How many people landed from each channel | **Yes** — GA4 landing page (floor; consent-gated) |
| Total download lift across the week | **Yes** — `downloads-history.jsonl` |
| How many downloads came from Show HN specifically | **No** |

Closing that last gap would mean persisting `?ref` and attaching it to the
download click — a new cross-page identifier on a privacy-marketed site. That
is a privacy-reviewed product decision, not a launch chore, and it is
deliberately **out of scope**. Task 15 reports per-channel *landings* plus
*aggregate* download lift, and says so.

---

### Task 3: Google Ads advertiser verification

**Owner:** `owner` — identity verification.

**Status: COMPLETE 2026-08-27.** The live account page shows the organization
questionnaire and submitted documents under `Completed tasks`, with no pending,
in-review, or action-required state. The private launch log records the outcome.

**Why:** Due **2026-09-15** in the live Google Ads UI. If it lapses, paid
delivery stops — potentially mid-launch. Account: Bananify Creative,
747-455-5018, campaign 24027915268.

- [x] **Step 1: Complete verification in the Google Ads UI**

Must be finished **before launch week begins**, not during it.

Submitted on 2026-08-23 under Bananify Creative. Verified again on August 27:
the account page contains only `Completed tasks`, including the organization
questionnaire and submitted documents, and exposes no pending, in-review, or
action-required verification state.

- [x] **Step 2: Confirm the campaign is still Enabled and serving**

Check campaign 24027915268 shows `Enabled` with recent impressions. A verified
account with a paused campaign delivers nothing.

Verified live again on 2026-08-27: the Blanc campaign is `Eligible (Limited)`
only because it is limited by budget, and the Aug 20–26 overview reports 81
clicks, proving delivery continued after the verification submission.

- [x] **Step 3: Record the outcome**

```bash
echo '{"date":"2026-08-27","googleAdsVerification":"complete","campaignStatus":"eligible-limited-budget","evidence":"completed-tasks-no-pending-state"}' \
  >> "$LAUNCH_LOG"
```

Recorded once in the private launch log on August 27.

---

### Task 4: Prove the production Patron checkout

**Owner:** `owner` — real payment. **An agent must not attempt a purchase.**

**Status: PASSED 2026-08-23.** The owner opened the live checkout from the
public packaged v1.8.2 app, bought the real $4/month subscription, activated it,
and confirmed Named Workspaces creation and renaming. Polar's customer portal
shows exactly one active allocation labeled `Blanc`; against the configured
five-device cap, the customer retains four activations of headroom. The portal's
initial `Validations: 0` / `Never Validated` display is expected: activation is
its own API operation, and Blanc schedules the first subscription revalidation
after 24 hours.

**Why this gate existed:** Sandbox purchase→activate→create was proven
2026-08-20, but production had not been run before this 2026-08-23 test. Named
Workspaces (merged in `8a3dcf5`, PR #177) carried this as an explicit launch
gate because launch week points the largest traffic spike in Blanc's history at
the payment path.

**Interfaces:**
- Produced: the cleared launch gate required before the channel sequence begins.

- [x] **Step 1: Build a packaged app**

```bash
npm run dist:dir
```

Dev builds hit the Polar **sandbox** — a dev run does not prove production. It must be the packaged binary.

Satisfied with the already-published packaged v1.8.2 binary, which is stronger
evidence than a local unpacked build.

- [x] **Step 2: Buy a real Patron subscription through the packaged app**

Use the live checkout link. Real card, real money. Complete the purchase.

- [x] **Step 3: Activate the licence in the packaged app and confirm perks unlock**

Confirm the app reports Patron active, and that Named Workspaces create/rename works.

- [x] **Step 4: Verify the activation cap is understood, not just the happy path**

Activations are capped at **5** with **no in-app deactivate**. Confirm the count consumed by this test, and that a normal buyer has headroom.

- [x] **Step 5: Record the evidence**

```bash
echo '{"date":"YYYY-MM-DD","productionPurchase":"PASS","activated":true,"namedWorkspacesVerified":true,"activationsUsed":N,"notes":"..."}' \
  >> "$LAUNCH_LOG"
```

If any step fails, **stop the whole plan here** and fix the checkout. Launching into a broken payment path is the single worst outcome available.

---

### Task 5: Make the site's Patron claims true, and ship the objections page

**Owner:** `agent` — this is ordinary site work.

**Status: COMPLETE.** Merged in `ba18dc9` and deployed to production. The
completed steps remain as the implementation and verification record.

**COMPLETED POST-RELEASE CORRECTION.** Four pages previously stated that no
feature was locked behind payment even though v1.8.0 shipped Patron-gated
workspace creation and v1.8.1 made that gate explicit before the editor opened.
One of those pages was the Terms of Service. The detailed steps below preserve
the corrected implementation record.

**Files:**
- Create: `site/src/pages/faq.astro`
- Modify: `site/src/pages/sitemap.xml.js` (add `/faq` to `MANIFEST` — **the build fails without this**)
- Modify: `site/src/components/Footer.astro` (add `/faq` to `LINKS`)
- Modify: `site/src/pages/index.astro:258` (FAQ answer claims nothing is paywalled)
- Modify: `site/src/pages/about.astro:41` (claims every browser feature is free)
- Modify: `site/src/pages/terms.astro:28` (**legal text** claiming no feature is locked behind payment)
- Modify: `site/src/pages/press.astro:297` (price line + "cosmetic Dock icons today")

**Interfaces:**
- Produces: `https://blancbrowser.com/faq` — linked verbatim from Tasks 12–14 when an objection lands.

**Why:** So the answers are *linkable* in a hostile thread rather than retyped under pressure at hour three of a Show HN.

- [x] **Step 1: Add the route to the sitemap manifest first**

In `site/src/pages/sitemap.xml.js`, add to `MANIFEST` after the `/press` entry:

```js
  { path: '/faq',                      changefreq: 'monthly', priority: '0.5' },
```

- [x] **Step 2: Verify the build fails right now**

```bash
npm run site:build
```
Expected: **FAIL** — the manifest lists `/faq` but no page exists. This proves the guard works before you rely on it.

- [x] **Step 3: Create the page**

Create `site/src/pages/faq.astro`. Use the `standard` header profile, matching every non-index, non-legal page:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';

const QUESTIONS = [
  {
    q: 'Is Blanc open source?',
    a: [
      'Yes. Bananify Creative-owned code and documentation are licensed under the MIT License.',
      'The repository at github.com/bnfy/blanc contains the application source. You can read every line, check what the blocker does, check what the launch ping sends, modify or redistribute the MIT-covered material, and build it locally. Publishing a build also carries the bundled filter lists\' CC BY-SA 3.0+ obligations, while the Blanc name and logo remain reserved trademarks.',
      'A local build shows what that source does; it does not prove that a published binary matches it byte for byte. Published macOS releases are signed and notarized, and published Windows releases carry a timestamped Authenticode signature whose subject is checked at release time. The release checksum manifest is signed with Sigstore under a verified OIDC identity, while Windows and Linux CI artifacts carry GitHub provenance attestations. Those records authenticate the published artifacts; they do not make a local build reproducible.',
    ],
  },
  {
    q: "It's Electron. Isn't that just Chrome with extra memory?",
    a: [
      'Blanc is Chromium-based, and yes, that is Electron. The memory assumption is the part worth checking rather than assuming.',
      'We built a benchmark harness to answer it, and published the method along with the numbers. It sums phys_footprint across each browser’s whole process tree rather than summing RSS — summing RSS counts the engine framework once per renderer, which systematically penalises whichever engine isolates more per site.',
      'Two qualifications travel with those figures wherever they appear: Brave is the fair peer, because it also blocks by default; and the gap is not only blocking — with the blocker switched off, Blanc still came in under Chrome.',
    ],
  },
  {
    q: 'Does Blanc phone home?',
    a: [
      'It sends one launch ping, from packaged builds only, and you can turn it off. The payload is six fields: a random install id, a session id, the app version, platform, architecture, and OS version coarsened to a major number. There is no page, URL, search, or history data in it, and none of it is joined to anything else.',
      'On a fresh profile the choice is presented during first-run setup and must be saved before any ping is sent — it is not a silent default you discover later. The server HMACs the install id before storage, applies replay dedup and rate caps, and keeps only expiring seen-markers plus aggregate counts.',
      'The install id lives in a device-local file and is never synced. Profile Sync never carries it.',
    ],
  },
  {
    q: 'Why does a free browser have a subscription?',
    a: [
      'Blanc Patron is $30/year or $4/month, and it is optional. Everything that makes Blanc a browser is free: ad and tracker blocking, encrypted sync, private tabs, tab groups, quiet tabs, passkeys.',
      'On macOS, Patron unlocks three extra Dock colorways. On every platform, it adds the ability to save a window as a named workspace. Creating a named workspace requires an active Patron subscription. Renaming and removing existing workspaces continue to work if it lapses — your own data does not get held hostage.',
      'Patron exists because Blanc has no ad business and no investors, and an independent browser needs some way to pay for itself that is not selling the people using it. Nothing that was free has ever moved behind payment, and nothing will.',
    ],
  },
  {
    q: 'Why no extensions?',
    a: [
      'Deliberate, and not a gap waiting to be filled. The extension runtime caused native crashes, required an unsandboxed chrome window, and imposed a licensing constraint on the project.',
      'The thing most people want extensions for is blocking, and that is built in at the network layer instead — below the extension system, so it is not subject to Manifest V3’s rule caps.',
    ],
  },
  {
    q: 'Who makes Blanc?',
    a: [
      'Bananify, an independent studio. Built independently, with no investors.',
    ],
  },
];
---
<BaseLayout
  title="Straight answers about Blanc"
  description="Honest answers to the hard questions about Blanc: open source, Electron and memory, telemetry, the Patron subscription, and extensions."
  path="/faq"
  page="faq"
  header="solid"
>
  <main class="page">
    <header class="page-head">
      <h1>Straight answers</h1>
      <p class="page-lede">
        The questions worth asking about Blanc, answered plainly — including the
        ones where the honest answer is a trade-off rather than a win.
      </p>
    </header>

    <div class="faq-list">
      {QUESTIONS.map(({ q, a }) => (
        <section class="faq-item">
          <h2>{q}</h2>
          {a.map((paragraph) => <p>{paragraph}</p>)}
        </section>
      ))}
    </div>
  </main>
</BaseLayout>
```

- [x] **Step 4: Add the footer link**

In `site/src/components/Footer.astro`, add to `LINKS` between the `/press` and `/privacy` entries:

```js
  { href: '/faq', label: 'FAQ' },
```

- [x] **Step 5: Add the page styles**

Append to `site/src/styles/site.css`. Reuse existing custom properties rather than hardcoding colours:

```css
/* --- FAQ page ------------------------------------------------------- */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  max-width: 46rem;
}
.faq-item h2 {
  font-size: 1.15rem;
  line-height: 1.35;
  margin: 0 0 0.75rem;
}
.faq-item p {
  margin: 0 0 0.75rem;
}
.faq-item p:last-child {
  margin-bottom: 0;
}
```

- [x] **Step 6: Verify the build now passes**

```bash
npm run site:build
```
Expected: PASS. The manifest and the page now agree.

- [x] **Step 7: Verify the page renders and the claims are accurate**

```bash
npm run site:dev
```

Open `/faq` and read every answer against the source of truth. Specifically confirm the telemetry payload really is those six fields (`src/main/telemetry.js`) and that the Patron prices match the live Polar products. **A factually wrong FAQ linked into a Show HN thread is worse than no FAQ.**

- [x] **Step 8a: Correct the homepage claim**

`site/src/pages/index.astro:258` previously read *"every browser feature is
free, and nothing is locked behind payment."* It was replaced with:

```html
        <p>Yes — Blanc is free, and everything that makes it a browser stays free: ad and tracker blocking, encrypted sync, private tabs, tab groups, quiet tabs, and passkeys. On macOS, Blanc Patron adds three extra Dock colorways; on every platform, it lets you save a window as a named workspace. Creating a named workspace requires an active Patron subscription. Renaming and removing existing workspaces continue to work if it lapses.</p>
```

- [x] **Step 8b: Correct the About page claim**

`site/src/pages/about.astro:41` previously opened *"Every browser feature is free."* Keep
the promise that follows it — *nothing free moves behind payment* — because
that one is still true; named workspaces were never free. Replace the opening
clause:

```html
        <p>Blanc is free, and everything that makes it a browser stays free — blocking, encrypted sync, private tabs, tab groups, quiet tabs, and passkeys. Blanc Patron is an optional subscription — $30 a year or $4 a month — that funds the work and adds three macOS Dock colorways plus named workspaces on every platform. Creating a named workspace requires an active Patron subscription. Renaming and removing existing workspaces continue to work if it lapses. Supporters who bought the earlier one-time purchase keep everything, free, forever.</p>
```

- [x] **Step 8c: Correct the Terms of Service**

**This one is legal text, not marketing.** `site/src/pages/terms.astro:28`
previously stated *"Blanc's features are free, and none of them are locked
behind payment."* That became false when v1.8.0 shipped. It was replaced with:

```html
  <p>Blanc is free to download and use. Everything that makes it a browser — ad and tracker blocking, encrypted sync, private tabs, tab groups, quiet tabs, and passkeys — is free and stays free. Blanc Patron is an optional subscription, billed monthly or yearly, that adds three macOS Dock colorways and lets you save a window as a named workspace on every platform. Creating a named workspace requires an active Patron subscription. Renaming and removing existing workspaces continue to work if it lapses. Nothing that is free today is moved behind Patron.</p>
```

- [x] **Step 8d: Correct the press fact sheet**

`site/src/pages/press.astro:297` previously read `Free; all browser features
included` and described Patron as `cosmetic Dock icons today`. Both were wrong.

```html
          <div><dt>price</dt><dd>Free; all core browsing features included</dd></div>
          <div><dt>optional support</dt><dd>Blanc Patron subscription, US$30/year or $4/month, plus tax; three macOS Dock colorways and named workspaces on every platform</dd></div>
```

- [x] **Step 8e: Prove no "nothing is locked behind payment" claim survives**

```bash
grep -rn "nothing is locked behind payment\|none of them are locked behind payment\|every browser feature is free\|all browser features included" site/src/ ; echo "exit=$?"
```

Expected: **no matches** (`exit=1`). A single survivor is a public contradiction
of the product on launch day.

- [x] **Step 8f: Run the guard tests — AFTER every file is edited**

```bash
npm run test:unit && npm run substrate:check
```
Expected: PASS. These run **last** deliberately: Steps 8a–8e modify four more
site files, so running the guards before them tests a state that never ships.
`site.css` is not under the `tokens/` substrate guard, and the new page uses the
default OG image, so `og-cards.test.js` is unaffected — but run them to confirm
rather than assume.

- [x] **Step 9: Commit**

```bash
git add site/src/pages/faq.astro site/src/pages/sitemap.xml.js \
        site/src/components/Footer.astro site/src/styles/site.css \
        site/src/pages/index.astro site/src/pages/about.astro \
        site/src/pages/terms.astro site/src/pages/press.astro
git commit -m "site: add /faq, and make the Patron claims true

Named Workspaces creation is Patron-gated (chrome:workspaces-save-as
returns not-patron), so four pages saying no feature is locked behind
payment — including the Terms — become false when 1.8.0 ships. Corrected
alongside a new /faq covering source availability, Electron memory,
telemetry, pricing and extensions."
```

- [x] **Step 10: Push, open a PR, and merge — before deploying**

Launch execution depends on this work being *merged*, not merely committed locally.

**`site:deploy` forcibly passes `--branch=main`**, so deploying from a feature
branch produces a deployment labelled `Branch: main` that looks correct while
serving unmerged code. The label cannot be used as evidence of merge.

```bash
git push -u origin site-patron-claims
gh pr create --title "site: add /faq, and make the Patron claims true" --body "..."
```

Merge it, then enter a checkout that is exactly `origin/main`:

```bash
git checkout main && git pull && git fetch origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && echo "OK: HEAD == origin/main" || echo "STOP: not at origin/main"
git status --porcelain    # must be EMPTY
```

- [x] **Step 11: Deploy from the merged checkout**

```bash
npm run site:deploy
```
Confirm `Environment: Production`, `Branch: main`, and that the reported source
SHA equals `git rev-parse HEAD`. Then load https://blancbrowser.com/faq and
confirm it is live.

---

### Task 6: Refresh the README — it becomes the Show HN landing page

**Owner:** `agent`.

**Status: COMPLETE.** Merged in `ba18dc9`; Task 8 subsequently replaced the
static image with the final launch demo before Show HN.

**Why this sits in Phase 0, before launch:** the repository is the Show HN
landing page. v1.9.1 has already shipped, so the release-source ordering concern
is historical; the live requirement now is that this README be correct and
merged before Task 12 posts.

It is also, once Task 12 submits the repository to Show HN, the first thing
thousands of sceptical readers see. Build instructions alone will not do.

- [x] **Step 1: Rewrite the README to carry the story**

Confirm or add, in this order:

- **One-line description** and an image. The initial release-ready README used
  an already-committed screenshot; Task 8 Step 6 has now replaced it with the
  final demo GIF linked to the MP4.
- **Licence status, stated plainly:** Bananify Creative-owned code and
  documentation are MIT-licensed and open source. Preserve the bundled filter
  lists' CC BY-SA 3.0+ obligations and reserved Blanc name/logo trademarks.
- **The Patron boundary:** every core browsing feature is free; Patron adds
  three macOS Dock colorways and named workspaces on every platform; creating a
  workspace needs an active subscription, renaming/removing does not.
- **A link to the memory benchmark** (`bench/memory/`) — the strongest technical
  artifact and the direct answer to the Electron objection.
- **A link to https://blancbrowser.com/faq**.
- **Download links** for macOS, Windows, Linux.

- [x] **Step 2: Commit it (explicit path)**

```bash
git add README.md
git status --short
git commit -m "README: licence status, Patron boundary, benchmark and FAQ links"
```

Merge it into `origin/main` before Task 12 posts.

---

### Task 7: Release v1.8.0, supersede through v1.9.1, and soak

**Owner:** `owner` — the release script requires interactive 1Password/Terminal auth.

**Status: v1.9.1 PUBLISHED; FOLLOW-UP EVIDENCE COMPLETE. Do not rerun any immutable
release command in this task.** v1.8.0 through v1.9.1 are immutable public
releases. The detailed v1.8.x release steps below remain only as the completed
historical record. Step 11 now carries the executable v1.9.1 soak and platform
checks.

**Current launch gate:** Task 4 has passed; Tasks 5 and 6 are already satisfied;
v1.9.1 is public, its 48-hour soak clock has elapsed, and the macOS, Windows,
and Linux follow-up evidence has passed. Task 7 is fully cleared.
Because the release already
happened, Tasks 5 and 6 are launch prerequisites, not release prerequisites.
Verify the live Terms before launch:

A bare `curl -s | grep -c` prints `0` when the request *fails* — an empty body
contains no matches, so an outage or a typo'd URL reads as a pass. This gate must
fail closed: require HTTP success, assert the obsolete sentence is **gone**, and
assert the replacement text is **present**.

```bash
set -o pipefail
TERMS=$(curl -fsS https://blancbrowser.com/terms) || { echo "STOP: /terms did not return 200"; exit 1; }
echo "$TERMS" | grep -q "none of them are locked behind payment" \
  && { echo "STOP: obsolete no-paywall claim is still live"; exit 1; }
echo "$TERMS" | grep -qi "creating a named workspace requires an active Patron subscription" \
  || { echo "STOP: corrected Patron wording is NOT live — Task 5 has not deployed"; exit 1; }
echo "OK: Terms page reflects the Patron gate"
```

Expected: `OK`. Any `STOP` means Task 5 has not reached production — do not launch.

**Why:** v1.9.1 is the **build** the launch runs on, not the
**story** the launch tells. Those were conflated in the first draft of this plan
and it produced a contradiction: Named Workspaces was called the headline, yet the Show HN post
never mentioned it — correctly, because workspace *creation* is Patron-gated and
a paywalled headline is a weak opening on Hacker News.

The resolved position: **the story is the browser** — the Island, network-level
blocking, and the deliberate absence of an extension runtime. Named Workspaces
ships in the build, appears in the release notes, and features in the Product
Hunt listing where a paid tier reads as normal. It is not the Show HN pitch.

The soak exists so the launch rides a build that has survived a weekend, not one
that is hours old.

- [x] **Step 1: Read the release runbook before touching anything**

```bash
cat docs/release-verification.md
```

Also invoke the `releasing-blanc` skill — it carries the required `BLANC_RELEASE_*` env vars that the checked-in runbook omits.

- [x] **Step 2: Bump the version and the lockfile together**

Set `version` to `1.8.0` in `package.json`, then regenerate the lockfile so the
two agree — a release built from a lockfile still pinned to the old version is a
dirty release source:

```bash
npm install --package-lock-only
git diff --stat package.json package-lock.json
```

Consider whether the `electron` devDependency should move with it (Chromium
cannot be swapped out of a running app).

- [x] **Step 3: Write the release notes file**

`release.sh` ships `docs/press/release-notes/v1.8.0.md` **verbatim** via
`--notes-file`. Write it before releasing.

Formatting rules that are not optional, because the site changelog is generated
from the published release body: put **each paragraph on ONE line** (a wrapped
paragraph fragments into separate blocks), use no markdown headings, and let
dates render in America/New_York.

- [x] **Step 4: Pin the press page AND its guard test to the new version**

`site/src/pages/press.astro` carries `const VERSION = '1.7.0';`. Advance it to
`1.8.0`, or the press kit states the old version beside the new release.

`test/unit/press-kit.test.js:54` asserts `packageVersion === '1.7.0'`. **Step 5's
gate runs `test:unit` and will fail** until this is advanced too — the repository
deliberately encodes the pin as a guard test, so it must move in the same commit
as the policy it guards:

```bash
grep -n "1\.7\.0" test/unit/press-kit.test.js   # confirm the pin before editing
```

Advance it to `1.8.0` and stage it in Step 6's release commit.

- [x] **Step 5: Run the real release gate**

Not `test:unit` alone — the repository defines a far broader gate:

```bash
npm run release:verify:press
```

That runs `substrate:check`, `icons:windows:check`, `test:unit`,
`test:acceptance:dry`, `test:acceptance:desktop`, `test:cold-launch`,
`test:oauth:desktop`, `test:dns-smoke`, `release:security` (npm audit) and
`site:build`. Expected: all pass. Do not release on a red gate.

Note the known first-attempt killers: the press-kit version pin (Step 4),
`npm audit` findings, and site dependency issues.

- [x] **Step 6: Commit the release inputs, merge them, and enter a clean checkout**

**`release.sh` will refuse to run otherwise.** It checks that every release
source is clean and that `HEAD == origin/main`:

```
Release sources are dirty. Commit every release input before staging.
HEAD is not origin/main. Push the exact release commit first.
```

`RELEASE_SOURCES` covers `README.md`, `SECURITY.md`, `package.json`,
`package-lock.json`, `.github/workflows`, and the notes file — all of which
Steps 2–4 just modified. Releasing directly from that working tree exits 1.

```bash
git checkout -b release-1-8-0
git add package.json package-lock.json docs/press/release-notes/v1.8.0.md \
        site/src/pages/press.astro test/unit/press-kit.test.js README.md
git status --short          # confirm nothing unexpected is staged
git commit -m "Release Blanc 1.8.0"
git push -u origin release-1-8-0
gh pr create --title "Release Blanc 1.8.0" --body "Version bump, lockfile, release notes, press pin."
```

Merge the PR, then enter a checkout that is exactly `origin/main`:

```bash
git checkout main && git pull
git fetch origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && echo "OK: HEAD == origin/main" || echo "STOP: not at origin/main"
git status --porcelain      # must be EMPTY
```

Both checks must pass before the next step. This is also why Step 5's gate runs
*before* the PR: a red gate should never become a merged commit.

- [x] **Step 7: Release**

Run `npm run release` in a **native Terminal**, foreground and interactive.
Never backgrounded — cosign falls back to a 300s device code and has burned a
release before. Never rerun an immutable release after its tag or draft exists;
an abort after the tag push forces a version bump.

- [x] **Step 8: Complete the post-publication workflow**

`docs/release-verification.md` specifies this exactly; all of it, in order:

```bash
npm run site:changelog     # regenerate site/src/data/releases.json — never hand-edit
```

Then **advance the public and migration baselines in both `CLAUDE.md` and
`AGENTS.md`** to v1.8.0. The two files were resynchronised to v1.7.0 in
`e39fb6b`; keep them in lockstep. Commit `572cd7f` advanced only `CLAUDE.md`,
which is exactly how they drifted apart and why this plan's first review demanded
retired evidence — do not repeat that by updating one.

**Create the branch first** — the previous draft committed on local `main` and
then pushed a branch that had never been created:

```bash
git checkout -b record-blanc-1-8-0
npm run site:changelog     # regenerate releases.json ON the branch
npm run site:build
```

Then commit **explicit paths only** — never `git add -A`, which would sweep in
anything untracked:

```bash
git add site/src/data/releases.json CLAUDE.md AGENTS.md
git status --short          # confirm NOTHING unexpected is staged
git commit -m "Record Blanc 1.8.0 in the public changelog"
git push -u origin record-blanc-1-8-0
gh pr create --title "Record Blanc 1.8.0 in the public changelog" --body "..."
```

Merge it, then deploy from a clean checkout at `origin/main`:

```bash
git checkout main && git pull
npm run site:deploy
```

- [x] **Step 9: Verify the deploy reached production, not a preview**

```bash
npx wrangler pages deployment list --project-name=blancbrowser
```

Confirm the expected source SHA shows `Environment: Production` and
`Branch: main`. Then load the **canonical domain** and confirm both the
changelog and the homepage show 1.11.0 — not a Cloudflare preview URL.

- [x] **Step 10: Record the current v1.9.1 soak clock**

```bash
echo '{"date":"2026-08-26","version":"1.9.1","publishedAt":"2026-08-26T04:29:03Z","soakEndsAt":"2026-08-28T04:29:03Z"}' \
  >> "$LAUNCH_LOG"
```

Recorded once in the private launch log on August 27.

- [x] **Step 11: Soak exit criteria — real upgrade evidence, not elapsed time**

**PASS 2026-08-28.** The exact clock ended at `2026-08-28T04:29:03Z`
(August 28, 12:29:03 a.m. ET), and every platform check below is recorded in
`docs/release-incidents/2026-08-26-v1.9.1.md`.

48 hours passing is necessary but not sufficient. The current public baseline
is **v1.9.1**, with this evidence state:

- [x] the current **v1.9.0 → v1.9.1 updater handoff on macOS**, including Restart Now, installer completion, relaunch, and installed-version confirmation
- [x] the current **v1.9.0 → v1.9.1 updater handoff on Windows**, including Restart Now, installer completion, relaunch, and installed-version confirmation
- [x] the authenticated public **v1.9.1 Linux AppImage download/launch/render**, including installed version confirmation

The macOS check passed on August 27 from a SHA-verified public v1.9.0 arm64
bundle in a disposable location. The old packaged app found and downloaded
v1.9.1, the native dialog's **Restart Now** path was invoked, ShipIt recorded
successful installation and relaunch, and the updated bundle reported v1.9.1
while passing strict signature and Gatekeeper checks. Full evidence is in
`docs/release-incidents/2026-08-26-v1.9.1.md` and the private launch log.

The Windows check passed on August 28 in Parallels Windows 11. A screenshot-
backed v1.8.2 → v1.9.1 run first proved the public downloaded-update prompt,
**Restart Now**, relaunch, and rendered v1.9.1 marker. Because v1.9.0 changed the
packaged Electron runtime, the owner then repeated the same in-app flow from
public v1.9.0 and confirmed that it updated to v1.9.1 without issues. The exact
adjacent-version result is recorded in the private launch log.

The Linux check passed on August 27 in
<https://github.com/bnfy/blanc/actions/runs/33122902409>. The Ubuntu job
downloaded the public v1.9.1 AppImage and manifest, verified its digest and
GitHub attestation, launched it under Xvfb, observed Blanc's chrome, overlay,
and new-tab targets, and read `v1.9.1` from the rendered new-tab DOM.

The publication gate proved signed native artifacts, immutable updater metadata,
authenticated checksums, and logged-out downloads. The follow-up macOS and
Windows updater handoffs plus the Linux public-AppImage check now add direct
runtime evidence. The full record is
`docs/release-incidents/2026-08-26-v1.9.1.md`.

A Windows updater check must *begin inside the old packaged Blanc*: it discovers
the staged `latest.yml`, downloads the matching installer, and the user invokes
**Restart Now**. A directly launched NSIS installer is **not** an updater-handoff
test and does not satisfy this.

If any upgrade check fails, the launch week moves.

**Launch Monday must fall after the selected launch release's `soakEndsAt`.** If a regression surfaces during the soak, the launch week moves — it does not proceed on a known-bad build.

---

## Phase 1 — Assets (v1.10.0 set complete; refresh after backlog cleanup if needed)

### Task 8: Cut the 20-second Island demo

**Owner:** `agent` — app-only capture from the real packaged application.

**Status: COMPLETE 2026-08-30 for the current public v1.10.0 baseline;
conditionally stale for launch after backlog cleanup.** Re-recorded
from the installed packaged public v1.10.0 macOS app in an isolated local
profile with three seeded tabs. The 20.50-second export is 1228×768, 30 fps
H.264, and BT.709. It contains the full resting Island, `⌘L` expansion, typed
`git` Quick Switcher filter, tab-dot switch, live 13-item blocker count and
popover on The Verge, and final resting hold. The MP4 is 464,982 bytes and the
GIF is 322,600 bytes. Asset commit: `0cc0c57`.

**Why:** One asset, reused across every channel. The outreach plan already calls for it, and Product Hunt in particular under-performs badly without video.

- [x] **Step 1: Set up a clean capture environment**

Use the packaged public **v1.10.0** app with an isolated local profile and
seeded public tabs so the window shows real sites rather than an empty profile.
Use three or four tabs in one active context so the eight-dot cap does not
distract from the interaction. Do not record a development build or any
behavior added to `main` after the v1.10.0 tag.
Relaunch the dev instance afterwards if you touched it.

- [x] **Step 2: Record the beat sheet, in this order**

1. Resting island over a real page (2s)
2. `⌘L` — island morphs open into the command palette (4s)
3. Type a few characters — Quick Switcher filters live (4s)
4. Switch tabs via a tab dot (3s)
5. Blocked-count chip on an ad-heavy site (4s)
6. Rest again (3s)

Total ~20s. No narration, no captions burned in — it gets reposted in contexts with sound off and with different copy around it.

- [x] **Step 3: Convert colour space**

Run the checked-in exporter. It inspects the source metadata, converts a
non-BT.709 input rather than merely relabelling it, emits a 30 fps H.264 MP4,
and fails if the final capture is not 18–24 seconds:

```bash
scripts/export-launch-demo.sh
```

The direct app-window frames carried the machine's `Color LCD` ICC profile.
They were converted through ColorSync to the system ITU-709 profile before the
source MOV was encoded; `ffprobe` then reported complete BT.709 space,
transfer, and primaries metadata before the checked-in exporter ran. A future
Screen Recording may instead be Display P3; the exporter handles a fully tagged
input but fails closed if the metadata is missing.

- [x] **Step 4: Export both forms**

- MP4 (Reddit and the source upload for Product Hunt's required YouTube URL)
- GIF under 8MB (Hacker News comments, inline embeds)

The exporter tries progressively smaller GIF presets and refuses to report
success unless `island-demo.gif` is below 8 MiB. Do not hand-wave a larger
file as “close enough.”

- [x] **Step 5: Store it**

```bash
mkdir -p docs/superpowers/plans/assets
# place island-demo.mp4 and island-demo.gif here
ls -la docs/superpowers/plans/assets/
```

Do **not** commit large binaries to the repo if they exceed a few MB — store
them where the launch posts can reach them and record the location in
`"$LAUNCH_LOG"` (never a file inside the repository).

- [x] **Step 6: Swap the GIF into the README, before Show HN**

Task 6 shipped the README with an already-committed screenshot because the demo
did not exist yet. Now that it does, replace it — the README is the Show HN
landing page and a moving demo outperforms a still.

```bash
git add README.md
git status --short
git commit -m "README: use the Island demo"
```

This lands after v1.10.0, which is fine: `README.md` is a release source for the
*next* release, not this one. It must be merged before Task 12 posts.

---

### Task 9: Verify the newsletter capture path

**Owner:** `agent` for the test; `owner` if the Resend key needs rotating.

**Status: PASSED 2026-08-23.** The production footer accepted a previously
unsubscribed address, delivered the double-opt-in email, and returned the
production Worker's `Subscription confirmed` page after the link was opened.
The address is deliberately omitted from repository and launch-log evidence.

**Why:** The spec names newsletter capture as one of two zero-cost retention
actions. A traffic spike with no working capture converts a one-day event into
nothing durable — the visitors leave and there is no way to reach them again.
The double opt-in flow has been live since 2026-08-13, but "was working a week
ago" is not evidence it works today, and the failure mode is silent.

**Files:**
- Verify only: `site/src/components/NewsletterForm.astro`, `cloudflare/newsletter-worker/`

- [x] **Step 1: Confirm the form renders on the pages that will receive traffic**

```bash
npm run site:dev
```

The footer is one unified component on every page, so the form should appear on
`/`, `/download` and `/faq`. It is deliberately absent from the legal pages.
Confirm it is present on the landing page the `?ref=` URLs point at.

- [x] **Step 2: Subscribe with a FRESH email alias**

Use a `+alias` address never used before. **An address that is already
subscribed returns a silent no-op**, which looks identical to success and will
convince you a broken form works.

The new confirmation message received at 00:28 ET proves this request was not
the already-subscribed silent no-op.

- [x] **Step 3: Confirm the confirmation email actually arrives**

Double opt-in means an unconfirmed signup captures nobody. Check the inbox,
click through, and confirm the subscription completes.

- [x] **Step 4: Check the quarantine state, not just the success path**

The honeypot **quarantines** rather than rejecting. A quarantined address never
receives a confirmation message. For a successful confirmation,
`handleConfirm()` awaits the confirmed-record write and quarantine deletion
before it can return the exact `Subscription confirmed` page captured in this
test (`cloudflare/newsletter-worker/src/index.js`). That production response is
therefore address-scoped proof of both states.

Do not use the broad `/subscribers` admin export for this smoke test: it returns
every subscriber's address and unsubscribe URL when this gate needs evidence
about only the test address. Reserve that export for an authorized operational
export or manual quarantine review.

- [x] **Step 5: If testing via curl, send an allowlisted Origin (not applicable — production form used)**

`/subscribe` requires an allowlisted `Origin` header; a bare curl is rejected in
a way that looks like a server fault:

The production endpoint is the one the site form posts to
(`site/src/components/NewsletterForm.astro`):

```bash
curl -sS -X POST https://blanc-newsletter.bnfy-441.workers.dev/subscribe \
  -H 'Origin: https://blancbrowser.com' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test+launchcheck@example.com"}'
```

Without the allowlisted `Origin` header the request is rejected in a way that
resembles a server fault.

- [x] **Step 6: Record the result**

```bash
echo '{"date":"YYYY-MM-DD","newsletterVerified":true,"confirmedDelivery":true,"quarantined":false,"testAddressRecorded":false}' \
  >> "$LAUNCH_LOG"
```

If any step fails, fix it **before** launch week. This is cheap to fix now and
impossible to fix retroactively.

---

### Task 10: Write the channel copy pack

**Owner:** `agent-drafts / owner-publishes`.

**Status: COMMITTED AND FACT-CHECKED 2026-08-23; RE-AUDITED 2026-08-27.** The canonical
artifact is `docs/superpowers/plans/assets/launch-copy.md`. Current official
channel guidance required two corrections to the original draft below:

- HN's moderator-linked presentation guidance now explicitly asks makers not
  to publish LLM-generated or LLM-edited text. The artifact therefore contains
  an owner-written Show HN worksheet and verified fact cards, not paste-ready HN
  prose. The old verbatim HN draft below is retained only as historical plan
  context and **must not be posted or used to edit the owner's wording**.
- Product Hunt's current form limits the description to 260 characters and
  accepts gallery video through a full YouTube URL. The artifact contains a
  verified 244-character description and the correct asset instructions.
- The final demo's immutable MP4 and GIF URLs are pinned in the artifact. The
  re-audit also removed a Windows-draft claim that the current public updater
  handoff was already tested; that v1.9.0 → v1.9.1 evidence remains open.

**Files:**
- Create: `docs/superpowers/plans/assets/launch-copy.md`

**Interfaces:**
- Consumes: the tagged URLs from Task 2, `/faq` from Task 5, the demo from Task 8.
- Produces: the exact text posted in Tasks 11–14.

**Why:** Copy written under time pressure on launch morning is worse copy. Everything gets drafted while the freeze is on.

- [x] **Step 1: Prepare the owner-written Show HN worksheet and verified facts**

**RETIRED DRAFT — DO NOT POST OR USE FOR LLM EDITING.** The text below predates
HN's current moderator guidance. Use the owner-written worksheet in
`launch-copy.md`; Anthony writes every public HN word himself.

**Title** (HN truncates past ~80 chars; this fits):

```
Show HN: Blanc – a minimal desktop browser with one floating control surface
```

**Body:**

```
I've spent the last year building Blanc, a desktop browser that replaces the
tab strip and toolbar with a single floating pill I call the Island. It's on
macOS, Windows and Linux, and it's free.

Two decisions drove most of the design.

The first is that ad and tracker blocking happens at the network layer, in the
browser itself, rather than in an extension. That was originally a reaction to
Manifest V3's rule caps, but it turned out to matter more than I expected:
blocking that isn't an extension can't be limited by the extension API, and it
works on the first paint of the first page.

The second is that there is no extension runtime at all. I had one, and removed
it. It caused native crashes, it required running the browser chrome
unsandboxed, and it imposed a licensing constraint on the project. Removing it
is the single most controversial thing about Blanc and I don't expect everyone
to agree with it.

It's Electron, which I know is the first objection. The assumption that comes
with it is memory, so I built a benchmark harness to actually measure it rather
than argue about it. It sums phys_footprint across each browser's entire
process tree — summing RSS counts the engine framework once per renderer, which
systematically penalises whichever engine isolates more per site. Blanc came in
under Chrome, and still did with its blocker switched off. Brave is the fair
comparison there, since it also blocks by default. Method and raw runs are in
the repo.

The code and documentation are open source under MIT. The bundled EasyList and
EasyPrivacy snapshots keep their CC BY-SA obligations, and the Blanc name and
logo remain reserved trademarks. There's no mobile version yet, and no
extension support, and there won't be.

On money: there's a $4/month or $30/year optional Patron subscription that funds it.
Everything described above is free. Being specific rather than vague about it,
since this release adds named workspaces: saving a window as a named workspace
requires Patron. Renaming and deleting workspaces you already have keeps working
if a subscription lapses — that's your data, not mine.

Happy to answer anything, including the hostile version of the questions above.

The source, and the builds, are here: https://github.com/bnfy/blanc
Site and downloads: https://blancbrowser.com
```

**Submit the GitHub repository as the Show HN URL, not the marketing homepage.**
HN's Show HN rules state *"Don't post landing pages or fundraisers"* and ask you
to *"make it easy for users to try your thing out."* `blancbrowser.com` is a
marketing landing page and risks the post being penalised or reclassified.

The repository is the better target on every axis: it is public, it contains the
application source, its README documents `npm install && npm start`, and the
releases are linked from it. It also defuses the closed-source objection before
it is raised — the source is right there in the thing you submitted.

Attribution comes from GitHub's own referrer data:

```bash
gh api repos/bnfy/blanc/traffic/popular/referrers
```

Do not post a title with "revolutionary", "beautiful", or an em-dash-heavy
tagline. HN rewards a plain description of what the thing is.

- [x] **Step 2: Prepare verified objection fact cards and non-HN replies**

**RETIRED FOR HN.** Do not paste or LLM-edit the prose below into Hacker News.
The artifact carries fact cards for Anthony's own HN answers and separate
paste-ready replies for Reddit and Product Hunt.

**On Electron:**

```
Fair, and it's the objection I'd lead with too. The memory assumption is the
testable part, so I tested it: phys_footprint summed across the whole process
tree, not summed RSS (which double-counts the framework per renderer and
penalises whichever engine isolates more). Blanc came in under Chrome, and
still did with blocking off — so the gap isn't only the blocker. Brave is the
honest peer since it also blocks by default. Method and the raw runs are in the
repo if you want to pull it apart: https://blancbrowser.com/faq
```

**On source and published binaries:**

```
The application code and documentation are open source under the MIT License.
The repo you're looking at has the whole application in it; you can read what
the blocker does and what the launch ping sends, modify or redistribute the
MIT-covered material, and build the checked-out source with npm install && npm
start. Publishing a build also carries the bundled filter lists' CC BY-SA 3.0+
obligations, while the Blanc name and logo remain reserved trademarks. A local
build shows what that source does; it does not prove that a published binary
matches it byte for byte.

On top of that, published macOS releases are signed and notarized, and published
Windows releases carry a timestamped Authenticode signature verified against an
expected publisher at release time. The checksum manifest is Sigstore-signed
under a verified OIDC identity, while Windows and Linux CI artifacts carry
GitHub provenance attestations. Those records authenticate the published
artifacts; they do not make a local build reproducible.
```

**On telemetry:**

```
One launch ping, packaged builds only, and you can turn it off. It's six
fields: a random install id, a session id, version, platform, arch, and OS
version coarsened to a major. No URLs, no page data, no history, and it isn't
joined to anything else. On a fresh profile the choice is shown during setup
and has to be saved before anything is sent — it isn't a default you find out
about later. The server HMACs the install id before storing it. Details:
https://blancbrowser.com/faq
```

**On the subscription:**

```
$30/year or $4/month, entirely optional. Everything that makes it a browser is
free — blocking, encrypted sync, private tabs, tab groups, quiet tabs,
passkeys. On macOS, Patron unlocks three extra Dock colorways; on every platform,
it adds saving a window as a named workspace. Creating a named workspace requires
an active Patron subscription. Renaming and deleting existing workspaces continue
to work if it lapses, because that's your data, not mine. There's no ad business
and no investors here, so this is the
alternative to monetising the people using it. Nothing that was free moved
behind payment to create it.
```

**On no extensions:**

```
Deliberate, not a roadmap gap. I shipped an extension runtime and then removed
it: native crashes, it forced the browser chrome to run unsandboxed, and it
brought a licensing constraint with it. The main thing people want extensions
for is blocking, and that's built in at the network layer instead — which is
also why Manifest V3's rule caps don't apply to it. If you need a specific
extension, Blanc is genuinely not for you and I'd rather say so up front.
```

- [x] **Step 2a: Write channel-specific Reddit drafts**

One post, retargeted per eligible community. **Never cross-post identical
text.** The drafts are candidates, not a posting list: r/windows is on hold
unless the owner's account already has promotion permission and the green-check
flair; r/macapps and r/linux each have account-history gates documented in the
copy pack. Do not manufacture eligibility.

**Base title** (rewrite to the live community's format; r/macapps requires the
`[OS]` prefix if eligible):

```
I built Blanc, a desktop browser that replaces the tab strip with one floating pill
```

**Body:**

```
I've been building Blanc for about a year. It's a desktop browser for macOS,
Windows and Linux where the tab strip and toolbar are replaced by a single
floating pill — back/forward, the current group's tabs as dots, the domain, and
the blocked-request count, all in one surface that expands into a command
palette when you hit Cmd/Ctrl+L.

Ad and tracker blocking runs at the network layer inside the browser rather than
as an extension, so it isn't subject to Manifest V3's rule caps and it's active
on the first paint of the first page.

There's no extension runtime at all, which is the most divisive decision in it.
I had one and pulled it: native crashes, it forced the browser chrome to run
unsandboxed, and it brought a licensing constraint with it.

Being upfront about the rest: it's Electron; the application code and
documentation are open source under the MIT License, with the bundled filter
lists retaining their own CC BY-SA 3.0+ terms and the Blanc name/logo reserved
as trademarks; there's no mobile version; and there's a $30/year or $4/month
optional Patron subscription. Every core browsing feature is free — Patron
adds three macOS Dock colorways and named workspaces on every
platform, and creating a named workspace is the one action that needs an active
subscription.

https://blancbrowser.com

Happy to answer anything, including the sceptical version.
```

Check each community's self-promotion rules before posting. Some require a flair,
some ban links in the body, some require you to be an established participant.

- [x] **Step 2b: Write the Product Hunt listing to current field limits**

**Tagline** (60 char limit):

```
A minimal desktop browser with built-in ad blocking
```

**Description (RETIRED — exceeds Product Hunt's current 260-character limit):**

```
Blanc replaces the tab strip and toolbar with a single floating pill — the
Island. Back/forward, your tabs, the domain, and a live blocked-request count
live in one surface that expands into a command palette on Cmd/Ctrl+L.

Ad and tracker blocking runs at the network layer inside the browser, not as an
extension, so Manifest V3's rule caps don't apply to it.

New in this release: named workspaces — save a window's whole set of tabs and
groups and bring it back later.

Free on macOS, Windows and Linux. Blanc Patron ($30/yr or $4/mo) is optional;
it adds three macOS Dock colorways and named workspaces on every platform. Every
core browsing feature is free.
```

The current 244-character description and complete maker comment are in
`launch-copy.md`.

Lead the listing with the demo from Task 8, uploaded through a full YouTube URL
that is public or unlisted. Product Hunt does not accept a raw MP4 as gallery
video.

- [x] **Step 2c: Write the AlternativeTo listing**

Submitted in Task 1. **Clean URL, no tag.**

```
Blanc is a minimal desktop browser for macOS, Windows and Linux. It replaces
the traditional tab strip and toolbar with a single floating control surface
called the Island, which expands into a command palette and quick switcher.

Ad and tracker blocking is built into the browser at the network layer rather
than provided by an extension, so it is not limited by Manifest V3's rule caps.
There is no extension runtime. Other features include tab groups, named
workspaces, quiet background tabs that release memory, private tabs, end-to-end
encrypted sync, and Touch ID passkeys on macOS.

Blanc is free. The source is publicly available on GitHub but is not released
under an open-source licence. An optional Patron subscription ($30/year or
$4/month) adds three macOS Dock colorways and named workspaces on every platform.
```

**Alternative to:** Chrome, Arc, Brave, Vivaldi, Opera, Zen.

- [x] **Step 2d: Write the BetaList submission**

```
Name: Blanc
Tagline: A minimal desktop browser with built-in ad blocking
URL: https://blancbrowser.com/?ref=betalist

Description:
Blanc is a desktop browser that replaces the tab strip and toolbar with one
floating pill. Ad and tracker blocking runs at the network layer inside the
browser instead of as an extension, so it isn't limited by Manifest V3. Free on
macOS, Windows and Linux, with no account required to use it.
```

- [x] **Step 3: Fact-check every claim in the pack**

Cross-check version numbers, prices, platform support and the memory figures against the repo. The memory numbers must match `MemoryChart.astro` and `docs/press/fact-sheet.md` exactly — they are pinned together by `test/unit/public-truth.test.js`.

- [x] **Step 4: Commit**

Committed to `main` in `837f4c7` (`docs: record launch readiness and copy
pack`).

```bash
git add docs/superpowers/plans/assets/launch-copy.md
git commit -m "docs: launch copy pack for the growth counter-offensive"
```

---

## Phase 1.5 — backlog cleanup and pre-launch release train

The owner moved Show HN to Tuesday, September 8 so selected product work can be
resolved before the launch freeze. This is a quality window, not a permission
shortcut or a requirement to merge every open PR.

- [ ] **Step 1: Select the backlog that actually belongs in the launch release**

Review #192–#197 / PR #238, #205, and the held dependency PRs against their
current issue bodies, merge gates, security boundaries, and platform impact.
Close work the owner no longer wants. For platform-sensitive changes, obtain
the owner's explicit affected-machine confirmation before merging. Do not
convert the scheduling decision into implicit approval for any individual PR.

- [ ] **Step 2: End product merges by Thursday, September 3 at noon ET**

After the selected backlog is merged, product/runtime, dependencies, package
metadata, packaging, release workflows, and feature specs stop moving. If the
selected work is not merge-ready by the cutoff, leave it open and move on; do
not consume the release-verification buffer trying to make the count zero.

- [ ] **Step 3: Publish and prove each immutable pre-launch release, ending with
      the launch release by Friday, September 4 at 3:00 p.m. ET**

For every post-v1.10.0 version, follow the complete release operator protocol.
The macOS, Windows, and Linux artifacts, updater metadata, authenticated
manifest/Sigstore material, platform signatures/fuses/payloads, logged-out
downloads, and dated release incident must pass. Test the updater handoff from
the immediately preceding public version to that exact new version on macOS
and Windows; a direct installer launch, or a jump over an intermediate public
version, is not that handoff. Do not overwrite assets or reuse a released
version. Each release requires the owner's explicit release approval and
cannot be delegated by this plan.

An intermediate release does not need to complete a separate 48-hour launch
soak if it is intentionally superseded by the next approved release, but its
publication and platform evidence still must be truthful and complete. Any
known regression stops the train. The final selected launch release starts the
only soak that can clear Task 11, and any subsequent release restarts it.

Missing the Friday cutoff moves all four launch days again.

- [ ] **Step 4: Refresh every release-bound launch artifact**

Regenerate the README release boundary, launch copy pack, packaged Island demo,
Product Hunt stills, download-baseline tag, FAQ facts, and release evidence for
the selected public release. An old v1.10.0 asset may remain only when its exact
behavior and visible version are still truthful for the selected release.

- [ ] **Step 5: Record the new freeze state after the release and refreshed
      assets are on `origin/main`**

Set `LAUNCH_RELEASE_TAG` to the immutable public tag, then run:

```bash
git fetch origin --tags
LAUNCH_FREEZE_ANCHOR="$(git rev-parse origin/main)"
LAUNCH_RELEASE_SHA="$(git rev-list -n 1 "$LAUNCH_RELEASE_TAG")"
test -n "$LAUNCH_RELEASE_SHA"
export LAUNCH_FREEZE_ANCHOR LAUNCH_RELEASE_SHA LAUNCH_RELEASE_TAG
python3 - <<'FREEZE'
import datetime, json, os, pathlib

anchor = os.environ['LAUNCH_FREEZE_ANCHOR']
release_sha = os.environ['LAUNCH_RELEASE_SHA']
release_tag = os.environ['LAUNCH_RELEASE_TAG']
row = {
    'date': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
    'event': 'launch-freeze-start',
    'launchDate': '2026-09-08',
    'anchor': anchor,
    'releaseTag': release_tag,
    'releaseSha': release_sha,
}
with pathlib.Path(os.environ['LAUNCH_LOG']).open('a') as launch_log:
    launch_log.write(json.dumps(row, separators=(',', ':')) + '\n')
print(json.dumps(row, indent=2))
FREEZE
```

The recorded `anchor` is the only valid merge-freeze baseline. From this row
through the live Show HN submission, only launch evidence, launch copy, and
their regression guards may merge.

- [ ] **Step 6: Complete and record a fresh ≥48-hour soak before Task 11**

The release must remain public and stable throughout the soak. Any replacement
release restarts the clock. Do not shorten this gate to recover calendar time.

---

## Phase 2 — Launch week (feature freeze in effect)

The owner moved the official launch one week later on August 30. The fixed
launch calendar is now:

| Date | Task |
|---|---|
| Monday, September 7, 2026, after 3:00 p.m. ET | Task 11 — post-soak baseline, then evergreen listings |
| Tuesday, September 8, 2026, early US Eastern | Task 12 — Show HN |
| Wednesday, September 9, 2026 | Task 13 — eligible Reddit communities |
| Thursday, September 10, 2026 | Task 14 — Product Hunt; select this date in **Schedule Launch** |

If any dependency slips, move that task and every downstream task. Do not
compress two launch channels into one day or select a different Product Hunt
date merely to preserve the weekday labels.

### Task 11: Monday, September 7 — baseline, then evergreen listings

**Owner:** `owner` — posting under an account.

**Depends on: Tasks 1–10 and Phase 1.5, all of them.** Not a subset. An executor working
task-by-task must not be able to legally start launch week with measurement
dark, the Ads account unverified, the checkout unproven, or the release
unshipped.

- [ ] **Step 0: Verify every Phase 0, Phase 1, and Phase 1.5 gate has actually passed**

Do not proceed until each of these is true. Check, do not assume:

```bash
cat "$LAUNCH_LOG"
```

- [x] Task 1 — AlternativeTo approved; canonical listing recorded
- [x] Task 2 — GA4 confirmed live via a **Realtime** self-test
- [x] Task 3 — Google Ads verification complete, campaign serving
- [x] Task 4 — production Patron purchase **PASS**
- [x] Task 5 — `/faq` live **and** the four contradicting pages corrected and deployed
- [x] Task 6 — README refreshed and merged (it is the Show HN landing page)
- [x] Task 7 — v1.10.0 published; publication workflow complete
- [x] Task 7 — v1.9.1 → v1.10.0 macOS updater handoff and strict
  post-update trust checks passed
- [x] Task 7 — v1.9.1 → v1.10.0 Windows updater handoff passed
- [x] Task 7 — authenticated public v1.10.0 Linux AppImage launch/render passed
- [x] Task 8 — packaged-v1.10.0 demo exported and README assets replaced
- [x] Task 9 — newsletter capture verified with a fresh address
- [x] Task 10 — copy pack committed
- [ ] Phase 1.5 — selected backlog resolved; unselected work remains open or is
  explicitly closed, not rushed into the release
- [ ] Phase 1.5 — immutable launch release published by the Friday cutoff and
  all required macOS/Windows/Linux, updater, manifest, and download gates passed
- [ ] Phase 1.5 — README, copy pack, demo/stills, FAQ facts, and baseline tag
  refreshed for that exact launch release
- [ ] Phase 1.5 — `launch-freeze-start` row records the final `origin/main`
  anchor, release tag, and release SHA
- [ ] Phase 1.5 — fresh ≥48-hour soak elapsed and recorded for the selected
  launch release

- [ ] **Step 0a: Verify the soak has actually elapsed**

```bash
python3 -c "
import datetime, json, os, pathlib
rows = [json.loads(l) for l in pathlib.Path(os.environ['LAUNCH_LOG']).read_text().splitlines() if l.strip()]
freeze = [r for r in rows if r.get('event') == 'launch-freeze-start'][-1]
soak = [r for r in rows if r.get('releaseTag') == freeze.get('releaseTag') and r.get('soakEndsAt')][-1]
ends = datetime.datetime.fromisoformat(soak['soakEndsAt'].replace('Z','+00:00'))
now  = datetime.datetime.now(datetime.timezone.utc)
print('releaseTag:', freeze['releaseTag'], '| soakEndsAt:', ends, '| now:', now)
print('CLEARED' if now >= ends else 'NOT CLEARED — DO NOT LAUNCH')
"
```

Expected: `CLEARED`. If not, the launch week moves. Elapsed time alone is not
enough — Task 7 Step 11's upgrade evidence must also be recorded.

- [ ] **Step 0b: Verify the repository landing page is still inside the merge freeze**

```bash
git fetch origin --tags
python3 - <<'FREEZE'
import json, os, pathlib, re, subprocess

rows = [json.loads(line) for line in pathlib.Path(os.environ['LAUNCH_LOG']).read_text().splitlines() if line.strip()]
freeze = [row for row in rows if row.get('event') == 'launch-freeze-start'][-1]
anchor = freeze.get('anchor', '')
release_tag = freeze.get('releaseTag', '')
release_sha = freeze.get('releaseSha', '')
if not re.fullmatch(r'[0-9a-f]{40}', anchor) or not re.fullmatch(r'[0-9a-f]{40}', release_sha):
    raise SystemExit('STOP: invalid launch-freeze SHA record')
if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?', release_tag):
    raise SystemExit('STOP: invalid launch release tag')
resolved = subprocess.check_output(['git', 'rev-list', '-n', '1', release_tag], text=True).strip()
if resolved != release_sha:
    raise SystemExit('STOP: recorded release tag no longer resolves to recorded SHA')
print('launch release:', release_tag, release_sha)
print('freeze anchor :', anchor)
subprocess.run(['git', 'diff', '--name-only', f'{anchor}..origin/main'], check=True)
FREEZE
gh pr list --repo bnfy/blanc --state open --limit 100 \
  --json number,title,headRefName,isDraft,url
```

Review the diff; do not reduce this to a count. Changes after the anchor may be
launch evidence, launch copy, or their tests. If application/runtime code,
dependencies, package metadata, packaging, release workflows, or unrelated
feature specs reached `origin/main`, stop: the GitHub landing page and frozen
release story have diverged. Do not merge a late product or dependency PR merely
because its checks are green.

- [ ] **Step 1: Take the pre-launch baseline BEFORE anything is posted**

This must be the first action of launch week. A snapshot taken after the
listings go out is not a pre-launch baseline, and it silently absorbs the first
hours of lift into the "before" number.

Capture the **recorded launch release only**, not the lifetime sum across every release. Preserve
the full public-safe snapshot beside the private launch log so later reads use
the same asset scope and can report per-platform deltas. Refuse to overwrite an
existing baseline: a second capture after a listing goes live is not a valid
replacement for the pre-launch floor.

```bash
LAUNCH_RELEASE_TAG="$(python3 -c "import json,os,pathlib; rows=[json.loads(line) for line in pathlib.Path(os.environ['LAUNCH_LOG']).read_text().splitlines() if line.strip()]; print([row for row in rows if row.get('event') == 'launch-freeze-start'][-1]['releaseTag'])")"
case "$LAUNCH_RELEASE_TAG" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "STOP: invalid launch release tag"; exit 1;; esac
BASELINE_FILE="$(dirname "$LAUNCH_LOG")/download-baseline-${LAUNCH_RELEASE_TAG#v}-launch-week.json"
test ! -e "$BASELINE_FILE" || { echo "STOP: launch baseline already exists at $BASELINE_FILE"; exit 1; }
node marketing/social/capture-download-baseline.mjs "$LAUNCH_RELEASE_TAG" > "$BASELINE_FILE"
export BASELINE_FILE LAUNCH_RELEASE_TAG
python3 - <<'BASELINE'
import datetime, json, os, pathlib
from zoneinfo import ZoneInfo

snapshot_path = pathlib.Path(os.environ['BASELINE_FILE'])
snapshot = json.loads(snapshot_path.read_text())
if snapshot.get('release', {}).get('tag') != os.environ['LAUNCH_RELEASE_TAG']:
    raise SystemExit('STOP: snapshot is not for the recorded launch release')

captured = datetime.datetime.fromisoformat(snapshot['capturedAt'].replace('Z', '+00:00'))
eastern = captured.astimezone(ZoneInfo('America/New_York'))
row = {
    'date': eastern.date().isoformat(),
    'measuredAt': eastern.strftime('%H:%M:%S ET'),
    'event': 'launch-week-baseline',
    'releaseTag': os.environ['LAUNCH_RELEASE_TAG'],
    'packageAssetRequests': snapshot['totals']['packageAssetRequests'],
    'packageAssetRequestsByPlatform': snapshot['packageAssetRequestsByPlatform'],
    'postedAnythingYet': False,
}
with pathlib.Path(os.environ['LAUNCH_LOG']).open('a') as launch_log:
    launch_log.write(json.dumps(row, separators=(',', ':')) + '\n')
print(json.dumps(row, indent=2))
BASELINE
```

The baseline measures package-asset **requests**, not people or attributed
conversions. The macOS ZIP can be fetched by the updater, and QA, retries,
updater handoffs, and non-launch traffic are included. Task 12 and Task 15 may
report only the aggregate request delta from this snapshot.

- [ ] **Step 2: Confirm the AlternativeTo listing and correct its pre-MIT copy**

The availability half passed August 27 in a signed-out browser at
`https://alternativeto.net/software/blanc/`: the page rendered the Blanc
listing, six alternatives, and the `Sign In` control. **After Step 1 captures
the pre-launch baseline**, the owner edits the description to the current MIT
wording in Task 10, saves it, and rechecks the public signed-out listing until
the MIT source-status sentence is visible. Do not edit the listing before the
baseline. AlternativeTo presents a Cloudflare challenge to automated clients,
so a `403` from `curl` is not evidence that the approved listing is unavailable.

- [ ] **Step 3: Submit to BetaList**

Use `https://blancbrowser.com/?ref=betalist` and the Task 10 copy. BetaList's
current first-party [support page](https://betalist.com/support) says **all
submissions are paid** and there is no free option; its live authenticated form
shows the current plans, prices, and review/featuring timelines. After Steps 1
and 2, the owner reviews those live choices and explicitly decides whether to
purchase one. An agent must not choose or buy a plan. If the owner declines,
record `not-submitted-paid-only` and do not count BetaList as a fired channel.

- [ ] **Step 4: Record both statuses**

```bash
echo '{"date":"YYYY-MM-DD","alternativeTo":"live|pending","betaList":"submitted|not-submitted-paid-only"}' \
  >> "$LAUNCH_LOG"
```

A silent rejection is a channel you believe you fired and did not.

---

### Task 12: Tuesday, September 8 — Show HN

**Owner:** `owner` — must post and engage personally. **An agent must not post to Hacker News.**

**Depends on:** Task 11.

**Why here:** Highest ceiling and highest hostility. Fired first because its criticism is free market research that improves Thursday's Product Hunt copy.

- [ ] **Step 0: Confirm the personal account is currently eligible**

HN is temporarily restricting Show HN submissions from accounts that are not
yet familiar with the community. Check `https://news.ycombinator.com/showlim`
from the owner's existing personal account before launch morning. Do not create
a launch-only account or manufacture activity to clear the restriction.

- [ ] **Step 0a: Re-run the repository merge-freeze check immediately before submission**

Repeat Task 11 Step 0b after the listings work and before opening the HN submit
form. A clean result means every post-anchor change is launch-only. Any
unreleased product/runtime or dependency merge stops the submission until the
release/copy boundary is reconciled.

- [ ] **Step 1: Post early morning US Eastern on Tuesday, September 8**

**Submit the URL only. HN does not accept a URL and body text together.**

Its FAQ is explicit: *"You can't. This is to prevent people from submitting a
link with their comments in a privileged position at the top of the page."* The
prescribed pattern is *"just submit the link, then add a regular comment."*

So:

1. **Title:** Anthony writes it himself; it begins `Show HN` and describes the
   whole browser rather than announcing the incremental launch release.
2. **URL:** `https://github.com/bnfy/blanc` — the repository, not the marketing
   homepage (HN's landing-page rule).
3. **Leave the text field empty.** Submit.
4. **Immediately** post Anthony's personally written context as the **first
   comment** on the submission. Do not use agent-generated or agent-edited
   wording: HN's current moderator-linked presentation guidance explicitly asks
   makers to write their text by hand.

> **Say the Patron gate out loud, unprompted.** Named Workspaces is not the
> Show HN pitch — the browser is (see Task 7) — but it ships in this build, it
> is in the release notes, and **creating one requires an active Patron**
> (`chrome:workspaces-save-as` returns `not-patron`). Launching a paywalled
> gated feature without naming it is the fastest way to lose a thread — HN
> will find it in minutes and the framing becomes "he buried the paywall."
> Stating it plainly in your own first comment costs nothing and removes the
> gotcha entirely. Renaming and deleting existing workspaces still work on a
> lapsed subscription; say that too, because it is the part that shows the
> gating is not hostile.

- [ ] **Step 2: Stay available the entire day**

This is the actual work. Answer every technical criticism, including hostile ones. Non-defensive, specific, and quick — HN rewards a founder who engages honestly and punishes one who disappears or argues.

- [ ] **Step 3: Answer from the verified fact cards, link `/faq`**

Answer the question actually asked in Anthony's own words. Use Task 10's fact
cards to keep numbers and boundaries accurate, but do not paste or LLM-edit a
prepared response into HN. Link `/faq` when the detailed evidence is useful.

- [ ] **Step 4: Capture every objection actually raised**

```bash
echo '{"date":"YYYY-MM-DD","channel":"show-hn","objections":["..."],"peakRank":N,"comments":N,"upvotes":N}' \
  >> "$LAUNCH_LOG"
```

**This list is an input to Tasks 13 and 14.** The whole point of the ordering is that Wednesday and Thursday get to answer what real readers actually said.

- [ ] **Step 5: Read the traffic**

```bash
gh api repos/bnfy/blanc/traffic/popular/referrers   # HN should appear here
gh api repos/bnfy/blanc/traffic/views --jq '.count, .uniques'
```

Also compare the same recorded launch-release asset scope against Monday's full Step 1
snapshot:

```bash
LAUNCH_RELEASE_TAG="$(python3 -c "import json,os,pathlib; rows=[json.loads(line) for line in pathlib.Path(os.environ['LAUNCH_LOG']).read_text().splitlines() if line.strip()]; print([row for row in rows if row.get('event') == 'launch-freeze-start'][-1]['releaseTag'])")"
BASELINE_FILE="$(dirname "$LAUNCH_LOG")/download-baseline-${LAUNCH_RELEASE_TAG#v}-launch-week.json"
node marketing/social/capture-download-baseline.mjs "$LAUNCH_RELEASE_TAG" "$BASELINE_FILE"
```

Per Task 2 Step 5, `packageAssetRequestDelta` is **aggregate** request lift —
it cannot attribute downloads to HN specifically or identify unique people,
and the retrospective must not claim otherwise.

---

### Task 13: Wednesday, September 9 — Reddit

**Owner:** `owner` — posting under a personal identity.

**Depends on:** Task 12, including its objection list.

- [ ] **Step 0: Account for the pre-existing third-party r/browsers thread**

A third-party user—not the owner—posted
[“Has anyone heard of Blanc Browser?”](https://www.reddit.com/r/browsers/comments/1vj0og9/has_anyone_heard_of_blanc_browser/)
on 2026-08-08 after seeing an Instagram ad. This is public pre-launch objection
evidence, not a founder launch and not attributable launch traffic. Carry its
AI/vibe-coding, repository-trust, and Arc-replacement questions into the rewrite.
On posting day, assess whether another Blanc thread would be welcome so soon
after the existing discussion; skip r/browsers if the live rules or context are
ambiguous. Do not revive the old thread or treat it as the Wednesday post.

- [ ] **Step 1: Revise the Reddit copy (Task 10) using Tuesday's objections**

Pre-empt in the post body whatever HN hit hardest. If telemetry dominated Tuesday, address it in the post rather than waiting to be asked.

- [ ] **Step 2: Resolve eligibility, then post only where the live rules permit**

Use Task 10's current eligibility matrix and re-open every linked rule page on
posting day. Founder-authored, with screenshots, founder disclosure, and a
candid limitations section. Use the clean `https://blancbrowser.com` URL, not a
`?ref=reddit` variant. **Do not paste identical text across subreddits** — it
reads as spam and gets removed.

- **r/browsers:** candidate after the same-day rule check.
- **r/macapps:** main feed only if the personal account already has 10 local
  karma, “Read the Rules” approval, is outside the 30-day cooldown, and meets
  the current trust/transparency path. Use `[OS]`, the live pricing flair, and
  Problem/Comparison/Pricing format. Otherwise use the current App Pile
  megathread only if permitted, or skip.
- **r/windows:** skip unless the personal account already has moderator
  permission and the green-check flair. The current rules say new applicants
  are not being accepted; do not request or manufacture an exception.
- **r/linux:** post only if the account already meets the no-more-than-10%
  own-content ratio. Make the required genuine reply to a related story, use a
  direct source, and stay to engage. If the existing ratio fails, skip.

- [ ] **Step 3: Engage in comments the same day**

- [ ] **Step 4: Record results**

```bash
echo '{"date":"YYYY-MM-DD","channel":"reddit","preExistingMentions":["r/browsers:1vj0og9 (third party; not launch-attributable)"],"posted":["..."],"skipped":[{"subreddit":"...","reason":"rule, eligibility, or recent-duplicate gate"}],"removed":[],"objections":["..."]}' \
  >> "$LAUNCH_LOG"
```

---

### Task 14: Thursday, September 10 — Product Hunt

**Owner:** `owner` — posting and engaging.

**Depends on:** Tasks 12 and 13.

**Why last:** The copy has now been tested against two days of live argument. A PH badge is permanent — spend it on a message proven to work.

- [ ] **Step 0: Confirm the owner's personal account can post — do this before Thursday**

Product Hunt requires a personal account; company accounts cannot post. Its
current [posting-access guide](https://help.producthunt.com/en/articles/481909-how-can-i-get-access-to-post)
says a newly created personal account normally waits one week before posting,
while subscribing to the newsletter can grant immediate access. The owner must
open the live submission flow and confirm it reaches the product form. An agent
must not create the account, subscribe, or claim access from account age alone.

- [ ] **Step 1: Revise the listing using both days' objections**

- [ ] **Step 2: Upload the demo video and verified stills early enough to preview**

Product Hunt's gallery accepts video through a full YouTube URL, not a raw MP4.
Upload Task 8's final export as public or unlisted (never private). Its current
[YouTube troubleshooting guide](https://help.producthunt.com/en/articles/11869741-youtube-link-troubleshooting)
warns that a newly uploaded video may need about **12 hours** before Product
Hunt can integrate it, so do not leave the upload for launch night. Paste the
full URL into the draft and verify the rendered preview. Upload the prepared
240×240 thumbnail and both 1270×760 packaged-v1.10.0 stills from
`docs/superpowers/plans/assets/product-hunt/`; those two images satisfy the
gallery's two-image floor. A Named Workspaces still is optional and must be
omitted unless it is a release-backed capture labeled as a Patron feature.

- [ ] **Step 3: Schedule the Thursday, September 10 launch**

Use **Schedule Launch**, not a manual launch-night action. Product Hunt's
current [scheduling guide](https://help.producthunt.com/en/articles/2724119-how-to-schedule-a-post)
allows selecting a date within 30 days, and its
[posting guide](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
says the site operates in 24-hour **PST** periods and scheduled posts go live at
**12:01 a.m. PST** on the selected day. Select **September 10, 2026** in the live
form. Before scheduling, verify that exact displayed date, the full YouTube
preview, both stills, the thumbnail, the pricing tag, and the final
objection-informed copy. If Tasks 12 or 13 slipped, move Product Hunt too; do not
schedule the old date with stale objection handling.

- [ ] **Step 4: Engage all day**

- [ ] **Step 5: Record results**

```bash
echo '{"date":"YYYY-MM-DD","channel":"product-hunt","rank":N,"upvotes":N,"comments":N}' \
  >> "$LAUNCH_LOG"
```

---

### Task 15: Measure, and set the real checkpoint

**Owner:** `agent` for the analysis; `owner` for the judgement call at the end.

**Depends on:** Tasks 11–14.

**Why:** The spec's success criteria are falsifiable only if someone actually checks them.

- [ ] **Step 1: Let the daily digest run undisturbed through launch week**

It already appends `downloads-history.jsonl` and `retention-history.jsonl` daily. Do not hand-edit either series.

- [ ] **Step 2: Two weeks after launch week, compute the sustained clean-day mean**

The previous version of this step printed rows and left the arithmetic to the
reader, which is how a "sustained rate" becomes whatever the reader wants it to
be. Compute it, over an explicit window, from `valid:true` rows only:

```bash
python3 - <<'CALC'
import json, pathlib, statistics
HIST = pathlib.Path.home() / '.claude/scheduled-tasks/blanc-daily-analytics/downloads-history.jsonl'
WINDOW_START = '2026-09-14'   # first Monday AFTER launch week ends; set explicitly
WINDOW_END   = '2026-09-27'   # 14 inclusive calendar days

rows = []
for line in HIST.read_text().splitlines():
    line = line.strip()
    if not line or not line.startswith('{'):
        continue
    r = json.loads(line)
    if r.get('valid') is True and r.get('delta') is not None \
       and WINDOW_START <= r.get('date','') <= WINDOW_END:
        rows.append(r)

if not rows:
    print('NO valid:true rows in window — cannot conclude. Do not estimate.')
else:
    deltas = [r['delta'] for r in rows]
    mean = statistics.mean(deltas)
    print(f'window      : {WINDOW_START}..{WINDOW_END}')
    print(f'valid days  : {len(deltas)}  {deltas}')
    print(f'post mean   : {mean:.2f}/day')
    print(f'baseline    : 11.25/day  (pre-launch: +16, +6, +18, +5)')
    print(f'change      : {mean - 11.25:+.2f}/day  ({(mean/11.25 - 1) * 100:+.1f}%)')
    if len(deltas) < 5:
        print('VERDICT     : INCONCLUSIVE — only '
              f'{len(deltas)} valid day(s); too few to call a trend.')
        print('              Report the mean as provisional, not as a result.')
    else:
        print('VERDICT     :', 'SUSTAINED' if mean > 11.25 else 'NOT SUSTAINED')
CALC
```

Only `valid:true` rows count; release-day deltas are contaminated by
auto-update pulls. If the window contains fewer than five valid days, say so
rather than reporting a mean that rests on two numbers.

- [ ] **Step 3: On Oct 1, read the September cohort**

Success criteria from the spec:
- September cohort **≥ 3× July's 27** (i.e. ≥ 81)
- Clean-day downloads sustained **above 11.25/day** two weeks post-launch
- The Oct 1 retention read is statistically meaningful for the first time

- [ ] **Step 4: Write the retrospective**

Create `docs/superpowers/plans/assets/launch-retrospective.md`.

Record **only what the instrumentation can actually support** (Task 2, Step 5):

**Per channel — measurable:**
- Landings (GA4 landing-page report, or GitHub referrers for HN). A consent-gated **floor**, not a full count.
- Engagement native to the channel: HN rank/comments, PH rank/upvotes, Reddit score, whether a post was removed.
- Objections raised, verbatim.

**Aggregate only — NOT per channel:**
- Recorded launch-release package-asset-request lift vs the Monday Step 1 baseline.
- Newsletter signups during the week.

**Do not write a per-channel download number.** Nothing in the site persists
`?ref` through to the download click, so any such figure would be invented. If
that attribution is genuinely wanted for a future launch, it is a
privacy-reviewed product change, not a spreadsheet exercise.

Then judge each channel on landings + engagement, and note whether it is worth
firing again. Channels are one-shot for the *first* launch only — a second Show
HN for a genuinely new version is legitimate, and this document is what tells
you whether it is worth it.

- [ ] **Step 5: Decide whether retention is now a real question**

If the September cohort cleared 81, retention becomes measurable and earns its own spec. If it did not, the constraint is still distribution — and the honest conclusion is that the answer is another acquisition cycle, not a retention experiment.

---

## Dependency summary

Tasks are ordered so every remaining dependency runs **forward**. Task 7's
v1.10.0 release command is an immutable historical completion. Phase 1.5 now
establishes the actual launch release, refreshed assets, dynamic freeze anchor,
and soak evidence. Task 11 checks that replacement state before taking the
baseline.

```
PHASE 0 — prep, in this order
  Task 1  AlternativeTo + $5 priority review      (~1–2 business days to clear)
  Task 2  Measurement restored (GA4 Realtime)
  Task 3  Google Ads verification                 COMPLETE (2026-08-27)
  Task 4  Production Patron purchase              PASS (2026-08-23)
            ▼
  Task 5  Site: /faq + fix 4 false Patron claims, DEPLOYED to production
  Task 6  README refreshed and merged             (the HN landing page)

RELEASE PUBLISHED — platform evidence complete; soak pending
  Task 7  v1.10.0 published Aug 29 14:58 ET
          v1.9.1 → v1.10.0 macOS updater handoff + trust checks PASS
          v1.10.0 Linux public AppImage launch/render PASS
          v1.9.1 → v1.10.0 Windows updater handoff PASS
          48h soak PENDING — ends Aug 31 14:58 ET

PHASE 1 — initial assets
  Task 8  Packaged-v1.10.0 demo exported; refresh if launch release changes
  Task 9  Newsletter capture verified
  Task 10 Copy pack committed

PHASE 1.5 — backlog cleanup + release reset
  Resolve selected backlog by Thu Sep 3 noon ET
  Publish/prove each immutable release; final launch release by Fri Sep 4 15:00 ET
  Refresh release-bound assets and record the new freeze anchor
  Complete a fresh ≥48h soak

PHASE 2 — launch week
  Task 11 Mon Sep 7  baseline FIRST, then listings
               (requires Tasks 1–10 + complete Phase 1.5 release/freeze/soak evidence)
     ▼
  Task 12 Tue Sep 8  Show HN  (URL only; body as first comment)
     ▼
  Task 13 Wed Sep 9  Reddit   (revised with Tuesday's objections)
     ▼
  Task 14 Thu Sep 10 Product Hunt (revised with both days')
     ▼
  Task 15      Measure + Oct 1 checkpoint
```

**Why Tasks 5 and 6 precede launch.** Task 5's corrections are live because the
current product gates workspace creation and the public Terms must say so. Task
6 makes the repository—the Show HN target—a candid, complete landing page. Both
requirements are currently satisfied in `ba18dc9`; neither is a release
prerequisite because v1.10.0 is already public.

**Hard stops:**

- **Task 4 fails** → the whole plan stops until the checkout works. With Named Workspaces confirmed Patron-gated, a broken checkout means that feature is unreachable *and* the best traffic day converts nothing.
- **Task 5 not deployed to production** → do not launch. **Currently satisfied** by production deployment `ba18dc9`; keep verifying the live Terms page, not the diff.
- **Task 6 not merged** → do not launch. **Currently satisfied** in `ba18dc9`;
  Task 8's current packaged-v1.10.0 demo replacement is also complete in
  `0cc0c57`.
- **Selected launch release soak or evidence not cleared** — either <48h elapsed
  or current platform evidence missing → the launch week moves unless the owner
  explicitly waives the remaining evidence after the risk is stated and records
  that waiver in the release incident. The v1.10.0 record remains historical;
  if cleanup changes downloadable behavior, only the replacement release's
  evidence and soak count.
- **Task 3 Google approval regresses or shows a new required action** → do not
  start Task 11. **Currently satisfied:** verification is in `Completed tasks`
  and the campaign is serving; recheck before the Monday baseline.
- **Task 8 demo incomplete or stale for the selected release** → do not start
  Task 11. The current 20.50-second MP4 and sub-8-MiB GIF were captured from
  packaged public v1.10.0 and committed in `0cc0c57`; keep them as historical
  inputs during the release train and recapture them from the final selected
  launch release before Task 11.
- **Unreleased feature work reaches `main` after the new freeze anchor** → stop and re-audit
  the README, demo, copy pack, and public binary/repository boundary before
  posting any channel. **Pending:** Phase 1.5 must record the replacement anchor,
  release tag/SHA, refreshed copy/assets, and soak evidence before this becomes
  satisfied.
- **Task 1 approved but listing not visible logged out on Monday, September 7**
  → that channel does not fire. This is *not* a reason to move the launch week.

**Licence decision:** resolved in Global Constraints. Use MIT/open-source
wording with the bundled-filter-list and Blanc trademark carve-outs; never use
the superseded `UNLICENSED` or no-redistribution language in current copy.
