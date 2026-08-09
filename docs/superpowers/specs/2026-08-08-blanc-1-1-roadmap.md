# Blanc 1.1 roadmap — multi-window and local profiles

**Date:** 2026-08-08
**Status:** Funded. M1 shipped. **M2 and M3 deferred to a release after 1.1.0**
(maintainer's call, 2026-08-08) — see "What 1.1.0 actually is" below.

Blanc 1.1 re-implements the multi-window and local-profile architecture against
current `main`, using `codex/post-1.0-development` strictly as a **reference
implementation** — never as a merge or cherry-pick source. The 2026-08-08 audit
established why: the branch's true base is the deleted 1Password credential-picker
spike, only 2 of 19 probed commits applied cleanly onto main (both docs-only), and
main has since landed features *inside* the functions the branch rewrote. See
PR #54's closing comment for the full record.

## What 1.1.0 actually is

Not this roadmap. 1.1.0 ships **M1 plus the island work**, and nothing else:

- **M1 — window-runtime foundation.** Merged and released in 1.0.10 as a
  behaviour-invisible change, exactly as planned below, so it has had real
  soak time before anything builds on it.
- **The island UI refresh** — the ten Design System checklist items (#92) and
  the four revisions that followed review (#93).
- **Island motion** — the resting pill reacting to the cursor approaching, and
  the panel growing out of the pill rather than appearing.

**M2 (independent windows) and M3 (local profiles) move to a later release.**
Their specs below stand and nothing about them is retracted; they are simply
not in 1.1.0. Both are architecture work of a size that would hold the island
work hostage, and neither has started.

Consequence worth stating: M1 was scoped as a foundation "for M2 to build on".
It now ships in a release that contains no M2. That is fine — it is inert by
design — but it means 1.1.0 carries a runtime boundary with exactly one
runtime in it, and the second runtime arrives later than the original plan
assumed.

## Milestones

Each milestone is its own spec → plan → PR cycle, with acceptance coverage
riding **inside** the milestone. (The reference branch grew its test slice
separately, coupled every scenario to the architecture via a shared `Before`
hook, and wired its features outside cucumber's `paths` so 11 scenarios never
ran. Each milestone here lands runnable, counted coverage or none.)

- **M1 — Window-runtime foundation.** Behavior-invisible: per-window state moves
  behind a runtime boundary with exactly one runtime; versioned workspace
  persistence with a v0 rollback mirror. Ships in a normal patch release for
  real-world soak before M2 builds on it.
  Spec: `2026-08-08-window-runtime-foundation-design.md`.
- **M2 — Independent windows.** *(deferred past 1.1.0)* ⌘N / File → New Window, per-window overlay and
  utility sheets, multi-window session restore, and application-menu-follows-
  focus correctness (the reference's version described the wrong window after a
  focus change — reproduced during the audit).
- **M3 — Local profiles.** *(deferred past 1.1.0)* Identity model, per-profile stores and sessions, a
  working rename/delete UI (the reference's is dead — `window.prompt()` throws
  in Electron), with the sync/supporter/telemetry invariants preserved. The
  audit verified the reference's store scoping keeps the default profile on
  every shipped root file, so existing users' data never moves.

## Explicitly deferred (design decisions required first)

- **Glance / split view** — a menu-only prototype in the reference: no
  accelerator, no way to choose the glanced tab, no chrome representation,
  unreachable on Windows/Linux. Needs a design exploration before any build.
- **Per-workspace closed-tab recovery** — depends on M2's workspace model;
  scope after M2 lands.

## Standing constraints (all milestones)

- Electron-only capabilities stay in the main process; renderers receive inert
  data only. IPC is authorized from `event.sender`, never from a global
  assumption. (Carried forward from the reference's boundary rules, which the
  audit found sound.)
- New persisted structures are versioned from their first release, with pure,
  fixture-tested migration functions.
- Security-sensitive flows that are per-window (1Password fill's focus checks,
  the shield popover's anchor/trigger state) must be runtime-owned from M1, so
  later milestones never re-touch them.
- The reference branch's twelve divergence-audit gaps serve as the regression
  checklist at each milestone's close.
