# Growth counter-offensive — firing the five channels Blanc never fired

> **Superseded (2026-08-30) — licensing only.** The licence decisions recorded
> in this document are historical. Blanc adopted the MIT License on 2026-08-30,
> reversing the 2026-08-20 decision to remain `UNLICENSED`. The original text
> below is preserved unchanged as a record of what was decided at the time; it
> is no longer an accurate statement of Blanc's licensing. For current terms see
> `LICENSE`, `THIRD-PARTY-NOTICES.md`, and `ASSET-LICENSE.md`.

**Date:** 2026-08-20
**Status:** Approved 2026-08-20 (brainstorming). Ready for implementation planning.
**Related:** [Press outreach plan](../../press-outreach-plan.md) (research July 11, 2026),
[Blanc Patron](2026-08-18-blanc-patron-design.md)

## Context

The daily analytics digest for 2026-08-20 recorded the third consecutive flat
retention reading and the smallest clean-day download delta yet measured. The
owner asked for a plan to counteract "this flatline of existing users and new
user growth." This spec is the result of brainstorming that request.

### What the numbers actually say

Measured 2026-08-20 09:10 ET, from the `blanc-ping` Worker and the GitHub
releases API:

| Signal | Value |
|---|---|
| Cumulative installer downloads | **766** (macOS 464 · Windows 206 · Linux 96) |
| Clean-day download deltas (no release in window) | +16 (Aug 11), +6 (Aug 12), +18 (Aug 13), +5 (Aug 20) |
| Total launches | 239 (darwin 136 · win32 94 · linux 9) |
| Monthly actives | July **29** → August **43** |
| Weekly actives | W32 **21** · W33 **21** · W34 **10** (partial) |
| July→August cohort retention | **5 of 27 = 18.5%**, flat across Aug 18/19/20 |
| GitHub stars / forks | 4 / 0 |
| Open issues | 7 — **all seven are pull requests**; zero real bug reports |
| Releases shipped | **76 total** since 2026-07-03 — **ten in the last seven days**, twenty since Aug 4 |

### Three findings that shaped the design

**1. The obvious retention fix is already shipped.** Blanc has a six-step
first-run onboarding (`default browser → import → island → ad blocking →
privacy → theme`), a working "Set as default" (`src/main/pages.js:298`), and
browser bookmark import (`src/main/pages.js:136`). The two classic
browser-churn killers — the user never makes it the default, and the user
cannot bring their bookmarks — are both closed. There is no cheap product fix
waiting to be found here.

**2. The retention number cannot carry a decision.** The July cohort is 27
people and 5 returned. "18.5%, flat for three days" describes *five humans*.
One additional returner moves the figure 3.7 points. No retention experiment
run at this sample size produces a trustworthy answer, and optimising the
number directly is measuring noise. Retention is not independently fixable
until the cohort is bigger.

**3. Product velocity is not the constraint; distribution is.** Seventy-six
releases since July 3 — twenty of them since Aug 4, and ten in the last seven
days alone — against ~11 downloads per clean day. Meanwhile the discovery channels named in the July 11
outreach plan — **Show HN, Product Hunt, AlternativeTo, BetaList, and founder
Reddit posts — have never been fired.** Every one of Blanc's 766 downloads was
built from Google Ads, a press wave that drew zero replies from 16 contacts,
and organic trickle. The single highest-leverage channel set in the plan sat
untouched while feature work absorbed all available effort.

### The reframe

> Stop optimising a five-person retention number. Fire the five unfired
> channels in one concentrated week — with measurement restored first and the
> payment path proven first — so that the next cohort is large enough for
> retention to become a real question.

## Decisions locked during brainstorming

1. **One focused launch week with a feature freeze.** Not a multi-week drip.
   Show HN in particular requires the owner present all day to answer hostile
   technical comments.
2. **Ship as-is; prepare honest answers rather than pre-launch concessions.**
   Considered and declined: flipping telemetry to opt-in, open-sourcing a
   component, and soft-pedalling Patron during launch week.
