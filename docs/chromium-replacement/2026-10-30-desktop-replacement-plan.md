# Blanc on Chromium: desktop replacement implementation plan

Status: **owner-approved execution contract** at `e884a6564`, with subsequent owner clarifications. Authorized now: F0.1–F0.6 and F0.8 including their incremental builds. D7, F0.7, cold builds, new platform machines, D1–D6, D8 and V2 remain separate pending decisions. No merge or release authorization.
Companion: [product specification](2026-10-30-desktop-replacement-spec.md). Task IDs below are referenced from the spec's matrix.

## 1. Why the work stalled, and what changes

**Evidence of churn (counted 2026-10-30 in the synced `Chromium Preview` folder):**
- **Files and storage:** the spike folder holds 14,014 files, 11,632 of them evidence across 547 dated folders. Another 84,598 evidence files (4.1 GB) and 2.1 GB of artifacts sit outside the repo.
- **Commits:** 411 commits touch the spike since October 15.
- **Status log:** `CONTINUATION.md` has 216 status sections, 124 of them headed October 30 alone. Each repeats the same boilerplate ("Electron paused, Google baseline separate, latency deferred").
- **Draft generations:** drafts are kept as numbered copies (Downloads `native-controller-v2`…`v10`, Glance `integration-*-v10`…`v15`). Many are syntax-checked but never built or run.
- **Result:** at least 11 features are drafted, and about 7 are built only in isolated candidates. Little of it reaches the running build.

**Causes (none of them carelessness):**
1. **The goal set breadth with no order or finish line.** "As many features as possible" plus a bar that counts only three-platform verification meant the bar could not move. So progress was reported as ever-smaller scoped checks.
2. **Integration was the expensive step, so it was deferred.** Several factors made every integration a negotiation:
   - Per-build approvals.
   - Live-scope build guards.
   - An agent may not quit the open dev instance, so every refresh needed an owner close and a profile backup.
   - A selected-search check required an offline VM that does not exist.
   Drafts accumulated behind it.
3. **Evidence became the product.** SHA receipts and prose summaries for every micro-step cost more than the change itself, and they do not prove user-visible behavior.
4. **Architecture forces churn.** Upstream edits live as anchored string replacements in `prepare.mjs`, the Island talks to native code through one untyped `chrome.send` dispatcher, and there is no fork CI. So every change needs a native build and a hand-run fixture.

**What changes (the operating contract in §2):**
- Fixed slice order.
- One canonical source tree and one candidate.
- Shipping's own acceptance scenarios as the measure of parity.
- A standing build envelope instead of per-build approvals.
- Small, overwritten status instead of an append-only log.

## 2. Operating contract for Codex (applies to every task)

1. **One canonical tree.** All fork code lives under `chromium/` on one integration branch (task F0.2). Fix or abandon a draft; never copy it to `-v2`. Git history is the version record. `experiments/chromium-extension-spike/` is frozen as history and gets no new files.
2. **One candidate.** There is exactly one current candidate build per platform. Changes land in the canonical tree first, then a build. No isolated side candidates, except a bisect when a regression must be located.
3. **Work in slices, in order (§5), with at most two features in progress.** A feature is done when its rows reach *Integrated* and their scenarios pass on macOS. Then the next feature starts. Windows and Linux verification follows per slice, not per feature.
4. **Tests are the evidence.**
   - A row is proven by named automated checks: shipping scenarios run against the fork, Chromium `browser_tests`/`interactive_ui_tests`, or unit tests. Each check's result is a CI or runner artifact.
   - Write no prose evidence README per check. Keep only one acceptance report per slice per platform, generated from test output.
   - Manual checks (screen readers, physical input, visual comparison) run once per slice per platform from a checklist.
5. **Build cadence.**
   - Batch changes and build at most a few times a day.
   - Never rebuild just to re-prove a passed check.
   - Within the standing envelope (decision D7), Codex builds without asking. Outside it (cold build, toolchain/SDK change, GN args change, new machine), Codex asks once with the exact scope.
6. **Status is small and overwritten.**
   - `chromium/STATUS.md`, at most 150 lines, replaced (not appended) at the end of each work session. It lists the current candidate, slice, rows that moved, blockers and next step.
   - The tracker (`chromium/tracker.json` → rendered table) changes only when a row changes state.
   - Don't repeat standing constraints in every entry; they live here.
