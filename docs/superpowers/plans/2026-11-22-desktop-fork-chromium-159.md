# Desktop fork: move to Chromium 159 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the desktop lane (Mac, Windows and Linux) from Chromium 158.0.8127.2 to the newest Chromium 159 beta, ship the first 159 betas on all three, then take 159's stable build when it comes out.

**Architecture:** The three platforms share one pin, one patch list and one `chromium/blanc/` source tree (`chromium/lanes/desktop.json`), so they move together. The pin and patches are rebased first on a side branch against a sparse copy of the new Chromium, with no build tree touched, while `chromium/next` keeps shipping 158. Only once every patch applies and the unit suite passes do the Mac Studio and the Linux server move their checkouts, in one window the owner approves, with the nightlies paused. The Android lane has its own pin and is not touched.

**Tech Stack:** Chromium checkouts with depot_tools and Siso; the fork's `chromium/tools/` (`refresh-upstream.py`, `check-patches.py`, `apply.py`, `build.mjs`); Node release tooling in `chromium/release/`; GitHub Actions candidate workflows for Windows and Linux.

**Spec:** Owner decision, November 22, 2026, in chat: move every desktop fork beta to 159 together, after the Linux beta has shipped, and skip an interim move to 158.0.8127.37. The reasons: 158 stopped getting fixes once it went stable (158.0.8127.37, November 12), the pin 158.0.8127.2 is the first 158 beta (October 28), and 159 is due to go stable on December 8. The procedure mirrors the Android lane's `docs/android/rebase.md`.

## Global Constraints

- Start only after the public Linux beta has shipped (the November 21 newsletter promised it for the week of November 23–29) and no desktop fork release (Mac, Windows or Linux) is between preflight and publish.
- One revision for all three platforms: the Mac Studio and the Linux server check out the same Chromium commit, and `lanes/desktop.json`'s `version` equals that tree's `chrome/VERSION`.
- Build only through `chromium/tools/build.mjs`, one build at a time per machine. Each of these needs the owner's scoped approval before it runs: moving a checkout and running `gclient sync` with its hooks; re-recording a build environment after reviewing its diff; a dry-run plan over 1000 actions (`--allow-large-build`); a new Windows toolchain package.
- Never touch the Android checkout (`~/chromium-android`) or its depot_tools on the server.
- The Mac Studio checkout stays at `~/Projects/Blanc/src`: the Siso cache is bound to that absolute path. Keep `~/Projects/Blanc/repo` clean and leave its HEAD alone.
- Build numbers never reset at a milestone: the Mac's Sparkle build integer and the Windows and Linux build (the version's last number) continue their sequences. `nextWindowsBuild` already takes the maximum over the whole ledger.
- Suite exclusions, gate waivers and divergences change only on the owner's word. A case that passed on 158 and fails on 159 is a regression to fix, not to exclude.
- Bring `chromium/next` into the rebase branch by merging, never by rebasing or force-pushing. The change carries no Electron app code.
- Once a 159 build is public on a platform, there is no going back to 158 there: Chromium refuses a profile written by a newer version. Rollback is possible only before the first 159 publish.

## Review Focus

1. **Updating across the milestone.** A person on the newest 158 beta must update to the first 159 beta through each platform's own updater: Sparkle on the Mac, Blanc's update service on Windows, apt and dnf on Linux. The proof starts from the public 158 build (Task 7).
2. **New outbound traffic.** A new milestone can add background services that contact Google. The Mac beta outbound check and the environment-key check must pass on 159 before anything is published (Task 6).
3. **A 158 profile opened by 159.** Data, Spaces, Favorites, Sync, passkeys and the Island state survive the profile migration (Task 6: open a copy of a used 158 profile).
4. **Version strings derived from the pin.** About, the trust receipt, package names and the Windows `158.0.8127.<build>` scheme must all follow the new pin, with no 158 left behind (Task 1's test and Task 7's grep).
5. **The nightly running against a half-moved tree.** A nightly that starts mid-move would build or apply the wrong source. The nightlies are paused for the window and come back only after a clean guard check (Tasks 4 and 5).

---

