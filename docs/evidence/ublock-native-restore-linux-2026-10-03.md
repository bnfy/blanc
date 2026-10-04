# Linux uBO backup restore: native focus crash and verification

Status: native fix verified in restore stress and installed candidates; final
merged-head checks and publication remain pending.
No sandbox flags, Electron executable, blocking deadline, or uBO restore
assertions were relaxed.

## Failure retained

The final normal four-platform run at `ca840a775f97642116c0b00a5885fbaa339bb048`
[failed on Linux](https://github.com/bnfy/blanc/actions/runs/37165514775)
while importing an original uBO backup, waiting for its background to reload,
switching from Dashboard to the regular fixture, and reloading that page.
The official Electron browser process exited with `SIGSEGV`. Other platforms
passed that run. An earlier similar disconnection had been recorded in the
review notes; passing intermediate runs did not establish a fix.

A fresh-profile native Linux stress test at
`a797dc490190daba3cfa281d23bc0b4ebb96fff8` repeated the actual original
backup import and immediate page reload 30 times. In
[run 37166293406](https://github.com/bnfy/blanc/actions/runs/37166293406),
12 iterations passed and iteration 13 crashed. GDB captured a main-thread
`SIGSEGV`; the remaining iterations did not run.

The browser was official Electron 44.5.1, Linux x64, with the normal renderer
sandbox and real uBO 1.75.0 blocking enabled. The test used a fresh isolated
profile and localhost fixture data. No personal browsing data is included.

## Native stack

The matching official Electron Linux x64 symbol archive was verified against
its upstream `SHASUMS256.txt`:

- Archive SHA-256: `9dbf06f81bfcd6e34b8cece3a9e00fa56455b7eda899027e14dd1134e68451ee`.
- Breakpad module: `6750EAB2DF952462232FCC64A7D9E7FC0` (`electron`).
- The captured main-thread addresses map, using the observed conventional PIE
  load base, to `ui::PropertyHandler::GetPropertyInternal`,
  `views::DesktopFocusRules::CanFocusWindow`, and
  `wm::BaseFocusRules::GetFocusableWindow`.

The corresponding Chromium 152.0.7977.130 source calls
`WindowStateIs(window->GetRootWindow(), kMinimized)` in `CanFocusWindow`.
`WindowStateIs` immediately reads a property from that root. This is consistent
with focus restoration against an unrooted live guest. The stack alone does
not identify the precise guest or prove whether its root was null versus
otherwise invalid.

Sources: [official Electron release](https://github.com/electron/electron/releases/tag/v44.5.1),
[DesktopFocusRules](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.130/ui/views/widget/desktop_aura/desktop_focus_rules.cc),
[WindowStateIs](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.130/ui/wm/core/window_util.cc).

## Targeted lifecycle change

Commit `4ec657877c1672bf307ace1589c32d18a9e35930` keeps managed uBO tool
views hidden but rooted in their owning native window on Windows/Linux,
including when their URL temporarily becomes Blanc's error page during a
background reload. A main-owned creation flag identifies these tool views;
website and private views are excluded. macOS retains its existing path.
Native roots are removed after destruction, through a listener independent
of the tab listeners that quiet/held teardown removes. Moving a view updates
its root record. Explicit workspace detachment remains available.

Unit checks exercise the actual production helper for focus release, hidden
root retention, ownership rejection, private exclusion, window moves,
replaced windows, and deferred destruction cleanup without listener growth.
All 2,223 unit tests and lint passed locally. The isolated Mac real-blocking
suite passed all 30 original restore/reload iterations plus its complete
profile, lifecycle, tools, privacy, deadline, and offline assertions.

The first native Linux post-fix run
[37166954902](https://github.com/bnfy/blanc/actions/runs/37166954902)
passed all 30 imports/reloads plus the full remaining suite. GDB recorded
normal browser-process exits, not a crash hidden by the launcher. Under GDB,
startup was 4,646 ms, named-profile startup 2,369 ms and allowed fixture
request latency 35.1 ms. Those debugger timings are diagnostic, not production
performance claims.

All four normal desktop jobs and ordinary packaging passed at the same runtime
in [run 37166947290](https://github.com/bnfy/blanc/actions/runs/37166947290).
[Run 37167160303](https://github.com/bnfy/blanc/actions/runs/37167160303)
then passed three fresh-process launches, each with all 30 actual imports and
reloads plus the complete remaining suite (90 additional restores). Every
launch kept background tool views hidden. The native child count started at
2, peaked at 3 when the regular fixture was attached, and had zero retired
children after each restore. All six browser-process exits, including the
three offline relaunches, were normal. The fix therefore passed 120 native
Linux restore iterations over four fresh suite launches.

[Sanitized machine-readable observations](ublock-native-restore-linux-2026-10-03.json)
retain the before/after source bindings and each stress launch's counts.

The refreshed signed Windows installer and outer Linux AppImage passed their
installed provider/restart/persistence/close/relaunch and no-scripting tests in
[run 37167093493](https://github.com/bnfy/blanc/actions/runs/37167093493),
including Ubuntu 22.04/24.04 launch and sandbox checks. That run used the
corrected runtime source `4ec65787`. The subsequent merge of main restores the
owner-approved original shield SVG, removes its retired PNG, and changes its
asset allowlist/CSS; it does not change the native lifecycle fix. Isolated Mac
shield and real-blocking suites passed after the merge. A further installed
Windows/Linux run at merged source `77e27349` is pending before publication.

These tests support the targeted root-lifetime explanation; they do not
establish a general absence of native runtime defects. Passing a non-stress
run alone was not treated as proof of a fix.


## Final merged-head dashboard check

At merged source `77e27349`, the Mac arm64 job's core blocking, restore,
lifecycle and privacy suite passed. The later Dashboard presentation suite
failed its strict custom-filter no-server-hit assertion. Upstream
`1p-filters.js:266–280` saves filters and disables Apply, then independently
sends `reloadAllFilters`; that operation's completion is broadcast as
`staticFilteringDataChanged` after engine freeze in `storage.js`.
The test had treated the disabled button as engine readiness.

The test now checks that native CodeMirror keyboard input produced the exact
standalone fixture filter and that My filters is enabled, then observes uBO's
own completion broadcast before navigating. It does not set editor contents,
reload the engine itself, weaken the no-hit assertion, change a production
filtering deadline, or alter upstream code. The corrected Dashboard suite
passed locally; final native CI is required before the merge.
