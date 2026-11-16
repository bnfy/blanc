# Chromium 157 rebase — Mac verification checkpoint

Status: build succeeded; automated data checks completed; native/visible checks pending an unlocked Mac. Owner chose “Continue automated checks for now.” Do not mark the rebase complete.

## Build

Target 157.0.8103.6 (`41520584daa68d0040db7746ae562a0ff82187f6`), separate sibling checkout/output. Same four GN arguments and global Xcode/SDK. Existing 156 args, recorded environment and compiler revision hashes still match the pre-run baseline.

- First invocation: 8965.718 s including preflight; failed in one Blanc object after 54,900 local and 434 noexec actions. Five obsolete `ToolbarView::extensions_container()` calls.
- Repair: retained concrete getter is `extensions_container_for_testing()`. Five calls updated, no upstream header patch; runtime extension popup proof still pending.
- Cached continuation: 621.402 s including preflight; Siso 10m16.32s, 2,330 steps, success at 2026-10-16 22:46:43 EDT.
- Combined invocation wall time: 2h39m47s. This mixes first-time compilation and the repaired object, so it is not a pure routine incremental benchmark. Calendar span first invocation to success: 2h45m06s, including the repair/monitor gap.
- Final guarded check: zero pending actions. Build-guard tests: 10/10.
- Other measured repairs: new BrowserView GN target anchors; bounded-memory dry-run log scanning instead of the old 128 MiB capture limit. All recorded invocations are included.

## Automated evidence (CDP/bridge; not physical input)

Passed: version/start-page routing, Island iframe initialization, extension slot presence, create/navigate/back/forward/reload/stop, Favorite creation and named folder reuse, four layout selections, cross-tab preference propagation, pin/mute and pinned-boundary refusal, tab/group reorder, group name reuse/focus/fold/ungroup/close, pin/order/group/Favorites/layout/dynamic-wallpaper restart persistence, private data guards and hidden hearts after opening the private panel, history clearing and retained Favorite/cookie/localStorage, cleared-history restart persistence. Live Web Store listing has an enabled normal Add to Chrome button; installation was not initiated.

History/TopSites: typed fixture visits eventually populated native TopSites after restart. Clearing removed them from the native service and delivered a `topSites` event to the same open start-page document. Visible DOM refresh is NOT passed: on the locked Mac the document is hidden and lacks `layout-ready`, so the adapter intentionally skips its render refresh. Retest unlocked with a visible Billboard page and seeded history.

The recorded attempts include harness failures: premature TopSites assertions, checking an unopened private panel before its private theme was applied, reading wallpaper from the wrong state object, and incorrectly expecting per-tab mute to persist. The prior 156 test asserted pin/order persistence only; mute remains transient. Also, CDP browser-context creation was unavailable; the private test instead used the existing disposable instance's incognito command. A closed history-database read required immutable read-only mode. These failures remain in invocation records; they are not hidden as product passes.

## Still required

Unlocked native keyboard/mouse checklist, visible layout/header tint/traffic-light checks, visible TopSites refresh, normal Web Store install with native consent, extension action popup/focus, Google endpoint update and restart, physical hearts/slash commands/drag/keyboard reorder, visible start-page typing bridge and layouts, native Dock icon confirmation. No claims of physical input testing were made during this locked session.

Disposable profile `/private/tmp/blanc-task0/profile`, CDP 9225, fixture server 8786. Original Chromium 156 instance/profile/tabs were not controlled. Keep the disposable test resources until the remaining checks finish, then remove only those resources.

## Reviewable records

- [Invocation records](invocations.jsonl) include failed attempts, exact commands, timestamps and durations.
- [Runtime observations](runtime-evidence.json) retain intermediate failures and scoped assertions. In `native-data-clear-and-notification-pass`, `sites` records the stale renderer state; the successful fresh service-query assertion is in [clear-verify.mjs](harness/clear-verify.mjs). It must not be read as visible refresh proof.
- [Stage logs](stage-logs/) and [harness sources](harness/) preserve the checkpoint's assertions and errors. Harness sources are historical Mac-specific records, with absolute disposable paths and port 9225; do not run them against another profile. Helpers contain native-input functions, but this locked checkpoint did not invoke those functions. Scripts reflect their final corrected state; earlier failed invocations remain in the logs.
- [Upstream file inventories](patched-upstream-files.json) measure 21 existing files in both versions: 19 text files plus two icon assets. This corrects the earlier 20-file estimate.
- [Disk checkpoint](disk-checkpoint.json): 57.26 GiB source tree including 8.42 GiB output, 408.17 GiB free. Peak usage was not measured.
- [Ledger](../../rebase-ledger.md) separates the 8,965.718 s cold invocation from the 621.402 s repair/unfinished-work continuation and leaves the final outcome open.
