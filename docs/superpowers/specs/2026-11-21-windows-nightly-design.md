# A nightly for Blanc Beta on Windows (and later Linux): design

**Date:** 2026-11-21
**Status:** approved by the owner on 2026-11-21. The implementation plan
(`docs/superpowers/plans/2026-11-21-windows-nightly.md`) states where it differs: one exclusive hold on the
candidate draft instead of moving the release record to the Mac Studio.
**Background:** the Mac beta's daily release
([2026-11-14 design](2026-11-14-daily-beta-release-design.md), `chromium/release/daily/`),
the Windows fork ([2026-11-17 design](2026-11-17-windows-fork-design.md)) and its release tool
(`chromium/release/windows-release.mjs`), and the Linux lane's L3 plan for one shared build-number
sequence (`docs/superpowers/plans/2026-11-21-linux-fork-l3.md`, branch `claude/linux-fork-design`).

## Why

The Mac beta is built and fully tested every night, so publishing that day's beta costs the owner
a few minutes. Windows betas are prepared by hand each time: bump the build number, build on the
Linux server, package, upload, run quick runner checks, then the ten release stages. Windows
.903 and .904 (November 21, 2026) took hours of preparation, and the full suite (667 cases) last
ran on Windows during W2. A change on `chromium/next` that breaks Windows is found only when someone
prepares a Windows beta. The owner wants Windows **ready to release each morning, like the Mac**,
and the Linux beta to join the same nightly once it is released.

## Owner decisions (2026-11-21)

1. **Ready to release each morning**, not only an early warning: the nightly leaves a tested
   candidate that the release can use as it is.
2. **The Mac Studio runs it.** The build server stays free of GitHub credentials. The Mac Studio,
   which already runs the Mac nightly and has `gh`, drives the server over SSH, uploads the
   candidate and starts the runners.
3. **The build number is set at build time and claimed at release** (the owner had no preference;
   chosen because, like the Mac, it needs no nightly push and leaves no gaps).
4. **Linux joins once the Linux beta is released.** The job is written for a list of platforms
   from the start, with only Windows in it now.

## Goals

- Each night with new source on `chromium/next`, from one commit: a Windows **prototype** (test
  hooks on) that runs the full suite, and a Windows **beta** at the next free build number that is
  the release candidate. This is how the Mac nightly already qualifies Mac betas: the suite runs on
  the same-commit prototype, and the beta gets its own checks (acceptance by equivalence).
- The beta candidate packaged, kept on the Mac Studio, uploaded to the `fork-windows-candidate`
  draft, and checked on a GitHub Windows runner: install, launch of the installed beta, the
  installer capture with its taskbar-icon check. The prototype runs the full suite with its launch
  and window-frame checks.
- A morning result the release can trust: which commit, which build number, which candidate (id
  and zip SHA-256), and whether the night passed, judged against a list of known Windows failures.
- Releasing from a passing night: a prep step writes the release's work folder from that night's
  result, and the existing ten stages run unchanged from `preflight`.
- The same job takes Linux later by adding a platform entry, not a new job.

## Non-goals

- Changing signing, the Touch ID update package, Sigstore, the typed confirmations or any
  `windows-release.mjs` stage after `preflight`. The owner still approves every signing run on
  GitHub.
- **Proving the update from the last public beta at night.** A real update needs the package signed
  with the owner's Touch ID; it stays in the release's staging gate and `verify-public`, as today.
- Building on any machine but the Linux server, or giving that server a GitHub credential.
- A nightly for Android, or for Windows on Arm.
- Publishing anything at night.

## Anti-goals (a failure even if it works)

- A release whose evidence comes from a different commit or build number than the one it ships,
  or whose suite evidence isn't labelled as coming from the same-commit prototype.
- A night that disturbs anything else on the server: an Android build, a Linux build holding
  `~/chromium-desktop/.blanc-checkout.lock`, or a Windows release in progress.
- A night that replaces the draft's candidate while a Windows release still needs it (from prep
  through `verify-public`).
- A night that disturbs the Mac nightly on the Mac Studio, or a cold build.
- Two platforms shipping the same build number for different source.

## Approaches considered

