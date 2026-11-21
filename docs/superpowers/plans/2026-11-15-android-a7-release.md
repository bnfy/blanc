# Blanc for Android A7: Release Pipeline and Rebase Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Android debug lane into a releasable product: an optimized, release-identity Android App Bundle built on the server from a tagged commit, verified, signed with the upload key, attested and uploaded to Play's internal track from the owner's Mac, plus one timed Chrome stable rebase.

**Architecture:** The server builds an unsigned-for-Play bundle (`chrome_public_bundle`, release GN args) from a tagged commit and writes a build record. The owner's Mac runs `chromium/android/release/release.mjs`, a staged, resumable script like the desktop beta's (`chromium/release/release.mjs`): fetch the bundle and record, verify it, sign it through `op run`, write checksums, SBOM and a Sigstore bundle, then upload to Play's internal track through the Play Developer API. The rebase drill adds a pin-refresh tool and a timed ledger.

**Tech Stack:** Chromium GN/Siso (Android lane, Chrome stable 156.0.8078.79), Node 22 (`node --test`), Python 3, `bundletool`, `jarsigner`, `cosign`, 1Password CLI (`op`), Google Play Developer API v3 (REST, no new npm dependency).

**Spec:** `docs/superpowers/specs/2026-11-03-android-port-design.md` (§3 Constraints, §7 Two lanes, §8.2 Release, §8.3 Security clock, §9 K3–K5), ladder row A7 in `docs/superpowers/plans/2026-11-03-android-port.md`, and `docs/android/play-console.md` (the owner's account decisions supersede the spec's organization-account line).

## Global Constraints

- Application ID `me.bnfy.blanc` (release); debug stays `me.bnfy.blanc.dev`. Display name "Blanc". Neither changes after the first upload.
- Play publishes from the owner's **personal** account (owner decision, November 4, 2026), so production needs a closed test with ≥12 testers opted in for 14 continuous days (that is A8, not A7).
- Play App Signing holds the app signing key. The **upload key** and the **Play Developer API service-account credential** live in 1Password vault **Dev** and never reach the build server, the repository, a log or a command line argument.
- The server builds from a **clean, tagged commit** only. The Mac verifies the bundle's SHA-256 against the server's build record before signing.
- Uploaded architectures: **arm64-v8a only**. x86_64 is built only for the emulator gates. No 32-bit ARM.
- No Google API keys (`use_official_google_api_keys = false`), Google background services off (patch 0102), and the **privacy gate blocks release** (§8.1).
- Release builds carry no Blanc test hooks: `blanc_channel = "release"`, so `blanc_enable_test_hooks` and `blanc_disk_assets` are false (`chromium/blanc/config.gni`).
- Version name and code are independent of desktop's. Version code increases by exactly 1 per uploaded build, starting at **1**. Version names are `1.0.0-beta.N` until A9 (the launch ping's `VERSION` pattern in `LaunchPing.java` accepts it).
- Chromium's BSD license and credits, Blanc's MIT `LICENSE`, `ASSET-LICENSE.md`, `THIRD-PARTY-NOTICES.md` and `chromium/THIRD_PARTY_NOTICES.md` ship in the app and are reachable from Settings → About.
- Sigstore signing uses the same `BLANC_COSIGN_IDENTITY` and `BLANC_COSIGN_OIDC_ISSUER` pins as `scripts/release.sh`, verified after signing.
- No public claim about Android (`docs/marketing-claims.md`). Nothing NDA-covered enters the repository.
- Shared-tool changes (`chromium/release/sbom.mjs`) keep the desktop beta's tests passing unchanged.
- Every new test lives where CI already runs it: `chromium/tools/*.test.mjs` or `chromium/release/*.test.mjs` (`.github/workflows/chromium-foundation.yml`).
- Owner approval is required, per item, for: the first release cold build (official builds take hours), each Play upload, and the rebase drill's download and builds (§7 rule 7).

## Review Focus

1. **A version code that was already uploaded, or lower than the last one.** Play rejects it, after a long build. The ledger refuses it before the build starts (Task 3, `nextRelease` tests).
2. **The upload keystore left on disk after a failure.** A signing error, a wrong password or Ctrl-C must still delete the temporary keystore (Task 6, `signBundle` cleanup test).
3. **A bundle built from a dirty tree, an untagged commit, or a tag whose ledger entry doesn't match.** The build must refuse before compiling (Task 4, `release-build.sh --dry-run` cases).
4. **A release build that still honors a `--blanc-test-*` switch or test hook.** It would let the command-line file redirect the ping or sync in the field (Task 1 hook-gate check, Task 5 gate).
5. **An interrupted upload.** A rerun after a failure between `edits.insert` and `edits.commit` must open a new edit and never record the build as uploaded until `commit` succeeded (Task 8 tests).

