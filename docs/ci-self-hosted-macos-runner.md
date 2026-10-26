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
| `workspace-regressions`, `favorites-import`, `browser-shortcuts` macOS legs (parity-guards.yml) | GitHub-hosted, nightly and manual runs only | self-hosted, every PR and push, plus nightly |
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

1. **Install Tart** (Cirrus Labs' macOS virtualization for Apple Silicon): `brew install cirruslabs/cli/tart`. *Check Tart's current licence before relying on it. It's source-available with a free tier for small installations.*
2. **Make a base image** from one of Cirrus Labs' public macOS images, for example `tart clone ghcr.io/cirruslabs/macos-sequoia-base:latest blanc-ci-base`. *Check the current image names on their registry; use the macOS version matching `macos-15`.* Then boot it once (`tart run blanc-ci-base`) and inside it:
   - make sure the user logs in automatically to a desktop session. Electron tests need a real GUI session;
   - install Node 22 and Git. `actions/setup-node` also installs Node per job, but Git must be there;
   - download the GitHub Actions runner into `~/actions-runner`, from Settings → Actions → Runners → *New self-hosted runner* → macOS ARM64. Don't configure it yet;
   - shut the VM down.
3. **The job loop on the host:** a small script, run as a LaunchAgent so it restarts, repeats:
   1. `tart clone blanc-ci-base ci-$N` to get a fresh copy;
   2. get a one-time registration from the GitHub API, either a just-in-time runner config (`POST /repos/bnfy/blanc/actions/runners/generate-jitconfig` with `labels` and `runner_group_id`) or a registration token (`POST /repos/bnfy/blanc/actions/runners/registration-token`). That needs a fine-grained token with *Administration: read and write* on `bnfy/blanc` only, kept on the host, never in the VM image;
   3. boot the clone, then inside it configure the runner as **ephemeral** with the labels below (`./config.sh --url https://github.com/bnfy/blanc --token … --labels blanc-ci --ephemeral --unattended`, or `./run.sh --jitconfig …`) and start it. It takes exactly one job and exits;
   4. when the VM's runner exits, `tart stop` and `tart delete ci-$N`.

   Run two loops to use two VMs at once. Apple's macOS licence allows two macOS virtual machines per Mac, and Tart enforces that, so two VMs is the ceiling per machine.
4. **Labels:** self-hosted runners get `self-hosted`, `macOS` and `ARM64` automatically. Add `blanc-ci` so nothing else matches by accident.

## Simpler but weaker: the runner directly on the Mac

Register the runner on a dedicated non-admin user account (`./config.sh --url https://github.com/bnfy/blanc --token … --labels blanc-ci`, then `./svc.sh install && ./svc.sh start`). It's quicker to set up, but jobs share one machine and can leave state behind for the next job. That's acceptable only because forks are excluded, and only on a machine with nothing else on it.

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
