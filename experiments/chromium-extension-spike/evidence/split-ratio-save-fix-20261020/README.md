# Pending-save Split View ratio repair — 2026-10-20

The retry-save state comparison now includes split membership bounds, layout and ratio for each tab. A ratio change while session/history writes are pending triggers a new session rebuild and both-store flush before acknowledgement, under the existing ten-second timeout. Previously the comparison covered tab identity/navigation/pinning/selection only, so a live 35/65 ratio could return as 50/50 after an immediate post-ack crash.

Four isolated schedules pass 47 checkpoints on the final normal binary:
- Encrypted session storage: injected initial Session write EIO, reconcile partial cancellation, hold retry Session write, resize to 35/65, release, await acknowledgement and immediately SIGKILL. Restart restores one 35/65 split with each pane exactly once; fresh history close remains usable (12).
- Clear session storage: the same held-write/immediate-crash sequence passes (12).
- Pending-navigation regression: the changed URL survives the immediate post-ack crash with the split (12).
- Repeated write EIO: failures remain errors; removal of the fault permits acknowledged recovery (11).

Seven capture tests pass. Incremental build succeeds in 37.72 seconds/six steps; final dry-run guard schedules zero actions. Two initial dictionary API compile failures are retained as build.log and build2.log. No upstream hooks changed; prior 54 files/128 hunks unchanged, so no patch-budget increase needed. Native test launch uses the existing disposable crash-bubble bypass and syscall interposition; production code contains no fault injection.

These checks qualify the reported ratio race and bounded regressions, not pre-ack crash durability, power loss, same-signature page-state changes, continuous-mutation timeout, arbitrary split/group lifecycle or physical native input. Retained dev instance and tabs untouched. Latency deferred; Electron diagnostic build pending approval. Changes are local and uncommitted at this checkpoint.