---

## Owner steps (in order; each is the owner's click or approval)

1. **Play Console:** create the app `me.bnfy.blanc` ("Blanc", app, free) in the personal account and opt into Play App Signing.
2. **Upload key:** run the command in `docs/android/play-console.md` (Task 10) on the Mac. It creates the keystore straight into 1Password; give Claude the upload certificate's SHA-256 fingerprint (public) for `chromium/android/release/upload-cert.json`.
3. **Play Developer API:** create the service account, grant it release access to Blanc only, and save its JSON key in 1Password (`op://Dev/Blanc Play API/credential`).
4. **Approve** the first official release cold build on the server (Task 4).
5. **Approve** the first internal-track upload (Task 9), then install from the internal testing link on the Pixel (exit gate).
6. **Approve** the rebase drill's download and builds (Task 11).

## Execution note

Codex implements Tasks 1–3 and 5–11 locally (code and Node/Python tests). Steps marked **[server]** need the build server and long builds; Claude runs them during review, with the owner's approvals above. Nothing is pushed, tagged or uploaded by the implementer.

---

### Task 1: Release GN args and the release version in the app

**Files:**
- Create: `chromium/android/args/release-arm64.gn`, `chromium/android/args/release-x64.gn`
- Modify: `chromium/blanc/config.gni` (new arg), `chromium/blanc/android/BUILD.gn` (generated Java), `chromium/blanc/android/java/src/org/chromium/blanc/firstrun/LaunchPing.java:34-35`
- Create: `chromium/blanc/android/java/templates/BlancRelease.java.tmpl`
- Test: `chromium/tools/android-args.test.mjs`, `chromium/blanc/android/junit/src/org/chromium/blanc/firstrun/LaunchPingTest.java`

**Interfaces:**
- Produces: GN arg `blanc_android_version_name` (string, default `""`); Java class `org.chromium.blanc.BlancRelease` with `public static final @Nullable String VERSION` (`null` when the arg is empty); `LaunchPing.RELEASE_VERSION = BlancRelease.VERSION`.
- Produces: the args files' exact key sets (Task 4 copies them and appends version lines).

- [ ] **Step 1: Write the failing args test.** In `android-args.test.mjs`, for `release-arm64.gn` / `arm64` and `release-x64.gn` / `x64`, assert the parsed dict equals exactly:
  `{target_os: 'android', target_cpu: <cpu>, is_debug: false, is_official_build: true, chrome_pgo_phase: 0, is_java_debug: false, is_component_build: false, symbol_level: 0, android_static_analysis: 'on', android_channel: 'stable', chrome_public_manifest_package: 'me.bnfy.blanc', use_official_google_api_keys: false, blanc_channel: 'release'}`
  and that none of `google_api_key`, `google_default_client_id`, `google_default_client_secret`, `disable_android_lint`, `android_override_version_code`, `android_override_version_name`, `blanc_android_version_name` appear (Task 4 appends the version lines per build).
