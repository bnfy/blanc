# Pending-tab shutdown repair — October 22

## Cause and repair

A new tab's pending first navigation is not in NavigationController's committed entry list. SessionTabHelper normally records entries on commit; rebuilding the session skipped the initial placeholder. A clean quit could therefore restore only the old blank tab. The baseline held-response fixture reproduces this with two real pending HTTP GET requests.

The repair snapshots live windows before shutdown destroys their session service, and before individual window teardown. The session builder includes an actively loading first HTTP(S) GET navigation at index zero. It does not replace already committed tab history, serialize POST requests, or turn a stopped request back into recovery intent. It does not bypass session encryption, introduce a second persistence store, or add a shutdown timeout.

Final validation is recorded in the result files and completion section below. The earlier draft and failed controls are retained separately. This is not acceptance of the previously observed intermittent startup wait or a public candidate approval.

## Final verification

Six final schedules pass on the final package, each with clean process exit and a restart:

- `final-pending`: two HTTP GET responses are withheld until quit. Both tabs restore in order with selected index 1 and complete after restart.
- `final-stop`: Stop leaves the pending destination out of the restored session; existing committed tabs and selection remain.
- `final-history`: navigating an already committed tab to a held response preserves its prior committed destination.
- `final-post`: a first-navigation POST is not replayed after restart; the existing tabs remain. No claim that the removed POST tab retains selection.
- `final-veto`: an actual native beforeunload prompt is cancelled during pending loading; the tab remains pending, then survives a later quit/restart. Prompt activation selects the guard tab. The transient empty quit-command tab is not restored.
- `final-relocated`: the pending-GET scenario passes from a relocated standalone app copy with original order/selection.

Seven capture tests, eleven patch-counter tests, launcher path test and JS syntax checks pass. Two guarded incremental builds: 38.97s/7 steps, then 35.61s/6 steps for the Stop correction. Final build guard reports zero actions. No cold build, GN/toolchain change, latency run or Electron build. Fresh footprint: 59 upstream files/142 zero-context hunks, +1 file/+5 hunks from58/137; threshold updated under standing owner authorization.

Bundle manifest hashes, preview helper/framework identifiers and strict deep ad-hoc codesign verification pass. Google baseline remains one New Tab; dev remains two New Tabs with second selected. Neither was restarted. The final ZIP and digest are in `artifact.json`; it is local/ad-hoc, not a release artifact. Extracted test app copies are removed after checks; the retained final relocated fixture profile remains separate and unchanged by app removal (`removal.json`).

## Retained failures and limitations

- `before.json` is the actual old-package data-loss reproduction, not a passing checkpoint.
- The first repair incorrectly retained a stopped destination (`stopped.json`). An old-package control (`old-stop.json`) drops it. Requiring IsLoading repairs that regression; `final-stop.json` is the final pass.
- Closing a never-committed loading tab reports “Tab closed, but history persistence failed or timed out” on both old and draft packages (`old-close`, `cancelled-tab`, `closed-tab-restart`). The tab stays absent after restart, but the close API warning remains a separate pre-existing gap; these are not clean API passes. No final-package fix for that warning is claimed.
- Initial veto fixtures used renderer navigation to chrome://quit, which returned ERR_INVALID_URL rather than exercising exit. Even after activation, that path did not prompt. The corrected fixture uses a browser-created quit target and records the actual beforeunload prompt. All failed attempts remain retained.
- The prior intermittent restored-profile startup stall remains unresolved; these successful restarts do not prove it fixed. Physical native controls, private/multiwindow matrices, power loss/write failures, real keychain service isolation and signed/quarantined acceptance are not newly qualified. Host macOS27.2 does not qualify the approved macOS26 target.

Launch progress remains 1/12 (8.3%), delta0. Claude's primary plan and supporting checklist are updated. Google upgrade evidence remains separate. Archived harnesses use a relative copy of the same CDP connect helper; unused hardcoded baseline helpers were omitted. No rerun is claimed for import-only archival edits.
