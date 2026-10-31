# Signed candidate recovery acceptance — October 22

> Superseded diagnosis (October 22): the blank window was waiting for the normal native crash Restore prompt, not proof of survivor loss. Explicit restoration exposed a different defect: the original candidate resurrected closed tab B. The replacement signed candidate restores exactly New Tab + A. See [repair and signed rechecks](../save-retry-repair-20261022/README.md). Historical observations below are retained, not current conclusions.

**Historical L6 assessment — superseded:** acknowledged retry does not preserve surviving open tabs after a real filesystem failure.** Candidate source 05aceba1b05ee202da2ed1cbba69f3340bea48b3; unchanged Developer ID signed/notarized archive SHA256 6c2bbae590f312d7f112f7c0acd871946812f34b92852582582ece6bc0b7528c. macOS27.2 Apple Silicon, real preview keychain, independent disposable profiles. No new build or diagnostic hooks, no injected library, no mock keychain.

| Required row | Candidate result |
| --- | --- |
| Ordinary close, encrypted-only clean restart, immediate post-ack crash | Prior current-candidate-recovery six assertions pass on this exact artifact |
| Last-window beforeunload Cancel/Leave | Separate native-prompt schedules pass; restart preserves fixture URLs |
| Multiwindow/Split/Spaces recovery | Grouped split roundtrip, two-window crash restoration and journal-boundary rollback pass |
| Active/inactive ratios/focus | 35/65 and 65/35 independent splits retain focus/order on clean restart |
| Recently Closed | Batch-close and restore returns exactly two panes with original ratio, no duplicates |
| Private owner teardown/restart exclusion | Ten private mutation/disposal/restart checkpoints pass; private Spaces admission refused |
| Failed save refusal/retry | Refusal passes; acknowledged retry followed by crash loses surviving HTTP tab in both attempts |
| Recovery screen without diagnostic bypass | Not qualified on this signed artifact; old injected-provider development tests are not credited |
| Broader profile teardown during save | Prior development evidence only; not completed on this artifact |

## Reproducible blocker

Create settled HTTP tabs A/B. Temporarily set user-immutable flags on files and directories within only the disposable Sessions and Sessions_Encrypted stores. Close B: returns explicit history persistence failure. Clear all flags. Create and close retry tab: succeeds. Immediately SIGKILL fixture browser, restart. Expected New Tab + A (selected A); observed only New Tab. Repeat with an additional twenty-second observation after restart has the same loss. Both failure reports retained; forcedCleanup reflects cleanup after failed assertion, not a passing shutdown. The first report held a mutable array for locked paths and records an empty list; the repeat fixes this evidence detail and records six exact paths. Flags were cleared by finally cleanup.

Source review suggests an acknowledgement coverage gap: SaveClosedHistory normally flushes history alone unless SessionRepair is pending or the no-history special case applies. An ordinary filesystem session failure does not necessarily establish that repair state. This is a hypothesis, not a completed causal proof or repair. Next action: ensure a successful retry acknowledges a durable current open-session snapshot as well as closed history, then rerun this exact schedule and controls on a replacement signed artifact.

## Fixture issues retained

Archived grouped fixture first referenced a missing temporary CDP helper, then attempted Spaces save before loading completed. Both logs retained. Explicit readiness corrected the setup, with a fresh profile; final grouped run passes. The grouped checkpoint count includes diagnostic snapshots, not seven distinct acceptance gates. Existing Google baseline and dev remain unchanged (one New Tab selected0; two New Tabs selected1). All task fixture processes exited; disposable profiles retained locally for diagnosis. No permanent profile copies or mutations.

Full recovery acceptance is not complete. Gate count stays1/12; L6 now explicitly blocked. Latency deferred; Electron build pending. No source repair, rebuild, commit or push in this acceptance turn.
