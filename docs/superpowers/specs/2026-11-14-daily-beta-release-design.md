# Daily Blanc Beta releases in minutes of owner time (design)

Date: 2026-11-14. Status: draft for owner approval.

## Why

The owner will ship a Blanc Beta (the macOS Chromium fork) every day until the
fork is stable. Beta.4's signing to publishing took 13 minutes. Getting there
took about 3½ hours: the full acceptance suite (~75 minutes with the Mac
Studio idle), gate evidence, waiver decisions made on the spot, one rebuild,
seven wrapper windows that each asked for passwords again, then a hand-written
website PR and records. The build stays on the Mac Studio, where incremental
builds are fast. The aim is for the owner to spend a few minutes per release,
from the MacBook Pro, without giving up any check that protects users.

## Owner decisions (2026-11-14, by buttons)

1. **Full suite: nightly, plus a targeted rerun.** The full suite moves off the
   release path and runs every night. A beta whose source matches a passing
   night releases on that night's evidence. A beta whose source changed since
   the last passing night may release after a rerun of only the scenarios the
   change touches.
2. **Gate decisions carry until changed.** Waivers and carried checks live in
   one standing file with the owner's reasons. Every beta uses them
   automatically, and its release notes list them. A carried check stops
   counting as soon as the code it covers changes.
3. **Hand checks only when their code changed.** The Touch ID passkey check,
   the real-iPhone Sync check and the signed beta-to-beta update check run
   only when their code changed since the last beta where they passed.
4. **Outbound check inside the one release command.** No new sudo rule on the
   Mac Studio; the owner types the passwords once, in the release window.

## Goals

- One release window on the MacBook Pro, from prepared candidate to public
  release, with every owner-only step kept: 1Password (Touch ID), the Mac
  Studio password, the blanc-test password, the typed "tag and draft" and
  "publish" confirmations and the Sigstore sign-in.
- No decision is made during a release that could have been made earlier.
- The website PR, the ledger entry and the release record are generated.
- Target owner time: about 3 minutes of attention and under an hour of wall
  time (notarization and the outbound check are most of the wait).

## Non-goals

- Changing signing, notarization, Sparkle or Sigstore. `release.mjs` stages,
  their order, their checks and their refusals stay as they are.
- Automating any owner-only step, storing a secret on disk or putting one on a
  command line.
- Intel builds (the Intel waiver stays a per-release `archWaiver`).
- Releasing from anywhere but the Mac Studio.

## Anti-goals (a failure even if it works)

- A release that goes out on evidence from different source than it ships,
  without saying so in its acceptance record.
- A carried check or standing waiver that outlives a change to the code it
  covers.
- A nightly job that disturbs a release in progress, races another build, or
  forces a cold build.
- Printing a secret, even once.

## Approaches considered

- **Full suite.** (a) Nightly, release binds to a passing night: strongest, but
  a fix landed in the afternoon waits a day. (b) Nightly plus a targeted rerun
  for source changed since the last pass: chosen; same-day fixes ship, and the
  next night's full run still covers them. (c) Keep it before every release:
  no change to what "passed" means, but keeps 75 idle minutes per beta.
- **Gate decisions.** Standing file (chosen) versus a one-click confirmation per
  beta versus per-version entries as now.
- **Hand checks.** When their code changed (chosen) versus weekly versus every
  beta.
- **Outbound check.** Inside the release command (chosen) versus nightly with a
  root-owned copy and a sudo rule (types nothing, but changes the Mac Studio's
  security settings).
- **One command.** Chaining today's seven wrappers (keeps seven SSH sessions and
  seven password prompts) versus one SSH session running every stage in order
  (chosen).

## Design

### 1. Standing gate decisions: `chromium/release/standing.json`

```json
{
  "schema": 1,
  "waivers": {
    "no-drm-handoff": {"since": "2026-11-14", "reason": "…owner's words…"},
    "production-sync-real-device": {"since": "2026-11-14", "reason": "…"}
  },
  "carried": {
    "webauthn":         {"paths": ["chromium/blanc/browser/webauthn/**", "chromium/patches/**webauthn**"], "lastPass": {"version": "2.0.0-beta.4", "sourceCommit": "…", "evidence": "…"}},
    "sparkle-N-to-N+1": {"paths": ["chromium/blanc/**/sparkle*/**", "chromium/patches/**sparkle**", "chromium/release/appcast.mjs"], "lastPass": {…}}
  }
}
```

