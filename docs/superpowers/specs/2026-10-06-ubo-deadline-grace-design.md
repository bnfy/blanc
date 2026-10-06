# Don't count Blanc's own freezes against uBO's decision deadline

**Date:** 2026-10-06
**Status:** approved 2026-10-06 (revision 2, after review) — not implemented
**Amends:** the decision-deadline behavior in `src/main/ublock-provider.js`
(`ask()`), recorded as "Blocking decisions have a two-second deadline" in
`docs/ublock-origin-implementation-2026-10-02.md`. The deadline values and
fail-closed behavior are unchanged; only main-process freeze time stops
counting.

## Why

Each critical uBO request decision (`onBeforeRequest`, `onBeforeSendHeaders`,
`onHeadersReceived`) has a deadline: 2 s, or 10 s for the first 15 s after uBO
becomes ready (`decisionDeadline()`, `ublock-provider.js:278`). When the timer
fires before uBO's answer has been processed, the provider fails with
`ubo-decision-timeout` (`:289–292`). Since #596 that starts automatic recovery:
a 1–4 s pause, then the profile works again.

The timer runs on Blanc's main process, and so does the code that processes
uBO's answer. If main freezes across the moment the deadline is due, both wait
behind the freeze. When main unfreezes, the expired timer can run before the
answer that is already queued, and a uBO that answered in about 1 ms is treated
as hung.

Evidence from the 2026-10-06 investigation:

- **Positive control.** A diagnostic busy-wait right after a decision was
  sent, with the 2 s deadline in force, failed the provider 2/2 times at
  2.5 s; at 1.5 s it did not (2/2). uBO had nothing else to do.
