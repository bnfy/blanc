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
  the last `0110-blanc-restore-pages-button.patch`, so this plan's first new patch is **0111**.
- Server checkout `~/chromium-desktop`: `.gclient` `target_os = ['win']` (no `target_os_only`),
  outputs `BlancWinPrototype` and `BlancWinBeta`, `build/linux/debian_bullseye_amd64-sysroot` present,
  marker `~/chromium-desktop/.blanc-synced`, applied map `~/chromium-desktop/.blanc-applied-source-map.json`.
  624 GB free.
- `chromium/tools/build.mjs`: `MAC_OUTPUTS`, `WINDOWS_OUTPUTS`, `outputName()`, `buildLane()`,
  `requireDesktopHost()`, `competingBuild()`, per-output lock `out/<name>/.blanc-build-guard.lock`.
- `chrome/common/chrome_paths_linux.cc:80` `GetDefaultUserDataDirectory()` picks the profile folder
  (`~/.config/chromium` for a Chromium build).
- `chromium/blanc/config.gni:51-57` `blanc_product_dir_name` per channel ("Blanc Chromium Preview" for
  the preview).
- `chromium/tests/lib/platform.mjs` already maps `linux`; `candidateIdentityFiles()` requires a
  framework (Mac) or a dll (Windows); Linux's browser is one `chrome` executable.
- `chromium/tests/runner.mjs:45` picks fork exclusions per platform (`macos`, `windows`).
- `chromium/blanc/island/host.js:5` already reports `linux`; the Island still draws its own window
  buttons on Linux (L1 changes that).

## Global constraints

- Linux builds only on `blanc-android-build`, only through `chromium/tools/build.mjs`, never while
  another `siso ninja` runs there, and never while the checkout lock is held.
- Never touch `~/chromium-android`, `~/depot_tools`, or the Windows outputs' `args.gn`.
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

1. **A Windows build or setup touching the checkout while Linux setup applies source** must be refused,
   not interleaved: the checkout lock (Task 1, Task 2).
2. **The Linux build reading or writing someone else's profile** (`~/.config/chromium`, shipping
   Blanc's `~/.config/Blanc`): a bare launch must use `~/.config/blanc-chromium-preview` (Task 3's test,
   Task 5's smoke).
3. **A launch that runs unsandboxed or falls back silently**: the smoke check reads every renderer's
   `/proc/<pid>/status` and fails unless each shows `Seccomp: 2` and a PID namespace different from the
   browser's (Task 5).
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
  `export function checkoutLocked(src: string, exists = fs.existsSync): boolean`.
- Consumes: existing `outputName`, `requireDesktopHost`, `WINDOWS_OUTPUTS`.

- [ ] **Step 1: Write the failing tests** in `build.test.mjs`:
  `outputName(['--out=BlancLinuxPrototype'])` returns it; `buildLane` returns the object above;
  `--sdk-root=` with the Linux output throws `/macOS option/`;
  `requireDesktopHost('BlancLinuxPrototype', 'darwin', 'arm64')` throws `/x86-64 Linux/` and
  `('BlancLinuxPrototype', 'linux', 'x64')` doesn't; `requireDesktopHost('BlancPrototype', 'linux', 'x64')`
  still throws; `checkoutLockPath('/h/chromium-desktop/src')` is `'/h/chromium-desktop/.blanc-checkout.lock'`;
  `checkoutLocked(src, p => p.endsWith('.blanc-checkout.lock'))` is `true`.
- [ ] **Step 2: Run** `node --test chromium/tools/build.test.mjs`; expect the new tests to FAIL.
- [ ] **Step 3: Implement** in `build.mjs`: `LINUX_OUTPUTS` joins the names `outputName` accepts and the
  usage line; `requireDesktopHost` treats Linux outputs like Windows ones (x86-64 Linux only);
  `buildLane` adds `chrome_sandbox` (the setuid helper the candidate launches with); a
  `linuxEnvironment(src, out)` records `host`, `clangRevision`, `clangVersion`, `sysrootHash` (the
  64-hex name of the single `.<hash>` marker file gclient's download hook leaves in
  `build/linux/debian_bullseye_amd64-sysroot/`, e.g. `.f851add7…`; throw unless exactly one) and
  `argsSha256`; export the name-picking part as `sysrootHash(entries: string[]): string` and test it;
  `main()` refuses every desktop output on Linux with
  `'The desktop checkout is locked (setup or apply in progress). No build started.'` while
  `checkoutLocked(src)`; on `--record-environment` the Linux summary line is
  `Linux sysroot <hash>`. No Linux candidate is auto-recorded (as for Windows).
- [ ] **Step 4: Run** the test file; expect PASS. Run the whole fork unit suite; expect PASS.
- [ ] **Step 5: Commit** `Fork: the build guard learns the Linux output and the checkout lock (L0)`.

### Task 2: Linux arguments and the server setup script