**What the nightly is for.** (a) Early warning only: test the committed build number, release by
hand as now. (b) Ready to release each morning: chosen by the owner.

**Where the number comes from.**
1. *Set at build time, claimed at release* (chosen). Like the Mac nightly, the night computes the
   next free number and writes it only into the server's `out/BlancWinBeta/args.gn`; nothing is
   committed. Releasing claims that number for that night's commit. No automatic pushes, no gaps.
   Needs the Linux plan's rule changed from "the claim commit is the source commit" to "the claim
   names the source commit".
2. *The night claims a number every night* by pushing a claim-and-bump commit to `chromium/next`
   and building it. Fits the Linux plan as written, but pushes to `chromium/next` every night and
   leaves a gap for every night that doesn't ship.
3. *Test at night, number in the morning.* The release claims a number, rebuilds and reruns the
   quick checks; the suite's evidence would come from a binary that differs by its version.

**Who runs it.** (a) The Mac Studio drives the server over SSH (chosen). (b) The server runs it with
a narrow GitHub token: simpler scheduling, but the first GitHub credential on a rented machine.

## Design

### Schedule and order

A LaunchAgent on the Mac Studio, beside the Mac nightly's, at **04:00 local time** (the Mac nightly
runs at 02:00). It runs `chromium/release/daily/desktop-nightly.mjs` from its own clean worktree of
`origin/chromium/next` on the Mac Studio, so it never moves the Mac checkout, which is pinned during
Mac releases.

### Skip rules (checked in order; a skip is recorded, never forced)

1. **A Windows release needs the draft.** Releases take a lock before they touch it: prep writes
   `records/windows-release/IN-PROGRESS` (naming the work folder) before `preflight`, and it is
   removed only after `verify-public` passes or the owner abandons the release. While it exists, the
   night skips. Prep refuses to start while a night runs (the nightly's own lock), which closes the
   race at release start. Releases keep this record on the Mac Studio (see Calls below).
2. The Mac Studio's own `RELEASE-IN-PROGRESS` marker exists (a Mac release is prepared).
3. On the server: `~/chromium-desktop/.blanc-checkout.lock` is held, or any `siso ninja` runs
   (Android or Linux). The night then holds that lock itself for its whole server phase.
4. `chromium/next` has not changed since the last night that passed for this platform (nothing new
   to test). The last passing candidate stays the morning's candidate.

### Per platform (Windows now; Linux later through the same steps)

1. **Number.** `next = max(every build in windows-ledger.json, every claimed build in
   build-reservations.json once it lands) + 1`. Windows' `previousBuild` stays the last Windows
   ledger build.
2. **Apply and build on the server** over SSH: check out the night's commit in `~/blanc-desktop`,
   `apply.py` check then `--apply --backup`. Build `out/BlancWinPrototype` with its committed
   arguments, unchanged. For `out/BlancWinBeta`, write the committed `beta-x64.gn` with only
   `blanc_beta_version` and `blanc_beta_build` replaced, then compare the resulting file with the
   output's current `args.gn` line by line: if any other line differs, stop the night (a reviewed
   arguments change is a person's job). Only then `gn gen`, `build.mjs --record-environment` (the
   guard's single `argsSha256` field can't tell these cases apart, so the line comparison is the
   check), and `build.mjs --build`.
3. **Package.** `package-candidate.mjs` for both outputs. Copy both zips to the Mac Studio, under
   `records/nightly/windows/<date>/`. The beta zip is the release candidate; the prototype zip is
   the suite's.
4. **Check on GitHub**, the beta first, then the prototype; the draft holds one zip at a time:
   - Upload the **beta** zip; dispatch `chromium-windows-candidate.yml` for it (install, installed
     launch, installer capture with the icon check).
   - Upload the **prototype** zip; dispatch the full suite with its launch and frame checks.
   - Both dispatches pin the harness to the night's commit: the workflow gets a `source_commit`
     input and checks that commit out instead of the dispatch ref's tip, and the full suite accepts
     a nightly candidate the committed tracker doesn't name (as development subsets already do),
     recording it as a nightly run rather than a tracker baseline. This is a change to the workflow
     on `chromium/next` (the copy `--ref chromium/next` runs) and to `run-suite.mjs`.
   - Finally re-upload the **beta** zip, so the draft holds the release candidate when the night
     ends.