7. **Ask at boundaries, not mid-step.** Questions to the owner go in a batch at slice start or end, unless something destructive or security-sensitive is at stake. Already-decided matters (this plan, §9 answers) are not re-asked.
8. **Dev instance.**
   - The owner's dev instance on the Mac mini is refreshed at slice exits, and when the owner asks.
   - The owner closes it normally; Codex backs up the closed profile, installs the candidate and relaunches it.
   - Between refreshes, Codex tests in its own isolated profiles. It never quits, restarts or modifies the owner's instance.
9. **Preserve, don't proliferate.**
   - Keep the 157 fallback until the first canonical build passes the S1 smoke (then ask once to retire it).
   - Keep the signed preview masters, build caches, the owner's profiles and tabs, and the separate Google baseline (never modified).
   - Raw evidence stays on the Mac mini outside the repo. After owner approval at F0.1, keep only the last two candidates' raw output.
10. **Standing pauses.** Electron product work stays paused, except the bridge release in task R.6, which needs owner go-ahead then. Latency work stays deferred.

## 3. Current state audit (what is actually true)

Machines:
- **Mac mini (build machine):** native checkouts (`BlancChromium158`, 157 recovery), `out/BlancPrototype`, Siso caches, signed preview artifacts, the owner's dev instance, raw evidence.
- **Other Macs:** only the synced `Chromium Preview` folder and the git branch. No native build exists on them.

| Layer | State | Evidence available remotely? |
| --- | --- | --- |
| Shipping reference | v1.45.1 / `85883b1a`, verified 2026-10-30 | Yes (GitHub release, tag) |
| Fork branch | `codex/f12-socket-speculation` @ `d63b6d4c0`. Committed through `38cc0061` plus two handoff commits. Extensive uncommitted work on the Mac mini | Branch yes; uncommitted work only as curated snapshots in `handoff-20261030/` |
| Chromium versions | 158.0.8127.2 candidate (signed source `0353d3e3`, archive `08e34d60…`). 157.0.8103.15 fallback (signed `73217ee5`) | Records yes; binaries Mac mini only |
| Patch set | 78 upstream files / 170 hunks + 23 added files, applied as anchored edits by `prepare.mjs` (which still pins 157). The 158 adaptation lives only in the rebase bundle | Yes (`rebases/158.0.8127.2/`) |
| Island/UI | WebUI view (`chrome://blanc-prototype/host.html`) in `BrowserView`; native strip/toolbar hidden. Dev shell runs the reviewed 1.38 renderer; the 1.44.1 renderer is staged, not active. Assets disk-served via `--blanc-prototype-assets` | Source yes |
| Blanc Blocker | Network (sandboxed V8 Ghostery utility, fails closed) + cosmetic/scriptlets built. Site actions/provider choice drafted | Source yes |
| macOS | Signed + notarized Apple Silicon **preview** (bundle `me.bnfy.blanc.chromium.preview`, minimum macOS 26). Owner L12 GO covers only that exact evaluation candidate. No Intel build. No updater (manual replacement) | Records yes |
| Windows | **Nothing built.** A first-build plan draft exists; the Parallels VM is suspended and failed to start | — |
| Linux | **Nothing built** | — |
| Extensions | Web Store install/update proven on 156/157 (L4 accepted Oct 28: real 1Password update). Store pages render on 158; install on 158 untested | Records yes |
| Migration | No general Electron profile importer. Sync-credential migration primitives (snapshot, backup codec, Keychain source provider, legacy parser) pass synthetic unit tests and are unintegrated | Snapshots yes |
| Sync | Native exchange/queue pieces pass isolated synthetic tests; no app integration; remote tabs and Spaces lists are placeholders | Snapshots yes |
| CI | None for the fork. Electron/site workflows only | — |
| Tracker | 57 rows, 0 verified on three platforms. The committed `PROGRESS.md` says 17 partial / 8 gaps / 32 unassessed (v1.45.0 reference). The handoff inventory says 25 / 12 / 20 (v1.45.1). Use the handoff numbers; the committed file is stale | Yes |
| Processes | Recorded: dev instance PID 9492 and an SDK 27.2 zoom build (PID 26367) on the Mac mini. **Not re-verified for this plan** (no access from this Mac) | — |

