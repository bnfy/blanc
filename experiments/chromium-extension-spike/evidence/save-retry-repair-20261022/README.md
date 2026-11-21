# Failed-write retry repair — October 22

## Corrected diagnosis

The prior blank-tab observation was Chromium waiting at its normal post-crash **Restore pages?** prompt, not proof that the survivor was lost. Source HasPendingUncleanExit suppresses automatic restoration unless the prompt is accepted (or the controlled test uses hide-crash-restore-bubble). Preferences existed; inspecting all hosts and clear-store fallback did not change the waiting screen.

A genuine stale-session defect remains on the original artifact: explicit restoration of its retained failure fixture returns New Tab + A + already-closed B. The repaired candidate returns only New Tab + A, selected A. Original-restore report preserves that contrast. Earlier reports marked as failure because they expected automatic restoration are retained and superseded by this diagnosis; do not count them as persistence-loss proof.

## Repair

SaveClosedHistory now rebuilds and flushes the current open session before flushing closed history on every regular close. It uses the existing mutation/generation revalidation and timeout path, preventing history-only success from acknowledging stale survivors after write errors. Initial loading tabs with no closed history skip the nonexistent history flush only after open-session durability. Private bypass remains unchanged. No weakened native validation or distribution diagnostic hooks.

## Signed checks

- Exact filesystem refusal/retry/crash: disposable Session stores temporarily user-immutable, failed close refuses acknowledgement, flags cleared, subsequent close succeeds. Explicit native restoration yields exactly New Tab + A selected1, not B/retry. All four corrected assertions pass.
- Six normal real-keychain encrypted-only restart/loading-close/crash assertions pass.
- Five active/inactive Split ratio/focus, batch-close and Recently Closed assertions pass.
- Separate native beforeunload Cancel and Leave/last-window restart schedules pass.
- Normal native UI (no crash-prompt bypass): accessibility exposes Restore pages?, explanation and Restore button. Agent clicks Restore; page A renders Fixture text; final protocol snapshot confirms exactly New Tab + A selected1. This is agent UI evidence, not owner VoiceOver acceptance or the encryption-timeout recovery screen.

Apple Accepted 9b702603-3494-484b-ac15-b238908aa901; stapled/strict signature/Gatekeeper pass. ZIP SHA256 d668fcd0ce6c2475c9732483e2bcb56aa7e37c8ca2f16f35edd949b04f4569e0. Tested code hashes unchanged after stapling. macOS27.2 Apple Silicon, real preview-only keychain. Temporary count-only replay diagnostics were added only to a separate native diagnostic build and removed byte-for-byte; the signed artifact was built before them and never contained them.

Incremental repair40.93s/6steps; diagnostic and normal-restoration build logs retained; final guard0. Seven capture tests pass. Initial test filename typo and remote rsync path quoting issue were corrected; no failed native compile. Existing upstream footprint62/153 unchanged (custom native source change only). No latency or Electron build.

UI inspection first auto-launched the signed app's welcome window against its standard preview profile. Only that newly identified PID was closed; welcome settings were not changed and the profile was not deleted. The subsequent native Restore check used an explicitly launched disposable copy. Google/dev snapshots remain unchanged (one NewTab selected0; two NewTabs selected1). Restricted signing access retained under owner preference. Full L6 remains open for encryption-recovery UI and remaining artifact-bound lifecycle acceptance; 1/12 gates, no release approval. Source/evidence uncommitted this turn.
