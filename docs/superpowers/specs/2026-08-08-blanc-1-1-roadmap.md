# Blanc 1.1 roadmap — multi-window and local profiles

**Date:** 2026-08-08
**Status:** Funded. M1 approved for design; M2/M3 get their own specs when reached.

Blanc 1.1 re-implements the multi-window and local-profile architecture against
current `main`, using `codex/post-1.0-development` strictly as a **reference
implementation** — never as a merge or cherry-pick source. The 2026-08-08 audit
established why: the branch's true base is the deleted 1Password credential-picker
spike, only 2 of 19 probed commits applied cleanly onto main (both docs-only), and
main has since landed features *inside* the functions the branch rewrote. See
PR #54's closing comment for the full record.

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
- **M2 — Independent windows.** ⌘N / File → New Window, per-window overlay and
  utility sheets, multi-window session restore, and application-menu-follows-
  focus correctness (the reference's version described the wrong window after a
  focus change — reproduced during the audit).
- **M3 — Local profiles.** Identity model, per-profile stores and sessions, a
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