Known recorded blockers:
- **Selected-search outbound isolation.** Waiting on an offline VM nobody has chosen. This plan replaces that requirement with a recording-proxy check (S1.1).
- **SDK 27.0 vs 27.2 drift.** Folded into the F0.7 decision.
- **Unexplained real-Keychain stall.** Re-tested after F0.3, because the identity change touches Keychain items.
- **Combined-candidate promotion hold.** Superseded by the one-candidate rule.

## 4. Progress model and display

Two bars replace the single "0/57" bar. Both are generated by `chromium/tools/progress.mjs` from `chromium/tracker.json` and test results; both are honest by construction.

**Bar A: executable shipping cases passing on the fork, per platform.** The shipping acceptance suite (578 declarations expanding to 627 executable cases at v1.45.1) runs against the fork through the fork test hook (F0.5). Example:
```
macOS   ███████░░░░░░░░░░░░░  212/627 executable cases pass
Windows ░░░░░░░░░░░░░░░░░░░░    0/627 (no build)
Linux   ░░░░░░░░░░░░░░░░░░░░    0/627 (no build)
```
This bar moves with real user-visible behavior, and any regression drops it. Scenarios that only make sense on Electron are tagged and excluded with a reason. Each excluded case is listed. By owner direction, the displayed total stays 627, including explicit exclusions; applicable, undefined and excluded counts remain separate.

**Traceability (required before Bar A is reported).** The F0.5 baseline is a committed file, `chromium/scenarios/baseline-<platform>-<candidate>.json`. Each declaration entry and its executable example results record:
- Scenario ID, feature file and line at the shipping tag.
- The spec row(s) it verifies.
- Shipping tag and SHA, fork commit, candidate build ID and platform.
- Result: pass, fail, or excluded with a reason.

Rules for counting:
- A scenario counts only if it maps to at least one spec row; unmapped scenarios are listed separately.
- A pass counts toward a row's *Verified* state only on that row's own platform candidate.
- The rendered bar links each number to its baseline file.
- Changing a scenario's mapping or exclusion needs a one-line reason in the commit.

**Bar B: requirement rows by state (79 rows: 57 tracked + 22 new from spec §5.2).** A stacked count per state from spec §3. Example:
```
Implemented 31 · Integrated 25 · Verified macOS 0 · Verified Windows 0 · Verified Linux 0 · Release-ready 0 / 79
```
**Baseline today**, from the spec matrix, macOS, 57 rows:

| State | Rows | Meaning |
| --- | --- | --- |
| Integrated (partial) | 18 | In the running dev build, contract incomplete |
| Built, isolated candidate | 7 | Not in the dev build |
| Drafted | 11 | Not built |
| Research only | 1 | uBO |
| Not assessed | 20 | — |

Windows and Linux have nothing built. The 22 new rows are unassessed. **Bar A has no baseline yet**; F0.5 produces it.

**Rebaseline rule.** At each Blanc release, record the new tag and SHA, then diff the matrix, settings defaults, `copy` and the release notes. Mark affected rows *re-check*, and re-run the scenario suite at the new tag (new or changed scenarios appear automatically). One STATUS entry per release.

## 5. Slices (dependency order)

```
F0 Foundation ──► S1 Daily driver (Mac) ──► S2 Identity & data ──► S3 Organization ──► S5 Remaining ──► Beta ──► Replacement
      │                 │                         │                        ▲
      │                 └──► S1 verify Win/Linux  └──► S4 Sync ────────────┘
      ├──► PW Windows bring-up ─┐
      ├──► PL Linux bring-up ───┼──► (each later slice verified on all three)
      └──► PM Intel Mac (D8) ───┘
R Release engineering runs alongside S2–S5; M (migration importer) runs alongside S1–S2.
```

### F0 Foundation (Mac mini; unblocks everything)