- `policy.mjs`: `waiverAllowed(r, gate)` accepts a gate listed for the version
  in `GATE_WAIVERS` (kept for past releases) **or** in `standing.json`'s
  `waivers`. A standing waiver still needs its reason in `release.json`'s
  `gateWaivers`, which `beta-prep` copies from the file, so the public
  `release.json` carries it as today.
- A carried gate passes only if `git diff --name-only lastPass.sourceCommit
  sourceCommit` touches none of its `paths`. `beta-prep` writes that diff
  (empty) and the earlier pass's evidence digest as the gate's evidence
  source, with basis "carried from <version>". Any matching change makes the
  gate required: the release stops before signing and asks for the check.
- After a hand check passes on a new beta, `beta-record` updates `lastPass`.
- The owner changes a decision by asking; Claude edits the file in a commit
  that quotes the owner. The exact path lists are the builder's call, written
  wide (a false "changed" costs a check; a false "unchanged" ships a gap).
- Release notes get a generated "Known limitations and carried checks" block
  from the file.

### 2. Nightly build and full suite on the Mac Studio

A LaunchAgent (`me.bnfy.blanc.beta-nightly`, the owner's GUI session, so the
keychain and windows work) runs `chromium/release/nightly.mjs` at 02:00 local:

1. **Skip, writing why**, if a release is in progress
   (`~/Projects/Blanc/records/RELEASE-IN-PROGRESS`, written by `beta-prep`,
   removed by `beta-record` or `beta-prep --abandon`), if any build or apply is
   running (a lock taken by `chromium/tools/build.mjs` and `apply.py`, added
   here if they have none), or if the source tree has uncommitted changes.
