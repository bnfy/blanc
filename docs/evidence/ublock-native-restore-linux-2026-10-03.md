# Linux uBO backup restore: native focus crash and verification

Status: native fix under verification; publication remains pending.
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
Three further fresh-process Linux stress runs with hidden/native-child bounds
assertions and updated installed Windows/Linux candidates are pending.
Passing a non-stress run alone is not treated as proof of a fix.
