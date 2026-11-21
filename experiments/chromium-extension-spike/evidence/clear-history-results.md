# Clear history: Mac acceptance — October 16, 2026

Verified head: `742cfb4bcf0cc9ee653452c81b5e483babf21bd5`. Chromium pin: `156.0.8078.36`.

Guarded native build PASS in **35.02 seconds**, seven actual steps. Reviewed plan: two actions after the prior failed compile. `ExpireHistoryBetween` and both TopSitesObserver overrides compile. Repeated prepare plus guarded check: **zero scheduled actions**. No cold rebuild, environment override, build-argument change, cache cleaning or competing build.

All runtime checks used the separate disposable profile `/private/tmp/blanc-pr864-profile-742cfb4b`, CDP9224, with native input pinned to its process ID. Its empty history/Favorites baseline was recorded. The permanent profile at CDP9223 was never used for `/clear`.

Acceptance results:

1. Seeded two localhost history fixtures, one Favorite, a cookie and local-storage sentinel.
2. An open Billboard page acquired a native TopSites fixture tile. Its document identity token was recorded before deletion.
3. Native Island `/clear` emptied `HistoryService` results; Chromium's own `chrome://history/` page independently showed zero items and its empty-history message.
4. Favorite unchanged. Cookie and local-storage sentinels retained.
5. The already-open Billboard received a `topSites` event, removed the visited fixture tile and retained the exact same document token: **no page reload**. Chromium's default Web Store tile remained; it is a built-in tile, not retained browsing history. Do not describe the expectation as removal of every tile.
6. Created a fresh regular-window control visit, then opened a private window with native Cmd-Shift-N. Native `/clear` displayed **“Clear history from a regular window.”** The regular history entries were unchanged.
7. Closed the private window and cleared the control visit from the disposable regular window. Closed fixture pages before restart so session restoration would not create new visits.
8. Quit/relaunch of the disposable profile retained empty history and the same Favorite. The cookie also survived restart.
9. Closed the disposable instance and deleted its exact profile directory; verified it no longer exists.

The first test runner stopped after the successful clear assertions because of an invalid newline in a diagnostic JavaScript expression for reading the History page. The diagnostic was corrected and testing resumed from the current state; this was a harness issue, not a product failure. The History-page, private-window and restart checks subsequently passed.


## Committed evidence

- [Successful guarded build log](clear-history-build.log)
- [Chronological disposable-profile run](clear-history-run.json)
- [Billboard after deletion](clear-history-billboard-cleared.png)

The run records the same-document token before and after deletion, the
TopSites event, surviving Favorite/cookie/storage sentinels, the private-window
refusal with unchanged regular history, restart results, and deletion of the
disposable profile. The screenshot alone does not prove live refresh; the
same-document assertions and event record provide that evidence.

The history-only native API scope was reviewed in source. Runtime preservation
checks covered Favorites, a cookie, and local storage; cache and download
retention were not separately exercised. Temporary paths and the local process
ID are historical test references, not requirements for reading this report.
The permanent profile was never subjected to `/clear`.

Build-log trailing whitespace was normalized when packaging; diagnostic content
and timing are unchanged.