**Files:**
- Create: `chromium/linux/args/prototype-x64.gn`, `chromium/linux/server/setup.sh`,
  `chromium/linux/server/README.md`
- Modify: `chromium/windows/server/bootstrap.sh` (takes the same checkout lock around apply and `gn gen`)

**Interfaces:**
- Consumes: Task 1's lock path (`~/chromium-desktop/.blanc-checkout.lock`, a directory made with
  `mkdir`, removed on exit by `trap`).
- Produces: `out/BlancLinuxPrototype` generated from `chromium/linux/args/prototype-x64.gn`; evidence in
  `~/blanc-evidence/linux/`.

- [ ] **Step 1:** `prototype-x64.gn`: `target_os = "linux"`, `target_cpu = "x64"`, `is_debug = false`,
  `is_component_build = false`, `symbol_level = 0`, with a header comment in the style of
  `chromium/windows/args/prototype-x64.gn`.
- [ ] **Step 2:** `setup.sh [--dry-run]`, modeled on the Windows `bootstrap.sh` but never syncing:
  refuse anything but x86-64 Linux and root; require `~/chromium-desktop/.blanc-synced` to name the
  lane's upstream (else stop: "run the Windows bootstrap first"); require the amd64 sysroot folder
  (else stop: "a hooks run is needed; ask the owner"); refuse if `pgrep -f "[s]iso ninja"` finds a
  build; take the checkout lock (refuse if it exists); before applying, run the guard's `--check` for
  `BlancWinPrototype` and `BlancWinBeta` and save each "Dry-run scheduled actions" line to
  `~/blanc-evidence/linux/windows-plan-before.txt`; `apply.py --lane desktop` check, then `--apply
  --backup ~/blanc-evidence/linux/backups/apply-<UTC>` with `--previous-map`; record the applied map
  exactly as `bootstrap.sh` does; create `out/BlancLinuxPrototype/args.gn` (refuse a differing one) and
  `gn gen`; release the lock; run the Windows `--check`s again into `windows-plan-after.txt` and print
  both. `--dry-run` prints each step and changes nothing.
- [ ] **Step 3:** `bootstrap.sh` takes and releases the same lock around its apply and `gn gen` steps.
- [ ] **Step 4:** `README.md`: layout (shared checkout, the Linux output, evidence folder), the lock,
  the rule "no Linux setup or build while a Windows build runs or a Windows candidate is being
  prepared", how to rebuild.
- [ ] **Step 5:** `shellcheck` both scripts if installed; run `bash chromium/linux/server/setup.sh
  --dry-run` on the server from `~/blanc-desktop` at this branch; expect the plan printed and nothing
  changed (`git -C ~/chromium-desktop/src status --porcelain` identical before and after).
- [ ] **Step 6: Commit** `Fork: Linux arguments and the server setup script (L0)`.

### Task 3: First build, data folder, and compile fixes

**Files:**
- Create: `chromium/patches/0111-blanc-linux-data-folder.patch` (and its lane entry)
- Modify: `chromium/blanc/config.gni` (a Linux folder name per channel), `chromium/lanes/desktop.json`,
  files under `chromium/blanc/` as compile errors require
- Test: `chromium/tools/linux-identity.test.mjs`

**Interfaces:**
- Produces: GN variable `blanc_linux_product_dir_name`: `"blanc"` (release), `"blanc-chromium-preview"`
  (preview), `"blanc-beta"` (beta); a bare Linux launch's profile is
  `$XDG_CONFIG_HOME` (default `~/.config`) + that name.

