

# Owner destruction and cross-owner retry after mutation timeout — October21

Six final schedules reach84 diagnostic checkpoints: four fail the immediate crash-recovery assertion and two controls pass. These are not84 persistence passes. Temporary native instrumentation forces a ratio change after each completed Session/Tabs save cycle before revalidation. Initial Session EIO establishes the repair marker; no write delay or fault remains armed during the timeout/retry phase. The diagnostic is the previously bounded, first-request-only hook, not a production change.

- Cross-owner retry, clear and encrypted: an existing second window is settled before the initial EIO. The original request times out after8,427/7,325 completed cycles. Set source35/65, observe live state, then close a helper tab from the second owner. That history close succeeds, but immediate SIGKILL/restart restores30/70 rather than35/65. Both source panes and the decoy survive exactly once. Twelve diagnostic checkpoints per failing run.
- Owner destruction, clear and encrypted: after timeout (8,034/9,240 cycles), close the two source panes and its New Tab placeholder. Verify the source host disappears and only the decoy host remains. A history close in the surviving owner acknowledges. Immediate crash/restart resurrects the explicitly closed source window/panes. Fourteen diagnostic checkpoints per failing run.
- Same-owner clear control: after the other-owner history close, a further close from the original source owner acknowledges the session repair. Immediate crash restores35/65 and each pane once;15 checkpoints pass.
- Settled destruction clear control:5.5seconds after the surviving owner's history acknowledgement, abrupt restart retains the decoy and leaves the source closed;17 checkpoints pass. This is a persistence-boundary control, not latency qualification.

Code inspection: partial_close_save_failed is owner-local. SaveClosedHistory in another owner takes the ordinary history-only flush path; it neither consumes nor completes the original owner's session repair. Destroying that owner removes its marker. A successful history close from another window therefore does not establish current whole-profile Session durability. These tests establish this coverage gap, not loss of acknowledged closed-history data. A repair should preserve pending session-repair responsibility across owner lifetime and require a current session/history flush plus mutation revalidation before clearing it. No repair applied this checkpoint. Green CI cannot close this runtime gap.

Two preliminary destruction fixtures are retained and excluded: both failed to destroy the owner because they omitted the retained New Tab placeholder (first selected only pane targets; second additionally handled about:blank but not chrome://newtab/). Final fixtures explicitly close that captured page and confirm one remaining host. No native crash was observed in the final destruction schedules; the persistence assertion fails after intentional SIGKILL/restart.

Mock keychain, syscall EIO setup and disposable crash-bubble bypass are fixture-only. Physical input, profile destruction, arbitrary simultaneous owners/saves, pre-ack crashes and powerloss remain unqualified. Latency deferred; Electron diagnostic build pending approval.

Evidence: evidence/timeout-owner-retry-20261021.

Final verification: temporary diagnostic removed byte-for-byte; native source has no git diff. Diagnostic and normal builds both incremental (35.53/35.81seconds, six steps each), final guard zero scheduled actions. Restored normal-binary smoke passes12 checkpoints; seven capture tests pass. Disposable test processes exited; only this task's profiles removed. Retained dev/upgrade baseline/permanent profiles and tabs untouched. Prior upstream54files/128hunks unchanged; no upstream patch edit or product repair. Plan/evidence updated; not committed or pushed.
