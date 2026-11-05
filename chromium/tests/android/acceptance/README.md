# Android acceptance scenarios

The shared scenarios in `spec/acceptance/` run against Blanc for Android here, the way
`test/desktop/` runs them against the desktop app. The steps drive the build server's emulator:
adb for input, UI Automator dumps of the tab grid and the palette for Blanc's state, and DevTools
for the page on screen.

```
chromium/tests/android/acceptance/run.sh out/AndroidDebugX64/apks/ChromePublic.apk [evidence dir] [cucumber args]
```

Run it on the build server from the Chromium checkout. It installs the APK, runs the
`androidSmoke` profile and writes `acceptance.log` and `acceptance.json` (with a screenshot of
every failure) to the evidence directory, `~/blanc-evidence/android/acceptance` by default.
Cucumber is the repository's pinned `@cucumber/cucumber` 13.3.0 in `~/acceptance-node`. Narrow a
run with `--tags`, for example `--tags @F2`.

- **What runs.** `cucumber.mjs` lists the scenarios Android has built (`RUNNABLE`, by stable id).
  Each one passes, fails or reports an undefined step; none is skipped. A scenario joins the list
  when its feature is built on Android.
- **Each scenario starts fresh.** Blanc's data is cleared and it launches on its Start Page. The
  emulator is set to light mode and 1080x1920 at density 320 for the run, so the grid and the
  palette show a scenario's tabs without scrolling; size and density are reset afterwards.
- **Fixture sites.** Every `*.example` host is a local HTTPS server. Chromium's debug
  command-line file (`/data/local/tmp/chrome-command-line`, read by a debug build on this userdebug
  emulator) maps the hosts to it through `adb reverse` and accepts its self-signed certificate.
  The file is removed when the run ends. A page's title is its host (and its path, if not `/`).
- **The fixture server has its own thread** (`fixture-server.mjs`). `adb` and `sleep()` block this
  one, and a server on it stops answering, which looks exactly like a page that won't load.
- **Timing.** A close's Undo lasts five seconds and a UI Automator dump takes over one, so steps
  that act during an Undo read the screen once and act on that.

`chromium/tools/android-acceptance.test.mjs` tests the readers in `support/parse.mjs` and checks
that every id in `RUNNABLE` names a scenario.
