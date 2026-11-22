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
build numbers reserved in one shared file that Windows uses too. The repository is two Cloudflare R2
buckets, each served by a small Worker that answers metadata from one atomically switched
**generation**, so a client never sees half a publish. The owner's Mac signs the `.rpm`s first; a
GitHub runner builds the repository metadata from exactly those signed packages (no key there); the
Mac checks every index entry against the approved hashes, signs the metadata, and uploads the whole
signed tree, whose digest is what staging proves and production receives.

**Tech stack:** Chromium 158.0.8127.2 official builds (`is_official_build = true`), Chromium's
`//chrome/installer/linux`, `apt-ftparchive` and `createrepo_c` on the runner, GnuPG and `rpmsign` on
the owner's Mac, Cloudflare R2 and `wrangler`, GitHub Actions (`ubuntu-24.04`, `ubuntu-24.04-arm`,
Docker `debian:12` and current Fedora), Sigstore (`cosign`) as for every Blanc release.

**Spec:** [`docs/superpowers/specs/2026-11-21-linux-fork-design.md`](../specs/2026-11-21-linux-fork-design.md)
§3 (whole), §4 (identity's beta values, sandbox, blocker), §5's L3 row, §6. **Before it:**
[L1](2026-11-21-linux-fork-l1.md) (packages, identity, key, install check) and
[L2](2026-11-21-linux-fork-l2.md)'s gate. Tasks 1 to 4 can start once L1's Task 4 is on `chromium/next`;
Task 7 onward needs both gates.

**Approved by the owner on 2026-11-21**, with the decisions below. **Review:** Codex reviewed it the
same day (11 findings: 7 blockers, 2 errors, 1 gap, 1 scope); all are folded in below, and its scope
finding changed decision 4 with the owner's agreement.

## Decisions this plan asks the owner for (approving the plan approves them)

1. **Two official cold builds and their incremental rebuilds:** `out/BlancLinuxBeta` (x64) and
   `out/BlancLinuxArm64Beta` (arm64), with `is_official_build = true` like `BlancWinBeta`, in the
   shared checkout under the Windows-release rule.
2. **Cloudflare resources, inside the free tier:** two R2 buckets, `blanc-linux-packages` (production)
   and `blanc-linux-packages-staging`, each behind a Worker on its domain (`pkg.blanc.day`,
   `pkg-staging.blanc.day`; Workers' free tier covers the traffic of a beta), created by the owner or by
   `wrangler` with the owner's approval. Each keeps the newest **3** versions per package per
   architecture, plus whatever the two previous metadata generations still name: about 2 GB per
   bucket, under R2's 10 GB free storage.
3. **The first public Linux beta's version is the one the update proof installs as N+1.** The N it
   updates from is a proof-only build (same source, build number one lower), never published and
   recorded in the ledger as `proofOnly: true`, as Windows proved .900 to .901 before going public.
4. **The first Linux beta ships x64 and arm64 together, and both are required** (owner, 2026-11-21,
   after Codex's review: the owner's VM is arm64, so it is the only real-desktop check, and spec §5's L3
   gate names both). If arm64 fails a gate, the release waits; if that endangers Friday, the owner hears
   by Wednesday 2026-11-25.
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
- **Signing order:** `rpmsign --addsign` rewrites an `.rpm`'s header, so its SHA-256 and size change;
  metadata indexed before signing would name the wrong file.
- **R2:** a single object read after a successful write is consistent, but two objects written by two
  puts can be read from different moments, and caches can keep a 404
  (developers.cloudflare.com/r2/reference/consistency/); `repomd.xml` and its `.asc`, and `InRelease`
  and the files it names, must therefore come from one generation.
- **Island notices:** `renderer.js:614-635` drops pill notices of unknown kinds and
  `:1521-1529` expires supported ones after 1.6 s, and a click opens the Island; fork strings come from
  the pinned catalogs (`chromium/tools/interface-strings.mjs:23-42`, `fork-strings.json`), not the
  working tree's `copy/messages`.
- **Smoke:** L0's `linux-smoke.mjs:73-98` requires preview test hooks and checks only that the blocker
  is ready, so it can't check a beta.
- **Version test:** `chromium/tools/windows-version.test.mjs:31` asserts `blanc_win_version_patch` is set
  only for Windows.
- **Windows numbering:** `windows-release.mjs:56-58` allocates from the Windows ledger alone, and its
  stage state is written after each stage finishes (`:352`).

## Global constraints

- L0 to L2's constraints hold (guarded server builds, the Windows-release rule, the checkout lock, the
  Android checkout untouched, no `--no-sandbox`, Ubuntu's restriction left on, Linux-only code behind
  `IS_LINUX`).
- **Keys:** the repository key's secret half lives only in 1Password ("Blanc Linux Repository
  Signing") and a throwaway `GNUPGHOME` on the owner's Mac during a signing stage. Never on the server,
  a runner, in R2, or in Git. Cloudflare credentials stay in `wrangler`'s own login on the owner's Mac.
- **Same bytes:** production receives exactly the files that passed staging (checked by SHA-256);
  nothing is rebuilt or re-signed between them.
- **Publishing a repository:** pool files first (immutable, `public, max-age=31536000, immutable`);
  then the whole metadata tree under `generations/<n>/`; then one write of the pointer object
  `current.json`. The Worker serves every metadata path (`dists/…`, `repodata/…`) from the generation
  `current.json` names, with `Cache-Control: no-cache`, and never caches a 404. apt metadata also
  carries `Acquire-By-Hash: yes` with `by-hash/` copies. The previous two generations and every pool
  file they name are kept. One publisher at a time: the upload takes a lock object and refuses if
  another is held.
- **Build numbers — ON HOLD (2026-11-21):** the owner approved a Windows nightly that builds at the next
  free number without committing it, so this rule is changing to "the claim *names* the source commit"
  (`{build, sourceCommit, platforms[], purpose}`; a release checks only earlier claims; a rejected push
  re-reads the tip and retries; the committed beta args keep a development number; the release proves
  the candidate's `treeCommit` and compiled-in build equal its claim). Task 5 waits for the Windows
  nightly plan (`docs/superpowers/specs/2026-11-21-windows-nightly-design.md`) and is then reworked to
  that form. The paragraph below is the superseded first agreement.
- **Build numbers** (first agreement with the Windows Beta session, 2026-11-21, superseded above): one desktop sequence for Windows
  and Linux, kept in `chromium/release/build-reservations.json` on `chromium/next`, keyed by sequence
  (`{"schema": 1, "sequences": {"desktop-158": [{build, platforms, purpose}]}}`, seeded with Windows'
  902, 903 and 904). The Mac beta's own `2.0.0-beta.N` sequence stays out of it. **The reservation commit
  is the release's source commit:** one commit adds the entry and bumps the build in each named
  platform's committed beta args (`chromium/windows/args/beta-x64.gn`,
  `chromium/linux/args/beta-{x64,arm64}.gn`), and is pushed; a rejected push means someone reserved
  first, so re-read, pick again and recommit. A reservation may name both platforms (both args bumped
  in that one commit), so one number can be the same browser on both, as spec §3 wants. A release's
  `sourceCommit` must be the commit that introduced its build's entry, naming its platform. Every new
  number exceeds every reserved or ledger build on every platform; gaps are fine (Chromium's updater
  and apt and dnf compare versions only). `previousBuild` stays the platform's own last released build.
  Reserve once per release, not per candidate. A failed public beta is replaced by a higher number.
  Any fix that lands after reserving and before the release needs a fresh reservation and number (the
  old one becomes a gap); `reserve-build.mjs` says so, and a mismatch fails with "sourceCommit didn't
  introduce a <platform> reservation: reserve a new build", not a bare check failure.
- **Irreversible writes are journaled:** before tagging, creating a release, switching production's
  generation or publishing, the tool writes its intent to `WORK/journal.json`; on resume it reconciles
  the remote state (tag SHA, release assets' hashes, production's `current.json`) against the journal
  before doing anything. Once clients can install `B`, recovery is the same bytes or a higher build.
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
   generations and by-hash keep it consistent. Task 4's real-tool test refreshes apt and dnf in a loop
   across a generation switch.
4. **A tampered package, metadata or an `.rpm` signed by another key, an unsigned `.rpm`:** apt and dnf
   refuse for that reason and N keeps running. Task 6's refusal legs.
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
- Create: patch `0116-blanc-linux-update-notifications.patch`
  (`chrome/browser/buildflags.gni`: `enable_update_notifications = is_chrome_branded ||
  (is_linux && blanc_channel == "beta")`)
- Create: `chromium/tools/linux-beta-config.test.mjs`

**Interfaces:**
- Produces: `BlancLinuxBeta` / `BlancLinuxArm64Beta` outputs whose `--product-version` prints
  `158.0.8127.<build>` and whose packages are `blanc-beta_158.0.8127.<build>-1_<deb_arch>.deb` and
  `blanc-beta-158.0.8127.<build>-1.<rpm_arch>.rpm`.

- Modify: `chromium/linux/server/setup.sh` and `chromium/linux/package-candidate.mjs`,
  `candidate.mjs`, `ship-candidate.sh` (choose `--out=BlancLinuxBeta|BlancLinuxArm64Beta`; beta
  packages `blanc-beta`; a beta candidate's asset name carries channel, arch and build,
  `blanc-linux-beta-<arch>-<build>-candidate.tar.gz`, so `B-1` and `B` never overwrite each other),
  `chromium/tools/windows-version.test.mjs` (admit a Linux beta)

- [ ] **Step 1: Failing test** `linux-beta-config.test.mjs`: both args files parse, carry
  `is_official_build = true`, `blanc_channel = "beta"`, `enable_widevine = false`, the same
  `blanc_beta_build` and the matching `target_cpu`; `config.gni`'s beta assertion admits linux x64 and
  arm64 and still refuses linux x86; the patch's added line names `is_linux` and `blanc_channel ==
  "beta"` and nothing else changes for Mac or Windows; test hooks are off (`blanc_enable_test_hooks`
  false for the beta channel, unchanged); `setup.sh` copies the committed beta args for the checkout's
  commit and refuses a build number with no reservation for `linux` introduced by that commit; beta
  asset names differ for `B-1` and `B`; `windows-version.test.mjs` admits a
  Linux beta and still refuses a Mac.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Check the pin** (after Task 1's patch, on the server): the
  generated Ninja alias for `//chrome/installer/linux:beta`, the package file names it writes, the
  version in each package's header (`dpkg-deb -f`, `rpm -qp --qf '%{VERSION}'`) and the installed
  binary's `--product-version`; use exactly those names in `build.mjs`. **Step 4: Implement.** **Step
  5: Run** with the fork suite and both lanes' patch checks; expected PASS. **Step 6: Commit** `Fork
  Linux: the beta channel builds for Linux (L3)`.

### Task 2: Restart to update, through the Island

**Files:**
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (an `UpgradeObserver` under
  `BUILDFLAG(IS_LINUX) && BUILDFLAG(BLANC_BETA_CHANNEL)`, and a fork-local `restartToUpdate` message
  handled only from the Island's own documents), `chromium/blanc/island/host.js` and `renderer.js`, the
  fork's pinned string catalog through `chromium/tools/interface-strings.mjs` / `fork-strings.json`
  (every language)
- Create: `chromium/tests/linux-relaunch.mjs`

**Interfaces:**
- Produces: a persistent **Restart to update** button in the Island's pill (not a 1.6 s notice), shown
  once an update is recommended and until restart, keyboard-reachable and labeled for screen readers;
  activating it sends `restartToUpdate`, which calls `chrome::AttemptRestart()` (session restored as
  Chromium's relaunch does) and does not open the Island. The app menu's "Relaunch to update" stays.

- [ ] **Step 1: Failing test** (`chromium/tools/linux-update-notice.test.mjs`): in a DOM test of the
  strip, an `update-ready` state shows the button until restart (not expiring), it is focusable and
  named, activating it sends `restartToUpdate` and doesn't open the Island; the string exists in every
  pinned catalog; the C++ block is inside both build flags; the message is refused from any other
  document.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement**: on `OnUpgradeRecommended` the observer sends the
  notice to every Island window once per detected version. **Step 4: Run**; PASS.
- [ ] **Step 5:** `linux-relaunch.mjs` (runner): launch beta N from `/opt/bnfy/blanc-beta`, replace the
  install with N+1 (`dpkg -i`), wait for the notice with N launched under
  `--check-for-update-interval=10` (read in every build, `installed_version_poller.cc:85`, and it
  also shortens the notification stages, `upgrade_detector_impl.cc:103`), activate it by keyboard,
  and assert a new browser process (different PID) reports N+1 and the previous tabs are back; the
  outbound log shows no request to a Google update or Chrome-releases host at any point.
- [ ] **Step 6: Commit** `Fork Linux: restart to update through the Island (L3)`.

### Task 3: Packages that add the repository, and an honest opt-out

**Files:**
- Modify: L1's patch 0115 only if Task 3's test finds the beta's rendered cron, defaults file or
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
  the source line; `rpm --import` and the `.repo` file; how to turn the repository off).
- [ ] **Step 4: Lifecycle on real systems** (`chromium/tests/linux-repo-lifecycle.mjs`, runner and
  containers, x64 and arm64, with a local HTTP server standing in for `pkg.blanc.day` through
  `/etc/hosts`): install, run the cron, upgrade, run the cron, `apt remove`, cron again, `apt purge`;
  the same for dnf; and the manual setup from `manual-repository.md` on a fresh system. After each step,
  list the sources, keyrings, `/etc/default/blanc-beta` and `~/.config/blanc-beta`, and assert the
  expected ones. Opt-out set before install: the cron never writes a source. Failure: with the
  repository host unreachable (DNS) and then answering 500, `apt-get update` / `dnf makecache` still
  updates the distribution's own repositories, the failure names only Blanc's source, and turning the
  source off per `manual-repository.md` clears it.
- [ ] **Step 5: Commit** `Fork Linux: the beta's repository scripts and manual setup (L3)`.

### Task 4: Repository metadata, signing and upload

**Files:**
- Order: (1) the owner's Mac signs each beta `.rpm` and writes a signed `approved-packages.json`
  (L1's `sign-candidate.command`, extended for beta candidates: every `.deb` and signed `.rpm` with its
  SHA-256, for both builds and both arches); (2) the runner builds metadata from exactly those files;
  (3) the Mac verifies, signs metadata and uploads.
- Create: `chromium/linux/repository/build-metadata.sh` (runner: checks each input against the signed
  `approved-packages.json`, then `apt-ftparchive` with `chromium/linux/repository/apt-ftparchive.conf`
  and `createrepo_c`; outputs an unsigned tree and `tree.json` listing every path and SHA-256)
- Create: `chromium/linux/owner/repository-sign.command` (owner's Mac: verify `approved-packages.json`'s
  signature, then that every package named in the apt `Packages` files and dnf `primary.xml` has an
  approved SHA-256 and size and nothing else is indexed; `gpg --clearsign` → `InRelease`,
  `--detach-sign` → `Release.gpg` and `repomd.xml.asc`; verify each with the committed public key;
  write `signed-tree.json` with the tree's digest (SHA-256 over the sorted path/hash list); shred the
  throwaway `GNUPGHOME`)
- Create: `chromium/linux/owner/repository-upload.command` (pool, then `generations/<n>/`, then
  `current.json`, under the publisher lock, to `staging` or `production`; production accepts only a
  tree whose digest staging proved; reads back through the public domain afterwards; prunes per
  decision 2)
- Create: `chromium/linux/repository/worker/` (the Worker: serves `current.json`'s generation for
  metadata paths and the pool as stored; no-cache metadata; 404s not cached) with its tests
- Create: `chromium/linux/repository/plan-upload.mjs` and `chromium/tools/linux-repository.test.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (job `repo-metadata`, selected by L2's `check` input as `check=repo-metadata`)

**Interfaces:**
- Produces: `planUpload(signedTree, {target: 'staging'|'production', provenDigest?, generation}) ->
  [{key, file, sha256, cacheControl, phase: 'pool'|'generation'|'pointer'}]`, ordered by phase, with
  `current.json` the single `pointer` write; throws when `target` is production and the tree's digest
  isn't `provenDigest`.

- [ ] **Step 1: Failing tests** in `linux-repository.test.mjs`: `planUpload` orders pool, generation,
  pointer, with exactly one pointer write; cache headers per phase; production refuses an unproven
  digest; pruning keeps the newest 3 versions and every file the current and two previous generations
  name; a second publisher is refused while the lock is held; the Worker test serves `repomd.xml` and
  `repomd.xml.asc` from the same generation across a pointer switch and doesn't cache a 404; the Mac's
  index check refuses a tree that indexes an unapproved or unsigned `.rpm`. Review Focus 3 with the real
  tools (when installed on the runner): a real `apt-get update` and `dnf makecache` in a loop against a
  local server while two generations are published and switched, with no hash or signature error.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run**; PASS.
- [ ] **Step 5: Cloudflare (owner approval, decision 2):** create both buckets and deploy both Workers
  on their domains; record names, domains and the date in `chromium/linux/repository.md`. A `GET` of
  `https://pkg-staging.blanc.day/deb/dists/stable/InRelease` answers 404 (uncached) until the first
  upload.
- [ ] **Step 6: Commit** `Fork Linux: repository metadata, signing and upload (L3)`.

### Task 5: The release tool

**Files:**
- Create: `chromium/release/linux-release.mjs`, `chromium/release/linux-release.test.mjs`,
  `chromium/release/linux-ledger.json` (`{"schema": 1, "builds": []}`),
  `chromium/linux/owner/linux-release.command`
- Create: `chromium/release/build-reservations.json` (seeded with every Windows ledger build) and
  `chromium/release/reserve-build.mjs` (reserve, look up, release an unused reservation)
- Modify: `chromium/release/windows-release.mjs` and its tests (`windows-release*.test.mjs`): keep
  `previousBuild === ` the Windows ledger's last build; replace "build > the Windows ledger's last" with
  "build > every reserved or ledger build on every platform, other than its own reservation" and "a
  reservation naming `windows` was introduced by `sourceCommit`". The Windows Beta session owns that
  tool: bring it the change to agree, and land it between Windows releases.
- Create: `chromium/tests/linux-beta-smoke.mjs` (an installed beta: test hooks absent, a control
  request loads, a request on the blocker's pinned list is blocked, renderers sandboxed)

**Interfaces:**
- Produces: `STAGES = ['preflight', 'build-check', 'sign', 'staging', 'update-proof', 'hand-check',
  'manifest', 'draft', 'sigstore', 'publish', 'verify-public']`, point of no return `draft`;
  `linux-release.mjs status|<stage> WORK`; record `WORK/linux-release.json` schema 1: `version`
  (`158.0.8127.<build>`), `build`, `previousBuild`, `tag` (`chromium-beta-linux-<version>`),
  `prerelease: true`, `makeLatest: false`, `sourceCommit` (40 hex, on `chromium/next`), `candidates`
  `{x64: {id, tarSha256}, arm64?: {id, tarSha256}}`.
- Produces in `reserve-build.mjs`: `reserveBuild({platforms: ('windows'|'linux')[], purpose:
  'release'|'proof'}) -> {build, commit}` (one commit adding the entry and bumping each named platform's
  beta args, pushed to `chromium/next`; on a rejected push, re-read, renumber, recommit, retry) and
  `checkReserved({build, platform, sourceCommit}) -> void` (throws unless `sourceCommit` introduced an
  entry for `build` naming `platform`).

- [ ] **Step 1: Failing tests** in `linux-release.test.mjs` and `reserve-build.test.mjs` on the model of
  `windows-release.test.mjs`: record validation (each field above); reservations (two concurrent
  reservers against a bare test repository get different numbers; the reservation commit changes only
  the file and the named platforms' args; a both-platform reservation passes `checkReserved` for each;
  a release whose `sourceCommit` isn't the reservation commit fails; a Mac beta number never enters the
  file; a failed public beta's replacement gets a higher number; Windows keeps `previousBuild` from its
  own ledger);
  stage order and resumption; typed confirmation for `draft` and `publish`; interruption after each
  irreversible write (tag created, release created, assets uploaded, generation switched, release
  published) resumes by reconciling the journal with the remote state and never repeats or skips a
  write.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement the stages:**
  1. `preflight`: record valid; `checkReserved` for `build` (and for the proof build `B-1`, recorded as
     `proofBuild`); `previousBuild` is Linux's last released build (none for the first beta, whose
     proof starts from `proofBuild`); tag and release absent; key fingerprint in `repository.md` matches the committed key.
  2. `build-check`: each candidate (both builds, both arches) on the `fork-linux-candidate` draft with
     its SHA-256, built from `sourceCommit` with the beta args, `scanPackage` clean against the
     committed key's fingerprint, package headers and `--product-version` equal the build's version,
     and `linux-beta-smoke.mjs` green on the installed package (hooks absent, blocking works).
  3. `sign`: the owner signs the `.rpm`s and `approved-packages.json`; the `repo-metadata` job builds
     staging's tree from `B`'s packages only (`B-1` stays a private draft asset); the owner checks and
     signs it (`repository-sign.command`); the stage records `signed-tree.json`'s digest.
  4. `staging`: `repository-upload.command staging` with that tree.
  5. `update-proof`: dispatches Task 6's proof (clients install `B-1` from its file, upgrade to `B`
     from staging), waits, requires every leg green, and records the proven digest.
  6. `hand-check`: the owner confirms the VM check (Task 8 Step 2) passed against this staging tree;
     typed `CHECKED <version>`.
  7. `manifest`: assets per arch `blanc-beta_<version>-1_<deb_arch>.deb`,
     `blanc-beta-<version>-1.<rpm_arch>.rpm`, `blanc-repository.asc`, `linux-release.json`,
     `NOTICES.txt`, `RELEASE-MANIFEST.json`, `SHA256SUMS`.
  8. `draft` (typed `DRAFT <version>`, journaled): tag, draft pre-release, assets read back.
  9. `sigstore`: as Windows (Safari, pinned identity).
  10. `publish` (typed `PUBLISH <version>`, journaled): `repository-upload.command production` with the
     proven tree, then a read-back of `https://pkg.blanc.day`'s `InRelease` and `repomd.xml` naming
     `<version>`; only then the GitHub release is published; latest must still be Electron's.
  11. `verify-public`: dispatches Task 7's check; requires it green.
