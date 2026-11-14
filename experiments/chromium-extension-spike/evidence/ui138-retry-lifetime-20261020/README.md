# Retry backoff and lifecycle evidence

### October 20 — Retry backoff and owner/window lifecycle checks

Six disposable clear/encrypted schedules test the unchanged automatic-retry implementation. Long-backoff schedules retain eight failed flush observations with monotonic timestamps, including consecutive30-second intervals, then remove the fault, await successful acknowledgement and crash/restart to verify the new UUID/URL and unchanged source/decoy. These measure retry scheduling, not the deferred performance/latency qualification.

Owner-destruction schedules first cause a save failure, then hold the next retry inside its fallback fsync. Closing that new window before release leaves the two original windows usable; release and later crash/restart do not resurrect the closed owner and preserve source/decoy UUIDs/URLs. Changed-window schedules navigate the retry owner while that flush is held, release it, await successful current capture acknowledgement and verify the changed URL under the same UUID after restart. These are bounded navigation and window-close schedules, not every mutation, entire-profile destruction, or direct observation of every callback rejection branch.

Fault injection is confined to disposable Session paths and validates the owning PID/path. The helper forces the macOS barrier call to fail so fallback fsync can be held; no product controls or native source edits. All task profiles/servers are removed. The first clear long-run cleanup completed owned cleanup but its read-only preview fetch returned ECONNREFUSED; original failure and follow-up are retained. Subsequent cleanup records preview unavailable. Preview untouched; its tabs were not reverified.

No native compilation; guard zero actions/5.32s. Prior measured footprint49 files/117 hunks unchanged within49/120. Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Before-ack crashes, first-ever profile persistence, recent unpersisted edits, actual provider/hardware faults, long unattended soak, mutation variants and broader lifecycle remain gaps. Disposable restart alone uses the crash-bubble bypass; no native Restore or power-loss claim.

Archive members: 174. SHA-256: `3d178a0f2d9dfec23992220faa6290324116f00ddf7438b9aef904126f1f0baf`.
