# Linux fork L3: a public Linux beta that updates through the system Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax. Codex implements; Claude reviews each task before the next starts.

**Goal:** Blanc Beta for Linux (x64 and arm64): `.deb` and `.rpm` packages on a GitHub pre-release,
without test hooks, that set up Blanc's signed repository on `pkg.blanc.day` so every later beta
arrives through apt or dnf with the system's other updates, and that ask to relaunch when a newer
version is installed.

**Architecture:** the beta channel is a third platform of the Windows beta's model: its own ledger and
release tool (`chromium/release/linux-release.mjs`, owner-run, resumable, typed confirmation before the
irreversible stages), its own GitHub pre-release (`chromium-beta-linux-<version>`, never latest), and
build numbers from the sequence Windows already uses. The repository is static files in two Cloudflare
R2 buckets behind custom domains. A GitHub runner builds the repository metadata from the exact
packages (no key there); the owner's Mac signs the metadata and the `.rpm`s and uploads; staging takes
every release first and a runner proves N to N+1 from it through apt and dnf before production gets
the same bytes.

**Tech stack:** Chromium 158.0.8127.2 official builds (`is_official_build = true`), Chromium's
`//chrome/installer/linux`, `apt-ftparchive` and `createrepo_c` on the runner, GnuPG and `rpmsign` on
the owner's Mac, Cloudflare R2 and `wrangler`, GitHub Actions (`ubuntu-24.04`, `ubuntu-24.04-arm`,
Docker `debian:12` and current Fedora), Sigstore (`cosign`) as for every Blanc release.

**Spec:** [`docs/superpowers/specs/2026-11-21-linux-fork-design.md`](../specs/2026-11-21-linux-fork-design.md)
§3 (whole), §4 (identity's beta values, sandbox, blocker), §5's L3 row, §6. **Before it:**
[L1](2026-11-21-linux-fork-l1.md) (packages, identity, key, install check) and
[L2](2026-11-21-linux-fork-l2.md)'s gate. Tasks 1 to 4 can start once L1's Task 4 is on `chromium/next`;
Task 7 onward needs both gates.

## Decisions this plan asks the owner for (approving the plan approves them)

1. **Two official cold builds and their incremental rebuilds:** `out/BlancLinuxBeta` (x64) and
   `out/BlancLinuxArm64Beta` (arm64), with `is_official_build = true` like `BlancWinBeta`, in the
   shared checkout under the Windows-release rule.
2. **Cloudflare resources, inside the free tier:** two R2 buckets, `blanc-linux-packages` (production,
   custom domain `pkg.blanc.day`) and `blanc-linux-packages-staging` (`pkg-staging.blanc.day`), created
   by the owner or by `wrangler` with the owner's approval. Each keeps the newest **3** versions per
   package per architecture: about 1.5 GB per bucket, under R2's 10 GB free storage.
3. **The first public Linux beta's version is the one the update proof installs as N+1.** The N it
   updates from is a proof-only build (same source, build number one lower), never published and
   recorded in the ledger as `proofOnly: true`, as Windows proved .900 to .901 before going public.
4. **The first Linux beta ships x64 and arm64 together.** If arm64 fails a gate, it waits for the next
   beta and the release says so; x64 doesn't wait for it.
5. **What the release notes and Download page say about updates:** "Updates come through your system's
   software updates (apt or dnf)". Ubuntu's unattended upgrades skip third-party repositories unless
   allowed, so the copy says "offered", never "installed automatically" (spec §3).

## Facts this plan rests on (read 2026-11-21 at the pin and on `chromium/next` 2439f5ee2)

- **Update notifications:** `chrome/browser/buildflags.gni:20` `enable_update_notifications =
  is_chrome_branded`; `upgrade_detector_impl.cc:71,485` gate the polling and notification on
  `ENABLE_UPDATE_NOTIFICATIONS`. On Linux, `get_installed_version_linux.cc` runs the current process's
  executable with `--product-version` and parses the reply, so a package manager replacing the files
  under a running browser is detected. The poller runs every 2 hours by default
  (`installed_version_poller.cc:116`) and the first notification stage comes about an hour after
  detection (`upgrade_detector_impl.cc:51`), so people see the prompt within about 3 hours of an
  update; the release notes say "after a while", not "right away".
- **Cron and opt-out:** `common/apt.include` writes the keyring to `/usr/share/keyrings/@@PACKAGE.gpg`
  and honors `/etc/default/@@PACKAGE` (`repo_add_once`, `repo_reenable_on_distupgrade`); `repo.cron`
  runs daily and re-adds the source unless opted out. `rpm.include` and `rpmrepo.cron` do the same for
  dnf.
- **Version:** patch 0103 stamps `chrome/VERSION`'s PATCH from `blanc_win_version_patch`, which
  `config.gni` sets only for a Windows beta; `installer.py` reads `installer/version.txt`, which comes
  from the same `process_version`.
- **Beta gating:** `config.gni:28-31` asserts the beta channel for `mac` or `win`/x64 only.
- **Windows release model:** `chromium/release/windows-release.mjs` (378 lines) `STAGES` `preflight`,
  `sign`, `package`, `upload`, `staging-gate`, `manifest`, `draft` (point of no return), `sigstore`,
  `publish`, `verify-public`; record schema 1 with `version`, `build`, `previousBuild`, `tag`,
  `sourceCommit`, `candidate`; preflight requires `build > last`. Owner wrappers live in
  `chromium/windows/owner/*.command`. Ledger `chromium/release/windows-ledger.json`; last build 904
  (`sourceCommit` 7721085b0).
- **Website:** `site/src/data/blanc-beta-windows.json` and
  `docs/website-blanc-beta-windows-158.0.8127.902-claims.json` are the Windows tile's data and claims
  ledger; `docs/marketing-claims.md` governs copy.
- **Public promise:** the owner's release-notes newsletter of 2026-11-21 said a Linux build of Blanc
  Beta is coming "this week" and that a note will go to the list when it's ready.

## Global constraints

- L0 to L2's constraints hold (guarded server builds, the Windows-release rule, the checkout lock, the
  Android checkout untouched, no `--no-sandbox`, Ubuntu's restriction left on, Linux-only code behind
  `IS_LINUX`).
