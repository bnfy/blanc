# Linux fork L0: first build Implementation Plan

> **For agentic workers:** execute inline (superpowers:executing-plans), one commit per task, no
> self-review loops. Steps use checkbox (`- [ ]`) syntax. Codex implements; Claude reviews each task
> before the next starts.

**Goal:** a Linux x64 build of the desktop fork, built on the server through the guard, that launches
sandboxed on a hosted runner under X11 and Wayland, draws the Island, starts the blocker, loads a page
and runs the full suite, with its result recorded. L0 is the fork plan's PL.1.

**Architecture:** Linux is a third output of the desktop checkout the Windows build already uses
(`~/chromium-desktop/src` on `blanc-android-build`). A small setup script applies the lane's source
and generates the Linux output under a checkout lock; the guard builds it; a packaging script turns it
into a candidate tarball that travels through an unpublished draft release to a manual GitHub workflow
on `ubuntu-24.04`, which runs the smoke check and the suite. Everything mirrors the Windows W0 tooling
(`chromium/windows/`), with Linux's differences named below.

**Tech stack:** Chromium 158.0.8127.2 (GN, Siso), Node 22 test harness (`node --test`), bash,
GitHub Actions, `xvfb`, `weston`.

**Spec:** [`docs/superpowers/specs/2026-11-21-linux-fork-design.md`](../specs/2026-11-21-linux-fork-design.md)
(owner-approved 2026-11-21). Read it first; §2 and §4 carry the rules this plan assumes.

