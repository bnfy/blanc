# L6 signed-candidate recovery acceptance — October 23, 2026

**L6 is accepted for this signed candidate: eight final schedules pass 49 checkpoints, and the owner accepted the mapped unchanged recovery UI.** There is no new product failure in these completed schedules, and no build or re-sign was needed. This record is candidate-bound, not a replay of older results.

- Source: `09985c160803f3432f0d2b40a21caa13e249e53c`; Chromium `157.0.8103.15`.
- Signed archive SHA-256: `4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`; Apple accepted `1818186c-4b95-4571-b822-397bf8705161`.
- macOS 27.2, Apple Silicon. All 17 executable and three recorded asset hashes match before/after; strict deep signature verification passes outside the command sandbox.
- Fresh disposable profiles, real preview keychain namespace, no mock keychain, fault interposer, research switch, or product modification. CDP supplies test input; physical input is a separate L5 gate.

## Written criterion coverage

| Criterion | Current signed-candidate result |
| --- | --- |
| Ordinary/loading close, clean restart and one acknowledged crash | `recovery/report.json`: 6 checks. Encrypted-only session restores ordered tabs and selection. Closing a loading tab acknowledges; immediate process crash restores survivors. |
| Failed-save refusal and retry | `verified/report.json`: 4 checks. Immutable flags on only the disposable session stores force a real write failure. Close reports failure; after flags are removed, retry acknowledges and immediate crash restores expected tabs. Refusal concerns the persistence acknowledgement, not undoing an already closed tab. |
| Active/inactive Split View and Recently Closed | `splits/report.json`: 5 checks. Independent 35/65 and 65/35 pairs retain order, focus and ratios through restart; batch close and restore have no duplicate panes. |
| Private exclusion and context teardown | `private-lifecycle/runtime.json`: 10 checks. Private grouping/pinning/focus work; private state cannot enter the Spaces file; disposing the private context leaves regular content; restart contains no private tabs. |
| Spaces round trip and multiwindow crash recovery | `grouped/runtime.json`: 6 checkpoints. Group names/color/collapse, split identities, selection and both windows survive a settled crash. Cleanup exit is zero. This does not claim immediate pre-ack or power-loss durability. |
| Island close, Cancel/Leave and last tab | `close/test.json`: 6 checks. Actual Island DOM close works, native beforeunload remains pending then Cancel preserves live JS state, Leave closes, last-tab close creates a fresh start tab, no warning banner. |
| Nonregular read and shutdown regression | `nonregular/pipe-report.json`: 6 checks. A selected disposable encrypted record is replaced with a FIFO; candidate refuses the nonregular record and remains responsive, quits zero without a watchdog, then restores original regular bytes. Other valid session records can supply the initial tabs. This does not reproduce an encryption-readiness wait or prove recovery of corrupt bytes. |
| Owner/window and profile teardown | `teardown-report.json`: 6 checks. Native last-tab window closure leaves another window able to save. Chromium's actual profile-picker `removeProfile` deletes only disposable Default while Profile 1 remains; survivor saves/quits/restarts without resurrecting the deleted profile or closed owner. No pending-write race is claimed here. |

## Recovery UI: explicit owner disposition

The [previous signed UI observation](../signed-recovery-ui-20261022/README.md) recorded the native **Restoring your tabs** dialog, its explanation that saved tabs remain untouched, and **Quit Blanc**. Releasing the held read resumed saved tabs. That record also retained the then-failing FIFO Quit watchdog, repaired afterward; current nonregular-read and clean-exit regressions above pass.

`recovery-ui-source-map.json` verifies `ShowSessionRecovery` is byte-for-byte identical at the observed predecessor `71d12488`, the subsequent read fix `78f92ceb`, and this candidate's source `09985c16`. This is source mapping, **not a new observation of this candidate's recovery dialog or an actual unavailable encryption provider**. We did not lock the owner's keychain, interfere with permanent profiles, insert a diagnostic bypass, or claim normal startup exercises the ten-second recovery screen.

After that limitation was stated explicitly, the owner answered **“Accept mapped UI evidence; close L6.”** `owner-acceptance.json` records the complete question/answer and exact candidate identity. L6 is therefore accepted with mapped UI evidence, not falsely represented as a new waiting-screen or real provider-outage test. Readiness is **6/12 (50%), delta +1 L6**. No public release, merge, or other gate is approved by these tests.

## Retained fixture and environment failures

The first recovery and split invocations selected Node 20, which lacks the expected global WebSocket client, and timed out before performing checks. The same scripts with installed Node 22.14.0 and fresh profiles passed. The first owner-close fixture compared native `chrome://newtab/` targets with virtual `blanc://newtab/` state, leaving a window alive; it was corrected to close a single exact native window target. An intermediate duplicate-variable syntax error ran no browser test. These attempts remain archived separately and are not included in 49 passing checks. Sandboxed codesign initially reported invalid signature; the normal outside-sandbox verifier passed, and all recorded binary/asset hashes match.

## Cleanup and scope

`cleanup.json` records 13 removed owned profile/session-fixture paths after all owned browser processes exited. Signed master, original source/output, permanent apps/profiles/tabs and the separate Google baseline were untouched. Scripts and byte-preserving gzip copies of raw logs are retained; no profile database, keychain secret or encrypted session backup is published. No native compilation, latency measurement or Electron diagnostic build was run. The Google baseline ledger and upgrade evidence remain uncommitted separately.