| Task | Work | Depends | Output | Acceptance |
| --- | --- | --- | --- | --- |
| F0.1 | Freeze the spike. Write `chromium/README.md` with this contract. Ask the owner once to archive (compress, not delete) evidence older than the 158 candidate | — | Frozen folder, archive on Mac mini | No new files in the spike after this commit |
| F0.2 | **Canonical tree.** Create `chromium/blanc/` (new files, built as `//blanc` in Chromium), `chromium/patches/NNNN-*.patch` (git-format upstream edits generated from the 158 rebase bundle, not anchors), and `chromium/tools/{sync,apply,build,test}`. For each feature choose **one** draft generation from `review-material/` and the Mac mini working tree, recording the choice in the commit message; drop the rest | — | Builds the same product as the current dev candidate | Applies cleanly to pinned Chromium; smoke scenarios match the current dev build |
| F0.3 | **Release identity.** Two channels: `dev/preview` (current bundle ID) and `release` (`me.bnfy.bowser`, "Blanc", same team), each with its own data directory. Set the macOS minimum per D8. Re-test Keychain Safe Storage under the new identity. **Identity spike:** on a separate test macOS user account (never the owner's), install a release-identity fork build over a signed Electron v1.45.1 that already holds camera/mic grants, a default-browser choice and a Dock pin. Record every spec §8.1 outcome as observed. Internal signing only; nothing distributed | F0.2 | Channel config; identity spike report | Both channels launch; Keychain item created once, no stall in 10 relaunches. Each §8.1 macOS outcome is recorded as observed, never as inferred. Failures become R.6 work items |
| F0.4 | **Tracker rebuild.** `chromium/tracker.json` with 79 rows, spec §3 states, test IDs per row; `progress.mjs` renders both bars; replace `PROGRESS.md` | F0.2 | Tracker + renderer | Renderer `--check` passes in CI |
| F0.5 | **Fork test hook + scenario runner.** `--blanc-test` (dev builds only, compiled out of release) exposes state over CDP like shipping's `__blanc`. Add a fork step library for `spec/acceptance` plus a portable subset of shipping `test:*:desktop` scripts. First full run gives the Bar A baseline | F0.2 | Runner + baseline report | Runs unattended; JUnit output; Electron-only scenarios tagged with reasons |
| F0.6 | **Release hygiene groundwork.** Compile assets into the resource pak (remove disk serving from release builds). Generate a typed Mojo interface from `browser-api/contract.json` and migrate handlers to it feature by feature (new code uses it from now on) | F0.2 | Pak assets; Mojo interface | Release build has no `--blanc-prototype-assets` path; contract check passes |
| F0.7 | **Rebase target per D6.** Move to the chosen Chromium stable/extended-stable branch with the canonical tree. **Expensive: one cold build**, combined with the SDK choice so the toolchain changes once | F0.2, D6 | New base candidate | Zero-action guard; F0.5 suite equal or better than before |
| F0.8 | **Fork CI.** Hosted jobs:<br>• Patch apply-check against vendored pristine copies of the touched upstream files (~100 files, no full checkout)<br>• JS/asset unit tests<br>• Copy/adblock checks<br>• Tracker check<br>Self-hosted Mac mini job: nightly build + scenario run | F0.2 | Workflows | Required on the fork PR |

### A Decision assessments (after F0.5; inputs to D1 and D2)

| Task | Work | Output |
| --- | --- | --- |
| A.1 | Private model comparison: run every shipping `@F4-*` scenario and the spec §6.1 private-trace scan under incognito windows (prototype) and list what in-window private tabs would require (files, patch size, risks) | One-page comparison for D1 |
| A.2 | Blocker comparison: Blanc Blocker (fork) vs uBO Lite (Web Store, fork) vs full uBO (Electron v1.45.1) on the shipping blocker fixtures and a fixed 50-site list; confirm MV2 status in the target branch | One-page comparison for D2 |

### PW / PL / PM: platform bring-up (start right after F0.2, in parallel)

| Task | Work | Depends | Acceptance |
| --- | --- | --- | --- |
| PW.1 | Windows x64 build host per D4; first cold build of the canonical tree. **Expensive** | F0.2, D4 | App launches, Island renders, blocker loads, F0.5 runs |
| PW.2 | Windows frame/window controls, high-DPI, Default Programs registration (port `installer.nsh` logic), installer, Authenticode via the existing Azure Trusted Signing | PW.1 | Settings → Default apps lists Blanc; signed installer verifies |
| PL.1 | Linux x64 build host per D4; first cold build. **Expensive** | F0.2, D4 | As PW.1, on X11 and Wayland |
| PL.2 | AppImage packaging, desktop entry (`Network;WebBrowser`, http/https handlers), PipeWire capture | PL.1 | AppImage launches on Ubuntu LTS and Fedora; desktop entry validated |
| PM.1 | Intel Mac output (cross-compile on the Mac mini) if D8 keeps Intel | F0.7, D8 | Launches on an Intel Mac or hosted `macos-15-intel` |

Platform code goes through the same canonical tree. Per-platform differences are recorded in `chromium/PLATFORMS.md`, one line each.

### S1 Daily driver (macOS first; then verify on Windows and Linux)

Goal: the owner can use the Mac candidate as their primary browser for a week, keeping Electron for the listed gaps (entry criteria below).

| Task | Rows | Work (key points) | Acceptance |
| --- | --- | --- | --- |
| S1.1 | F5, F47, N21, N6 | Integrate the selected-provider search candidate and the Bangs overlay into the canonical tree; `TemplateURLService` engines with DuckDuckGo default and custom `%s`; suggestion policy; OS hand-off lists. **Outbound-isolation check, replacing the offline-VM requirement (owner approval needed for the OS firewall rules):**<br>1. A recording proxy is the only permitted egress. The browser is launched with explicit proxy settings and a controlled DNS resolver.<br>2. Every other path is *independently* blocked at the OS, so a bypass fails instead of slipping past the proxy: a pf anchor for the test user on macOS, a network namespace on Linux, outbound firewall rules for the test binary on Windows. This covers direct TCP, UDP/QUIC, DNS, DoH/DoT, WebRTC/STUN and IPv6.<br>3. The OS block's own log is collected next to the proxy log.<br>4. Negative controls run in every session: deliberate direct TCP, QUIC, DNS, DoH and STUN attempts from a fixture page and from a native test hook must each be blocked and appear in the OS log. If any control is not observed, the run is invalid | `@F5-*`, `@F47-*` pass. Proxy and OS logs together show only the chosen engine. The OS log shows no unexplained blocked attempt (any attempt is a failure to investigate). Private and credential-like input never leave. All negative controls observed |
| S1.2 | F1, F6, F7, F8, F15, F23, F37, F44, N19 | Activate the 1.44.1+ renderer (then current release), Shield hit-region fix, all 34 slash commands wired (deferred features answer with shipping's unavailable copy until their slice), Find, zoom, theming, language pick with relaunch, copy link/clean link | Their scenarios; shortcut table test (spec §5.3); VoiceOver pass on Island surfaces |
| S1.3 | F2, F3, F18, F32 | Tab/group semantics over native models (ungrouped placement, pins lead groups, reopen tiers), multiple windows, session restore with meta columns | Scenarios; crash + clean-quit restore |
| S1.4 | F4 | Private model per D1 | `@F4-*`; profile scan after quit finds no private trace |
| S1.5 | F9, F10, F11, F16 | Favorites, History, Downloads as the shipping utility **sheet** over native models | Scenarios |
| S1.6 | F12, F13, F19, F20, N4, N5, N8, N22 | Shield site actions (document-bound, POST-safe reload), permission policy and Island-anchored prompts, context menu items, HTTP auth refusal, certificate page, secure DNS/WebRTC policy, startup navigation gate | Scenarios; per-permission browser_tests; 401/407 fixture |
| S1.7 | F14 | `chrome://settings` restyled: remove Google, Sync and Safety Check sections; add Blanc sections; every v1.45.1 key and default | Generated key-by-key check against `settings.js` DEFAULTS |
| S1.8 | F35 | Start Page on the current release's assets: blocked-count data, pins, layouts | Scenarios |
| S1.9 | — | **Privacy baseline** (spec §6.1): disable Google services by build flags/prefs | 10-minute capture shows no Google traffic |
| S1.X | — | **Exit:** S1 scenarios pass on macOS, then the owner dogfoods (entry criteria below), then the same suite runs on Windows/Linux candidates (after PW.1/PL.1) | Slice report per platform; dogfood log |

**Dogfood entry criteria (all must hold before the owner switches):**
1. **Data protection.**
   - The owner's Electron profile is backed up while Electron is closed, and the backup's checksum is recorded.
   - The fork reads it only through the M.2 importer, which never writes the source.
   - The fork uses its own dev/preview data directory and bundle ID, not the release identity.
   - Electron stays installed and usable throughout.
2. **Real data available.** M.2 has imported the owner's Favorites, History, settings and open session into the fork, and the import was verified against the backup.
3. **Essential workflows pass their scenarios on the candidate:**
   - Open, close, switch and reopen tabs; groups; session restore after quit and after crash.
   - Typed addresses and search with the chosen engine; Bangs.
   - Favorites and History lookup, Quick Switcher.
   - Downloads.
   - Blocking on by default with per-site allow.
   - Private browsing (per the D1 model or the prototype).
   - Settings changes persist.
   - Password filling through at least one path the owner uses (Chromium password manager or the 1Password extension).
   - Site sign-ins work after signing in again.
4. **Known gaps listed up front.** The S2–S5 features not yet present (for example Spaces, Sync, Glance, Split View) are listed, and the owner keeps using Electron for them.

The milestone is "primary browser, with Electron for listed gaps", not "only browser". Each gap hit during dogfood is logged in the slice report, not fixed ad hoc.

### M Migration importer (alongside S1–S2; mostly independent code)

| Task | Work | Depends | Acceptance |
| --- | --- | --- | --- |
| M.1 | Fixture profiles: generate Electron profiles for v1.40–current on each platform (scripted, synthetic data), plus a redacted copy of a real profile shape | — | Fixtures in CI storage |
| M.2 | Read-only importer per spec §7 table, running in the browser process before profile load, all-or-nothing per profile, marker, retry | F0.3 | Every fixture imports; Electron dir byte-identical after |
| M.3 | Sync key and Patron key re-wrap (integrate the existing credential-migration drafts) using the real `Blanc Safe Storage` item | M.2, S4 start | Real-account check with backup first |
| M.4 | Site data per D5 | M.2, D5 | Per D5 |

### S2 Identity, data and first run

| Rows | Work |
| --- | --- |
| F33, F17, F21, F36, F51, F30, N7, N10, N11 | Profiles (Personal = Default), icons and Patron, telemetry with consent gate, onboarding, What's New, Favorites import, Touch ID passkeys (entitlements and provisioning profile on the release channel), default-browser status and reminder, moving-in checklist |

Exit: fresh-install and migrated-install scenarios pass on all three platforms.

### S3 Organization

| Rows | Work |
| --- | --- |
| F41, F53, F34, F31, F52, F28, F46, F48, F59, F60, N1, F45, F40, N20, N13 | Spaces as Blanc data restored through native sessions; Split View (native 2-pane); Glance (pick **one** of the existing generations at F0.2 and finish it); Quiet Tabs (integrate the tested candidate); Archive; vertical rail; custom names; pinned homes; Ctrl+Tab recent order (Linux/Windows; Mac stays positional as shipping); link routing; Recently closed band; Arc import; Bring Your Tabs; handoff pages; site mute and page tint |

Exit: S3 scenarios on all three platforms; the real-key shortcut suite on Windows and Linux.

### S4 Sync (may start once S2 profiles land)

| Rows | Work |
| --- | --- |
| R2, F27, F57, R3, N9 | Run shipping `sync.js`, `sync-crypto.js` and the Shared Spaces and Tab Sync models in the sandboxed V8 runner (reuse the proven blocker and Sync-runner pattern; integrate the existing native exchange drafts as the transport); keys via OSCrypt; passphrase-free setup and recovery; device pairing and iPhone QR; send to device; v1.45.1 status rules |

Exit: cross-implementation check, with an Electron device and a fork device syncing both ways against the production Worker on a test account. iPhone pairing check.

### S5 Remaining features and decided exceptions

| Rows | Work |
| --- | --- |
| F58, F42, N2, N3, F49, F50, F54, R1, N12, N14, N15, N17, F38/X1 per D2, X2 per D3 | Reader; Dark websites in an isolated world with fetch broker; capture indicator and screen-share picker; wallpapers (switch the image store to a profile file as shipping does); clock; Sunrise; Mahjong; gestures; local HTML preview; Invite; then whatever D2 and D3 decide |

### R Release engineering (alongside S2–S5)

| Task | Work | Acceptance |
| --- | --- | --- |
| R.1 | macOS: Sparkle 2, EdDSA appcast on GitHub Releases, notarized zip + dmg, both arches per D8 | Update and rollback rehearsal between two signed builds |
| R.2 | Windows: signed installer, updater service/task, same "Restart Now" UX | Rehearsal on a clean VM and an upgraded one |
| R.3 | Linux: AppImage self-update against the signed manifest | Rehearsal |
| R.4 | Release pipeline: one script on the shipping `release.sh` model (immutable versions, SBOM, `SHA256SUMS`, Sigstore, provenance), per-platform signing, staged rollout flag, withdrawal flag | Dry run to a draft release |
| R.5 | **Security update runbook:** branch rebase per D6, affected-only checks, SLA in spec §6.2, suspend rule | One full rehearsal rebase timed |
| R.6 | **Bridge Electron release** (needs owner go-ahead, unpauses Electron for this one task): `electron-updater` installs the fork; staged percentage; Electron data untouched | Electron → fork → rollback → fork on each platform |
| R.7 | Trust receipt, About, diagnostics export, Check for updates, Dock menu, app badge (N16, N18) | Scenarios |

### Beta and replacement

1. **Beta channel:** opt-in from Settings in Electron (bridge release) plus direct downloads. It runs through at least one fork rebase cycle.
2. **Replacement:** every spec §10 gate passes. The owner approves. Staged rollout 5% → 25% → 100%, with automatic pause when crash or withdrawal signals appear.
3. Electron stays downloadable and security-patched for a period the owner sets at that time.

## 6. Parallel work and expensive builds

**Safe parallelism.** Each stream works in its own worktree and integrates through the canonical tree:
- F0 then {PW, PL, PM} on separate machines.
- M alongside S1.
- R.1–R.4 alongside S2–S5.
- Within a slice, features with disjoint files (for example S1.5 sheets and S1.7 Settings).

At most two Codex sessions write to the fork tree at once.

**Expensive builds, each needing the owner's one-time go-ahead with exact scope:**
- F0.7 rebase cold build.
- PW.1 and PL.1 first builds.
- PM.1 Intel output.
- Each security rebase (R.5 cadence).

Everything else is incremental within the D7 envelope. Keep the existing guard (zero-action re-check, cache preservation, no cleans, no silent toolchain changes) but stop asking per incremental build.

## 7. Risks to watch

| Risk | Mitigation |
| --- | --- |
| Private-tab model (D1) forces deep `TabStripModel`/profile patches | Decide D1 first; keep the patch isolated in `chromium/blanc/private/` |
| Windows/Linux reveal large platform gaps late | Bring-up starts right after F0.2, before S1 completes |
| No DRM at replacement (D3) breaks streaming for users | Keep Electron available; per-site notice; or wait for VMP per D3 |
| Patch set grows with each feature | `chromium/patches` budget report in CI; prefer `//blanc` code plus delegates over edits |
| Chromium release cadence outpaces one maintainer | D6 channel choice; R.5 runbook; suspend rule |
| Migration loses data | Read-only source, fixtures for every version, real-profile check with backup |
| Scenario port gaps hide missing behavior | Excluded scenarios listed with reasons; spec §5.2 rows reviewed each release |

## 8. Proposed replacement goal for Codex

> Replace shipping Electron Blanc with the Chromium fork on macOS, Windows and Linux by following `docs/chromium-replacement/2026-10-30-desktop-replacement-plan.md` and its spec. The latest published Blanc release is the product reference; rebaseline at each release as the plan describes. Work the slices in order, with at most two features in progress, under the operating contract in §2:
> - One canonical tree and one candidate.
> - Shipping scenarios and Chromium tests as the evidence.
> - A small, overwritten STATUS.md.
> - Builds inside the approved envelope.
>
> Report progress with the two bars in §4 at each slice boundary. Stop and ask only at slice boundaries, for the expensive builds listed in §6, or when a change is destructive, security-sensitive or contradicts the spec. Never quit or modify the owner's dev instance; refresh it at slice exits after the owner closes it.

## 9. Owner decisions needed (only these)

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | **Private tabs model** | (a) Chromium incognito **windows** with Blanc's private theme and chip; private tabs no longer mix into normal windows. (b) Port in-window private tabs (deep, risky patching of tab and profile ownership) | Leaning **(a)** for speed and safety, but **not decided**. Before asking, Codex delivers task A.1: a side-by-side comparison of every shipping `@F4-*` behavior under (a) and (b), listing each behavior that (a) would change. Until the owner decides, S1.4 is blocked and no private-model code lands |
| D2 | **Optional uBO provider and 1Password fill: built in, or Web Store extensions?** Blanc Blocker stays the default blocker in every option; this decision only concerns the optional uBO provider and the 1Password bridge | (a) Offer uBO Lite (MV3) and the 1Password extension from the Chrome Web Store, with a one-time notice for uBO users. (b) Restore MV2 in the fork for full uBO and keep the SDK bridge | Leaning **(a)**, but **not decided**. Before asking, Codex delivers task A.2: run uBO Lite and full uBO (Electron) against Blanc Blocker on the same blocker fixtures and a fixed site list (blocked counts, cosmetic coverage, breakage, private-window behavior, update path), and confirm whether MV2 can still be restored in the target Chromium branch. Until the owner decides, X1 and F38 stay required |
| D3 | **Widevine at replacement** | (a) Wait for castLabs VMP certification before replacing. (b) Replace without DRM, keep Electron downloadable for DRM users, notify on DRM sites. (c) Replace on Mac/Linux now, Windows when certified | Decide when castLabs shares requirements. Until then plan for **(a)** and don't block other work |
| D4 | **Build hardware for Windows and Linux** (the October 28 answer ruled out new paid resources) | (a) One x64 PC for Windows plus a Linux partition or VM. (b) Paid cloud VMs used only for builds. (c) Defer Windows/Linux until Mac S1–S3 are done | **(a)** or **(b)**. Platform bring-up is the largest unknown and should start early |
| D5 | **Site data (sign-ins) in migration** | (a) Don't migrate cookies or site storage; users sign in again. (b) Best-effort copy of Electron's cookie and local-storage DBs (same Chromium lineage, re-encrypted) with a fallback to (a) | **(b)**, behind fixtures and a real-profile check. Losing every sign-in is the most visible regression |
| D6 | **Chromium channel and security cadence** | (a) Stable branch, rebase every 4 weeks. (b) Extended Stable, rebase every 8 weeks, security fixes merged biweekly | **(b)**. Least maintainer load. Confirm the 7-day High/Critical security SLA |
| D7 | **Standing build envelope** (the main speed lever) | Approve: incremental builds of any size on the existing toolchain and cache, isolated test profiles, signing of internal candidates. Asking stays required for cold builds, toolchain/SDK/GN changes, new machines, the owner's dev instance, publishing, merging | **Approve as written** |
| D8 | **Platform floor** | Keep Intel Macs and the shipping macOS minimum, or follow the fork's Chromium minimum (the preview needs macOS 26) and Apple Silicon only | Decide after F0.7 reports the target branch's real minimum. Shipping currently supports both |

Approving this plan approves **none** of the proposed divergences in spec §9. Each row is reviewed on its own, and shipping behavior is implemented until a row is approved. V2 (history retention) and V7 (macOS floor, decided with D8) are product changes and need an explicit answer. D7 is likewise a proposal until the owner approves it.

## 10. Codex handoff checklist

1. Fetch `codex/f12-socket-speculation` at or after `d63b6d4c0`. Read this plan, the spec and the owner's §9 answers.
2. `gh release view` the latest Blanc release. If it is newer than v1.45.1, rebaseline per §4 first.
3. Inspect processes on the Mac mini: dev instance, any build. Don't touch them.
4. Do F0.1–F0.5 in order. F0.6 and F0.8 can follow in parallel. Request F0.7's cold build with exact scope. Deliver A.1 and A.2 to the owner once F0.5 runs.
5. Start PW.1/PL.1 per D4 as soon as F0.2 lands.
6. Work S1 tasks with at most two in progress; update `tracker.json` only on state changes; overwrite `STATUS.md` each session.
7. At S1 exit, ask the owner to close the dev instance, back up, refresh, and report both bars.
8. Continue S2 → S3 (S4 alongside) → S5; R and M alongside as listed.
9. Never sign for distribution, publish, merge to `main`, or touch Electron (except R.6 after go-ahead) without explicit owner approval.