- [ ] **Step 2: Run it.** `node --test chromium/tools/android-args.test.mjs` → FAIL (files missing).
- [ ] **Step 3: Write both args files** with those values, each line commented in the debug files' style (why official, why PGO phase 0: no PGO profiles are fetched for this checkout; lint on for release).
- [ ] **Step 4: Run it.** Same command → PASS.
- [ ] **Step 5: Add `blanc_android_version_name = ""`** to `declare_args()` in `chromium/blanc/config.gni`, with asserts: non-empty only when `target_os == "android"`; non-empty when `target_os == "android" && blanc_channel == "release"`. Generate `BlancRelease.java` from the template with Chromium's `jinja_template` in `chromium/blanc/android/BUILD.gn` (variable `blanc_version`), added to the Blanc Java library that holds `LaunchPing`. The template writes `VERSION = null` for an empty value, else the quoted string.
- [ ] **Step 6: Point `LaunchPing.RELEASE_VERSION` at `BlancRelease.VERSION`.** Keep the existing Robolectric case that a preview (null version) has no endpoint; add `testReleaseVersionMatchesPattern`: when `BlancRelease.VERSION` is non-null it matches `VERSION` (the class's pattern).
- [ ] **Step 7: Check the hook boundary.** `python3 chromium/tools/check-hook-gates.py` → passes; `node --test chromium/tools/*.test.mjs` → all pass.
- [ ] **Step 8 [server]: `gn gen` both release outs** (`out/AndroidRelease`, `out/AndroidReleaseX64`) with `blanc_android_version_name = "1.0.0-beta.1"` appended, and check each arg exists: `gn args out/AndroidRelease --list --short | grep -E 'chrome_pgo_phase|android_override_version_(code|name)|is_official_build'`. A missing name is dropped with a comment saying why, and the test updated.
- [ ] **Step 9: Commit.** `git commit -m "Android A7: release GN args and the release version in the app"`

### Task 2: Blanc's notices in the app, reachable from About

**Files:**
- Create: `chromium/tools/android-notices.mjs` (build and `--check`), `chromium/blanc/android/pages/licenses.html`, `chromium/blanc/android/pages/licenses.js`
- Generate (committed): `chromium/blanc/android/pages/notices/LICENSE.txt`, `ASSET-LICENSE.txt`, `THIRD-PARTY-NOTICES.txt`, `CHROMIUM-FORK-NOTICES.txt`
- Modify: the Android pages bundle list (wherever `android-pages.mjs` / the pages GRD lists `chromium/blanc/android/pages/*`), `ChromiumSettingsHost.openLicenses` target, `copy/messages/en.json` (+ five languages) for the page's strings
- Test: `chromium/tools/android-notices.test.mjs`

**Interfaces:**
- Produces: `notices()` → `[{file, source, sha256}]` for the four notices; the page `chrome://blanc/licenses.html`, which lists Blanc's four notices in full and links to `chrome://credits` for Chromium's.
- Consumes: the root `LICENSE`, `ASSET-LICENSE.md`, `THIRD-PARTY-NOTICES.md`, `chromium/THIRD_PARTY_NOTICES.md`.

- [ ] **Step 1: Write the failing tests:** `noticesAreByteCopies` (each generated file's SHA-256 equals its source's), `checkFailsOnDrift` (`--check` exits 1 when a source changes and the copy doesn't), `pageListsEveryNotice` (`licenses.html` names each generated file), `pageLinksChromiumCredits` (contains `chrome://credits`), `noticesAreBundled` (each file is in the Android pages bundle list).
- [ ] **Step 2: Run** `node --test chromium/tools/android-notices.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `android-notices.mjs` (copy byte-for-byte, `--check` compares), the page (no remote resources; reuses `ios-pages.css`; strings through `blancI18n.t` keys `android.licenses.*`), the bundle entries, and point the Open-source licenses row at the page. Run `npm run copy:build` after adding strings to all six languages.
- [ ] **Step 4: Run** the test, `node chromium/tools/android-notices.mjs --check`, `npm run -s copy:check` → all PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: Blanc's notices in the app, from About"`

### Task 3: The Android release ledger and version rules

**Files:**
- Create: `chromium/android/release/ledger.json`, `chromium/android/release/versions.mjs`
- Test: `chromium/tools/android-release-versions.test.mjs`

**Interfaces:**
- Produces: ledger shape `{schema: 1, builds: [{versionCode, versionName, tag, commit, state, date, note}]}` with `state` one of `"built" | "uploaded" | "abandoned"`; starts as `{schema: 1, builds: []}`.
- Produces: `validateLedger(ledger) -> void` (throws), `nextRelease(ledger, versionName) -> {versionCode, versionName, tag}`, `tagFor(versionName, versionCode) -> string` = `android-v${versionName}-${versionCode}`, `NAME = /^1\.0\.0-beta\.[1-9]\d*$/`.

- [ ] **Step 1: Write the failing tests:** first build gets code 1 and tag `android-v1.0.0-beta.1-1`; codes are strictly increasing by 1 (`[1,3]` throws); an `abandoned` code is never reused (next after abandoned 2 is 3); a reused version name with a new code is allowed only if the earlier one is `abandoned`; a name outside `NAME` throws; duplicate tags throw.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-versions.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `versions.mjs` and the empty ledger.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: release ledger and version rules"`

### Task 4: The server's release build from a tag

**Files:**
- Create: `chromium/android/server/release-build.sh`, `chromium/android/release/record.mjs`
- Modify: `chromium/android/server/README.md` (a "Release builds" section)
- Test: `chromium/tools/android-release-record.test.mjs`

**Interfaces:**
- Consumes: Task 1's args files and arg; Task 3's `tagFor`, `validateLedger`.
- Produces: `release-build.sh <tag> --previous-map <commit> [--dry-run] [--gates]`, `<commit>` being the commit the server tree was last applied from (the record keeps it as `appliedOver`); build record `~/blanc-evidence/android/release/<tag>/build.json` = `{schema: 1, tag, commit, appliedOver, upstream, versionName, versionCode, argsSha256, aab: {file: "ChromePublic.aab", sha256, bytes}, builtAt}`; with `--gates` also `gatesApk: {sha256}` for `out/AndroidReleaseX64/apks/ChromePublic.apk`.
- Produces: `validateBuildRecord(record, ledgerEntry) -> void` (throws on any mismatch or missing field).

- [ ] **Step 1: Write the failing tests** for `validateBuildRecord`: a record whose tag, commit, name or code differs from the ledger entry throws; a bad SHA-256 shape throws; a record without `aab` throws; a matching record passes. And for the script: `bash -n` passes; `--dry-run` on a non-Linux host exits non-zero with "only on x86-64 Linux" and prints nothing to stdout (as `bootstrap.sh`).
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-record.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** The script, in order, refusing at the first failure: tag exists and matches a ledger entry with `state: "built"` pending or absent; export the tagged commit with `git archive` from a dedicated blobless clone `~/blanc-release` (never `~/blanc`, which holds other sessions' trees); `apply.py --lane android --apply --backup` with a previous map built from `<commit>`'s `source-map-android.json` (upstream, upstreamFiles) and `source-map.json` (canonicalSha256), refusing if `apply.py` reports an unrecognized file; copy the ZXing jar and blocker bundle from `~/blanc-assets/`; write `out/AndroidRelease/args.gn` = `release-arm64.gn` + `blanc_android_version_name`, `android_override_version_name`, `android_override_version_code` lines; build `chrome_public_bundle`; check the generated `BlancRelease.java` holds the version; write `build.json`. `--dry-run` prints each action and changes nothing.
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5 [server]: Dry run, then the first official build** (owner approval 4) for `android-v1.0.0-beta.1-1` with `--gates`; record wall time in the README.
- [ ] **Step 6: Commit.** `git commit -m "Android A7: release builds from a tag on the server"`

### Task 5: Release gates on the emulator

**Files:**
- Create: `chromium/tests/android/release-gate.sh`, `chromium/tests/android/release-gate-exclusions.json`
- Test: `chromium/tools/android-release-gate.test.mjs`

**Interfaces:**
- Consumes: Task 4's `gatesApk`; `outbound-gate.mjs`; `acceptance/run.sh` (`androidSmoke`); `gate-lib.sh`.
- Produces: `release-gate.sh <apk> <evidence>` → `Release gate: pass|FAIL (...)`; exclusions file `[{scenario, needs, reason}]`, each `needs` naming the preview hook (`--blanc-sync-test`, `--blanc-test-ping-host`, …) the scenario depends on.

- [ ] **Step 1: Write the failing tests:** every exclusion names an existing scenario id from `spec/acceptance` and a `needs` switch that `chromium/blanc` only honors under `ENABLE_BLANC_TEST_HOOKS`; the gate script runs `outbound` before `acceptance` and fails if either fails; it refuses an APK whose package isn't `me.bnfy.blanc`.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-gate.test.mjs` → FAIL.
- [ ] **Step 3: Implement** the script (outbound gate, then `androidSmoke` minus the exclusions via `--tags "not (...)"`), and the exclusions list, built by running `androidSmoke` against the release APK once and listing only scenarios that fail for want of a hook.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5 [server]: Run** `release-gate.sh` on `android-v1.0.0-beta.1-1`'s gates APK; the excluded scenarios run on the same commit's debug build in the same session. Both results go in the build's evidence folder.
- [ ] **Step 6: Commit.** `git commit -m "Android A7: release gates on the emulator"`

### Task 6: Verify and sign the bundle on the Mac

**Files:**
- Create: `chromium/android/release/aab.mjs`, `chromium/android/release/upload-cert.json` (`{"sha256": ""}` until owner step 2)
- Test: `chromium/tools/android-release-aab.test.mjs`

**Interfaces:**
- Consumes: Task 4's record; `bundletool` and `jarsigner` on PATH (the script checks and names what's missing).
- Produces: `checkManifest(manifestXml, record) -> string[]` (problems): package `me.bnfy.blanc`, `versionCode`/`versionName` equal the record, no `android:debuggable="true"`; `checkEntries(names) -> string[]`: native libs only under `lib/arm64-v8a/` in every module, the four notices present under the pages bundle path; `signBundle(input, output, {keystoreRef, aliasRef, passwordRef}, run = spawnSync) -> {certSha256}`.

- [ ] **Step 1: Write the failing tests** on fixture strings and entry lists: wrong package, debuggable, mismatched code, an `armeabi-v7a` or `x86` lib, a missing notice — each reported. `signBundle` with a stub `run`: the keystore goes to a `0600` file under a `0700` temp dir, its path never appears in argv logged to stdout, the existing `META-INF/*.SF|*.RSA|*.EC|MANIFEST.MF` entries are removed before `jarsigner`, the temp dir is deleted when `jarsigner` fails and when it succeeds, and a signer certificate whose SHA-256 differs from `upload-cert.json` is an error.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-aab.test.mjs` → FAIL.
- [ ] **Step 3: Implement.** Secrets come only from `op read` inside `op run`'s environment (1Password item names in `docs/android/play-console.md`); passwords reach `jarsigner` through `-storepass:env`/`-keypass:env`, never argv.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: verify and sign the bundle on the Mac"`

### Task 7: Checksums, SBOM and Sigstore

**Files:**
- Modify: `chromium/release/sbom.mjs` (extract `gatherComponents(scan, src, options)` from `gather`; `gather` calls it unchanged in behavior)
- Create: `chromium/android/release/attest.mjs`
- Test: `chromium/tools/android-release-attest.test.mjs`; existing `chromium/release/sbom.test.mjs` must pass unchanged

**Interfaces:**
- Consumes: `sbom_scan.py --target //chrome/android:chrome_public_bundle --out-dir out/AndroidRelease` [server], `gatherComponents`, `makeSbom`.
- Produces: in the release work folder `Blanc-Android.cdx.json`, `SHA256SUMS` (signed bundle, SBOM, build record), `SHA256SUMS.sigstore.json`; `attest(workDir, env, run = spawnSync)` signs with `cosign sign-blob` then runs `cosign verify-blob --certificate-identity "$BLANC_COSIGN_IDENTITY" --certificate-oidc-issuer "$BLANC_COSIGN_OIDC_ISSUER"` and throws if verification fails or either variable is unset.

- [ ] **Step 1: Write the failing tests:** `SHA256SUMS` lists exactly the three files with correct digests, sorted; `attest` refuses without both pins; a failed `verify-blob` throws; the SBOM's top component is `Blanc for Android` with the record's version name.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-attest.test.mjs chromium/release/sbom.test.mjs` → new tests FAIL, `sbom.test.mjs` PASS.
- [ ] **Step 3: Implement** the extraction and `attest.mjs`.
- [ ] **Step 4: Run** → all PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: checksums, SBOM and Sigstore for releases"`

### Task 8: The Play Developer API client

**Files:**
- Create: `chromium/android/release/play-api.mjs`
- Test: `chromium/tools/android-release-play.test.mjs`

**Interfaces:**
- Produces: `accessToken(serviceAccountJson, now, fetchImpl) -> Promise<string>` (RS256 JWT via `node:crypto`, scope `https://www.googleapis.com/auth/androidpublisher`); `uploadToInternal({packageName, aabPath, versionCode, releaseName, token}, fetchImpl) -> Promise<{editId, versionCode}>` doing, in order, `edits.insert` → `edits.bundles.upload` (`uploadType=media`, `application/octet-stream`) → `edits.tracks.update` (`internal`, `releases: [{name, versionCodes: [String(versionCode)], status: "completed"}]`) → `edits.commit`; on any failure before commit it calls `edits.delete` and rethrows.

- [ ] **Step 1: Write the failing tests** with a recording fake `fetch`: the four calls in order with the right URLs and bodies; the uploaded `versionCode` differing from the requested one throws before `tracks.update`; a failure at `tracks.update` triggers `edits.delete` and no `commit`; the credential JSON never appears in any request except the token exchange's signed assertion.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-play.test.mjs` → FAIL.
- [ ] **Step 3: Implement** (no new npm dependency).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: Play Developer API upload to the internal track"`

### Task 9: The release orchestrator

**Files:**
- Create: `chromium/android/release/release.mjs`
- Create: `chromium/android/release/pixel-10-pro.json` (bundletool device spec: `supportedAbis: ["arm64-v8a"]`, `supportedLocales` the six languages, `screenDensity: 480`, `sdkVersion: 36`)
- Create: `docs/android/release.md` (how the owner runs it)
- Test: `chromium/tools/android-release-stages.test.mjs`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7, 8.
- Produces: `node chromium/android/release/release.mjs <stage> WORK` with stages `status`, `fetch`, `verify`, `sign`, `attest`, `upload`; `WORK/state.json` records each finished stage's outputs and digests.

- [ ] **Step 1: Write the failing tests:** a stage refuses to run before its predecessor; a stage whose recorded input digest no longer matches refuses; `fetch` refuses a bundle whose SHA-256 differs from `build.json`; `upload` asks for the typed confirmation `upload <versionName> (<versionCode>) to internal` and does nothing on any other input; `upload` refuses a code the ledger marks `uploaded`; the ledger is marked `uploaded` only after `uploadToInternal` resolved; `verify` also records the download size (`bundletool get-size total` for `pixel-10-pro.json`) in `state.json`.
- [ ] **Step 2: Run** `node --test chromium/tools/android-release-stages.test.mjs` → FAIL.
- [ ] **Step 3: Implement**, and write `docs/android/release.md` (the six stages, what each needs from 1Password, and that `upload` is run only with the owner's approval in a foreground Terminal).
- [ ] **Step 4: Run** → PASS; then `node --test chromium/tools/*.test.mjs chromium/release/*.test.mjs` → all PASS.
- [ ] **Step 5: Commit.** `git commit -m "Android A7: the release script, fetch to upload"`

### Task 10: Play setup records and the app's size (K3)

**Files:**
- Modify: `docs/android/play-console.md` (what is now set up, the upload-key command, the 1Password item names, the service account's permissions)

- [ ] **Step 1: Write** the upload-key command: `keytool -genkeypair` with alias `blanc-upload`, RSA 4096, validity 10000 days, into a temp `0600` file, then `op document create` into vault Dev as "Blanc Android upload key", then delete the temp file; and how to read the certificate's SHA-256 for `upload-cert.json`.
- [ ] **Step 2 [Mac, after Task 9 runs]: Record** the download size Task 9's `verify` stage measured in `STATUS.md` (K3) and the ledger note.
- [ ] **Step 3: Commit.** `git commit -m "Android A7: Play setup records and download size"`

### Task 11: The rebase drill (K4)

**Files:**
- Create: `chromium/tools/refresh-upstream.py`, `chromium/android/rebase-ledger.json`, `docs/android/rebase.md`
- Test: `chromium/tools/refresh-upstream.test.mjs`

**Interfaces:**
- Produces: `refresh-upstream.py --lane android --src <checkout> --version <x.y.z.w>` copies each file listed in `chromium/upstream-android/manifest.json` from the new checkout, rewrites the manifest's hashes, `upstream` and `version`, updates `lanes/android.json` and `source-map-android.json` to match, and prints files that vanished upstream (it never deletes a manifest entry by itself). Ledger rows `{from, to, startedAt, finishedAt, hours, patchesConflicted: [..], notes}`.

- [ ] **Step 1: Write the failing tests** on a temp fixture lane: hashes and pins update; a file missing in the new checkout is reported and the run exits 1 without writing anything; `check-patches.py --lane android` passes on the refreshed fixture.
- [ ] **Step 2: Run** `node --test chromium/tools/refresh-upstream.test.mjs` → FAIL.
- [ ] **Step 3: Implement**, and write `docs/android/rebase.md`: find the newest Chrome stable for Android on chromiumdash, fetch that revision on the server, refresh the pin, rebase each `patches/android/*` patch in order, rebuild debug and release, run the A5c gate (split) and `release-gate.sh`, record the times.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5 [server, owner approval 6]: Run the drill** onto the newest Chrome stable for Android at that date; it lands as its own PR within 7 days of starting; its row goes in `rebase-ledger.json`.
- [ ] **Step 6: Commit.** `git commit -m "Android A7: pin refresh tool and the rebase drill"`

### Task 12: Records and the exit gate

**Files:**
- Modify: `chromium/STATUS.md` (an "A7 Release pipeline" section with the exit gate table), `chromium/android/release/ledger.json`

- [ ] **Step 1: Fill the A7 gate table:** the release-signed `1.0.0-beta.1` (code 1) on the internal track installs over Play on the Pixel (owner, step 5); release gate result and exclusions; SBOM and Sigstore verified; download size (K3); rebase drill time and cost (K4); anything Play's review raised (K5); the security clock rule (§8.3) restated with where misses are recorded.
- [ ] **Step 2: Commit.** `git commit -m "Android A7: record the release pipeline and the drill"`
