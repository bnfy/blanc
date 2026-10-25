# Ctrl-Tab release spike (2026-10-25)

Evidence for §3.4 and §10 of [the MRU tab switcher spec](../../2026-10-24-mru-tab-switcher-design.md). Throwaway harnesses, not Blanc product code.

| File | What it is |
|---|---|
| `spike-harness.mjs` | The Linux spike: launches Blanc under xvfb, instruments every webContents, sends real X11 keys with `xdotool`. |
| `spike-variants.patch` | The throwaway patch the spike ran against (environment flags `BLANC_SPIKE_FOCUS`, `BLANC_SPIKE_NOPREVENT`). Never committed to `src/`. |
| `spike-linux-none.json` | Row 2: Ctrl+Tab only counts, press consumed. |
| `spike-linux-strip.json` | Row 3: as row 2, focus moved to the strip during the press. |
| `spike-linux-deferred.json` | Row 3: as row 2, focus moved to the strip a tick later. |
| `spike-linux-noprevent.json` | Row 4: press not consumed (two steps per Tab). |
| `spike-linux-noprevent-noaccel.json` | Row 5: press not consumed, menu item `registerAccelerator: false`. |
| `ctrl-tab-probe.mjs` | Manual probe for Windows and macOS with a real keyboard; `--auto` reproduces rows 2 and 5 on Linux. |

Each report's first scenario is a control (Ctrl+A, which Blanc doesn't intercept), showing the release is seen when it exists.

Chromium refuses to run as root and Blanc refuses to run without its sandbox, so on Linux run the harnesses as an unprivileged user with user namespaces available.