3. **Release v1.8.0 (Named Workspaces) first, as the launch headline** — after
   clearing the production Patron purchase gate, and with a soak period before
   launch day.
4. **Sequence the launch week cheap → expensive**, so neither one-shot channel
   is spent on untested copy.
5. **No retention experiments this cycle.** The real checkpoint is the
   September cohort, read on October 1.

### On shipping as-is

Three objections are predictable and will surface within the first hour of a
Show HN thread.

**Electron.** The "it's just a Chromium wrapper with extra memory" dismissal.
Blanc has an unusually strong counter: the `bench/memory/` harness, whose
design rule is that checks fail rather than warn, and whose published figures
are pinned by a `public-truth` test. It shows Blanc beating Chrome **even with
the blocker turned off**. This is a weapon, not a wound — but the two
qualifications must travel with it as they always do: Brave is the fair peer
(it also blocks by default), and the gap is not only blocking.

**Closed source.** The outreach plan already anticipates telling Linux outlets
that Blanc is proprietary freeware. HN will ask, repeatedly, and the answer
does not change. Prepare it; do not improvise it.

**Opt-out telemetry.** The sharpest of the three, and the one most likely to
hijack a thread, because a privacy-positioned browser that pings home by
default is a fair hit. The honest answer is stronger than the framing suggests
and must be written down before launch rather than composed under pressure:
the payload is six fields (`installId`, `sessionId`, `version`, `platform`,
`arch`, `osVersion`) with OS version coarsened to a major; the Worker HMACs
the install id before storage; `installId` is never synced or joined to other
Blanc data; pings fire from packaged builds only; and **a fresh profile must
save the presented privacy choice before any ping is sent**. That is informed
consent at first run, not a silent beacon.

### On the release ordering

