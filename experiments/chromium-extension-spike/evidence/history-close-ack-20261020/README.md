# Closed-history save acknowledgement

The Island closeTab command now waits for the existing CommandStorageManager selected-backend SaveAndFlush callback after synchronous native closure. A failed flush or ten-second timeout rejects the request; weak Handler ownership prevents a stale UI reply. A pending/cancelled unload is explicitly not acknowledged. Private closures skip history persistence. This does not change native menu close, batch closeSplit or every Chromium close entry point.

## Runtime evidence

Three isolated encrypted-only schedules pass (31 diagnostic checkpoints):
- Immediate crash after successful fresh close acknowledgement, following corruption of both encrypted stores: fresh tab restores exactly once (previous binary lost it).
- Five-second settled crash control: fresh tab restores exactly once.
- Injected Tabs fsync/barrier EIO: close rejects with persistence failure; fault removal and a subsequent close flush allow immediate crash/restart recovery of the fresh tab exactly once. Both fallback flush operations are faulted by the interposer.

All fixtures remove plaintext records only in their disposable stopped profiles and restart with the diagnostic crash-bubble bypass. These are automated protocol checks, not physical native input. No power-loss, pre-ack crash, all-close-path, full cancellation/destruction matrix or real disk failure guarantee. No automatic retry of a failed close acknowledgement is claimed.

Seven capture tests and eleven patch-counter tests pass. Successful guarded incremental build: 85.65 seconds/65 steps; two compile failures retained locally (inline virtual style and obsolete draft declarations). No clean build or toolchain change. Final guard schedules zero actions. Fresh footprint54files/128hunks at the owner-approved ceiling. Latency deferred; Electron diagnostic build unapproved. Retained preview untouched.

Browser/build/guard logs remain under /private/tmp/blanc-history-ack-* and are not published. Source and result files are hashed below. Native pending-unload, owner destruction and private branches have source safeguards but were not newly runtime-qualified in this checkpoint.