5. **Judge.** Download the suite report. The night passes when the beta's install, launch and icon
   checks and the prototype's launch and frame checks pass, and every suite failure is on
   `chromium/release/daily/windows-known-failures.json` (seeded from
   `chromium/reports/w2-windows-triage.md`, each with its reason). A failure not on the list is
   rerun once, as on the Mac; failing twice fails the night.
6. **Record** `records/nightly/windows/<date>/result.json`: status, source commit, build number and
   version, beta candidate id and zip SHA-256, prototype candidate id, run ids, the judged failures.
   `records/nightly/windows/LAST-PASS` points at the newest passing result. Zips of passing nights
   are kept until a newer night passes; failed nights' zips are deleted.

### Releasing from a night

`chromium/release/daily/windows-beta-prep.mjs` (run by Claude, as `beta-prep` is for the Mac):

1. Refuses while a night runs; writes `IN-PROGRESS`.
2. Reads `LAST-PASS`. If the draft holds a different zip (a later night failed after uploading),
   re-uploads the passing night's kept beta zip and checks its SHA-256.
3. **Claims the build** once the shared reservation file exists: pushes
   `{build, sourceCommit, platforms: ["windows"], purpose}` to `chromium/next`. If the push is
   rejected, it fetches and reads the file at the new tip: if another claim now holds that number,
   the night can't be released (the next night builds at a higher number); if not (an unrelated
   commit raced it), it rebases the one-line claim onto the new tip and retries.
4. Writes the work folder: `windows-release.json` with that night's build, version, source commit
   and beta candidate, and a draft `release-notes.md` listing the commits since the last Windows
   beta, for the owner to approve.

Then `preflight` and the other nine stages run unchanged. `validateWindowsRelease` changes to match:
the build must have a claim naming `windows` and `sourceCommit`, and must be above every Windows
ledger build and every other claim made before its own.

### Coordination with the Linux lane

The Linux L3 plan's "the claim commit is the source commit" becomes "the claim names the source
commit". A claim names one commit and one or more platforms; two platforms built from the same
commit may share one number. A later claim never invalidates an earlier one: a release checks only
claims made before its own, so Linux claiming 906 can't strand a Windows release at 905. A claim
whose release is abandoned stays a gap. This is agreed with the Linux session before either change
lands.

## Calls made after the builder check (Codex, 2026-11-21)

- **Suite on the prototype, release on the beta** (as the Mac nightly does), because beta builds
  compile out the test hooks the suite needs and the candidate workflow skips the suite for betas.
  Two builds per night instead of one.
- **No nightly update proof.** The installer capture checks the icon, not an update; a real update
  needs the Touch ID-signed package. The staging gate and `verify-public` keep proving it.
- **Releases hold the draft until `verify-public`**, through `IN-PROGRESS`, because `verify-public`
  still downloads the candidate after publication.
- **Yesterday's pass stays releasable** after a failed night: passing zips are kept on the Mac
  Studio and re-uploaded by prep.
- **The harness is pinned to the night's commit** with a `source_commit` workflow input, because a
  dispatch on `chromium/next` otherwise tests whatever is newest.
- **Argument changes are checked line by line**, because the guard's `argsSha256` can't distinguish
  a version bump from any other change.
- **A rejected claim push is checked, not assumed** to be a lost number.
- **The Windows release record moves to the Mac Studio** (`~/Projects/Blanc/records/windows-release/`
  there), so the nightly and releases see one lock. The owner's release stages already run from a
  Terminal on the MacBook Pro over the same records path; the wrappers read it over SSH.

## Left to the builder

- The exact SSH and `gh` calls, retries, timeouts and the log format, following `nightly.mjs`.
- How the owner-run release wrappers reach the Mac Studio's records (SSH paths), keeping every
  owner-only step in a foreground Terminal on the MacBook Pro.
- Tests: unit tests for the skip rules, the number, the arguments comparison, the claim retry and
  the judging, in the style of `daily-nightly.test.mjs`.