**Facts read from the pinned tree and this repo (2026-11-21):**
- Pin 158.0.8127.2, upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c`; the lane lists 109 patches,
  the last `0110-blanc-restore-pages-button.patch`. A new patch to an upstream file that isn't already
  in `chromium/upstream/manifest.json` needs that file's pristine copy imported first: the manifest,
  the lane's `fileCount`, `source-map.json`'s `upstreamFiles` and the count in
  `chromium/tools/check-patches.test.mjs` (224 today) all change with it
  (`chromium/tools/lane.py`, `check-patches.py`).
- Server checkout `~/chromium-desktop`: `.gclient` `target_os = ['win']` (no `target_os_only`),
  outputs `BlancWinPrototype` and `BlancWinBeta`, `build/linux/debian_bullseye_amd64-sysroot` present
  with gclient's marker files `.f851add7…` (64 hex), `.<hash>_hash`, `.<hash>_content_names`,
  `.<hash>_is_first_class_gcs`; marker `~/chromium-desktop/.blanc-synced` holds two fields,
  `<upstream> <toolchain package>`; applied map `~/chromium-desktop/.blanc-applied-source-map.json`.
  Build user `blanc`. 624 GB free.
- The setuid sandbox helper is the GN target `executable("chrome_sandbox")`
  (`sandbox/linux/BUILD.gn:298`); the browser looks for it as `chrome-sandbox` beside its executable
  (`sandbox/linux/suid/client/setuid_sandbox_host.cc:138`).
- `chromium/tools/build.mjs`: `MAC_OUTPUTS`, `WINDOWS_OUTPUTS`, `outputName()`, `buildLane()`,
  `requireDesktopHost()`, `competingBuild()`, per-output lock `out/<name>/.blanc-build-guard.lock`.
- `chromium/tests/lib/fixture.mjs:105` always passes `--user-data-dir`, so a suite or smoke launch never
  shows the bare-launch data folder; that and the rest of the preview's Linux identity are L1's
  (spec §5).
- `chromium/tools/build.mjs:272` falls back to the Mac's `environment()` (Xcode) for any output that
  isn't Android or Windows; the Linux output must be routed explicitly.
- The Windows candidate workflow installs the harness's npm dependencies before the suite
  (`chromium-windows-candidate.yml:148`); `chromium/tests/steps.mjs` needs `@cucumber/cucumber-expressions`.
- `chromium/tests/lib/platform.mjs` already maps `linux`; `candidateIdentityFiles()` requires a
  framework (Mac) or a dll (Windows); Linux's browser is one `chrome` executable.
- `chromium/tests/runner.mjs:45` picks fork exclusions per platform (`macos`, `windows`).
- `chromium/blanc/island/host.js:5` already reports `linux`; the Island still draws its own window
  buttons on Linux (L1 changes that).

## Global constraints

- Linux builds only on `blanc-android-build`, only through `chromium/tools/build.mjs`, never while
  another `siso ninja` runs there, and never while the checkout lock is held.
- Never touch `~/chromium-android`, `~/depot_tools`, or the Windows outputs' `args.gn`.
- **No Linux setup or build during a Windows release.** Before each server step that applies source or
  builds, check that no `chromium-beta-windows-*` draft release exists (`gh release list --repo
  bnfy/blanc`) and that the owner has no Windows release between `preflight` and `publish`; ask the owner
  if unsure. `setup.sh` takes `--windows-release-idle` as the operator's explicit statement of that check
  and refuses to apply without it.
- No `gclient sync`/hooks run in L0 unless Task 3 proves the Linux build needs one; then stop and ask
  the owner (it was approved only "if L0 finds one is needed", and the request must show why).
- Shared C++ and GN changes keep the Mac's and Windows' inputs identical: Linux-only code sits behind
  `is_linux` / `BUILDFLAG(IS_LINUX)`, never `is_posix` / `IS_POSIX`.
- The renderer sandbox is never turned off: no `--no-sandbox`, and the runner never relaxes Ubuntu's
  `kernel.apparmor_restrict_unprivileged_userns` (do not call `scripts/ci-enable-linux-sandbox.sh`).
- Work goes to `chromium/next` (merge, never rebase or force-push) after the fork unit suite
  (`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`) and
  `python3 chromium/tools/check-patches.py` pass for both lanes. No Electron app changes.
- No secret on the server or in GitHub. The server holds no GitHub credential.

## Review focus

1. **A Windows build or setup touching the checkout while Linux setup applies source**, or the reverse,
   must be refused, not interleaved: one atomic checkout lock that the guard acquires (not just checks)
   for the whole check or build, and setup and the Windows bootstrap acquire for apply and `gn gen`
   (Task 1, Task 2), with contention tested in both directions.
2. **A sandbox check that passes only because the runner relaxed Ubuntu's protection**: the smoke reads
   back `kernel.apparmor_restrict_unprivileged_userns` and fails unless it is `1` (Task 5).
3. **A launch that runs unsandboxed or falls back silently**: the smoke check requires at least one
   renderer and fails unless every renderer's `/proc/<pid>/status` shows `Seccomp:\t2` and its PID
   namespace differs from the browser's (Task 5).
4. **A "Wayland" run that is really X11**: the Wayland smoke starts with `DISPLAY` unset and
   `--ozone-platform=wayland`, so an X11 fallback can't connect (Task 5).
5. **A candidate whose identity doesn't match its files** (a Windows-shaped id, a stale tracker entry):
   `progress.mjs` and `runtimeConfig` reject it (Task 4).

---

### Task 1: The build guard learns the Linux output and the checkout lock

**Files:**
- Modify: `chromium/tools/build.mjs`
- Test: `chromium/tools/build.test.mjs`

**Interfaces:**
- Produces: `export const LINUX_OUTPUTS = ['BlancLinuxPrototype']`;
  `buildLane(['--out=BlancLinuxPrototype'])` → `{ lane: 'desktop', out: 'BlancLinuxPrototype', target: 'chrome', extraTargets: ['chrome_sandbox'] }`;
  `export function checkoutLockPath(src: string): string` → `path.join(path.dirname(src), '.blanc-checkout.lock')`;
  `export function acquireCheckoutLock(src: string, mkdir = fs.mkdirSync): () => void` (atomic
  `mkdir` without `recursive`; on `EEXIST` throws
  `'The desktop checkout is locked (setup, apply or another build). No build started.'`; returns the
  release function, which removes the directory);
  `export function sysrootHash(entries: string[]): string` (the one entry matching `^\.[0-9a-f]{64}$`,
  without the dot; throws unless exactly one).
- Consumes: existing `outputName`, `requireDesktopHost`, `WINDOWS_OUTPUTS`.

- [ ] **Step 1: Write the failing tests** in `build.test.mjs`:
  `outputName(['--out=BlancLinuxPrototype'])` returns it; `buildLane` returns the object above;
  `--sdk-root=` with the Linux output throws `/macOS option/`;
  `requireDesktopHost('BlancLinuxPrototype', 'darwin', 'arm64')` throws `/x86-64 Linux/` and
  `('BlancLinuxPrototype', 'linux', 'x64')` doesn't; `requireDesktopHost('BlancPrototype', 'linux', 'x64')`
  still throws; `checkoutLockPath('/h/chromium-desktop/src')` is `'/h/chromium-desktop/.blanc-checkout.lock'`;
  in a temporary folder, a first `acquireCheckoutLock` succeeds, a second throws `/locked/`, and after
  the first's release a third succeeds; `sysrootHash` picks `f851…` (64 hex) from the four real marker
  names listed above and throws for zero or two.
- [ ] **Step 2: Run** `node --test chromium/tools/build.test.mjs`; expect the new tests to FAIL.
- [ ] **Step 3: Implement** in `build.mjs`: `LINUX_OUTPUTS` joins the names `outputName` accepts and the
  usage line; `requireDesktopHost` treats Linux outputs like Windows ones (x86-64 Linux only);
  `buildLane` adds `chrome_sandbox` (the setuid helper the candidate launches with); a
  `linuxEnvironment(src, out)` records `host`, `clangRevision`, `clangVersion`, `sysrootHash` (from
  `build/linux/debian_bullseye_amd64-sysroot/`) and `argsSha256`; `main()` routes Linux outputs to
  `linuxEnvironment` explicitly (never the Mac's `environment()`), and for every desktop output built on
  Linux (Windows and Linux) acquires the checkout lock before the dry run and releases it after the
  build in the same `finally` that removes the output lock; on `--record-environment` the Linux summary
  line is
  `Linux sysroot <hash>`. No Linux candidate is auto-recorded (as for Windows).
- [ ] **Step 4: Run** the test file; expect PASS. Run the whole fork unit suite; expect PASS.
- [ ] **Step 5: Commit** `Fork: the build guard learns the Linux output and the checkout lock (L0)`.

### Task 2: Linux arguments and the server setup script

**Files:**
- Create: `chromium/linux/args/prototype-x64.gn`, `chromium/linux/server/setup.sh`,
  `chromium/linux/server/README.md`
- Modify: `chromium/windows/server/bootstrap.sh` (acquires the same checkout lock, with `mkdir`, around
  apply and `gn gen`, released by `trap`)

**Interfaces:**
- Consumes: Task 1's lock path (`~/chromium-desktop/.blanc-checkout.lock`, a directory made with
  `mkdir`, removed on exit by `trap`).
- Produces: `out/BlancLinuxPrototype` generated from `chromium/linux/args/prototype-x64.gn`; evidence in
  `~/blanc-evidence/linux/`.

- [ ] **Step 1:** `prototype-x64.gn`: `target_os = "linux"`, `target_cpu = "x64"`, `is_debug = false`,
  `is_component_build = false`, `symbol_level = 0`, with a header comment in the style of
  `chromium/windows/args/prototype-x64.gn`.
- [ ] **Step 2:** `setup.sh [--dry-run]`, modeled on the Windows `bootstrap.sh` but never syncing:
  refuse anything but x86-64 Linux and root (it runs as `blanc`); refuse a real run without
  `--windows-release-idle`; require the first field of `~/chromium-desktop/.blanc-synced` to equal the
  lane's upstream (else stop: "run the Windows bootstrap first"); require the amd64 sysroot folder
  (else stop: "a hooks run is needed; ask the owner"); refuse if `pgrep -f "[s]iso ninja"` finds a
  build. Before taking the lock, run the guard's `--check` for `BlancWinPrototype` and `BlancWinBeta`
  and copy each output's whole `blanc-build-plan.log` to
  `~/blanc-evidence/linux/plans/<UTC>-before-<output>.log`. Then acquire the checkout lock (`mkdir`,
  refuse if it exists, `trap` releases it); `apply.py --lane desktop` check, then `--apply --backup
  ~/blanc-evidence/linux/backups/apply-<UTC>` with `--previous-map`; record the applied map exactly as
  `bootstrap.sh` does; create `out/BlancLinuxPrototype/args.gn` (refuse a differing one) and `gn gen`;
  release the lock. After it, run the Windows `--check`s again into `...-after-<output>.log` and print
  the targets that differ between before and after. `--dry-run` prints each step and changes nothing.
- [ ] **Step 3:** `bootstrap.sh` takes and releases the same lock around its apply and `gn gen` steps.
- [ ] **Step 4:** `README.md`: layout (shared checkout, the Linux output, evidence folder), the lock,
  the rule "no Linux setup or build while a Windows build runs or a Windows candidate is being
  prepared", how to rebuild.
- [ ] **Step 5:** A contention check: with the lock held by a `mkdir` in one shell, `setup.sh`, the
  Windows `bootstrap.sh` and `build.mjs --check --out=BlancWinPrototype` each refuse; with a guard
  `--check` running, `setup.sh` refuses. Record the four results in the commit message. Then
  `shellcheck` both scripts if installed; run `bash chromium/linux/server/setup.sh
  --dry-run` on the server from `~/blanc-desktop` at this branch; expect the plan printed and nothing
  changed (`git -C ~/chromium-desktop/src status --porcelain` identical before and after).
- [ ] **Step 6: Commit** `Fork: Linux arguments and the server setup script (L0)`.

### Task 3: First build and compile fixes

**Files:**
- Modify: files under `chromium/blanc/` as compile errors require; a new patch only if an upstream file
  must change (then import its pristine copy first, per the facts above)

- [ ] **Step 1:** On the server (after the Windows-release check): `setup.sh --windows-release-idle`
  (real run), then `node chromium/tools/build.mjs ~/chromium-desktop/src --record-environment
  --out=BlancLinuxPrototype`, `--check`, and the approved cold build `--build --allow-large-build
  --out=BlancLinuxPrototype` in a tmux session, logged to `~/blanc-evidence/linux/cold-build-1.log`.
- [ ] **Step 2:** For each compile error: fix in `chromium/blanc/` behind `BUILDFLAG(IS_LINUX)` /
  `is_linux` where the fix is Linux-only, or a small patch (with its upstream file imported); rerun
  `setup.sh` and the guard (`--build`), next log number. If the error is a missing dependency that only
  `gclient` hooks would fetch, stop and report to the owner with the log line.
- [ ] **Step 3:** Run the fork unit suite and `check-patches.py` for both lanes; expect PASS.
- [ ] **Step 4:** Commit `Fork: the first Linux build compiles (L0)` (the fixes; the logs stay on the
  server). If nothing needed fixing, no commit; note the build facts for Task 6.

### Task 4: Package the candidate and get it to GitHub

**Files:**
- Create: `chromium/linux/candidate.mjs`, `chromium/linux/package-candidate.mjs`,
  `chromium/linux/ship-candidate.sh`
- Modify: `chromium/tests/lib/platform.mjs`, `chromium/tools/progress.mjs`, `chromium/tracker.json`
  (only when recording), `chromium/STATUS.md` (its generated candidate line)
- Test: `chromium/linux/candidate.test.mjs`, `chromium/tests/platform.test.mjs`, `chromium/tools/progress.test.mjs`

**Interfaces:**
- Produces (`candidate.mjs`): `ASSET_NAME = 'blanc-linux-candidate.tar.gz'`;
  `candidateId(exeSha256: string): string` → `'linux-x64-' + exeSha256.slice(0, 16)` (throws on a
  non-hex or wrong-length hash); `runtimeFiles(lines: string[]): string[]` (as Windows', from `gn desc
  runtime_deps`, refusing absolute paths and `..`);
  `runtimeConfig(directory, candidate)` → `{ candidate, executable: <dir>/chrome, executableSha256,
  singleBinary: true, blockerAssets: <dir>/blocker, diskAssets: false }`.
- Produces (`platform.mjs`): `candidateIdentityFiles(config)` accepts `singleBinary: true` with no
  framework and no dll, returning only the executable pair; `candidateIdentity` returns
  `{ id, executableSha256, singleBinary: true }`. Mac and Windows behavior unchanged.
- Produces (`progress.mjs`): `linuxCandidate(record)` and `--linux-candidate=<package.json>` writing
  `tracker.currentCandidates.linux`.

- [ ] **Step 1: Write the failing tests:** `candidateId` of a 64-hex hash; refuses `'abc'`;
  `runtimeConfig` refuses an id that doesn't match `exeSha256`; `candidateIdentityFiles({candidate,
  executable, executableSha256, singleBinary: true})` returns one pair and still throws for a config with
  neither `singleBinary` nor a library; `linuxCandidate` refuses a `windows-x64-…` id and an id not
  derived from `exeSha256`.
- [ ] **Step 2: Run** them; expect FAIL.
- [ ] **Step 3: Implement** the three modules. `package-candidate.mjs` follows
  `chromium/windows/package-candidate.mjs` (same lock, pin, blocker-hash and `gn_logs.txt` rules) with:
  the output `BlancLinuxPrototype`; `chrome_sandbox` copied as `chrome-sandbox`; a tarball
  (`tar -czf`, so file modes survive) instead of a zip; `candidate.json` with `platform: 'linux'`,
  `arch: 'x64'`, `exeSha256`, `qualification: 'preview with test hooks; never distributable'`.
  `ship-candidate.sh` follows the Windows one with `DRAFT_TAG=fork-linux-candidate`, the id pattern
  `^linux-x64-[0-9a-f]{16}$`, and prints the `chromium-linux-candidate.yml` run command.
- [ ] **Step 4: Run** the tests and the fork unit suite; expect PASS.
- [ ] **Step 5:** Package on the server into a new folder `~/blanc-evidence/linux/candidate-<n>`; ship it
  from this Mac; record it with `progress.mjs --linux-candidate=…`; `progress.mjs --check` passes.
- [ ] **Step 6: Commit** `Fork: Linux candidate packaging and identity (L0)`.

### Task 5: The hosted Linux run: workflow, smoke check, exclusions

**Files:**
- Create: `.github/workflows/chromium-linux-candidate.yml`, `chromium/tests/linux-smoke.mjs`,
  `chromium/tests/linux-fork-exclusions.mjs`, `chromium/linux/run-suite.mjs`
- Modify: `chromium/tests/runner.mjs` (exclusions map gains `linux`), `chromium/tests/lib/fixture.mjs`
  only if a Linux launch flag is needed
- Test: `chromium/tools/linux-fork-exclusions.test.mjs`, `chromium/linux/run-suite.test.mjs`

**Interfaces:**
- Consumes: Task 4's `runtimeConfig`, `ASSET_NAME`; `chromium/windows/pinned-commits.mjs` (platform-neutral).
- Produces: workflow inputs `sha256` (64 hex), `suite` (`none` | `f0`), `only` (same character rule as
  Windows); job artifact with `smoke-x11.json`, `smoke-wayland.json`, screenshots and, for a suite run,
  the runner's results.

- [ ] **Step 1: Write the failing tests:** `linux-fork-exclusions.test.mjs` asserts every key is an
  existing case id and every reason is non-empty, and that it contains exactly the Windows exclusions
  whose reasons hold on every platform (the 1Password, Reading Mode, Dark Reader, updater, V12, V18 and
  quiet-tabs rows, with their reasons copied, except the updater row, whose reason becomes "The test
  build has no updater; Linux betas update through apt and dnf from Blanc's repository (spec owner
  decision 2), proven at L3."), not the Windows-only ones (caption buttons, icon catalog, Windows Hello,
  the Arc row). `run-suite.test.mjs` mirrors the Windows `suiteArguments` tests.
- [ ] **Step 2: Run** them; expect FAIL.
- [ ] **Step 3: Implement.** `linux-smoke.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR`, built on
  `chromium/tests/windows-smoke.mjs` (its `NativeFixture` launch, `assertRendering`, blocker-ready and
  page-loaded checks and screenshots), adding: the run is an ordinary user's (`process.getuid() !== 0`);
  `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` reads `1`; at least one renderer process
  (`--type=renderer` in its command line, a child of the launched browser) exists, and for every one
  `/proc/<pid>/status` has `Seccomp:\t2` and `/proc/<pid>/ns/pid` differs from the browser's. For
  `wayland` the workflow starts `weston --backend=headless --socket=wayland-blanc` with a private
  `XDG_RUNTIME_DIR` (mode 700) and waits up to 10 s for the socket before the smoke runs; the smoke
  unsets `DISPLAY`, keeps `WAYLAND_DISPLAY=wayland-blanc` and adds `--ozone-platform=wayland` through the
  fixture's `extraArgs`.
  The workflow (manual only, `ubuntu-24.04`, `permissions: contents: write` on the one job, as the
  Windows workflow explains): validate inputs; checkout without credentials; Node 22; fetch the pinned
  shipping commits; download the draft asset and check its SHA-256 and that the release is a draft;
  unpack; `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`; `apt-get install
  xvfb weston`; install the harness's npm dependencies exactly as the Windows workflow's "Install the
  harness's dependencies" step does; run the smoke under `xvfb-run -a` and under Wayland; when `suite` is `f0`, run
  `linux/run-suite.mjs` under `xvfb-run -a` at 1920×1080; upload the artifact. Every action
  SHA-pinned, as in the Windows workflow.
- [ ] **Step 4: Run** the tests and the fork unit suite; expect PASS. `actionlint` the workflow if
  available.
- [ ] **Step 5:** PR the workflow alone to `main` (approved; GitHub dispatches only default-branch
  workflows) and merge when checks pass. Merge Tasks 1–5 into `chromium/next` and push (verified fork
  work goes there without asking), so the scripts the workflow loads exist on that ref. Then
  `gh workflow run chromium-linux-candidate.yml --repo bnfy/blanc --ref chromium/next -f
  sha256=<Task 4's zip SHA-256> -f suite=none`; both smokes pass.