### Task 1: Version strings follow the pin

Today `CHROME_VERSION` and `UPSTREAM` are hard-coded in `chromium/release/policy.mjs`, and `VERSION_PREFIX = '158.0.8127.'` is hard-coded again in two daily scripts. Make the pin the only place to edit.

**Files:**
- Modify: `chromium/release/daily/desktop-nightly.mjs:25`, `chromium/release/daily/windows-beta-prep.mjs:36`
- Test: `chromium/release/pin-consistency.test.mjs` (new)

**Interfaces:**
- Produces: `VERSION_PREFIX` in both daily scripts computed as `` `${CHROME_VERSION.split('.').slice(0, 3).join('.')}.` `` from `policy.mjs`, the same rule `windows-release.mjs:48` already uses. `policy.mjs`'s two constants stay literal, edited by hand at a pin move, because the policy names the reviewed pin.

- [ ] **Step 1: Write the failing test.** `pin-consistency.test.mjs` asserts that `CHROME_VERSION` and `UPSTREAM` equal `lanes/desktop.json`'s `version` and `upstream`, and that neither daily script contains a literal version (`/\d+\.0\.\d{4}\./` does not match its source).
- [ ] **Step 2: Run it** with `node --test chromium/release/pin-consistency.test.mjs`. Expected: FAIL on the two literals.
- [ ] **Step 3: Derive `VERSION_PREFIX`** in both scripts from `CHROME_VERSION`.
- [ ] **Step 4: Run the fork unit suite:** `node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`. Expected: PASS. This task can land on `chromium/next` before the move.
- [ ] **Step 5: Commit** "Fork release tooling: the nightly version prefix follows the pin".

### Task 2: Pick the revision and read what it needs

**Files:**
- Create: `chromium/reports/rebase-159-preflight.md`