- **Keys:** the repository key's secret half lives only in 1Password ("Blanc Linux Repository
  Signing") and a throwaway `GNUPGHOME` on the owner's Mac during a signing stage. Never on the server,
  a runner, in R2, or in Git. Cloudflare credentials stay in `wrangler`'s own login on the owner's Mac.
- **Same bytes:** production receives exactly the files that passed staging (checked by SHA-256);
  nothing is rebuilt or re-signed between them.
- **Ordering in a repository:** pool files first, then metadata, `InRelease`/`repomd.xml` last; apt
  metadata is published with `Acquire-By-Hash: yes` and `by-hash/` copies, so a client mid-update never
  sees mismatched hashes. Metadata objects carry `Cache-Control: no-cache`; pool objects
  `public, max-age=31536000, immutable`.
- **Build numbers:** one sequence with Windows. A Linux build either equals a Windows ledger build with
  the same `sourceCommit`, or exceeds the highest build in both ledgers. Linux builds only increase.
- **Nothing public before the `publish` stage:** no download link, website copy, social post or
  newsletter about the Linux beta. The newsletter note is the owner's to send after verify-public.
- The latest GitHub release stays Electron Blanc's; the Mac and Windows betas' flows don't change.

## Review Focus

1. **A system that never ran the cron** (installed with `--no-scripts`, or `repo_add_once="false"` in
   `/etc/default/blanc-beta`): no repository is added and nothing nags; the Download page's manual
   commands work. Task 3's test renders the cron with the opt-out file present and asserts no source is
   written.