- [ ] **Step 6: Commit** `Fork: hosted Linux candidate run and smoke check (L0)`.

### Task 6: Full suite, records, close

**Files:**
- Create: `chromium/reports/f0-linux.json`, `chromium/scenarios/baseline-<candidate>.json`
- Modify: `chromium/STATUS.md` (a `## Linux` section with the L0 gate table), `chromium/PLATFORMS.md`
  (the `## Linux` section), `chromium/tracker.json`

- [ ] **Step 1:** Make sure the tracker entry from Task 4 is pushed to `chromium/next` (the runner
  refuses a candidate the tracker doesn't name), then run the workflow with `-f sha256=… -f suite=f0`;
  commit the report and baseline as W0 did; list failures by cause (expected: window buttons, L1).
- [ ] **Step 2:** STATUS `## Linux`: server, output, candidate, cold-build facts, gate table below with
  run ids. PLATFORMS `## Linux`: one line per difference found (build, data folder, window buttons
  pending L1, packaging pending L1, updater by apt/dnf, sandbox).
- [ ] **Step 3:** Mac and Windows unaffected: `check-patches.py` for both lanes; the fork unit suite;
  the before/after Windows plans differ only in targets the new source explains; if a `.gn`/`.gni`
  changed, regenerate both Windows outputs on the server and the Mac Studio's prototype and beta outputs
  with unchanged arguments (when no release or build is running), compare their plans the same way, and
  confirm the next nightly built from a source commit that includes this work.
- [ ] **Step 4: Commit** `Fork: Linux L0 recorded` (report, baseline, tracker, STATUS, PLATFORMS).
- [ ] **Step 5:** Merge into `chromium/next` and push.

## Exit gate (all must hold)

1. `check-patches.py` passes for both lanes; the fork unit suite passes; the next Mac nightly builds;
   the Windows outputs plan only the expected rebuild.
2. `progress.mjs --check` passes with a Linux candidate.
3. `chrome` for Linux x64 was built on the server through the guard, with no hooks run (or with the
   owner's recorded approval for one).
4. On a hosted `ubuntu-24.04` runner, under X11 and Wayland, as an ordinary user, the app launches
   sandboxed (every renderer seccomp-filtered in its own PID namespace, Ubuntu's restriction read back
   as on), the Island draws, the blocker reports ready and a page loads.
5. The full suite ran on Linux; `reports/f0-linux.json` and the baseline are committed, failures listed
   by cause.
6. STATUS has a Linux section and `PLATFORMS.md` lists the differences.

## Not in L0

Window buttons and frame, the data folder and every other identity name, `.deb`/`.rpm`, the repository and
its key, arm64, the beta channel, update notifications, the S1 triage, any website or public claim.