- [ ] **Step 1: Pick the version.** Take the newest 159 Beta for Mac from `https://chromiumdash.appspot.com/fetch_releases?channel=Beta&platform=Mac&num=1` (159.0.8154.13 on November 22, 2026) and its `hashes.chromium` commit. Check that Windows and Linux Beta show the same version. Record the version, commit and start time in the report.
- [ ] **Step 2: Make a sparse copy, no build.** In the scratchpad on the MacBook Pro: `git init`, add `https://chromium.googlesource.com/chromium/src` as `origin`, `git sparse-checkout set --no-cone` with every path in `chromium/upstream/manifest.json`'s `files` plus `chrome/VERSION`, `DEPS`, `build/vs_toolchain.py`, `build/config/mac/mac_sdk.gni`, `build/linux/sysroot_scripts/sysroots.json` and `.gn`, then `git fetch --depth 1 --filter=blob:none origin <commit>` and `git checkout FETCH_HEAD`. Expected: `chrome/VERSION` reads the picked version.
- [ ] **Step 3: Read the toolchain changes.** Compare each of those five build files with the 158 tree on the Mac Studio (read-only `git show`). Note: `TOOLCHAIN_HASH`, `SDK_VERSION` and the first `MSVS_VERSIONS` entry (a new Windows toolchain package if any changed); the macOS SDK and Xcode minimum (whether the Mac Studio's Xcode is still enough); the Linux sysroots; the clang and Siso revisions in `DEPS`. Each "changed" becomes an approval to ask for in Task 4 or 5.
- [ ] **Step 4: Check disk room.** `df -h` on the Mac Studio and the server. A milestone sync and cold builds of every output need roughly the size of one output folder free on top of what is used now. Record the numbers.
- [ ] **Step 5: Commit** the report on the rebase branch (Task 3, Step 1).

### Task 3: Refresh the pin and rebase the patches (no build tree touched)

**Files:**
- Modify: `chromium/upstream/**`, `chromium/upstream/manifest.json`, `chromium/source-map.json`, `chromium/lanes/desktop.json`, conflicting files in `chromium/patches/`, `chromium/tools/check-patches.test.mjs` (only if the file count changes), `chromium/release/policy.mjs:10-11`
- Create: `chromium/rebase-ledger.json`, rows shaped like the Android ledger's `{from, to, startedAt, finishedAt, hours, patchesConflicted, notes}`

- [ ] **Step 1: Branch.** `git switch -c chromium/rebase-159 origin/chromium/next`, push it, and merge `chromium/next` into it at the start of each working session.
- [ ] **Step 2: Refresh:** `python3 chromium/tools/refresh-upstream.py --lane desktop --src <sparse copy> --version <x.y.z.w>`. Exit 0 means every patch applies. Exit 1 means a pinned file moved: find where, update the patch and the manifest by hand, then run it again. Exit 3 means a patch no longer applies: rebase that patch against the new file in `chromium/upstream/`, then `refresh-upstream.py --lane desktop --patched-only`, and list it in the ledger row. Repeat until exit 0.
- [ ] **Step 3: Set the release policy pin.** `policy.mjs`'s `CHROME_VERSION` and `UPSTREAM` take the new version and commit; Task 1's test proves they agree with the lane file.
- [ ] **Step 4: Check the patch set:** `python3 chromium/tools/check-patches.py --lane desktop` and the Android lane too (a shared tool change must not break it). Expected: both pass, `fileCount` equal to the manifest's file count.
- [ ] **Step 5: Run the fork unit suite.** Expected: PASS. Fixtures that name 158 on purpose (past releases, ledgers) stay as they are; only tests that read the current pin change.
- [ ] **Step 6: Commit and push** the branch: "Desktop lane: refresh the pin to <version> and rebase the patches".

### Task 4: Move the Mac Studio and build

Needs the owner's approval for the window before Step 1, and for each gated step named below.

- [ ] **Step 1: Pause the Mac nightlies.** On the Mac Studio, `launchctl bootout` the jobs that `chromium/release/daily/install-nightly.sh` and `install-desktop-nightly.sh` install, after confirming no nightly is running. Record the time.
- [ ] **Step 2: Move the checkout (owner approval: download and hooks).** In `~/Projects/Blanc/src`: `git fetch --depth 1 origin <commit>`, `git checkout FETCH_HEAD`, `gclient sync -D --no-history`. Expected: `chrome/VERSION` reads the new version.
- [ ] **Step 3: Apply** the rebase branch's tree with `apply.py --src ~/Projects/Blanc/src --previous-map <current map> --apply --backup <records/apply-backup-159-*>`.
- [ ] **Step 4: Regenerate GN** for `out/BlancPrototype` and `out/BlancBeta` with their `args.gn` unchanged (byte-compare before and after).
- [ ] **Step 5: Re-record the build environment (owner approval).** `build.mjs SRC --check` will refuse a changed environment. Show the owner the diff (expected: clang, Siso, the SDK if Task 2 found one), then `--record-environment` for each output.
- [ ] **Step 6: Build (owner approval for the large plan).** `build.mjs SRC --check --out=BlancPrototype`, review the plan, then `--build --allow-large-build`. Fix compile errors in `chromium/blanc/` or the patches on the rebase branch, apply again, and rebuild until it links. Then the same for `BlancBeta`.
- [ ] **Step 7: Leave the nightlies paused** until Task 6 passes on the Mac.

### Task 5: Move the Linux server and build Windows and Linux

Needs the same approvals as Task 4. The Windows and Linux outputs share `~/chromium-desktop/src` and its checkout lock; the Android lane must not be building.

- [ ] **Step 1: Windows toolchain (only if Task 2 found a change; owner approval).** `gh workflow run chromium-windows-toolchain.yml --ref chromium/rebase-159`, then stage the package as `chromium/windows/server/README.md` describes, keeping exactly one `.zip`.
- [ ] **Step 2: Pause the Windows nightly** (the Mac Studio's 04:00 job from Task 4, Step 1) and confirm no `chromium-beta-windows-*` or Linux release draft is between preflight and publish.
- [ ] **Step 3: Move the checkout (owner approval).** In `~/chromium-desktop/src`, holding the checkout lock: the same fetch, checkout and `gclient sync -D --no-history` as Task 4, with `~/depot_tools-desktop`. Then `bash chromium/windows/server/mount-toolchain.sh`.
- [ ] **Step 4: Apply, regenerate GN with unchanged arguments, and re-record environments after review** for every desktop output on the server: `BlancWinPrototype`, `BlancWinBeta`, `BlancLinuxPrototype`, `BlancLinuxArm64Prototype`, and any Linux beta output present (`ls out/`).
- [ ] **Step 5: Build each output through the guard,** one at a time, Windows first (its nightly is the oldest consumer), fixing platform-only compile errors on the rebase branch.

### Task 6: Prove 159 on all three platforms

Nothing here may lower a pass count without the owner's decision. The 158 baselines are the last recorded runs in `chromium/STATUS.md`: Mac 637 of 667 (nightly 20261118-1221), Linux x64 636 of 667 (run 45041019578), and the latest Windows W2 or W3 count.

- [ ] **Step 1: Mac.** Run the full suite on `BlancPrototype` on the Mac Studio, with the Mac idle for the ~75 minutes. Expected: no case that passed at 158 fails. Then `chromium/tests/native-environment-api-keys.mjs`, the Safe Browsing-off check, and the beta outbound check on a `BlancBeta` candidate (`chromium/tests/outbound/`, Adobe Creative Cloud quit in `blanc-test`, long enough to catch background fetches). A new connection is a stop: report it to the owner.
- [ ] **Step 2: A used 158 profile.** Copy a 158 beta profile from a test user, open it in the 159 candidate, and check Favorites, Spaces, open tabs, Sync sign-in and the Island state survive. Record the result in the ledger row.
- [ ] **Step 3: Windows.** Ship the candidate (`chromium/windows/ship-candidate.sh`) and run `chromium-windows-candidate.yml` with `--ref chromium/rebase-159`: launch, frame, install, crash and the suite.
- [ ] **Step 4: Linux.** The same with `chromium-linux-candidate.yml` for x64 and arm64.
- [ ] **Step 5: Passkeys.** The upstream changed, so `standing.json`'s `anyChange` makes the Touch ID passkey check due for the first 159 Mac beta. Ask the owner to run it on the candidate.
- [ ] **Step 6: Record** every result in `chromium/STATUS.md` and the ledger row, and commit on the branch.

### Task 7: Land it and ship the first 159 betas

- [ ] **Step 1: Merge** `chromium/rebase-159` into `chromium/next` (a merge commit), run `check-patches.py` for both lanes and the unit suite on the result, and push. Recount `fileCount` if another session added an upstream file meanwhile.
- [ ] **Step 2: Docs.** Update the pin wherever current docs state it as current: `docs/chromium-beta-release.md` (lines 9, 26, 27), `chromium/PLATFORMS.md`'s "At the 158.0.8127.2 pin" claims (re-check each claim against 159 before changing the number), and `chromium/linux/identity.md`. The Windows paragraph of `CLAUDE.md` and `AGENTS.md` ("the same … 158.0.8127.2 pin as the Mac") lives on `main`, so its edit goes in the next beta's tag-to-`main` PR, not on `chromium/next`. Leave records of past releases alone. `git grep -n "158\.0\.8127" -- ':!chromium/reports' ':!chromium/release/*ledger*' ':!chromium/release/fixtures'` should show only history.
- [ ] **Step 3: Turn the nightlies back on** (run the two install scripts again), then watch the first Mac and Windows nights build and pass.
- [ ] **Step 4: Ship the first 159 beta on each platform** through its normal release command, and prove the update across the milestone from the public 158 build: the Mac signed Sparkle handoff (compare the installed app's code hash with the released DMG), the Windows N-to-N+1 update proof, and an apt and a dnf upgrade on Linux.
- [ ] **Step 5: Close the ledger row** with `finishedAt` and `hours`.

### Task 8: Take 159 stable (about December 8)

- [ ] **Step 1:** When chromiumdash shows 159 Stable for Mac, Windows and Linux with one commit, repeat Tasks 2–7 for that commit. Expected: a point release on the same branch; few or no patch conflicts and an incremental build plan. If the guard's plan is still over 1000 actions, show it to the owner as for Task 4.
- [ ] **Step 2:** Add its ledger row. From then on, each 159 stable security update follows the same procedure.