- **Real freezes.** Hosted runners logged main-process freezes of up to
  1.94 s (Intel Mac) and 2.57 s (Windows). Sources found so far: the Dock icon
  reload (fixed in #592), a test-only synchronous install (fixed in #593),
  app startup, and synchronous `JsonStore` saves with `fsync`
  (`src/main/store.js:125`, 0.9–1.4 s on Windows; not yet fixed).

Recovery limits the damage, but each false timeout still cancels the request
in flight, pauses the profile for a restart, and uses one of the three
automatic restarts allowed per 10 minutes.

## Decisions

Taken with the owner on 2026-10-06:

1. **Only uBO's own time counts.** Time Blanc's main process spends frozen no
   longer counts against the deadline. A genuinely slow or hung uBO still fails
   closed at about 2 s, as today.
2. **Late-timer grace.** Rejected alternatives: a 10 Hz monitor that adds up
   all frozen time (it catches no additional real case, because any false
   timeout already shows up as a late timer, and it runs all the time), and
   bridge-side timing (it trusts timing data from the extension side of the
   bridge and changes the protocol).
3. **The base deadlines stay** at 2 s and 10 s.

## Why a late timer is the whole signal

A false timeout needs uBO's answer to be queued while the timer is due. Both
are processed on main. If main was free when the timer was due, the timer runs
on time and any answer that arrived earlier was already processed, so the
timeout is real. Only a freeze spanning the due moment produces a false
timeout, and that freeze makes the timer callback run late by roughly the
freeze's remaining length. So the lateness of the timer callback is the
evidence needed. Nothing has to watch the main process in between.

What lateness does **not** prove is that uBO answered before the original
deadline. It proves only that main delayed the timeout callback. If main is
frozen from 1.9 to 2.5 s and uBO answers at 2.4 s, grace accepts an answer that
was genuinely late. Under a coincident main-process freeze, then, the effective
decision deadline can extend by one or more grace periods. This is accepted as
a bounded mitigation: a permanently hung uBO still fails closed, and the
request stays held, never sent undecided, the whole time.

## Design

All changes are inside `ask()` in `src/main/ublock-provider.js`, for critical
decisions only. Non-critical operations keep their 10 s
`ubo-operation-timeout` unchanged.

**Constants** (in `src/main/ublock-recovery.js`, beside the other deadline
policy):

- `LATE_TIMER_MS = 100`. A timer callback this much after its due time means
  main was frozen when it was due. Hosted Windows timer resolution is about
  16 ms, so 100 ms stays well clear of ordinary jitter.
- `GRACE_MS = 250`. One grace period: long enough for the queued answers
  ahead of a re-armed timer to be processed.
- `MAX_GRACE_COUNT = 8`, so at most 2 s of grace in total per decision.

**Behavior.** Each critical decision records when its timer is due
(`performance.now() + deadline`). When the timer callback runs:

1. If the decision has already settled, do nothing (unchanged).
2. If the callback ran less than `LATE_TIMER_MS` after its due time, main was
   free. Fail with `ubo-decision-timeout` exactly as today.
3. Otherwise main was frozen. If fewer than `MAX_GRACE_COUNT` grace periods
   have been granted, re-arm the timer for `GRACE_MS` (storing the new handle
   on the pending item so the decision handler's `clearTimeout(item.timer)`
   still works) and record the new due time. Each re-armed timer goes through
   the same check, so grace continues only while main keeps freezing.
4. When the cap is reached, fail as today.

**Worst case.** If uBO is truly hung and main is free, the failure comes at
exactly the deadline, the same as today. If uBO is hung and main also froze,
it comes after the deadline, the freeze and at most 2 s of scheduled grace.
The 2 s cap is scheduled grace time, not wall-clock time: further
main-process freezes during grace stretch each grace period, so wall-clock
time to failure can exceed deadline + freeze + 2 s by those freezes.

**Fail closed.** During grace the request is still held in Chromium's
`webRequest` callback. Nothing is sent undecided, and a failure after grace
cancels it exactly as today, then follows the existing recovery path.

**Status counters.** The provider reports `decisionGrace: { granted, saved }`
in `status()`, for this launch:

- `granted` — the number of individual grace periods scheduled (one decision
  can receive up to `MAX_GRACE_COUNT`);
- `saved` — the number of decisions that settled successfully (uBO's answer
  processed, no failure) after receiving at least one grace period.

These are live provider status counters, not diagnostics. `blocking-providers.js`
spreads provider status into `blockingStatus()`, so the test hook can read
them. They are not copied into the bounded `diagnostics` entries, and Settings
does not display them. Counts only, no URLs.

## Invariants

1. A decision whose timer fires on time fails exactly as today.
2. No request is sent without a decision; grace only delays a cancellation.
3. Scheduled grace per decision is bounded: at most
   `MAX_GRACE_COUNT × GRACE_MS` (2 s). Main-process freezes during grace can
   stretch wall-clock time beyond that.
4. Non-critical operations and the CSS-helper deadline are unchanged.

## Testing

**Unit** (the vm-lifted `ask()` fixture in
`test/unit/ublock-operation-deadline.test.js`, extended with a fake
`performance.now`):

- the timer fires on time → `ubo-decision-timeout`, no grace (the existing
  "two-second fail-closed boundary" test still passes unchanged);
- boundary: a callback 99 ms late fails at once; one 100 ms late gets grace;
- the timer fires 2 s late and the answer arrives during grace → resolves, no
  failure, `granted` 1 and `saved` 1;
- the timer fires late, and every re-check also fires late, with no answer →
  fails after exactly 8 grace periods, `granted` 8 and `saved` 0;
- the timer fires late once, then the re-check fires on time with no answer →
  fails at that re-check;
- non-critical operations: unchanged 10 s `ubo-operation-timeout`.

**Desktop controls, on every platform** (`test/desktop/ublock-origin.mjs`):
whether a re-armed timer runs after IPC answers queued during a freeze
depends on Electron/Chromium scheduling, which can differ by platform. Both
controls therefore live in the uBO suite, which the `Full uBlock Origin
candidate` workflow runs on all four desktop jobs (`macos-15`,
`macos-15-intel`, `windows-latest`, `ubuntu-latest`). Both must pass on all
four before merge.

- **Freeze-and-answer:** a `BLANC_TEST`-only hook freezes the main process
  for 2.5 s right after the next critical decision is sent, the same
  injection that failed the provider 2/2 times in the investigation. The
  provider must stay `ready`, the page must load, and `decisionGrace.saved`
  must rise by at least 1.
- **Hung uBO, main free:** the existing "decision deadline" stage must still
  fail at the deadline and recover automatically, with no grace granted for
  that decision.

## Out of scope

- The `JsonStore` freezes themselves (item 1 of the investigation). This
  design stops them from failing uBO; fixing them is separate.
- The startup deadline (45 s), the warm-up values, and automatic recovery.

## Open points for review

1. Values confirmed in review: `LATE_TIMER_MS = 100`, `GRACE_MS = 250`,
   `MAX_GRACE_COUNT = 8` (2 s of scheduled grace).
2. Whether the Electron task ordering assumption holds on every platform:
   that a re-armed 250 ms timer runs after IPC answers queued during the
   freeze. The freeze-and-answer control on all four workflow jobs proves or
   disproves it before merge.
