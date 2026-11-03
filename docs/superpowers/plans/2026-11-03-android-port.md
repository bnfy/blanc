# Blanc for Android 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Blanc for Android 1.0, the iPhone companion release, on Google Play, built from an Android lane of Blanc's Chromium fork.

**Architecture:** Chromium's own Android browser (`//chrome/android`) with Blanc patches from the shared `chromium/` tree, which now has two lanes: desktop, pinned to a 158 preview, and Android, pinned to Chrome stable for Android. Blanc's UI (Island, sheets, pairing) is drawn over Chromium's models. The blocker host and sync runner are shared with the desktop lane.

**Tech Stack:** Chromium (GN/Siso, Java/Kotlin where Chromium's build allows it, C++), Android SDK/NDK as pinned by Chromium, Node for the tree's tools, Python for `check-patches.py`, Android emulators and a Pixel, Google Play Console and the Play Developer API.

**Spec:** [`docs/superpowers/specs/2026-11-03-android-port-design.md`](../specs/2026-11-03-android-port-design.md). Executors read both. Section numbers below (§N) refer to it.

**Shape of this plan.** Android 1.0 is many months of work across independent subsystems. This file has two parts:
- **Part 1, the ladder:** milestones A0–A9. Each has a deliverable, an exit gate and the owner's steps.
- **Part 2:** task-level detail for **A0 only**. Each later milestone gets its own task-level plan at `docs/superpowers/plans/<date>-android-aN-<name>.md`, written when it starts and checked against the then-current tree. That's the same ladder pattern as the iPhone's M-plans. Writing A3's tasks today, against a blocker host that doesn't yet exist on Android, would be guessing.

## Global Constraints

- Android builds **only on x86-64 Linux**: the rented server (16+ cores, 128 GB RAM, 1 TB+ NVMe, Ubuntu LTS). Never on the Mac mini or this M5.
- Android follows **Chrome stable for Android** and its security respins. Desktop's pin doesn't bind it (owner decision 8).
- Same rules as the desktop tree (`chromium/README.md`): one current candidate per platform, at most two Android features in progress, no competing builds, raw evidence off Git, `STATUS.md` overwritten in place.
- A change to a shared patch, a shared tool or shared `chromium/blanc/` code needs the desktop agent's confirmation before merge. **Exception:** a security rebase under §8.3. When the lanes compete, **desktop goes first**, and Android may add a temporary version under `chromium/blanc/android/` (§7.3).
- PRs target `chromium/migration`, one branch per piece of work, named `chromium/android-<slug>`. Never push to desktop-lane branches.
- Application ID **`me.bnfy.blanc`** for release; debug builds **`me.bnfy.blanc.dev`**, so both can be installed. Display name **"Blanc"**.
- Architectures: **arm64-v8a** (devices) and **x86_64** (emulators). No 32-bit ARM. `minSdkVersion` follows the pinned Chromium's Chrome-public target.
- No request to a Google service that desktop doesn't make. Play services are allowed **only** for Credential Manager, autofill and the code scanner, used when the person invokes them (owner decision 9).
- The upload key and the Play API credential live in 1Password (vault **Dev**) and never reach the server or the repo. Signing and upload run from the owner's Mac through `op run`.
- Strings come from `copy/messages/` in all six languages. Guarded by `copy:check`; never hand-edit `*/generated/`.
- Telemetry is one launch `/ping` with `platform: 'android'`, after consent. No crash upload.
- Security clock: stable security release on Play production within **7 days**; exploited-in-the-wild fix within **72 hours**.
- No public claim (Play listing, site, posts) beyond what a published release backs (`docs/marketing-claims.md`). Nothing about protected playback until K1 is settled. Nothing NDA-covered in the repo.
- Cold builds, new machines, purchases, Play Console changes, Worker deploys and publishing are each the owner's explicit, scoped approval.

## Review Focus

Inputs the spec implies that no milestone's headline tests reach. Each is a required test in the milestone plan named:

1. **Android kills the app mid-session (process death).** Tabs, groups, Spaces and the active tab come back, and private tabs come back gone. → **A2** (session test with `adb shell am kill` while backgrounded).
2. **Rotation, split-screen and window resizing.** The Island, palette and sheets keep their state and stay inside the insets. → **A1** (configuration-change test on the emulator at three sizes).
3. **A phone without Play services.** Pairing falls back to the CameraX scanner, passkeys are absent without errors, and nothing crashes. → **A4** and **A6** (an emulator image without Google APIs).
4. **A sync payload carrying a field a newer desktop added.** Unknown fields survive a phone edit and round-trip to desktop unchanged. → **A4** (wire fixture with an extra field).
5. **First launch offline.** Pairing explains that it needs a connection, with no endless spinner, and blocking still starts from the bundled lists. → **A3** and **A5** (airplane-mode emulator run).

---

# Part 1: the ladder

| | Milestone | Deliverable | Exit gate | Owner steps |
|---|---|---|---|---|
| **A0** | Foundation | Server provisioned. The Android lane is pinned to Chrome stable. A debug `me.bnfy.blanc.dev` APK, branded Blanc and built from the tree, loads pages with Google background services off. | Part 2's A0 gate | Rent the server; buy the Pixel; approve A0's cold build |
| **A1** | Island and pages | Chrome's toolbar, omnibox UI, tab switcher, New Tab page and Discover hidden. The bottom Island (address, back, tab dots, shield placeholder) is in place. `blanc://` newtab, favorites, history, settings, shortcuts, error and mahjong are served from the bundle. Native-views-versus-WebUI spike recorded. | Island usable one-handed on the Pixel; pages render at phone width; outbound gate still passes; Review Focus 2 | Review the Island spike captures |
| **A2** | Tabs and navigation | Tabs (with mute), groups (names, optional color), pins, private tabs, the palette and Quick Switcher, slash commands (iPhone's set), find, tab card strip and gestures (F56), floating and tuck Island with top/bottom setting, session restore, Quiet Tabs. | `@android-smoke` acceptance scenarios for F2–F8, F18, F31, F56 pass on the emulator; Review Focus 1 | — |
| **A3** | Blocking | The shared blocker host on Android: pinned EasyList and EasyPrivacy, network, cosmetic and scriptlets, an exact shield count, per-site allow and re-block, the global switch. Private tabs protected. | F12 scenarios pass; blocker fails closed; Review Focus 5 (blocking half) | — |
| **A4** | Sync | The shared sync runner with Android Keystore keys. Pairing by QR, with typed and CameraX fallbacks. Profile Sync, Tab Sync, Shared Spaces, synced Recently closed, Send to device, WorkManager background sync. | Wire tests both ways against desktop and iPhone fixtures on the staging Worker; two-device hands-on check (Pixel and desktop); Review Focus 3 (pairing half) and 4 | Hands-on pairing check |
| **A5** | First minute and Settings | Onboarding: pairing first, privacy consent, default-browser role. Settings re-scoped (Google, Chrome Sync and Safety-check removed; Blanc's sections added). Theming, interface language (per-app language), launch ping. | Pairing in under a minute on the Pixel; pages and Settings in all six languages; Review Focus 5 (pairing half) | Deploy the ping Worker change adding `android` |
| **A6** | Android's own needs | Share target "Open in Blanc", system and predictive back, edge-to-edge insets, context menu, HTTP auth, certificate interstitial, autofill and passkeys, K1 Widevine check. | Pixel hands-on checklist passes; K1 result recorded; Review Focus 3 (passkeys half) | Confirm the Widevine licensing position (K1) |
| **A7** | Release pipeline and rebase drill | Release GN args. Unsigned AAB built on the server from a tagged commit. Mac-side sign, verify and upload script (`op run`), SBOM, Sigstore. Chromium and Blanc license notices reachable from About. Play internal track, which surfaces Play review issues early (K5). App download size measured and recorded (K3). One full Chrome stable rebase, timed against the clock, with its cost recorded (K4). | A release-signed build on the internal track installs over Play on the Pixel; the rebase lands within 7 days, with its cost in the ledger | Organization Play account (D-U-N-S); Play App Signing; upload key into 1Password |
| **A8** | Beta | Closed testing track, then open beta. Play listing, Data safety form, screenshots from the real app (no Wikipedia), support address, `docs/android/play-console.md`. The §8.4 signals become readable: pairing rate, 30-day retention and monthly actives from the launch ping, and the security clock from `STATUS.md`. | No open Severity-1 bugs for one rebase cycle; privacy gate passes on the beta build | Approve listing copy and captures; approve each track promotion |
| **A9** | 1.0 | Production with staged rollout. Records: parity matrix, divergence register, `STATUS.md`, site download band (only after release). | Release live; release-backed site copy deployed | Approve production rollout and site copy |

**Ordering rules.** A1 through A3 may overlap, within the two-features-in-progress limit. A4 needs A2's tab model. A5 needs A4 for pairing. A7 may start once A2 lands, and must finish before A8. When a shared piece (blocker host, sync runner) isn't ready on desktop when Android reaches it, read desktop's drafts read-only on the Mac mini (K2), then apply §7.3: a temporary Android version, marked in `STATUS.md`.

---

# Part 2: A0, Foundation

**A0 exit gate (all must hold):**
1. `python3 chromium/tools/check-patches.py --lane android` passes, and `--lane desktop` output is byte-identical to today's default run.
2. `node chromium/tools/progress.mjs --check` passes with an `android` column present.
3. `out/AndroidDebug/apks/ChromePublic.apk` (target `chrome_public_apk`, arm64) and its x86_64 twin are built from the tree at a recorded commit. `aapt2 dump badging` shows `package: name='me.bnfy.blanc.dev'` and `application-label:'Blanc'`.
4. The APK installs on the emulator and on the Pixel, launches, and loads `https://example.com`.
5. `node chromium/tests/android/outbound-gate.mjs` passes on the emulator: zero requests to denylisted Google hosts in a scripted 5-page session.
6. `STATUS.md` has an Android section naming the candidate, milestone and the gate's results.

### Task 1: The tracker gains an Android column

**Files:**
- Modify: `chromium/tracker.json` (every row's `platformVerification` and `platformProgress`)
- Modify: `chromium/tools/progress.mjs`
- Test: `chromium/tools/progress.test.mjs`

**Interfaces:**
- Produces: `platformProgress.android = { stage: 'not-started', basis: 'no fork build' }` and `platformVerification.android = null` on every row. `PLATFORMS` in `progress.mjs` becomes `['macos', 'windows', 'linux', 'android']`. Bar B renders Android as its own line, after Linux.

- [ ] **Step 1: Write the failing tests** in `progress.test.mjs`:
  - `test('every row carries an android platform')`: for each row of the real tracker, `assert.deepEqual(row.platformProgress.android, { stage: 'not-started', basis: 'no fork build' })` unless the row's stage is something other than `not-started`, and `assert.ok('android' in row.platformVerification)`.
  - `test('bar B lists android separately')`: render the STATUS block from a fixture tracker with one row at Android `implemented` and assert the output contains a line starting `Android` with `1` implemented, and that the macOS, Windows and Linux lines are unchanged from the same fixture without the Android key.
  - `test('--check fails when a row lacks android')`: remove the key from one fixture row and assert `check()` throws with a message naming that row's `id`.
- [ ] **Step 2: Run** `node --test chromium/tools/progress.test.mjs` and confirm the three new tests fail.
- [ ] **Step 3: Implement.** Add `'android'` to `PLATFORMS`, add the Bar B line, add the `--check` rule, and add the two keys to every row of `tracker.json` in one scripted edit (keep key order: after `linux`).
- [ ] **Step 4: Run** `node --test chromium/tools/progress.test.mjs` and `node chromium/tools/progress.mjs --check`. Both pass.
- [ ] **Step 5: Commit** on `chromium/android-tracker`, and open a PR into `chromium/migration` marked *shared tool: needs desktop confirmation*.

### Task 2: Lanes for `check-patches.py`, and the Android pin

**Files:**
- Create: `chromium/lanes/desktop.json`, `chromium/lanes/android.json`
- Create: `chromium/upstream-android/manifest.json` and the pinned upstream inputs it lists
- Create: `chromium/patches/android/` (empty, with a README naming its rule from §4)
- Modify: `chromium/tools/check-patches.py`, `chromium/tools/apply.py`
- Test: `chromium/tools/check-patches.test.mjs` (new; runs the Python through `spawnSync`)

**Interfaces:**
- Produces: the lane file schema
  `{ "lane": "desktop"|"android", "upstreamDir": "upstream"|"upstream-android", "upstream": "<chromium commit>", "version": "<x.y.z.w>", "channel": "preview"|"stable", "fileCount": <int>, "patches": ["patches/…", …] }`.
  `check-patches.py --lane <name>` (default `desktop`) and `apply.py --lane <name> --src …`.
  `desktop.json` holds today's hard-coded values exactly (upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c`, the current patch list, `fileCount` 83).
- Android's patch list starts as the shared patches that apply at its milestone, then `patches/android/*`. A shared patch that needs a different hunk at Android's milestone gets `patches/variants/<version>/<same name>`, which replaces it for that lane only, and is listed in the rebase ledger.

- [ ] **Step 1: Read the pin.** On the server, fetch `https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Android&num=1`. Record `version` and `hashes.chromium` in `android.json` with `channel: "stable"`.
- [ ] **Step 2: Write the failing tests** in `check-patches.test.mjs`:
  - `test('desktop lane is unchanged')`: the stdout and exit code of `check-patches.py --lane desktop` equal those of `check-patches.py` run at the base commit (captured into a fixture in this step).
  - `test('android lane verifies its own inputs')`: corrupt one byte of a copied `upstream-android` file in a temp copy of the tree and assert exit code ≠ 0 with `Digest mismatch`.
  - `test('variant replaces shared patch for its lane only')`: in a fixture tree, a `variants/<v>/0008-…` patch is applied for android and ignored for desktop.
  - `test('unknown lane is refused')`: `--lane ios` exits ≠ 0.
- [ ] **Step 3: Run** `node --test chromium/tools/check-patches.test.mjs` and confirm the tests fail.
- [ ] **Step 4: Implement** `--lane` in both tools, reading the lane file instead of the hard-coded list. Populate `upstream-android/` from the pinned checkout with `chromium/tools/inventory.py`'s file list for the same paths. Every shared patch that applies cleanly stays shared; record each one that needs a variant.
- [ ] **Step 5: Run** the tests and `python3 chromium/tools/check-patches.py --lane android`. Both pass.
- [ ] **Step 6: Commit** on `chromium/android-lanes`. The PR body lists every variant and is marked *shared tool: needs desktop confirmation*.

### Task 3: Server bootstrap and GN args

**Files:**
- Create: `chromium/android/server/bootstrap.sh`
- Create: `chromium/android/args/debug-arm64.gn`, `chromium/android/args/debug-x64.gn`
- Create: `chromium/android/server/README.md` (what lives on the server and where: checkout `~/chromium-android/src`, outputs `out/AndroidDebug`, `out/AndroidDebugX64`, evidence `~/blanc-evidence/android/`)
- Test: `chromium/tools/android-args.test.mjs`

**Interfaces:**
- Consumes: `chromium/lanes/android.json` (Task 2).
- Produces: `bootstrap.sh [--dry-run]`, idempotent. It installs depot_tools at a pinned commit, runs `fetch --nohooks android` only when no checkout exists, checks out `android.json`'s `upstream`, runs `gclient sync -D --with_branch_heads`, then `build/install-build-deps.sh --android`, and applies the lane with `apply.py --lane android`. It never deletes an existing output folder.
- Args files: each imports `//blanc/config.gni`'s Blanc settings the way the desktop args do, plus `target_os = "android"`, `target_cpu = "arm64"` or `"x64"`, `is_debug = false`, `is_component_build = false`, `symbol_level = 1`, `android_channel = "stable"`, and no Google API keys.

- [ ] **Step 1: Write the failing test** `test('android args pin the platform')`: parse both args files and assert the keys and values listed above, and that neither file sets `google_api_key`, `google_default_client_id` or `use_official_google_api_keys = true`.
- [ ] **Step 2: Run** `node --test chromium/tools/android-args.test.mjs` and confirm it fails.
- [ ] **Step 3: Write** the args files and `bootstrap.sh`. Check every arg name against `gn args out/AndroidDebug --list` on the server, and drop any the pinned milestone doesn't define, with a comment saying why.
- [ ] **Step 4: Run** the test (passes) and `bash chromium/android/server/bootstrap.sh --dry-run` on the server, which prints the planned actions and changes nothing.
- [ ] **Step 5: Owner approval:** the first `bootstrap.sh` run and the cold build in Task 5 are one approval request, stating disk use and expected hours.
- [ ] **Step 6: Commit** on `chromium/android-bootstrap`.

### Task 4: Build wrapper knows the Android lane

**Files:**
- Modify: `chromium/tools/build.mjs`
- Test: `chromium/tools/build.test.mjs`

**Interfaces:**
- Consumes: lane files (Task 2), args files (Task 3).
- Produces: `node chromium/tools/build.mjs --lane android --out out/AndroidDebug --target chrome_public_apk`. It keeps the existing dry-run guard (`plannedActions`, `planSummary`) and refuses to start when the planned action count exceeds the approved threshold, or when another `siso`/`ninja` process is running in that checkout. After success, it writes the candidate identity to `STATUS.md`'s Android section through `progress.mjs`.

- [ ] **Step 1: Write the failing tests:** `test('android lane resolves its out dir and target')` (argument parsing yields `{ lane: 'android', out: 'out/AndroidDebug', target: 'chrome_public_apk' }`), and `test('android lane refuses a competing build')` (with a fake process list containing `siso` under the same `src`, the function returns a refusal and no spawn happens).
- [ ] **Step 2: Run** `node --test chromium/tools/build.test.mjs` and confirm the tests fail.
- [ ] **Step 3: Implement** the `--lane` and `--target` options. Desktop's defaults are unchanged.
- [ ] **Step 4: Run** the tests. They pass, and the existing desktop cases still pass.
- [ ] **Step 5: Commit** on `chromium/android-build`, marked *shared tool*.

### Task 5: Identity and launcher icon (first cold build)

**Files:**
- Create: `chromium/patches/android/0101-android-identity.patch` (package `me.bnfy.blanc.dev` for the debug channel and `me.bnfy.blanc` for release, app label "Blanc", its own data directory)
- Create: `scripts/android-app-icons.js` (writes adaptive-icon foreground and background and legacy mipmaps, `mdpi` through `xxxhdpi`, from `assets/sunrise-mark-4096.png` into `chromium/blanc/android/res/`)
- Modify: `package.json` (`brand:build` and `brand:check` include it)
- Test: `test/unit/android-app-icons.test.js`

**Interfaces:**
- Consumes: Task 4's build command.
- Produces: `out/AndroidDebug/apks/ChromePublic.apk` and `out/AndroidDebugX64/apks/ChromePublic.apk` with Blanc's identity.

- [ ] **Step 1: Write the failing test:** the generated mipmaps exist at 48, 72, 96, 144 and 192 px (mdpi to xxxhdpi) for legacy icons, and adaptive foreground and background layers at 108, 162, 216, 324 and 432 px. `brand:check` fails if any of them drift from what the generator writes.
- [ ] **Step 2: Run** `node --test test/unit/android-app-icons.test.js` and confirm it fails.
- [ ] **Step 3: Implement** the generator and the identity patch. Add the patch to `android.json`.
- [ ] **Step 4: Run** the unit test (passes), then `check-patches.py --lane android` (passes), then the approved cold build of both targets with Task 4's wrapper.
- [ ] **Step 5: Verify:** `aapt2 dump badging out/AndroidDebug/apks/ChromePublic.apk` shows `package: name='me.bnfy.blanc.dev'` and `application-label:'Blanc'`. `adb install` on the x86_64 emulator, launch, load `https://example.com`, and save a screenshot to the evidence folder.
- [ ] **Step 6: Commit** on `chromium/android-identity`.

### Task 6: Google background services off, and the outbound gate

**Files:**
- Create: `chromium/patches/android/0102-android-google-services-off.patch` (sign-in promos, Discover feed, Safe Browsing pings, variations seed fetch, minidump upload, usage-stats and GMS "usage and diagnostics" reporting, and any startup call to a Google endpoint the gate finds). The shared `0008-background-services.patch`, or its Android variant, still applies.
- Create: `chromium/tests/android/outbound-gate.mjs`
- Create: `chromium/tests/android/outbound-denylist.json` (Google hosts: `*.google.com`, `*.googleapis.com`, `*.gstatic.com`, `*.gvt1.com`, `*.gvt2.com`, `*.googleusercontent.com`, `*.doubleclick.net`, `*.google-analytics.com`, `clients*.google.com`)
- Create: `chromium/tests/android/outbound-allowlist.json` (empty at A0; A6 adds the Credential Manager and scanner flows, each with the user action that triggers it)
- Test: `chromium/tools/android-outbound.test.mjs`

**Interfaces:**
- Consumes: `chromium/tests/outbound/analyze.mjs` (the desktop analyzer), reused for parsing.
- Produces: `outbound-gate.mjs --apk <path> --avd <name> --evidence <dir>`. It writes a NetLog through Chromium's command-line file (`/data/local/tmp/chrome-command-line` with `--log-net-log=…`), runs a scripted session over `adb` (launch, open 5 fixed pages, idle 60 s, background and foreground, quit), and exits non-zero on any denylisted host that isn't allowlisted. Its report goes to `<evidence>/outbound-android.json`.

- [ ] **Step 1: Write the failing tests** against fixture NetLogs: `test('a denylisted host fails the gate')`, `test('an allowlisted flow passes only with its trigger')`, `test('an empty session fails as not-run')` (a NetLog with no page loads is an error, never a pass).
- [ ] **Step 2: Run** `node --test chromium/tools/android-outbound.test.mjs` and confirm the tests fail.
- [ ] **Step 3: Implement** the gate, then run it on Task 5's APK. Write the patch for each Google request the gate finds, then rebuild incrementally.
- [ ] **Step 4: Run** the unit tests (pass) and the gate on the rebuilt APK on the emulator (passes, report saved).
- [ ] **Step 5: Commit** on `chromium/android-outbound`.

### Task 7: Records and the A0 gate

**Files:**
- Modify: `chromium/STATUS.md` (new **Android** section: candidate ID, lane version, server, the six gate results with evidence paths)
- Create: `docs/android/play-console.md` (on `main`, through a docs-only PR: account type, D-U-N-S, app ID, Play App Signing, tracks, Data safety answers to come, release-script contract)
- Modify on `main`: `spec/README.md` (Android's status line), `spec/divergence-register.md` (D1: Android uses the shared fork engine), `CLAUDE.md` and `AGENTS.md` (one paragraph naming the lane, the server and this plan)

- [ ] **Step 1: Run** every A0 gate command and write the results to `STATUS.md`.
- [ ] **Step 2: Install** the arm64 APK on the Pixel over `adb`, load a page, and record it.
- [ ] **Step 3: Run** `node chromium/tools/progress.mjs --slice-boundary=A0` and `node chromium/tools/progress.mjs --check`. Both pass.
- [ ] **Step 4: Commit** the tree records on `chromium/android-a0-gate`, and open the docs PR on `main` separately (website- and docs-only CI rule).
- [ ] **Step 5: Write** the A1 plan (`docs/superpowers/plans/<date>-android-a1-island.md`) from §4 and this ladder, and hand it to the owner for review.