- [ ] **Step 4: Run**; PASS. **Step 5: Commit** `Fork Linux: the release tool (L3)`.

### Task 6: The update proof from staging

**Files:**
- Create: `chromium/tests/linux-update-proof.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (job `update-proof`, `check=update-proof`, inputs `from`,
  `to`, `repository=staging`)

- [ ] **Step 1: Write the proof.** Legs per arch: Ubuntu 24.04 on the runner (apt), Debian 12 and
  current Fedora in containers (apt, dnf). Each: download `B-1` from the private draft, verify it
  against the signed `approved-packages.json`, install it by file; check the cron wrote the production
  source, then disable it and add a test-only staging source (removed after); launch `B-1`;
  `apt-get update && apt-get install --only-upgrade blanc-beta` / `dnf upgrade blanc-beta` from
  staging's already-published tree; Review Focus 2 (a new tab works before relaunch); Task 2's button
  appears; relaunch shows `B`; `linux-beta-smoke.mjs` passes on `B`. Refusals (Review Focus 4), each
  against its own local repository served on the runner (never staging) with a clean package-manager
  cache and otherwise valid signed metadata, each asserting the specific error and that `B-1` still
  runs: a `.deb` with one byte changed (apt's hash mismatch); metadata signed by a throwaway key (apt
  refuses `InRelease`, dnf `repomd.xml`); an `.rpm` signed by a throwaway key (dnf's signature check);
  an unsigned `.rpm` (dnf's signature check). Uninstall leg (Review Focus 5). On x64, Electron Blanc's
  AppImage launches afterwards (the AppImage is x64-only; arm64 checks the seeded `~/.config/Blanc` is
  unchanged).
- [ ] **Step 2: First run (decision 3):** reserve `B-1` and `B` for the same commit, build both, publish
  only `B` to staging, run the proof. Record runs in `chromium/reports/l3-linux.json`.
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
  or warnings, and the package manager lists `blanc-beta` at `<version>` from the repository;
  `linux-beta-smoke.mjs` passes on the installed browser (hooks absent, a control request loads, a
  listed request is blocked, renderers sandboxed) on all six legs.
- [ ] **Step 2: Commit** `Fork Linux: verify-public (L3)`.

### Task 8: The first public Linux beta

- [ ] **Step 1: Builds (decision 1):** reserve `B-1` (`purpose: 'proof'`) then `B` (two consecutive
  reservation commits; `B`'s differs from `B-1`'s only in the file and the Linux args); with no Windows
  release in progress, `setup.sh` at `B-1`'s commit, then guarded cold builds of `BlancLinuxBeta` and
  `BlancLinuxArm64Beta` (time the first and tell the owner the measured length); then `setup.sh` at
  `B`'s commit and incremental builds (only version-stamped files change; stop if the plan says
  otherwise). Package and ship each.
- [ ] **Step 2: Release stages through `hand-check`** with `linux-release.command` (owner, foreground
  Terminal). At `hand-check`, the owner's VM check, recorded in `chromium/linux/hand-checks-l3.md`:
  install `B-1` from its verified `.deb`; disable the production source and add staging's;
  Software Updater offers `B`; the Island's Restart to update appears and relaunches into `B`; the
  dock icon, keyring prompt, default browser and screen sharing as in L1/L2; then restore the sources.
- [ ] **Step 3: Release** the remaining stages to `verify-public`.
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

1. The update proof passes on every leg and both arches, with every refusal leg refused for the
   expected reason.
2. Verify-public passes for the published version on x64 and arm64.
3. The owner's VM hand checks pass.
4. The latest GitHub release is still Electron Blanc's; the Mac and Windows betas are unaffected.
5. The owner approves the website copy before it deploys.

## Timing against the "this week" promise

Critical path: L1 (Tasks 1, 2, 4, 6 and 7) → Task 1 here → two official cold builds, run one after
the other on the shared server (the longest step; not yet timed for Linux, so measure the first before
promising a day) → `B` rebuilds → proof → VM check → release. Everything else runs beside the builds:
L1's key and Task 4 Step 5's Cloudflare setup (owner steps with no dependency), Tasks 2 to 7's code and
tests, the Worker, the repository fixtures and the workflow jobs. L2's Windows regression run takes the
shared server too; schedule it between Linux builds. The website PR (Task 8 Step 5) can follow the
release by a day without breaking the promise, since the promise is the build and the note. Both
architectures stay required. If measured build times leave too little time for the proof and the VM
check by Friday 2026-11-27, tell the owner by Wednesday 2026-11-25 so the promised note can give a real
date.

## Not in L3

A stable `blanc` package (the repository's layout leaves room for it), KDE or x64 desktop hand checks,
crash upload, Flatpak, Snap, AppImage, protected video, the Electron profile's Linux key storage (S2).
