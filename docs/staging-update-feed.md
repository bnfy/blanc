# N-1 staging update feed

Blanc can exercise its real packaged updater without exposing a candidate to
the production GitHub Releases channel. Ordinary packaged launches continue to
read the embedded GitHub `app-update.yml` exactly as before.

The alternate feed activates only with:

```text
BLANC_UPDATE_CHANNEL=staging
BLANC_UPDATE_STAGING_URL=https://updates.example/blanc/
```

The URL must be absolute HTTPS with no credentials, query, or fragment. Local
smokes may use loopback HTTP only with
`BLANC_UPDATE_STAGING_ALLOW_HTTP=1`. Invalid staging configuration disables the
updater for that launch and never falls back to production.

## Prepare a candidate

Build without publishing, then copy the platform metadata and exactly its
referenced artifacts into a fresh directory:

```bash
npm run update:staging:prepare -- \
  --source /absolute/path/to/dist \
  --output /absolute/path/to/empty-feed \
  --platform mac \
  --version 1.11.0-staging.1
```

The output uses `staging-mac.yml`, `staging.yml`, or `staging-linux.yml`.
Production clients request the `latest` channel names and cannot discover it.

## Exercise the real handoff

The first automated replacement smoke targets signed Squirrel.Mac packages:

```bash
BLANC_N_MINUS_ONE_APP=/absolute/path/to/old/Blanc.app \
BLANC_STAGING_UPDATE_FEED=/absolute/path/to/empty-feed \
BLANC_EXPECTED_UPDATE_VERSION=1.11.0-staging.1 \
npm run test:packaged:update-staging
```

It copies the N-1 application into an isolated profile, serves the feed on
loopback, waits for discovery and download, lets Squirrel replace the bundle,
waits for the installed version and deep signature to stabilize, and relaunches
the replacement to confirm its running version. Hardened packages are launched
through Chromium CDP rather than Playwright's Electron inspector, because
Blanc's production NodeCliInspect fuse is deliberately disabled.

Squirrel.Mac's privileged ShipIt service installs the replacement as
`root:wheel`, matching an update under `/Applications`. The smoke removes its
isolated profile and status files but retains that installed app at the path it
prints for post-run inspection; dispose of it through the normal
administrator-authenticated macOS path after recording evidence. The first
genuine N-1 result is possible only after a released build containing this
staging seam exists. Nothing in this workflow tags, publishes, or changes the
stable feed.

## Recorded N-1 results

The staging seam first shipped in public v1.11.0, which made a genuine N-1 run
possible for the first time. Both runs below used public v1.11.0 as N-1 and the
same staged N, `1.12.0-staging.1`, and neither tagged, published, or touched the
stable feed.

### macOS — PASS 2026-08-31

- N-1 was `/Applications/Blanc.app` at `1.11.0`, the public release the owner had
  reached through the real v1.10.0 -> v1.11.0 updater handoff.
- N was built locally with `npm run dist -- --mac zip`, signed by the pinned
  identity `55283A84…`; `after-sign-verify` confirmed the embedded provisioning
  profile, DER WebAuthn entitlement, and the Plugin helper as the sole
  library-validation exception.
- `npm run test:packaged:update-staging` served the feed on loopback, and the
  N-1 copy completed discovery, download, install, relaunch, and version
  confirmation, printing
  `packaged-update-staging-smoke OK: 1.11.0 -> 1.12.0-staging.1`.
- The harness triggers installation programmatically rather than through the
  prompt. On macOS that is the same call: the **Restart Now** button runs
  `autoUpdater.quitAndInstall()` and the staging path runs
  `autoUpdater.quitAndInstall(false, false)`, which are identical defaults. Only
  the click itself was absent, which the Windows run below supplies.

### Windows — PASS 2026-08-31

- The automated smoke refuses to run off darwin, so this run was manual.
- N was `Blanc-Setup-1.12.0-staging.1.exe` from private validation run
  <https://github.com/bnfy/blanc/actions/runs/33437365977>, built from the
  throwaway branch `staging/win-update-rehearsal`. Its recorded Authenticode
  status was `Valid` with publisher `CN=Bananify Creative` and a Microsoft
  timestamp, and the downloaded installer's SHA-256
  `ce71e49e1acc7d7d09078e627e0efdc9761d1d62c87a4b4ba91a811bb2b1c1c2` matched
  `windows-signature.json`.
- The feed was served from `http://localhost:8080/` on the same machine, with
  auto-install deliberately left off so the ordinary prompt appeared.
- Public v1.11.0 discovered and downloaded the staged build, the owner clicked
  the real **Restart Now** action, and the relaunched app reported
  `1.12.0-staging.1` in the new-tab footer, confirmed by screenshot.
- The host was Windows 11 under Parallels Desktop. Parallels is unreliable for
  Blanc's Linux runtime checks, but it served this Windows updater run without
  trouble.

Linux staging remains unexercised; the policy and feed tooling support it, but
no N-1 run has been recorded.
