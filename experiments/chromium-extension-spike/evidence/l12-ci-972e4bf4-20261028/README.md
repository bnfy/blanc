# CI review — 972e4bf4

Exact head972e4bf4a258a7d12836fffefac7e1d228901200. Recorded snapshot:9success,9running,6queued,2failure,2skip. CodeQL has no completed result in this snapshot; previous-head success is not transferred.

Actual Ubuntu job123014507040 log confirms Electron44.9.1 modified-link-click-smoke.mjs:168, allowed versus SecurityError. Substrate123014326545 fails on tab-import-companions addons-linter high advisories GHSA-GCQX-W48M-W2H4, GHSA-5P2G-FCMC-QVQQ and GHSA-W3RX-R6R6-PGPR. Desktop/site/tab-import-worker have no unsuppressed high/critical dependency findings. These are known repository merge blockers outside the approved native-preview L11 scope. No Chromium-relevant completed failure identified.

Fifteen checks remain pending; retain their IDs from snapshot.json and review new failures. No CI rerun, passed browser test, native build, Electron repair, Google change or artifact modification performed. No all-green or L12 closure claim.

Pre-push update:16success,2running,6queued,3failures,2skips. CodeQL now passes with no new alerts. Windows job123014507542 confirms the same Electron44.9.1 allowed-versus-SecurityError assertion. No new Chromium failure; eight checks pending. See pre-push-snapshot.json and windows-failure.txt.
