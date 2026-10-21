# Partial cancellation write boundaries — 2026-10-20

No production changes or native build. A disposable-profile-only DYLD write interposer targets Session_ or Tabs_ files in clear/encrypted stores. Four schedules reach actual native writes. Static HTTP fixture content and protocol arguments avoid reflected or generated-code injection.

## Findings

- Holding the session write, confirming the request remains pending, then killing the browser restores the older two panes loose, without partial Split history.
- Holding the history write similarly restores only the surviving right pane; the closed left pane is absent.
- Injected write EIO in either store rejects the close durability result.
- After removing the fault, removing the fixture beforeunload guard, reconciling partial history, acknowledging an explicit Spaces save and a subsequent close/history flush, immediate crash still fails full Split restoration. Session-error retry restores both panes loose. History-error retry restores only the survivor. **Remaining runtime recovery failures, no fix this checkpoint.**
- All four restarts remain usable and accept new acknowledged close/history writes.

The harness pass flag covers only its bounded assertions (pending/refusal, no duplicate URLs, usable restart), NOT successful complete Split recovery. outcomes.json separately records fullSplitRecoveryPassed=false for all four. Total34 diagnostic checkpoints are not34 recovery passes. No claim that two independently flushed stores form a crash-atomic transaction. Before-ack loss is an observed boundary; post-error acknowledged retry is a separate unresolved recovery gap.

Initial retry fixtures hit the intentional beforeunload/complete-window save guard. Waiting for load alone did not remove that guard. Final fixtures explicitly clear it before recovery. All initial result files retained; raw logs local under /private/tmp/blanc-partial-boundary-*. The inherited interposer error.json errno field is only a configured diagnostic value for hold mode: hold blocks before write and is killed, and does not return EIO; error mode does return EIO.

Zero-action build guard; no Chromium compilation, no production edits. Prior54files/128hunks unchanged. No native physical input, latency, Electron diagnostic build or power-loss qualification. Retained preview untouched.
