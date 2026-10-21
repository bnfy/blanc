# Grouped Split View recovery — October 20, 2026

Evidence-only checks on297ef25f. Grouped Spaces round trips pass, but the multiwindow crash gate fails twice. No implementation repair is included.

The source contains a two-pane split with right-pane focus, a blue collapsed group and a loose active New Tab. Switching to Plain and back restores exact normalized group name/color/collapse/member URLs, split layout/focus, active URL and durable window UUID. A second window is then created with its own grouped split and saved Space.

After actual SIGKILL and session restart, the harness times out waiting for two split windows. A diagnostic restart of that disposable profile finds only the source window, with its grouped split intact. A fresh-profile control with ten seconds of settling before the crash repeats the missing second window; settled-live.json captures that state during the wait. The cause is unresolved: this does not establish whether saving, restore enumeration or another lifecycle path loses the second window. This is not a complete grouped multiwindow recovery pass. The journal-boundary stage was never reached and remains unqualified in this checkpoint.

Initial harness attempt used the unsupported color name blue; the bridge correctly refused it before assertions. Final attempts use its hexadecimal color #376694. Raw failures and browser logs retained. The subsequent diagnostic launch occurred after the first failed harness cleanup and is labeled separately, not passed off as the first crash observation. The settled control captures the first crash restoration directly.

No compile; incremental guard schedules zero actions. Prior49files/117hunks within49/120 unchanged. Test profiles removed; retained preview untouched. Native input pending, latency deferred and Electron diagnostic build unapproved. Automated crash-bubble bypass is confined to disposable profiles. Fixture pages are authored loopback content. Broader grouped/private mutations, Recently Closed, physical restore and later recovery boundaries remain gaps.
