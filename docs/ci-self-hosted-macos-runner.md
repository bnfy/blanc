# Self-hosted macOS CI runner

**Status:** optional, off until the repository variable below is set (October 2026).
**Why:** GitHub allows 5 concurrent macOS jobs on the Free, Pro and Team plans,
shared by every workflow ([Actions limits](https://docs.github.com/en/actions/reference/limits)).
Larger runners share that cap. Pull requests waited 28–41 minutes for a macOS
slot (October 26, 2026), so #1151 moved most macOS legs to a nightly
schedule. A Mac we own adds Apple Silicon capacity outside that cap, at no
GitHub cost, and brings the macOS legs back to every pull request.

## What changes when it's on

One repository variable, `MAC_RUNNER_LABELS`, switches it on:

| Job | Variable unset (default) | Variable set |
|---|---|---|
| `unit (macos-15)` (unit-tests.yml) | GitHub-hosted, every PR | self-hosted, every PR |
| `workspace-regressions`, `favorites-import`, `browser-shortcuts` macOS legs (parity-guards.yml) | GitHub-hosted, nightly and manual runs only | self-hosted, nightly and manual runs only. On every pull request they'd queue three more jobs per PR for the Mac's two slots |
| `desktop (macos-15)` (ublock-origin.yml) | GitHub-hosted, nightly and manual runs only | self-hosted, matching PRs, plus nightly |
| `desktop (macos-15-intel)`, iOS `xctest`, nightly desktop acceptance, release and prerelease workflows | GitHub-hosted | **unchanged: GitHub-hosted** |

- Check names stay the same (`unit (macos-15)` …), so required checks keep matching.
- **Fork pull requests never reach the Mac.** Every `runs-on` that can pick it falls back to the GitHub-hosted runner unless the pull request's head repository is `bnfy/blanc`. `test/unit/ci-self-hosted-mac.test.js` fails if any such line loses that guard, or if Intel, iOS or a release workflow starts using the variable.
- **Turning it off:** delete the variable. Every job goes back to the default column on the next run.

## The machine

- A dedicated Apple Silicon Mac, such as a Mac mini. **Not the release MacBook Pro.** CI runs pull request code, and that machine holds the Developer ID certificate, the notarization credentials and 1Password.
- **No secrets on it.** No signing identities, no 1Password, no GitHub token beyond the runner's own registration. The CI jobs that use this runner need no secrets.
- **Always on, never asleep.** In System Settings → Energy, prevent automatic sleep and turn on *Start up automatically after a power failure*. Give it a wired network connection.
- **macOS updates:** keep it on the same major macOS as `macos-15` jobs, or newer.
- **Intel can't be covered here.** Rosetta isn't the Intel runner. Intel stays GitHub-hosted, nightly and in the release gate.

## Recommended: one throwaway VM per job (Tart)

Each job then starts from a clean macOS image and leaves nothing behind for the next one. That matters because pull request code runs here.

`scripts/ci-mac-vm-runners.sh install` sets this up on the CI Mac. Run it as the account the VMs should run under, with `gh` signed in as a repository admin. It needs no admin rights on the Mac, and no Homebrew.

1. **Tart.** The script downloads Tart (Cirrus Labs' Apple Silicon virtualization, licensed FSL-1.1-ALv2 since 2.33, which allows this use) into `~/blanc-ci-vms`.
2. **The golden image.** It clones `ghcr.io/cirruslabs/macos-sequoia-base:latest`, matching `macos-15`; that's tens of GB the first time. The base image logs `admin` in automatically, gives it passwordless sudo, and ships the Command Line Tools and Homebrew; the script checks the first two. Inside it, the script installs the latest GitHub Actions runner and a LaunchAgent in admin's GUI session (Electron tests need one). The result is saved as `blanc-ci-golden`. It sizes each VM from the Mac: two VMs when the Mac has 24 GB of memory or more, otherwise one.
3. **The job loop.** A LaunchAgent on the host (`dev.blanc.ci-vms`) runs one loop per VM slot:
   1. ask GitHub for a just-in-time runner config (`POST /repos/bnfy/blanc/actions/runners/generate-jitconfig`), good for one job, with the labels below;
   2. write it into the slot's folder and boot a fresh clone of the golden image with that folder shared **read-only**;
   3. in the VM, the LaunchAgent runs the runner with that config. It takes exactly one job, then the VM powers itself off;
   4. delete the clone and start again. A VM still up after 6 hours (a hung job, or an idle runner) is replaced.

   The host's GitHub sign-in never enters a VM; each VM only sees its own single-use config. Apple's macOS licence allows two macOS VMs per Mac, and Virtualization.framework enforces that, so two VMs is the ceiling per machine.
4. **Labels:** `self-hosted`, `macOS`, `ARM64` and `blanc-ci`, the same as the direct install, so `MAC_RUNNER_LABELS` doesn't change.
5. **Switching over.** Once a VM runner is online, the script retires a direct-install runner left by `scripts/ci-mac-runner-setup.sh`, waiting for it to finish any job it's running, and sets `MAC_RUNNER_LABELS` if it isn't set. If GitHub won't unregister it yet, `retire-direct` finishes the job later.

Day to day: `status` shows the loop, the VMs and the runners GitHub sees. `rebuild-image` refreshes the image with a newer macOS image or runner. `stop` and `start` pause the loop; jobs wait meanwhile. `uninstall` deletes the variable first, then the loop, the VMs and their runners. Logs are in `~/blanc-ci-vms`.

## Simpler but weaker: the runner directly on the Mac

`scripts/ci-mac-runner-setup.sh` registers the runner on a dedicated non-admin user account and starts it as a LaunchAgent. It's quicker to set up, but jobs share one machine and can leave state behind for the next job. That's acceptable only because forks are excluded, and only on a machine with nothing else on it.

## Switching it on

1. **Confirm the runner is ready.** In GitHub → Settings → Actions → Runners, it should show as *Idle*, labelled `self-hosted, macOS, ARM64, blanc-ci`.
2. **Approve fork workflows.** In Settings → Actions → General → *Fork pull request workflows from outside collaborators*, choose **Require approval for all outside collaborators**. The workflows already keep forks off the Mac; this stops an unknown contributor's workflow changes from running at all until you've looked.
3. **Add the variable.** In Settings → Secrets and variables → Actions → *Variables* → **New repository variable**, set the name to `MAC_RUNNER_LABELS` and the value to `["self-hosted","macOS","ARM64","blanc-ci"]`. It must be valid JSON; the workflows read it with `fromJSON`.
4. **Check a pull request.** Push one. `unit (macos-15)` should start within seconds, and its log's *Set up job* should name your runner.
5. **Measure the queue.** After a day, `npm run ci:queue -- --since=<the day you switched>` shows queue times per runner label. Compare `macos-15` / `macos-latest` with `self-hosted,macOS,ARM64,blanc-ci`.

## If something goes wrong

- **Jobs sit queued forever:** no idle runner has every label in the variable. Fix the runner's labels, or delete the variable to fall back at once.
- **A test passes on hosted macOS but fails on the Mac:** compare the runner image (Node, Xcode command-line tools, screen size). The hosted image is described at <https://github.com/actions/runner-images>. Fall back by deleting the variable while you investigate.
- **The Mac is offline:** jobs wait for it rather than falling back. Delete the variable until it's back.
