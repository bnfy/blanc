# Concurrent cancellation and profile shutdown during cross-owner saves

Uses the repaired normal binary at ec90a8e6. Initial Session EIO creates a pending profile-repair generation, then the source pair is reconciled and set35/65. A history close in an existing other owner is held at an actual Session write. No native instrumentation or code edits are used; the disposable-profile syscall interposer is bounded to30seconds and released explicitly.

Concurrent cancellation: while the prior cross-owner save is pending, a new partial Split close cancels unload on the right pane and closes the left pane. Both operations remain pending until the barrier is released. The prior save acknowledges, and the new cancellation reports partial history/session saved. Immediate SIGKILL/restart retains only the right pane plus decoy; explicit Restore Tab reconciliation restores each pane once at35/65. This tests overlapping cancellation while an earlier repair is in flight; it does not isolate a same-signature generation-only race or arbitrary numbers of owners.

Profile lifetime: request Browser.close while a cross-owner Session write is held and confirm no successful close acknowledgement yet. Release the barrier, require browser exit0, then restart with the same isolated profile and verify source pair35/65, each pane once and decoy once. The destroyed caller's CDP promise ends with a transport timeout, not a durability success or native timeout observation. This qualifies full-browser/profile shutdown and restart; it is not hot profile deletion with another profile remaining alive, nor instrumented destructor/callback ordering.

Mock keychain and automated crash-bubble bypass apply only to disposable fixtures. The interposer's generic error.json errno field is inherited EIO metadata even for a held write; write-hold records do not mean an EIO was returned. Initial write-error setup does return EIO.


# Concurrent cancellation and cross-owner profile shutdown — October21

Four normal-binary schedules pass56 checkpoints: concurrent partial cancellation during a held cross-owner Session save in clear/encrypted modes, and full-browser/profile shutdown during that held save in both modes. Concurrent cancellation remains pending until release; immediate crash after completion preserves the newer surviving pane, and explicit Restore Tab restores the pair exactly once with35/65 ratio. Shutdown begins with no save success, exits0 after release, and restart preserves source pair35/65 and decoy once. The destroyed caller has a CDP transport timeout, not a native durability acknowledgement.

This qualifies bounded full-browser/profile teardown, not hot profile deletion with other profiles alive or instrumented destructor ordering. Same-signature generation-only races, arbitrary simultaneous owners, pre-ack crashes/powerloss and physical native input remain unqualified. No new runtime gap observed in these schedules.

Normal ec90a8e6 binary unchanged; no product edit or native compile. Only the isolated write-barrier dylib compiled (macOS syscall deprecation warnings retained). Seven capture tests pass; final build guard zero; prior54/128unchanged. Test processes exited and disposable profiles removed. Retained dev/upgrade baseline and permanent profiles/tabs untouched. Plan/evidence updated, uncommitted. CI monitor for ec90a8e6 continues. Native input pending; latency deferred; Electron diagnostic build pending approval and unstarted.

Evidence: evidence/cross-owner-concurrent-lifecycle-20261021.