Named Workspaces merged in `8a3dcf5` (PR #177) but carries an unmet release
gate: a **production** Patron purchase in a packaged build has never been run.
Sandbox purchase→activate→create was proven on 2026-08-20; production was not.

A successful launch week points the largest traffic spike in Blanc's history at
a payment path that has never processed a real transaction. Clearing that gate
is therefore not release hygiene — it is a precondition for the launch being
worth running at all.

## Design

### Phase 0 — Prep

Ordered by external clock, not by convenience.

1. **Submit AlternativeTo immediately.** Its current FAQ requires email
   verification, not account age. The real lead time is editorial review: paid
   priority review is normally 1–2 business days and can take longer when busy.
2. **Verify Product Hunt posting access immediately.** Product Hunt requires a
   personal account. Its current first-party guidance says a new account
   normally waits one week before it can post, while subscribing to the
   newsletter can grant immediate access. Do not discover this gate on Thursday.
3. **Restore measurement.** GA4 has been unreadable for several days — the
   Claude in Chrome extension reports zero connected browsers — so site→download
   conversion is currently invisible. Reconnect it, and *independently* tag every
   channel URL with `?ref=` so per-channel attribution survives even if GA4 stays
   flaky. Launching the biggest traffic event in Blanc's history without
   measurement wastes it twice: no read on which channel worked, and no baseline
   for the next attempt.
4. **Complete Google Ads advertiser verification.** Due **2026-09-02**; delivery
   stops if it lapses. It must be finished before launch week, not during it.
5. **Run one real production Patron purchase** on a packaged build. Clears the
   Named Workspaces gate and proves the checkout before traffic arrives.
6. **Release v1.8.0** with Named Workspaces, then **soak at least 48 hours**
   before launch day, so the launch rides a build that has survived a weekend
   rather than one that is hours old.

### Phase 1 — Assets, built during the freeze

- **A 20-second Island demo** (rest → ⌘L → tab switch → blocked count), already
  called for by the outreach plan. One asset, reused across every channel.
- **A public objections page on the site**, covering Electron, closed source,
  telemetry, and Patron pricing. The point is that it is *linkable* in a comment
  thread rather than retyped under pressure at hour three of a Show HN.
- **The memory benchmark as the hero technical artifact.** Rigorous method with
  stated limits is the currency HN trades in, and it is the direct answer to the
  Electron objection.

### Phase 2 — Launch week, sequenced evergreen → argumentative → showcase

| Day | Channel | Rationale |
|---|---|---|
| Mon | AlternativeTo + BetaList listings | Permanent long-tail groundwork. AlternativeTo is already approved; BetaList now requires a paid owner-selected plan. |
| Tue AM ET | **Show HN** | Highest ceiling and highest hostility. Fired first because its criticism is free market research. |
| Wed | Reddit founder posts | Rewritten using the objections HN actually raised, in communities whose rules permit self-promotion. |
| Thu 00:01 PT | **Product Hunt** | Copy now battle-tested by two days of live argument. |

**External-policy correction, 2026-08-30:** BetaList's current first-party
[support page](https://betalist.com/support) says every submission is paid and
there is no free option. Current plans, prices, and timelines appear at the end
of its authenticated submission form. The original zero-risk/free assumption
is retired; Task 11 treats BetaList as an explicit owner budget decision.

The ordering is the central design decision. Show HN and Product Hunt are both
effectively one-shot cards. Firing them on the same untested narrative risks
spending both on copy that does not work. Firing HN first converts its
hostility into an input: by Thursday, the Product Hunt listing answers
objections that real readers actually raised, and the permanent PH badge is
spent on a message that has been proven.

### Retention — treated honestly

No retention experiments this cycle. At n=27 the instrument cannot resolve the
effect.

Two zero-cost actions that compound instead, both riding infrastructure that
already exists:

- **Capture newsletter signups during the spike.** The double opt-in Resend
  flow has been live and end-to-end verified since 2026-08-13. A traffic spike
  with no capture mechanism converts a one-day event into nothing durable.
- **Use the existing changelog feature overlay** as the re-engagement surface
  for the release after v1.8.0.

The real retention checkpoint is the **September cohort, read on October 1**,
when n should finally be large enough for the number to mean something.

## Success criteria

Falsifiable, and checked against the existing `downloads-history.jsonl` and
`retention-history.jsonl` series:

- **September cohort ≥ 3× July's 27.**
- **Clean-day downloads sustained above the current ~11/day average two weeks
  after launch week** — the baseline is 11.25/day, the mean of the four
  `valid:true` rows measured so far (+16, +6, +18, +5). Measured on
  `valid:true` rows only, since auto-update pulls contaminate release-day
  deltas.
- **The October 1 retention read is statistically meaningful for the first
  time.**

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| v1.8.0 regression during the traffic spike | ≥48h soak; launch on a build that has survived a weekend |
| Show HN lands badly | Evergreen listings fire Monday and do not depend on HN; the objections page absorbs the predictable hits |
| Production checkout fails under real traffic | Phase 0 item 4 proves it before launch, not during |
| Google Ads delivery stops mid-launch | Verification completed before launch week (deadline 2026-09-02) |
| Launch happens but is unmeasured | GA4 reconnected *and* `?ref=` tagging as an independent fallback |
| AlternativeTo unavailable at launch | Account created at the very start of Phase 0 to clear the 7-day age requirement |

## Proposed calendar

- **Aug 20–28** — Phase 0 and Phase 1. Ads verification complete before Sep 2.
- **Aug 31 – Sep 3** — launch week, feature freeze in effect.
- **Oct 1** — retention checkpoint on the September cohort.

## Out of scope

- Telemetry changes of any kind (considered, declined).
- Open-sourcing any component (considered, declined).
- Retention A/B experiments (statistically unsupportable at current n).
- A second press wave. The July 11 outreach plan's press targets drew zero
  replies from 16 contacts on Aug 2; re-running it is not this cycle's work.
