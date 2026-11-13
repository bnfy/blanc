# Windows port of the memory benchmark — design

**Date:** 2026-11-09
**Status:** Draft for review. Implemented; the port runs on a hosted `windows-latest` runner (see *Findings*). Committed on `claude/new-session-45fae7`; under review.
**Scope:** Developer tooling only (`bench/memory/`, one new unit-test file). Nothing in `src/`.
**Origin:** Support chat #527 asked how much RAM Blanc uses on Windows. Every published memory figure comes from one Apple Silicon Mac, and the site's own FAQ says those are not Windows results. `bench/memory/run.js:603` refuses to run anywhere but macOS.
**Builds on:** `2026-08-09-browser-memory-benchmark-design.md`, which listed Windows and Linux as out of scope ("`phys_footprint` is a macOS concept; the other platforms need different metrics (PSS on Linux, working set on Windows)").

## Decision

Teach the existing harness to run on **Windows x64** and measure the same thing in the nearest Windows terms. macOS behavior stays byte-for-byte what it is: the 2026-10-19 run must stay reproducible. Linux stays out.

This design produces a **harness**, not a claim. No Windows figure may reach the site, the fact sheet or a support reply until a run on a quiet, dedicated x64 machine exists and `docs/marketing-claims.md` has been followed. A hosted-runner run is a proof that the port works, not evidence.

## The metric

The macOS number is `phys_footprint`: dirty plus compressed pages, no clean file-backed pages shared between processes, the same figure as Activity Monitor's Memory column. Summed RSS is rejected for it double-counting the engine binary mapped into every renderer.

