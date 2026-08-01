# N-1 staging update feed

Blanc can exercise its real packaged updater without exposing a candidate to
the production GitHub Releases channel. The staging path is deliberately
runtime-only: an ordinary packaged launch still reads the signed
`app-update.yml` and checks GitHub Stable exactly as before.

## Boundary

The alternate feed activates only when both of these are present:

```text
BLANC_UPDATE_CHANNEL=staging
BLANC_UPDATE_STAGING_URL=https://updates.example/blanc/
```

The URL must use HTTPS, contain no credentials/query/fragment, and serve the
platform's `staging` metadata (`staging-mac.yml`, `staging.yml`, or
`staging-linux.yml`). A malformed staging request disables updating for that
launch; it never falls back to production. Plain HTTP is accepted only for the
loopback smoke and only with `BLANC_UPDATE_STAGING_ALLOW_HTTP=1`.

The first automated replacement smoke targets macOS, Blanc's primary signed
distribution. Windows/Linux feed preparation is supported, but native install
smokes remain follow-up platform work.

## Prepare the candidate feed

Build the candidate without publishing it. The candidate and N-1 app must be
signed by the same identity; on macOS use the normal signing/notarization
environment and `electron-builder --publish never`, never `npm run release`.

Then copy only the updater metadata and referenced artifacts into a fresh,
separate directory:

```bash
npm run update:staging:prepare -- \
  --source /absolute/path/to/candidate/dist \
  --output /absolute/path/to/empty/staging-feed \
  --platform mac \
  --version 1.0.1-staging.1
```

The command verifies the metadata version, rejects missing or path-traversing
artifacts, refuses a non-empty output directory, copies available blockmaps,
and renames `latest-mac.yml` to `staging-mac.yml`. The rename is load-bearing:
production clients request `latest-mac.yml` and therefore cannot discover this
feed accidentally.

## Run the N-1 replacement smoke

Use the immediately preceding signed staging app. It must already contain the
staging-feed seam introduced with this ticket; therefore the first real N-1
run becomes available after one packaged build containing this code exists.

```bash
BLANC_N_MINUS_ONE_APP=/absolute/path/to/n-minus-one/Blanc.app \
BLANC_STAGING_UPDATE_FEED=/absolute/path/to/staging-feed \
BLANC_EXPECTED_UPDATE_VERSION=1.0.1-staging.1 \
npm run test:packaged:update-staging
```

The smoke:

1. copies N-1 into an isolated temporary location and profile;
2. serves the prepared feed on loopback under the `staging` channel;
3. waits for `electron-updater` to discover and download the newer package;
4. lets Squirrel.Mac verify and replace the signed app;
5. checks the on-disk bundle version; and
6. relaunches the replaced bundle and checks `app.getVersion()`.

The temporary feed, app copy, status record, and profile are removed after the
run. Nothing is uploaded, tagged, released, or pointed at production.

## External staging server

For a longer-lived tester feed, upload the prepared directory to a dedicated
HTTPS origin and launch the N-1 staging package with the two boundary variables
above. Do not reuse `github.com/bnfy/blanc/releases`, do not mark a staging
candidate Latest, and never put credentials in the URL. Authentication, if a
future staging host needs it, should be added as explicit request headers—not
URL user info—and threat-modeled separately before use.