2. Fetch `origin/chromium/next`, move the Mac Studio's checkout to its tip,
   apply with `apply.py`, and build `BlancPrototype` and `BlancBeta` through
   the guard (`build.mjs --build`, never bypassed; a large or changed-environment
   plan stops the night with a note instead of building). The beta is built as
   the next version (ledger's highest build + 1); an unreleased night's
   candidate is simply rebuilt the next night.
3. Run the full suite on the prototype; rerun only failed pointer/window cases
   once (`run-cases.sh`), as the runbook allows. A night passes only if the
   suite matches the accepted baseline (the known intermittent
   `vertical-tabs.feature:58` stays listed as known until fixed).
4. Run the beta's own unattended checks on the candidate: blocker payload,
   test hooks absent, profile coexistence, notices and credits.
5. Write `~/Projects/Blanc/records/nightly/<date>/result.json`: source commit,
   input digest, both candidate ids, GN digests, suite summary, check results,
   pass or fail. `latest-pass.json` points at the newest passing night.

The Mac Studio must stay idle during the suite; at 02:00 nobody uses it, but
the job also refuses to start while another Claude session holds the lock.

### 3. Targeted rerun (same-day fixes)

`beta-prep --source <commit>` compares the release source with the newest
passing night's. If they differ:

- Changed files under `chromium/blanc/` and `chromium/patches/` are mapped to
  acceptance features by `chromium/release/scenario-areas.json` (path globs →
  feature rows such as `F41`). **Any changed file the map doesn't cover, or any
  change to a build file, a patch outside a mapped area or the test runner,
  requires the full suite** (fail closed).
- Otherwise it builds the prototype incrementally and runs those features'
  cases plus a fixed smoke set (`--case-list`).
- The acceptance evidence then names both runs: "full suite at <night commit>,
  plus N targeted cases at <release commit> for <files>". That night's full
  run still covers the new source.

### 4. Preparing a release: `chromium/release/beta-prep.mjs` (run by Claude)

Builds everything that needed a human decision before, so none is made during
the release: `release.json` (version and build from the ledger, candidate and
GN digests from the night, `gateWaivers` from `standing.json`, the Intel
`archWaiver`), `local-inputs.json`, payloads (SBOM, `NOTICES.txt`, release
notes drafted from commits since the last beta plus the standing block), the
gate-evidence `SOURCES.json` (night results, carried gates, waivers), and a
plan listing which hand checks are required. It points the outbound check's
config at the candidate (a beta.4 lesson), writes `RELEASE-IN-PROGRESS`, and
runs `gate-evidence.mjs plan` so a gap shows before the owner starts. Its
output is one short summary for the owner: version, what changed, waivers,
carried and required checks.

### 5. The one release command (owner, MacBook Pro)

`chromium/release/owner/remote/beta-release.command`, the same file for every
beta (it reads the version from the prepared work folder; no per-version
copies). One Terminal window:

1. 1Password with Touch ID once: the Apple ID, the app-specific password and
   the update key, read into memory and sent only as SSH environment (`LC_*`),
   as today.
2. One `ssh -t` session (port 49197 forwarded for Sigstore) runs
   `chromium/release/owner/beta-release-remote.sh` on the Mac Studio. It asks for
   the Mac Studio password for `sudo` and the keychain (at most two prompts at
   the start, never on argv), then the blanc-test password for the outbound
   check.
3. In order, stopping at the first failure with a fixed message and a status
   line Claude watches: outbound check → `release.mjs` preflight, sign,
   notarize-app, dmg, notarize-dmg, sparkle → required hand checks, if any (the
   window says which and waits for Return; usually none) → `gate-evidence.mjs
   write` → manifest → shows the release notes → draft (typed "tag and draft")
   → sigstore (the window shows the sign-in link to click on the MacBook Pro)
   → publish (typed "publish") → verify-public.
4. A rerun resumes at the first unfinished stage (`release.mjs status`), so a
   stopped run never redoes notarization and never reruns anything past the
   point of no return.

Every rule in `release.mjs` stays: typed confirmations, the key-backup check,
absence checks before the tag, never printing secrets.

### 6. After publication: `chromium/release/site-pr.mjs` and `beta-record.mjs` (run by Claude)

- `site-pr.mjs <tag>` downloads the public `release.json`, appcast and DMG
  headers logged out (`curl`), makes a fresh worktree of `origin/main`, writes
  `site/src/data/blanc-beta.json`, `site/public/updates/chromium-beta/arm64.xml`
  (the release appcast byte for byte), `BETA_DOWNLOAD` in
  `cloudflare/ping-worker/src/dl.js`, the version reference in `download.astro`,
  `security/audit-surface-inventory.json` if it names the beta, and
  `docs/website-blanc-beta-<version>-claims.json` from the previous ledger with
  a dated "only the release it names changes" decision line. **It refuses if the
  waivers or limitations differ from the previous beta**, because then the
  page's text changes and needs the owner's approval. It runs the site's beta
  tests, commits, pushes and opens the PR.
- Deploying stays Claude's checklist: merge when checks pass, compare the live
  blanc-ping version with `main` and keep live-only code, deploy the Worker,
  then the site from the clean `main` checkout, confirm Production at the SHA,
  then dispatch the hosted smoke check with `check_feed=true`.
- `beta-record.mjs` adds the ledger entry, updates `standing.json`'s `lastPass`
  for checks that ran, appends a short dated record to the runbook, and removes
  `RELEASE-IN-PROGRESS`; Claude commits it to `chromium/next`.

## Left to the builder

- Exact `paths` for carried checks and the first `scenario-areas.json` map
  (start narrow; unmapped means full suite).
- The build lock mechanism if `build.mjs`/`apply.py` lack one.
- How `beta-release-remote.sh` feeds the password to `sudo` and the keychain
  without argv (or asks twice).
- Tests: unit tests for standing waivers and carried-gate logic in `policy`,
  `beta-prep`'s plan, the scenario mapping's fail-closed rule and `site-pr`'s
  file generation against beta.4's real files; the wrappers checked by a dry
  run that stubs `ssh` and `release.mjs`.

## Order of work

1. Standing decisions (policy, gate evidence, notes block) and `beta-prep`.
2. `site-pr.mjs` and `beta-record.mjs`.
3. The one release command.
4. The nightly job, then the targeted rerun. Installing the LaunchAgent on the
   Mac Studio waits until no build is running there; its first night is
   watched.
5. Runbook: a new "Daily beta" section that replaces the per-beta wrapper
   copying.
