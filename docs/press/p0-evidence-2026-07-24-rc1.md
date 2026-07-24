# P0 release-candidate evidence — July 24, 2026

## Candidate identity

- Version/tag: `1.0.0-rc.1` / `v1.0.0-rc.1`
- Immutable source commit: `03741ecea5bf3f0bd83cd4d2b6f6bde0c2acb587`
- Published as a GitHub prerelease at `2026-07-24T16:36:35Z`
- Release: <https://github.com/bnfy/blanc/releases/tag/v1.0.0-rc.1>
- Distributed matrix: macOS Apple Silicon only
- Stable updater discovery remains on `v0.22.0`; the candidate is not marked
  Latest and is not offered to Stable users.

## Source and automation gates

- Locked dependency install completed with zero production vulnerabilities.
- Design-token, settings-schema, copy, and ad-block substrate checks pass.
- All 259 unit tests pass.
- Acceptance wiring resolves all 52 scenarios and 345 steps.
- All 52 runnable desktop scenarios and 345 steps pass against Electron.
- Deterministic Google OAuth compatibility and native DNS smoke pass.
- The production site builds successfully, including `/press`.
- GitHub Pre-release smoke run `30108800288` passes on Windows and Linux. Its
  first Linux attempt was retried after GitHub returned a transient HTTP 504
  while downloading Electron; the retry passed.
- GitHub Parity guards run `30108800278` passes substrate/unit,
  acceptance-wiring, and OAuth compatibility jobs.

## macOS trust and packaged behavior

- The pinned Developer ID Application identity and embedded provisioning
  profile pass preflight for the selected Apple Silicon build.
- Apple notarization completed successfully.
- The app's code signature, provisioning profile, required entitlement, and
  stapled ticket pass post-sign verification.
- Gatekeeper accepts both the built app and the app copied from the mounted DMG
  with `source=Notarized Developer ID`.
- The copied app passes the packaged first-run smoke from a clean temporary
  profile.
- Cold-online startup, pre-consent behavior, persisted opt-out, corrupt-cache/
  offline recovery, Retry, and explicit Continue-without-blocking paths pass.
- Public Stable `v0.22.0` and the candidate pass the same-profile migration
  smoke with representative settings, grouped/pinned tabs, a Favorite, and
  history restored.
- The outer DMG uses electron-builder's default unsigned-container model. The
  app inside is signed, notarized, and stapled; electron-builder documents that
  signing the DMG container is not required for Gatekeeper, and Apple states
  that disk images do not need to be signed.

## Exact public artifact hashes

```text
f5c8fee8348f1acd8f14b6fd704dd7482a53116112d1888250eafc19700b7648  Blanc-1.0.0-rc.1-arm64-mac.zip
7be2c2b3eca6d1c7f34cd7ce739373e065bf6629ad4591f6763067b5aae846f6  Blanc-1.0.0-rc.1-arm64-mac.zip.blockmap
675f21682a64251b5e4b32c59bf714f5879d84d66bcb7c364cc918afb9d69b9f  Blanc-1.0.0-rc.1-arm64.dmg
262e8b67e2a57cf6a267f093c990a4e0185e43523ce28abf264cfcadfc8199f7  Blanc-1.0.0-rc.1-arm64.dmg.blockmap
434b40e9ea55c123a51865290ab0b002fb7a5e84766460e35486433328eebb38  latest-mac.yml
```

The authenticated draft was downloaded before publication, verified against
the expected five-file manifest, hashed, re-verified with `SHA256SUMS`, and
then published without rebuilding. Public logged-out asset requests and the
reviewer page links succeed.

## Live reviewer surface

- The committed Astro build was deployed to the existing Cloudflare Pages
  production project after the previous production deployment was found to
  serve the home page at `/press`.
- `https://blancbrowser.com/press` now serves the reviewer kit with its
  canonical, `noindex,nofollow,noarchive`, Open Graph, and Twitter metadata.
- Desktop and 390px-wide browser checks show no horizontal overflow.
- Keyboard navigation reaches every press action and screenshot link with a
  visible focus treatment.
- The page, social card, screenshots, RC DMG, checksum manifest, and GitHub
  release URLs return successful public responses; the browser console reports
  no warnings or errors.
- The accepted vertical-tabs UI still needs a clean native recapture before
  the screenshot gate can close.

## Candidate-window gates still open

- At least one active human tester must install and use this exact RC.
- Seven consecutive days must pass with no open P0/P1 defect. The provisional
  clock begins at publication and completes no earlier than
  `2026-07-31T16:36:35Z`; a P0/P1 fix creates immutable `rc.N` and resets it.
- Representative screenshots must be recaptured where the accepted vertical
  tabs UI changed.
- Final Stable links, checksums, release notes, and site staging remain Day 13
  work.
