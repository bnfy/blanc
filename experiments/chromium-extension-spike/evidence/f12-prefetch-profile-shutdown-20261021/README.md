# Pending prefetch response: profile deletion and shutdown

October 21, 2026. Four bounded regular/private × profile-delete/shutdown
schedules pass on the existing repaired native binary; no production change.

Each waits for Ready prefetch, pauses the verified disposable browser's blocker
utility, selects the prefetched response by link navigation, and observes
PrefetchResponseUsed with an unresolved source navigation and no completed
response decision. Profile deletion uses the real profile-picker removeProfile
flow after getProfileStatistics, with an independent Profile 1 open. Default is
removed from Local State, its page closes, and the browser survives. After utility
resumption the destroyed navigation has no completion; survivor navigation works.
The restarted browser explicitly uses Profile 1 and verifies Default's directory
is absent, avoiding accidental recreation of the deleted profile.

Shutdown uses browser-level CDP Browser.close with the utility still held and
requires disconnection before resuming any surviving utility process. The pending
navigation rejects. Both shutdown schedules restart successfully and load a fresh
page. These are clean shutdown checks, not abrupt crash, power-loss, session-tab
restoration, or private-context persistence acceptance.

All schedules retain exactly the initial prefetch server arrival through the
post-teardown observation; no additional response decision for the cancelled
navigation appears during the1.5s observation. This is bounded behavioral evidence,
not instrumented destructor ordering or indefinite late-callback absence. The
private test is an off-the-record context within the disposable Default profile.
Deletion cancellation, overlapping navigations, shutdown veto, redirects,
subframes, cross-origin serving, BFCache/prerender and uBO remain open. F12 and
Decision2 remain in progress.

Native binary/source/engine hashes unchanged and verified. Syntax/lint, archived
validator and member hashes checked. Guard zero; no compile; prior56files/135hunks
unchanged. All disposable profiles and keys removed. Permanent profiles/tabs and
Google baseline untouched. Latency deferred; native physical input and Electron
diagnostic build pending.
