# Restored-profile startup investigation — October 22

The startup stall is **not fixed or closed**. No production source change or native build was made: the retained package now starts the saved disposable profile copy without reproducing the prior wait. The original profile and prior stack remain retained. No timeout bypass, discarded session, or altered restore policy was introduced.

## Actual results

- Copy of the saved `profile-one-3` starts at a relocated extraction of the unchanged ZIP. Five subsequent clean restart cycles retain its single New Tab and selection (`cycles.json`).
- Fifteen independent fresh-profile/clean-restart pairs pass (`pairs.json`, 30 starts). These single-blank-tab cases alone cannot establish meaningful session restoration.
- At the original package location, a settled three-tab local fixture survives three clean restarts with exact URL order and selected index 1 (`multi-settled.json`). All four schedules exit cleanly. Every host window is captured in `settled-*.json`.
- Earlier multi-tab fixtures fail: immediate close after tab creation restores only one blank tab. Both new navigations were still loading. The first fixture also mistakenly passed chrome URLs through address normalization, which searched Google; it was replaced with controlled loopback URLs. Capturing all hosts confirms the local pending-navigation mismatch was not selection of a wrong window. These failures remain recorded and are not counted as passes. The settled control waits 6.5 seconds; this is a fixture boundary, not a latency benchmark or proof that immediate close is safe.
- Original-location and relocated starts therefore work in these bounded cases, but the previous intermittent SessionRestoreImpl::Restore wait has no established root cause. Do not infer a fix from non-reproduction. Next useful diagnostic is per-callback session/app-registry readiness capture when the stall recurs; another broad blank-tab repetition is not sufficient evidence.
- Strict deep ad-hoc codesign verification passes. Google baseline retains one New Tab, dev retains two with second selected (`preserved.json`). Neither is restarted or mutated. Permanent profiles and Google work are untouched.

## Limits and cleanup

No new full isolation acceptance: real keychain/service isolation, signed/quarantined artifact acceptance and approved macOS26 testing remain open; this host is macOS27.2. Launch progress remains **1/12 (8.3%), delta 0**. Latency and Electron diagnostic build remain pending. Prior upstream footprint58/137 unchanged; no native compile.

The unchanged ZIP remains `/private/tmp/blanc-preview-crash-repair/Blanc-Chromium-Preview-local.zip`. Disposable successful pair profiles and extracted app copies are removed after checks; original failure profiles, copied reproduction and multi-tab fixtures retained locally. Early harness log names overlapped, so only final settled and initial reproduction logs are archived here; JSON outcomes are retained for all recorded runs. Archived scripts use the copied CDP helper; no runtime claim for that import-path-only relocation.
