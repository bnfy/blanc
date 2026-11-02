# Session encryption recovery screen — October 22, 2026

Owner-selected behavior: show a recovery screen and preserve saved tabs rather than treating a missing encryption callback as an empty session.

## Implementation

After ten seconds in synchronous native session restoration, the preview displays a native “Restoring your tabs” dialog with an explanation and Quit Blanc. It leaves the original read pending. Late completion dismisses the dialog and continues the original restore exactly once; no retry read, blank fallback, or global provider failure is synthesized. The dialog owns its delegate until synchronous dismissal.

Quit required two repairs exposed by these tests. The nested restore loop must exit after shutdown is requested and all browser windows have closed, and startup must not create a fallback browser. The restore's process/profile keep-alives are released by a non-nestable task after startup installs the main quit closure. Releasing them during startup left an invisible process alive. Other windows must finish closing before abandonment; broader concurrent veto/profile combinations remain unqualified.

## Final bounded results

`verified` and `verified-encrypted` contain twelve starts across six fault/restart pairs. `initial/validation-final.json` records 28 passing assertions:

- Twenty-second provider delay: recovery screen appears, then dismisses once; exact three-tab ordering and selected index 1 restore, followed by a matching clean restart.
- Withheld provider callback: native Quit action exits without fixture termination. Every original Session/Tabs record remains byte-for-byte unchanged. Healthy restart automatically restores the exact three tabs and selection.
- Both cases repeat with only `Sessions_Encrypted` retained in disposable copies. These demonstrate encrypted-only delayed/withheld readiness recovery with a healthy mock-keychain result, not recovery from unavailable or corrupt keys.
- Temporary/permanent KeyError controls with both stores present restore through the existing clear-store fallback and survive restart. They do not establish encrypted-only provider-error recovery.

The native accessibility tree exposed the recovery heading, explanation and Quit Blanc button. This is not physical input or spoken VoiceOver qualification. The first UI-attached run had an extra blank window; the repeat without UI attachment restores exactly one window. The attachment's causal role is inferred, not proved.

## Retained failures and limitations

`initial` retains the first Quit hang and the initial incorrect automatic-restart expectation after forced termination. `interim` and `interim-encrypted` retain the second Quit hang after the nested loop was repaired but before keep-alive release ordering was fixed. Those forced kills are failures, not passing shutdown evidence. Compiler failures from older DialogDelegate construction/ownership APIs are retained. The final runs use no forced kills.

These are simulated provider faults in copied disposable profiles using mock keychain on macOS 27.2. They do not prove the historical intermittent stall had this cause, real macOS keychain behavior, macOS 26 acceptance, arbitrary asynchronous restoration, encrypted-only KeyError handling, or wider concurrent profile lifecycle. L2 and the public release gates remain open; tracker 1/12 (8.3%), delta 0.

## Build and provenance

All builds are incremental. Retained successful Siso durations: 46.55s (initial API repair), 40.97s (delegate ownership), 47.28s (shutdown loop), 34.63s and 34.24s (shutdown guards), 57.05s (interim normal restoration), 50.10s (keep-alive repair), and 63.58s (final normal restoration). Two preceding compile failures are retained separately. Final dry-run guard schedules zero actions. Seven capture tests and eleven counter tests pass; module syntax and diff checks pass.

Temporary provider/UI hooks were restored byte-for-byte; source hashes and compressed diagnostic patches are retained. The final normal UI source matches the repository copy. Fresh counter: 60 upstream files / 149 hunks, within the updated ceiling under standing owner authorization to expand and consolidate later. The packaged test apps are local ad-hoc fixtures, not signed distribution candidates.

Google baseline and live dev snapshots match before/after. Original fixture profiles and permanent profiles were not modified. Disposable apps/profiles are removed after evidence capture. Google baseline work remains separate and uncommitted. Latency and the Electron diagnostic build remain pending.
