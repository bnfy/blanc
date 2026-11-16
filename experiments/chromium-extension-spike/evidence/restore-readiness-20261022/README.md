# Restored-profile readiness diagnosis — October 22, 2026

The intermittent startup stall remains unresolved. No production repair is claimed. The original stack showed the main thread inside the synchronous SessionRestoreImpl::Restore run loop, without enough evidence to identify an outstanding callback.

Temporary logging records restore mode, browser/app session callbacks, registry readiness and entry/exit of the nested wait. Three targeted starts use copies of the retained failed profile and the retained three-tab profile (including one clean restart). Every run reports `sync=1 browser=1 apps=0`, then browser-session callback with one window and `status=1` (kSuccess), readiness, and resumed execution. The three-tab runs restore exact URLs/order and selected index 1. All exit cleanly. No startup stall or sample threshold is reached.

This establishes that web-app registry readiness is not required in these tested starts. It does not identify the original incident's missing callback, prove timing-independent correctness, or qualify the intermittent issue as fixed. The next incident needs the same markers plus command-storage read dispatch/completion and effective encryption-stage readiness if the browser callback is absent. Source inspection identifies those as the path feeding SessionServiceBase::OnGotSessionCommands, not as a proven cause. Do not bypass the wait or discard sessions.

The early `BlancPrototypeHost is not defined` reads in results are bounded polling before host JavaScript initialization; all later host reads succeed. They are not recurrence of the original CDP-unresponsive native wait.

Original disposable fixture contents are verified unchanged against before-run hashes. Google baseline and dev tab snapshots match. The diagnostic is removed byte-for-byte and the normal binary restored incrementally; source hashes and temporary patch are retained. No production code changes, cold builds, latency measurements or Electron diagnostic build. Prior upstream59/142 unchanged. Test host remains macOS27.2, not approved macOS26 acceptance. Disposable diagnostic app/profile copies are removed after process checks; the original failed fixture remains available.

Primary plan and supporting checklist keep L2 open. Launch progress remains 1/12 (8.3%), delta0. Logs, callback results and validation are evidence for this investigation only, not a reliability or release pass.

Incremental diagnostic build35.86s and normal restoration35.58s, six actions each. Final check-only guard reports zero pending actions. Syntax/diff checks and exact callback/result validation pass.