- [ ] **Step 1: Write the failing test** `linux-identity.test.mjs`: parses `config.gni` and asserts the
  three names above; asserts none equals `chromium`, `google-chrome` or `Blanc` (shipping's folder);
  asserts patch 0111 touches only `chrome/common/chrome_paths_linux.cc` and its BUILD file, and that
  every hunk it adds is inside `BUILDFLAG(IS_LINUX)` code or an `is_linux` block.
- [ ] **Step 2: Run** it; expect FAIL.
- [ ] **Step 3:** add `blanc_linux_product_dir_name` to `config.gni`; write patch 0111 so
  `GetDefaultUserDataDirectory()` uses it (a define from a `config()` in the BUILD file, the pattern of
  patch 0094); add it to the lane; run `check-patches.py` and the test; expect PASS.
- [ ] **Step 4:** On the server: `setup.sh` (real run), then
  `node chromium/tools/build.mjs ~/chromium-desktop/src --record-environment --out=BlancLinuxPrototype`,
  `--check`, and the approved cold build `--build --allow-large-build --out=BlancLinuxPrototype` in a
  tmux session, logged to `~/blanc-evidence/linux/cold-build-1.log`.
- [ ] **Step 5:** For each compile error: fix in `chromium/blanc/` or a small patch behind
  `IS_LINUX`, rerun `setup.sh` and the guard (`--build`), next log number. If the error is a missing
  dependency that only `gclient` hooks would fetch, stop and report to the owner with the log line.
- [ ] **Step 6:** Commit `Fork: Linux data folder and the first Linux build (L0)` (one commit for the
  patch, config and any compile fixes; the log stays on the server).

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
  existing case id, every reason names an owner decision or a V-number, and that it contains exactly the
  Windows exclusions whose reasons hold on every platform (the 1Password, Reading Mode, Dark Reader,
  updater, V12, V18 and quiet-tabs rows), not the Windows-only ones (caption buttons, icon catalog,
  Windows Hello, the Arc row). `run-suite.test.mjs` mirrors the Windows `suiteArguments` tests.
- [ ] **Step 2: Run** them; expect FAIL.
- [ ] **Step 3: Implement.** `linux-smoke.mjs --display=x11|wayland CANDIDATE_DIR RESULTS_DIR`:
  launch the candidate through the harness with a fresh profile under a temporary `HOME`; assert the
  profile folder is `$HOME/.config/blanc-chromium-preview` and no `$HOME/.config/chromium` appears;
  Island target present; blocker reports `ready`; the fixture page loads; every renderer's
  `/proc/<pid>/status` has `Seccomp:\t2` and `/proc/<pid>/ns/pid` differs from the browser's; screenshot;
  write the JSON. For `wayland` start `weston --backend=headless --socket=wayland-blanc` first, unset
  `DISPLAY`, set `WAYLAND_DISPLAY=wayland-blanc` and pass `--ozone-platform=wayland`.
  The workflow (manual only, `ubuntu-24.04`, `permissions: contents: write` on the one job, as the
  Windows workflow explains): validate inputs; checkout without credentials; Node 22; fetch the pinned
  shipping commits; download the draft asset and check its SHA-256 and that the release is a draft;
  unpack; `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`; `apt-get install
  xvfb weston`; run the smoke under `xvfb-run -a` and under Wayland; when `suite` is `f0`, run
  `linux/run-suite.mjs` under `xvfb-run -a` at 1920×1080; upload the artifact. Every action
  SHA-pinned, as in the Windows workflow.
- [ ] **Step 4: Run** the tests and the fork unit suite; expect PASS. `actionlint` the workflow if
  available.
- [ ] **Step 5:** PR the workflow alone to `main` (approved; GitHub dispatches only default-branch
  workflows), merge when checks pass; run it with `--ref chromium/next -f suite=none`; both smokes pass.
- [ ] **Step 6: Commit** `Fork: hosted Linux candidate run and smoke check (L0)`.

### Task 6: Full suite, records, close

**Files:**
- Create: `chromium/reports/f0-linux.json`, `chromium/scenarios/baseline-<candidate>.json`
- Modify: `chromium/STATUS.md` (a `## Linux` section with the L0 gate table), `chromium/PLATFORMS.md`
  (the `## Linux` section), `chromium/tracker.json`

- [ ] **Step 1:** Run the workflow with `suite=f0`; commit the report and baseline as W0 did; list
  failures by cause (expected: window buttons, L1).
- [ ] **Step 2:** STATUS `## Linux`: server, output, candidate, cold-build facts, gate table below with
  run ids. PLATFORMS `## Linux`: one line per difference found (build, data folder, window buttons
  pending L1, packaging pending L1, updater by apt/dnf, sandbox).
- [ ] **Step 3:** Mac and Windows unaffected: `check-patches.py` for both lanes; the fork unit suite;
  `windows-plan-after.txt` shows only the rebuild the new source explains; if a `.gn`/`.gni` changed,
  regenerate the Mac Studio's GN files with unchanged arguments when no release or build is running,
  and confirm the next nightly builds.
- [ ] **Step 4:** Merge to `chromium/next`; push.
- [ ] **Step 5: Commit** `Fork: Linux L0 recorded`.

## Exit gate (all must hold)

1. `check-patches.py` passes for both lanes; the fork unit suite passes; the next Mac nightly builds;
   the Windows outputs plan only the expected rebuild.
2. `progress.mjs --check` passes with a Linux candidate.
3. `chrome` for Linux x64 was built on the server through the guard, with no hooks run (or with the
   owner's recorded approval for one).
4. On a hosted `ubuntu-24.04` runner, under X11 and Wayland, the app launches sandboxed (every renderer
   seccomp-filtered in its own PID namespace, Ubuntu's restriction left on), the Island draws, the
   blocker reports ready, a page loads, and the profile is `~/.config/blanc-chromium-preview`.
5. The full suite ran on Linux; `reports/f0-linux.json` and the baseline are committed, failures listed
   by cause.
6. STATUS has a Linux section and `PLATFORMS.md` lists the differences.

## Not in L0

Window buttons and frame, identity names beyond the data folder, `.deb`/`.rpm`, the repository and
its key, arm64, the beta channel, update notifications, the S1 triage, any website or public claim.
