
### Island single-tab close warning repair — 2026-10-20

The old closeTab handler tested tab removal synchronously, reporting pending Chromium closure as an error. Single-tab close now uses the native unload observer/pending-close lifecycle: waits for actual removal before history flush and treats Cancel as a successful no-op. The bridge permits time for the native decision dialog; history flush retains its existing bounded failure handling. No claim of durability is made on cancellation.

Two isolated normal-binary schedules pass six checkpoints each, including actual Island .pill-close DOM click, ordinary close, pending beforeunload, Cancel retaining live state, Leave removing the tab, last-tab replacement and no warning banner. These are CDP/DOM checks, not physical-input qualification. Scoped lint and twelve existing theme/Store tests pass. One38.63second incremental build, final guard zero. No upstream hook changes; prior54/128 budget unchanged.

Owner-approved retained dev restart subsequently passed: both open New Tab pages and second-tab selection restored through native session restoration, without URL reconstruction. Disposable test profiles removed after clean exits. Pending save-failure/owner-destruction matrices and broader lifecycle remain unqualified. Latency and Electron diagnostic build remain pending. Evidence: evidence/island-close-warning-20261020.
