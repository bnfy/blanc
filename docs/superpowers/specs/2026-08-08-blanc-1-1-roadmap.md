# Blanc 1.1 roadmap — multi-window and local profiles

**Date:** 2026-08-08
**Status:** Complete, including follow-ups. M1 shipped in 1.0.10; M2 and M3
were deferred from 1.1.0, then implemented together in post-1.2 development
on 2026-08-14. Glance and per-workspace closed-tab recovery followed on
2026-08-15. No planned product work remains in this roadmap. See "What 1.1.0
actually is" for the historical release-scope decision.

This roadmap re-implemented the multi-window and local-profile architecture
against `main`, using `codex/post-1.0-development` strictly as a **reference
implementation** — never as a merge or cherry-pick source. The 2026-08-08
audit established why: the branch's true base is the deleted 1Password
credential-picker spike, only 2 of 19 probed commits applied cleanly onto main
(both docs-only), and main had since landed features *inside* the functions
the branch rewrote. See PR #54's closing comment for the full record.

## What 1.1.0 actually is

Not this roadmap. 1.1.0 ships **M1 plus the island work**, and nothing else:

- **M1 — window-runtime foundation.** Merged and released in 1.0.10 as a
  behaviour-invisible change, exactly as planned below, so it has had real
  soak time before anything builds on it.
- **The island UI refresh** — the ten Design System checklist items (#92) and
  the four revisions that followed review (#93).
- **Island motion** — the resting pill reacting to the cursor approaching, and
  the panel growing out of the pill rather than appearing.

**M2 (independent windows) and M3 (local profiles) moved to a later release.**
Their specs below stood and nothing about them was retracted; they were simply
not in 1.1.0. Both were architecture work of a size that would have held the
island work hostage, and neither had started when that release-scope decision
was made. Both were subsequently implemented on 2026-08-14.

Consequence worth stating: M1 was scoped as a foundation "for M2 to build on".
It shipped in a release that contained no M2. That was fine — it was inert by
design — but it meant 1.1.0 carried a runtime boundary with exactly one
runtime in it, and the second runtime arrived later than the original plan
assumed.

## Milestones

All three milestones are complete. The roadmap originally called for each
milestone to have its own spec → plan → PR cycle, with acceptance coverage
riding **inside** the milestone. M2 and M3 ultimately landed together, with
both runnable, counted acceptance slices included. (The reference branch grew
its test slice separately, coupled every scenario to the architecture via a
shared `Before` hook, and wired its features outside cucumber's `paths` so 11
scenarios never ran.)

- **M1 — Window-runtime foundation.** Behavior-invisible: per-window state moves
  behind a runtime boundary with exactly one runtime; versioned workspace
  persistence with a v0 rollback mirror. Shipped in a normal patch release for
  real-world soak before M2 builds on it.
  Spec: `2026-08-08-window-runtime-foundation-design.md`.
- **M2 — Independent windows.** *(implemented 2026-08-14)* ⌘N / File → New Window, per-window overlay and
  utility sheets, multi-window session restore, and application-menu-follows-
  focus correctness (the reference's version described the wrong window after a
  focus change — reproduced during the audit).
- **M3 — Local profiles.** *(implemented 2026-08-14)* Identity model, per-profile stores and sessions, a
  working rename/delete UI (the reference's is dead — `window.prompt()` throws
  in Electron), with the sync/supporter/telemetry invariants preserved. The
  audit verified the reference's store scoping keeps the default profile on
  every shipped root file, so existing users' data never moves.

## Completed follow-up work (outside the original milestones)

- **Glance / reference pane.** *(implemented 2026-08-15)* The selected design
  keeps the active page dominant and opens one explicitly chosen tab in a
  narrow reference pane. It has an Island tab-picker action, a native View
  menu command and Cmd/Ctrl+Shift+G accelerator on every desktop platform, a
  chrome context chip, a bounded resizable divider, promote/swap and close
  actions, a narrow-window stacked fallback, Quiet Tabs integration, and a
  runnable F34 acceptance slice. Design: `2026-08-15-glance-design.md`.
- **Per-workspace closed-tab recovery.** *(implemented 2026-08-15)* Each
  native window now owns its own bounded recently-closed stack. Reopen Closed
  Tab restores only the focused workspace's ordinary tabs; private tabs and
  blank new tabs leave no recovery trace. The F2-5 acceptance scenario proves
  that closing in one workspace cannot leak into another.

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