Windows has the same trap under another name. **Working set** (`WorkingSet64`, the Details tab's "Working set") includes pages shared between processes, so it double-counts the Chromium and Gecko DLLs exactly as RSS does. The right analogue is **private working set** (`Working Set - Private`): resident pages that belong to this process alone. It is what Task Manager's Memory column on the Processes tab shows, so it is the figure a Windows user would compare against, which is the property Activity Monitor gave the macOS choice.

| Backend | Source | Metric id | Publishable |
| --- | --- | --- | --- |
| `perf-private-ws` | `Win32_PerfRawData_PerfProc_Process.WorkingSetPrivate`, one query for the whole tree | `private_working_set` | yes, with the caveats below |
| `get-process-ws` | `Get-Process` `WorkingSet64` | `working_set` | **no**: report carries the same banner as RSS |

Selection works as it does on macOS: probe in fidelity order, re-validate against the first real browser, never downgrade an explicitly pinned `--backend`, and `requireConsistentMetric()` still refuses to mix metrics in one table.

**Where private working set differs from `phys_footprint`, stated in the report and README rather than hidden:**

- It counts only resident pages. Memory the OS has compressed or paged out is not in it, where `phys_footprint` includes compressed pages. On a machine with spare RAM the gap is small; under pressure Windows would make every browser look lighter and the run would not say so. The run records total RAM and the runner is expected to be idle.
- Chromium can trim a backgrounded process's working set. A run where windows are minimized or occluded is not comparable with one where they are not. The harness never minimizes anything.
- Numbers are comparable **within** a Windows run and **never against** a macOS run. `meta.platform` is recorded and the report header names the OS.

## What changes, file by file

All pure functions take the platform as an argument with a macOS default, so `test/unit/bench-memory.test.js` stays valid on every host. This matters because `unit-tests.yml` runs the unit suite on `windows-latest`. Only the thin I/O edges read `process.platform`.

- **`lib/winps.js` (new).** Runs PowerShell with `-EncodedCommand` (UTF-16LE base64), because inline `-Command` quoting breaks on paths with spaces and quotes. Forces UTF-8 output so a user name with accented characters survives.
- **`lib/measure.js`.** `backendsFor(platform)`; the Windows backends above. `BACKENDS` keeps meaning the macOS list.
- **`lib/proctree.js`.** `parseWindowsProcessJson`; `snapshot()` uses `Get-CimInstance Win32_Process`. `matchingBundle` compares case-insensitively and across `\` and `/` when the bundle path is a Windows path, with the same boundary rule (`...\Application` must not match `...\Application2`). Windows has no zombie state, so `state` is `null`.
- **`lib/launch.js`.** `executablePath` joins with `path.win32`. `quit()` asks for a **graceful** exit with `taskkill /PID` (WM_CLOSE) before force-killing. This is not cosmetic: on Windows `process.kill(pid, 'SIGTERM')` is `TerminateProcess`, which skips Chromium's shutdown, and the harness reads each browser's history after it quits. A hard kill could lose the most recent visits and fail a good cell as "page not loaded" — the flattering-in-reverse failure that the load check exists to prevent.
- **`lib/registry.js`.** An entry may carry a `windows` block overriding `bundlePath`, `executableName`, `extraArgs` and `notes`. Paths expand `%LOCALAPPDATA%`, `%ProgramFiles%` and `%ProgramFiles(x86)%`. An entry with no `windows` block is "not installed" on Windows, never silently run with a macOS path. Version comes from `VersionInfo.ProductVersion`.
- **`browsers.json`.** Windows blocks for Blanc (both entries), Chrome, Edge, Brave and Vivaldi. Firefox, Zen, Opera, LibreWolf and Arc are left out. An unverified path costs nothing (the row is reported "not installed"), but an unverified process layout could mis-attribute memory. Firefox was tried and is **known not to work yet** (see *Findings from the hosted-runner probe*).
- **`lib/report.js`.** The header says Windows or macOS from `meta.platform` (absent in old files means macOS). The "not publishable" banner covers `working_set` as well as `rss`.
- **`run.js`.** The guard allows `darwin` and `win32`; `meta.platform` is written; on Windows the temp root is resolved with `realpathSync.native` so no 8.3 short names (`RUNNER~1`) end up in a profile path.
- **`README.md`.** A Windows section: the metric, the caveats above, how to prepare a machine.

Unchanged on purpose: the page-observation check (profile files read after quit work the same), warmed templates, settle detection, interleaved rotation, per-repetition baselines, the growth floor, and the no-process-model-flags rule.

## Verification

Nothing about the Windows edges can be proven on a Mac, so the port is proven in two stages.

1. **Unit tests, any host.** Parsers against realistic PowerShell JSON (array, single object, null path, junk), Windows path matching and its boundaries, registry resolution with injected `env` and `exists`, quit command construction, report wording and the unpublishable banner, and the macOS paths unchanged.
2. **A throwaway `windows-latest` branch, run once and deleted.** Per the repo's own pattern for Windows checks without the VM (the Parallels VM is ARM64 running emulated x64 Blanc, so it is not a valid target either way). The workflow installs public Blanc 1.47.0 after checking its SHA-256 against the release's `SHA256SUMS`, then runs `--list`, `--probe`, and a one-repetition `mixed` run of Blanc, Chrome and Edge. **Positive controls first**, as in the macOS work: the probe must show that the backend returns a nonzero private working set below the same process's `WorkingSet64` (otherwise it is reading the wrong counter), and an idle cell must show a plausible multi-process tree before any loaded cell is believed.

## Known limits and open questions

- **Hosted runners are shared hardware with datacenter IPs.** Ad networks may serve different content there, which would move an ad-heavy page's memory in ways that say nothing about a home connection. The 2026-08-09 spec ruled out shared runners for that reason. So the hosted run proves the harness; the figure to publish needs a dedicated machine (rented VM for a day, or a real PC). Not decided here.
- **Process layout is assumed, then checked.** Chrome, Edge and Blanc were confirmed to be a root process with helpers beneath it. Brave is expected to be and has not run on Windows yet.
- **Edge background behavior.** Edge can stay resident after its window closes. `quit()` already force-kills survivors after the grace period; if the probe shows Edge surviving WM_CLOSE, that is recorded rather than fixed blind.
- **`WorkingSetPrivate` in the raw performance class** is believed to be the instantaneous value, not a rate or a cumulative counter. The probe's positive control exists because that is a belief, not a fact I have checked on a Windows machine.
- **No Windows on Arm.** Blanc ships x64 only, and emulated x64 against native ARM competitors would be an unfair comparison.

## Findings from the hosted-runner probe (2026-11-09)

Five runs on `windows-latest` (Windows Server 2025, x64, 4 vCPU, 16 GiB), each fixing what the last one showed. What they established, and what they did not:

**Established.**

- `WorkingSetPrivate` in the raw performance class is the instantaneous private resident byte count. The positive control (a PowerShell process: private 27 MiB, working set 97 MiB, private bytes 41 MiB) passed before any browser was measured.
- The `perf-private-ws` backend reads Chrome, Edge and Blanc process trees; tree sizes at idle (Chrome 12–13, Edge 7–9, Blanc 6) and after ten pages are plausible and settle.
- Chrome and Edge verify 10/10 pages from their own history files. Blanc's installed 1.47.0 runs from `%LOCALAPPDATA%\Programs\blanc`.

**Defects the probe found in the port, all fixed.**

1. **Blanc exits at once when given two or more URLs.** Exit code -1, no output, before any app code runs. Electron's Windows guard (CVE-2018-1000006) requires `--` before several URLs; `src/main/startup-urls.js` already documents it. Not a Blanc bug: Blanc's own registrations pass one URL. The Windows Blanc launch now inserts `--`. Bisected: any single URL ran, every list of two or more exited.
2. **A locked temp folder lost a whole report.** Cleanup ran before the report was written and threw `EBUSY`. Cleanup is now best effort with retries.
3. **A surviving browser process kept the runner alive until the job timed out.** Its inherited stderr pipe held the event loop open. The pipe and child handle are now unref'd.
4. **The warm-up quit only the root pid,** so a browser that outlives its root kept the template locked. It now quits the whole attributed tree, as measured cells already did. This also applies on macOS and is a strict improvement there.

**Not established.**

- Firefox: `firefox.exe` is a launcher; its warm-up survivor locked the template and failed every cell. Left off Windows (see above).
- No number from these runs is evidence. They are one repetition on shared hardware, and the Blanc rows failed page verification (below).

**The Blanc rows' missing page is the check working, and it exposes the hosted-runner problem.** Both Blanc rows recorded 9 of 10 pages, always missing `reddit.com/r/browsers/`, while Chrome, Edge and Brave recorded 10 of 10. Blanc's saved session shows the Reddit tab open at the right URL; it simply has no history entry, because Blanc records no visit for an HTTP 4xx or 5xx response (`historyEligible`, `src/main/tab-view.js`). Chrome's stored titles for the same pages on the runner explain why: Reddit came back with **no title**, and Stack Overflow served Cloudflare's **"Just a moment..."** challenge twice before the real page. Chromium records those as ordinary visits, so their 10/10 does not prove the real pages loaded. Two consequences:

- A hosted runner's workload is partly bot-challenge and block pages. That makes it unfit for a published figure, which is what the design already said and this is now measured, not assumed.
- The page check should stay as it is. Loosening it for Blanc would hide exactly this case; the right fix is a workload fetched from an address sites treat like a person's. `workloads.json` now records the Blanc-versus-Chromium difference so the next failure is not mistaken for a Blanc defect.

