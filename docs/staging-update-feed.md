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