2. **An update while the browser runs:** apt replaces `/opt/bnfy/blanc-beta` under it; the running
   browser keeps working (Chromium's zygote and renderers are already loaded), new tabs open, and the
   relaunch prompt appears within the poller's interval. Task 6's proof opens a new tab after the
   upgrade before relaunching.
3. **A client mid-update when metadata changes** (apt fetched `InRelease` from N, then N+1 lands):
   by-hash keeps it consistent. Task 4's test publishes twice into a local directory and checks every
   hash named by both `InRelease` files resolves.
4. **A tampered package, metadata signed by another key, an unsigned `.rpm`:** apt and dnf refuse and
   N keeps running. Task 6's refusal legs.
5. **Uninstall** (`apt purge`, `dnf remove`) removes the repository source and keyring the package
   added, keeps `~/.config/blanc-beta`, and leaves Electron Blanc and Chromium's entries alone. Task 6.

---

### Task 1: The beta channel builds for Linux

**Files:**
- Modify: `chromium/blanc/config.gni` (allow `target_os == "linux"` with x64 or arm64 for the beta;
  set `blanc_win_version_patch` for a Linux beta too, with a comment that the name predates Linux),
  `chromium/tools/build.mjs` and `build.test.mjs` (`BlancLinuxBeta`, `BlancLinuxArm64Beta`; targets
  `chrome`, `chrome_sandbox`, `//chrome/installer/linux:beta`)
- Create: `chromium/linux/args/beta-x64.gn`, `chromium/linux/args/beta-arm64.gn` (as
  `chromium/windows/args/beta-x64.gn`: official, non-branded, `blanc_channel = "beta"`, Widevine off,
  `blanc_beta_build`, `blanc_beta_version = "2.0.0-beta.<build>"`, `blanc_blocker_bundle =
  "/home/blanc/blanc-assets/blocker"`, `symbol_level = 0`, no `enable_updater`)
- Create: patch `0115-blanc-linux-update-notifications.patch`
  (`chrome/browser/buildflags.gni`: `enable_update_notifications = is_chrome_branded ||
  (is_linux && blanc_channel == "beta")`)
- Create: `chromium/tools/linux-beta-config.test.mjs`

**Interfaces:**
- Produces: `BlancLinuxBeta` / `BlancLinuxArm64Beta` outputs whose `--product-version` prints
  `158.0.8127.<build>` and whose packages are `blanc-beta_158.0.8127.<build>-1_<deb_arch>.deb` and
  `blanc-beta-158.0.8127.<build>-1.<rpm_arch>.rpm`.

- [ ] **Step 1: Failing test** `linux-beta-config.test.mjs`: both args files parse, carry
  `is_official_build = true`, `blanc_channel = "beta"`, `enable_widevine = false`, the same
  `blanc_beta_build` and the matching `target_cpu`; `config.gni`'s beta assertion admits linux x64 and
  arm64 and still refuses linux x86; the patch's added line names `is_linux` and `blanc_channel ==
  "beta"` and nothing else changes for Mac or Windows; test hooks are off (`blanc_enable_test_hooks`
  false for the beta channel, unchanged).
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** **Step 4: Run** with the fork suite and both
  lanes' patch checks; expected PASS. **Step 5: Commit** `Fork Linux: the beta channel builds for Linux (L3)`.

### Task 2: Restart to update, through the Island

**Files:**
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (an `UpgradeObserver` under
  `BUILDFLAG(IS_LINUX) && BUILDFLAG(BLANC_BETA_CHANNEL)`), `chromium/blanc/island/host.js`,
  `copy/messages/en.json` and every translation in the same change (fork strings pin rules apply)
- Create: `chromium/tests/linux-relaunch.mjs`

**Interfaces:**
- Produces: the Island's existing pill notice (`onPillNotice`) with kind `update-ready` and text
  `Restart to update Blanc Beta`; clicking it calls `chrome::AttemptRestart()`, which restores the
  session as Chromium's own relaunch does. The app menu's Chromium "Relaunch to update" item stays.

- [ ] **Step 1: Failing test** (`chromium/tools/linux-update-notice.test.mjs`): the host maps
  `update-ready` to the notice with the `relaunch` action; the string exists in every language; the
  C++ block is inside both build flags.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement**: on `OnUpgradeRecommended` the observer sends the
  notice to every Island window once per detected version. **Step 4: Run**; PASS.
- [ ] **Step 5:** `linux-relaunch.mjs` (runner): launch beta N from `/opt/bnfy/blanc-beta`, replace the
  install with N+1 (`dpkg -i`), wait for the notice with N launched under
  `--check-for-update-interval=10` (read in every build, `installed_version_poller.cc:85`, and it
  also shortens the notification stages, `upgrade_detector_impl.cc:103`), click it, and assert the
  relaunched process reports N+1 and the previous tabs are back.
- [ ] **Step 6: Commit** `Fork Linux: restart to update through the Island (L3)`.

### Task 3: Packages that add the repository, and an honest opt-out

**Files:**
- Modify: L1's patch 0114 only if Task 3's test finds the beta's rendered cron, defaults file or
  uninstall scripts wrong
- Create: `chromium/tools/linux-repo-scripts.test.mjs`, `chromium/linux/manual-repository.md` (the
  commands the Download page shows)

- [ ] **Step 1: Failing test**: render `repo.cron`, `apt.include`, `rpm.include`, `rpmrepo.cron`,
  `postinst`, `prerm`, `postrm` for channel `beta` and assert: apt source
  `/etc/apt/sources.list.d/blanc-beta.list` with
  `deb [arch=<arch> signed-by=/usr/share/keyrings/blanc-beta.gpg] https://pkg.blanc.day/deb stable main`;
  keyring bytes equal the dearmored `chromium/linux/keys/blanc-repository.asc`; dnf file
  `/etc/yum.repos.d/blanc-beta.repo` with `baseurl=https://pkg.blanc.day/rpm/stable/$basearch`,
  `gpgcheck=1`, `repo_gpgcheck=1`, `gpgkey=` the same key; `/etc/default/blanc-beta` with
  `repo_add_once="false"` writes nothing (Review Focus 1); purge removes the list, keyring and repo
  file (Review Focus 5); no rendered file names `dl.google.com` or `pkg-staging`.
- [ ] **Step 2: Run**; FAIL until the beta rendering is right. **Step 3: Fix** and write
  `manual-repository.md` (download the key, `gpg --dearmor` into `/usr/share/keyrings/blanc-beta.gpg`,
  the source line; `rpm --import` and the `.repo` file) with each command tested by Step 1's fixtures.
- [ ] **Step 4: Commit** `Fork Linux: the beta's repository scripts and manual setup (L3)`.

### Task 4: Repository metadata, signing and upload

**Files:**
- Create: `chromium/linux/repository/build-metadata.sh` (runner: `apt-ftparchive` with
  `chromium/linux/repository/apt-ftparchive.conf`, `createrepo_c --update`; inputs the exact packages
  by SHA-256; outputs an unsigned tree and `tree.json` listing every path and SHA-256)
- Create: `chromium/linux/owner/repository-sign.command` (owner's Mac: verify `tree.json`, `rpmsign
  --addsign` each `.rpm` if L1's step didn't, `gpg --clearsign` → `InRelease`, `--detach-sign` →
  `Release.gpg` and `repomd.xml.asc`, verify each with the committed public key, then shred the
  throwaway `GNUPGHOME`)
- Create: `chromium/linux/owner/repository-upload.command` (`wrangler r2 object put` in the ordering
  and cache headers of Global Constraints, to `staging` or `production`; production refuses any file
  whose SHA-256 differs from staging's copy; prunes to 3 versions per package per arch after upload)
- Create: `chromium/linux/repository/plan-upload.mjs` and `chromium/tools/linux-repository.test.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (job `repo-metadata`, selected by L2's `check` input as `check=repo-metadata`)

**Interfaces:**
- Produces: `planUpload(tree, {target: 'staging'|'production', stagingTree?}) -> [{key, file, sha256,
  cacheControl, phase: 'pool'|'metadata'|'release'}]`, ordered by phase; throws on a production file
  absent from or differing from staging.

- [ ] **Step 1: Failing tests** in `linux-repository.test.mjs`: `planUpload` orders pool before
  metadata before `InRelease`/`Release.gpg`/`repomd.xml{,.asc}`; cache headers per phase; production
  refuses a differing file; pruning keeps the newest 3 versions and never removes one named by the
  current metadata; Review Focus 3 (two consecutive publishes into a temp dir by the real
  `build-metadata.sh` when `apt-ftparchive` is installed, else skipped with the reason: every hash in
  both `InRelease` files resolves under `by-hash/`).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run**; PASS.
- [ ] **Step 5: Cloudflare (owner approval, decision 2):** create both buckets and attach the custom
  domains; record bucket names, domains and the date in `chromium/linux/repository.md`. A `GET` of
  `https://pkg-staging.blanc.day/deb/dists/stable/InRelease` answers 404 until the first upload.
- [ ] **Step 6: Commit** `Fork Linux: repository metadata, signing and upload (L3)`.

### Task 5: The release tool

**Files:**
- Create: `chromium/release/linux-release.mjs`, `chromium/release/linux-release.test.mjs`,
  `chromium/release/linux-ledger.json` (`{"schema": 1, "builds": []}`),
  `chromium/linux/owner/linux-release.command`
- Modify: `chromium/release/windows-release.mjs` only to export the shared build-number check

**Interfaces:**
- Produces: `STAGES = ['preflight', 'build-check', 'sign', 'staging', 'update-proof', 'manifest',
  'draft', 'sigstore', 'publish', 'verify-public']`, point of no return `draft`;
  `linux-release.mjs status|<stage> WORK`; record `WORK/linux-release.json` schema 1: `version`
  (`158.0.8127.<build>`), `build`, `previousBuild`, `tag` (`chromium-beta-linux-<version>`),
  `prerelease: true`, `makeLatest: false`, `sourceCommit` (40 hex, on `chromium/next`), `candidates`
  `{x64: {id, tarSha256}, arm64?: {id, tarSha256}}`.
- Produces: `checkSharedBuild(build, sourceCommit, {windows, linux}) -> void` (throws unless `build`
  equals a Windows ledger build with the same commit or exceeds both ledgers' highest; and exceeds
  Linux's last).

- [ ] **Step 1: Failing tests** in `linux-release.test.mjs` on the model of `windows-release.test.mjs`:
  record validation (each field above), `checkSharedBuild` (equal-to-Windows with same commit passes,
  equal with another commit fails, below both fails, above both passes), stage order and resumption,
  no stage after `draft` reruns `draft`, typed confirmation required for `draft` and `publish`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement the stages:**
  1. `preflight`: record valid; `checkSharedBuild`; tag and release absent; key fingerprint in
     `repository.md` matches the committed key.
  2. `build-check`: each candidate on the `fork-linux-candidate` draft with its SHA-256, built from
     `sourceCommit` with the beta args, `scanPackage` clean against the committed key's fingerprint, `--product-version` equals `version`, no
     test hooks (`--blanc-test` ignored by the installed binary, checked by the smoke).
  3. `sign`: runs `repository-sign.command` (owner) on the metadata the `repo-metadata` job built for
     staging; verifies every signature with the committed key.
  4. `staging`: `repository-upload.command staging`.
  5. `update-proof`: dispatches Task 6's proof against staging from `previousBuild` to `build`, waits,
     requires every leg green.
  6. `manifest`: assets per arch `blanc-beta_<version>-1_<deb_arch>.deb`,
     `blanc-beta-<version>-1.<rpm_arch>.rpm`, `blanc-repository.asc`, `linux-release.json`,
     `NOTICES.txt`, `RELEASE-MANIFEST.json`, `SHA256SUMS`.
  7. `draft` (typed `DRAFT <version>`): tag, draft pre-release, assets read back.
  8. `sigstore`: as Windows (Safari, pinned identity).
  9. `publish` (typed `PUBLISH <version>`): `repository-upload.command production` with staging's
     bytes, then the GitHub release published; latest must still be Electron's.
  10. `verify-public`: dispatches Task 7's check; requires it green.
- [ ] **Step 4: Run**; PASS. **Step 5: Commit** `Fork Linux: the release tool (L3)`.

### Task 6: The update proof from staging

**Files:**
- Create: `chromium/tests/linux-update-proof.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (job `update-proof`, `check=update-proof`, inputs `from`,
  `to`, `repository=staging`)

- [ ] **Step 1: Write the proof.** Legs per arch: Ubuntu 24.04 on the runner (apt), Debian 12 and
  current Fedora in containers (apt, dnf). Each: install N from staging's pool by package file; check
  the cron wrote the production source, then point it at staging for the test (a test-only override
  file under `/etc/apt/sources.list.d/` and `/etc/yum.repos.d/`, removed after); launch N; staging
  publishes N+1; `apt-get update && apt-get install --only-upgrade blanc-beta` / `dnf upgrade
  blanc-beta`; Review Focus 2 (a new tab works before relaunch); Task 2's notice appears; relaunch
  shows N+1. Refusals (Review Focus 4): a `.deb` with one byte changed in the pool → apt's hash check
  fails and N stays; metadata signed by a throwaway key → `apt-get update` refuses `InRelease`, dnf
  refuses `repomd.xml`; an unsigned `.rpm` → dnf refuses. Uninstall leg (Review Focus 5). Electron
  Blanc's AppImage launches afterwards.
- [ ] **Step 2: First run (decision 3):** build `B-1` (proof-only) and `B` from the same commit, publish
  `B-1` then `B` to staging, run the proof. Record runs in `chromium/reports/l3-linux.json`.
- [ ] **Step 3: Commit** `Fork Linux: the update proof from staging (L3)`.

### Task 7: Verify-public

**Files:**
- Create: `chromium/tests/linux-verify-public.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (job `verify-public`, `check=verify-public`, input
  `version`; this job downloads only public assets and takes no token)

- [ ] **Step 1:** Logged out (no token in the job): download every asset of
  `chromium-beta-linux-<version>`; check `RELEASE-MANIFEST.json`, `SHA256SUMS` and `cosign
  verify-blob` with the pinned identity; the release is a pre-release and not latest. Fresh
  `ubuntu:24.04`, `debian:12` and current Fedora containers on x64 and arm64 install the public
  package, see `https://pkg.blanc.day` added, run `apt-get update` / `dnf makecache` without errors
  or warnings, and the package manager lists `blanc-beta` at `<version>` from the repository; the
  installed browser launches sandboxed (L0's smoke, no test hooks), the blocker starts with no
  override.
- [ ] **Step 2: Commit** `Fork Linux: verify-public (L3)`.

### Task 8: The first public Linux beta

- [ ] **Step 1: Builds (decision 1):** with no Windows release in progress, `setup.sh` then guarded cold
  builds of `BlancLinuxBeta` and `BlancLinuxArm64Beta` for `B-1`, then incremental builds for `B`
  (only version-stamped files change; stop if the plan says otherwise). Package and ship each.
- [ ] **Step 2: Owner hand checks** in the arm64 VM, recorded in `chromium/linux/hand-checks-l3.md`:
  install `B-1` from its `.deb`; Software Updater offers `B` from staging (with the test override);
  the Island's Restart to update appears and relaunches into `B`; the dock icon, keyring prompt,
  default browser and screen sharing as in L1/L2.
- [ ] **Step 3: Release** through `linux-release.command` (owner, foreground Terminal), every stage to
  `verify-public`.
- [ ] **Step 4: Records PR** (to `chromium/next`, then `main` as the owner asks): the ledger entries
  (`B-1` proof-only, `B` public), `l3-linux.json`, `STATUS.md`, `PLATFORMS.md` (updates, repository,
  uninstall), `repository.md`.
- [ ] **Step 5: Website PR** (website-only, separate): `site/src/data/blanc-beta-linux.json`, the
  Download page's Linux tile (both packages per arch and `manual-repository.md`'s commands), and
  `docs/website-blanc-beta-linux-<version>-claims.json` naming only the systems and sessions a gate
  ran on (spec §1) and decision 5's update wording; the owner approves the copy before merge and
  deploy.
- [ ] **Step 6: The promised note:** draft the release-notes list message for the owner (what it is,
  where to get it, which systems were tested, that it is a beta); the owner sends it.

## L3 gate (all must hold)

1. The update proof passes on every leg and both arches (or arm64 is deferred per decision 4), with
   all refusal legs refused.
2. Verify-public passes for the published version on x64 and arm64.
3. The owner's VM hand checks pass.
4. The latest GitHub release is still Electron Blanc's; the Mac and Windows betas are unaffected.
5. The owner approves the website copy before it deploys.

## Timing against the "this week" promise

Critical path: L1 (Tasks 1, 2, 4, 6 and 7) → Task 1 here → two official cold builds (the longest
step; an official build on the 20-core server has not been timed for Linux, so measure the first one
before promising a day) → Tasks 4 to 7 in parallel with the builds → proof → release. Task 4 Step 5
(Cloudflare) and L1's key (Task 1) are owner steps with no dependency; doing them first takes them off
the critical path. If verify-public can't pass by Friday 2026-11-27, tell the owner by Wednesday
2026-11-25 so the promised note can give a real date.

## Not in L3

A stable `blanc` package (the repository's layout leaves room for it), KDE or x64 desktop hand checks,
crash upload, Flatpak, Snap, AppImage, protected video, the Electron profile's Linux key storage (S2).
