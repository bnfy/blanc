---
name: releasing-blanc
description: Full runbook for cutting a Blanc desktop release — scripts/release.sh mechanics and its required BLANC_RELEASE_* env vars, macOS notarization via 1Password, the Touch ID provisioning profile and signing-certificate pinning, the Windows/Linux GitHub Actions build with Azure Trusted Signing, and the post-publication changelog + site-deploy steps. Use when running npm run release, debugging a signing/notarization failure, rotating the Developer ID certificate or provisioning profile, or changing the release workflow.
---

# Releasing Blanc

**Released versions are immutable** — always bump to a new version, never overwrite
assets. The pipeline is draft-first and fail-closed: nothing is tagged or published
until every gate passes, and a failed attempt leaves no public artifacts.

## The release flow, end to end

1. **Release PR** (squash-merged to `main`, titled "Release Blanc X.Y.Z") containing,
   in one commit:
   - the `version` bump in `package.json` + `package-lock.json` (consider the
     `electron` devDependency too — it tracks Chromium stable, and Chromium can't be
     swapped out of a running app);
   - the checked-in release notes **`docs/press/release-notes/vX.Y.Z.md`**
     (required; ordinary wrapped markdown — mirror the previous release's file);
   - the press-page version: `const VERSION = 'X.Y.Z'` in `site/src/pages/press.astro`
     **and** the literal version pin in `test/unit/press-kit.test.js`
     (`assert.equal(packageVersion, 'X.Y.Z')`). The verify gate fails the release if
     either lags the package version.
2. **Run the script from a checkout whose HEAD is exactly `origin/main`** (the script
   verifies this and refuses otherwise):

   ```bash
   BLANC_RELEASE_MODE=stable BLANC_RELEASE_PLATFORMS=mac,windows,linux BLANC_MAC_ARCHES=arm64 npm run release
   ```

   All three env vars are **required** — the script exits immediately without them.
   `BLANC_RELEASE_MODE=candidate` requires a prerelease version (`X.Y.Z-rc.N`) and
   publishes with `--prerelease`; `stable` refuses prerelease versions. Recent
   releases ship mac **arm64 only**; add `x64` to `BLANC_MAC_ARCHES` only when the
   x64 build is actually verified.
3. **After publication**, the script regenerates `site/src/data/releases.json` from
   the GitHub release body (`npm run site:changelog`). Commit that as
   "Record Blanc X.Y.Z in the public changelog" (its own PR), then deploy the site
   (`npm run site:deploy`) — **only from a checkout at `origin/main`**: a production
   Pages deploy ships whatever the local tree contains, and a deploy from a stale
   checkout has silently rolled the live site back to older content before.

## What the script does (and refuses)

`scripts/release.sh` authenticates via the `gh` CLI's cached session (no `GH_TOKEN`
needed locally). In order: it refuses existing tags/releases for the version
(immutability), refuses dirty release sources (a broad list: `src`, `build`, `test`,
`scripts`, `site`, spec/substrate dirs, workflows, `package.json`/lock, the notes
file), refuses a HEAD that isn't `origin/main`, then runs `npm ci` and the
**press verification gate** (`release:verify:press`: substrate checks, unit tests,
acceptance dry-run + desktop run, OAuth desktop test, DNS smoke,
`npm audit --omit=dev --audit-level=high`, site build). Only then does it build:
notarized mac artifacts, a packaged first-run smoke test, and a migration test that
downloads the public Stable base version and upgrades its profile. The immutable
source tag is pushed first so CI runners can check out the exact commit, the draft
release is created with the complete mac asset set (using `gh release create`
directly — electron-builder's own GitHub publisher races per-artifact uploads and
can leave a first publish missing `latest-mac.yml` or a blockmap), Windows/Linux
builds are dispatched and watched, the full draft asset set is re-downloaded and
verified against the expected manifest, `SHA256SUMS` is generated and uploaded, and
only then is the draft published and every download URL smoke-checked logged-out.

## First-attempt failure modes (all observed on v1.0.3)

- **Press-kit pin:** `test/unit/press-kit.test.js` hard-codes the version and
  requires `press.astro`'s `VERSION` to match — bump both in the release PR itself
  (see step 1), not as an afterthought.
- **npm audit:** the security gate is fail-closed on high-severity advisories in
  production deps, including transitive ones (e.g. `undici` under electron's
  `@electron/get`). Fix is usually a lockfile-only `npm audit fix --omit=dev`,
  committed to main.
- **Fresh worktree:** root `npm ci` does not install the site's dependencies — run
  `npm --prefix site ci` too, or the site build dies with `astro: command not found`.
- **Exit-code masking:** don't pipe the release run through `tee` in a shell without
  `pipefail` — a failed release then reports exit 0 and reads as success.

Releasing from a **throwaway git worktree** works well when the primary checkout is
dirty or shared with concurrent sessions: `git worktree add <dir> origin/main`, land
the release PR, `git checkout --detach origin/main` in the worktree (detached HEAD
passes the HEAD-equals-origin/main check), install both dependency trees, run the
script, remove the worktree afterward.

## macOS notarization

**Notarization:** the build step is wrapped in `op run --env-file=.env.1password --no-masking -- ...`, pulling `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD` from the 1Password item **"Apple Notarization"** (vault Dev, `username`/`password` fields) plus a literal `APPLE_TEAM_ID` — electron-builder's `@electron/notarize` integration auto-detects those three env vars with no extra config (hardened runtime + the JIT/unsigned-memory/disable-library-validation entitlements it needs are already electron-builder's defaults). If `op` isn't installed, the script falls back to an unnotarized build with a warning instead of failing outright; if `op` *is* installed but the item can't be resolved (locked vault, wrong item name), it fails loudly rather than silently shipping unnotarized — a signed-but-unnotarized build gets quarantined and blocked by Gatekeeper the moment it's downloaded (e.g. by `electron-updater` during an auto-update), which is exactly what broke a stale pre-rebrand install after the v0.3.0 release.

## Provisioning profile and signing certificate

**Provisioning profile (Touch ID passkeys):** the mac build embeds `build/embedded.provisionprofile` (wired via `build.mac.provisioningProfile`) because the WebAuthn `keychain-access-groups` entitlement is *restricted* — even for the app's own `TeamID.BundleID` group, AMFI SIGKILLs an app carrying it without a profile that authorizes it, and helpers can't carry a profile at all (so the inherit entitlements must never list the group). The profile is only honored when it embeds the **exact certificate** the build is signed with; the Apple account has several identically-named Developer ID Application certs, so the signer is made deterministic and verified twice. `build.mac.identity` pins the signing certificate **by SHA-1 fingerprint** (electron-builder substring-matches the qualifier against `security find-identity` lines, so a fingerprint selects exactly one identity — update the pin when the cert rotates). `scripts/preflight-mac-signing.mjs` (npm `predist`/`predist:dir` + `release.sh`) then fails the build early unless *every* certificate electron-builder could select — the pinned identity, a `CSC_LINK` p12 (parsed and validated, never skipped), or unpinned Developer ID identities — is embedded in the profile, and unless the profile is an unexpired, all-devices (`ProvisionsAllDevices`, never `ProvisionedDevices`), `Platform: OSX` Developer ID profile — a device-listed development-type profile would launch only on registered Macs, bricking every other install through auto-update, while end-user devices need nothing installed for the correct profile type (it ships inside the bundle). Finally `scripts/after-sign-verify.js` (`build.afterSign`) checks ground truth on every packaged app: the certificate that *actually* signed `Blanc.app` must be in the bundle's embedded profile (itself byte-identical to the repo's) with the WebAuthn entitlement present, throwing before any dmg/zip exists. Regenerate the profile on the developer portal whenever the signing cert rotates — and note every current Developer ID cert expires 2027-02-01 (G1 CA cap), so cert *and* profile rotation land together before then. `test/unit/webauthn-packaging.test.js` guards the static wiring cross-platform.

## Windows & Linux

**Windows & Linux:** `release.sh` only builds macOS locally (it's a macOS dev machine), then dispatches `.github/workflows/release-windows-linux.yml` against the already-pushed source tag and watches the run to completion; the draft stays unpublished if the native build fails. That workflow builds NSIS on `windows-latest` and AppImage on `ubuntu-latest` and uploads both onto the same draft; duplicate asset uploads fail rather than overwrite an existing version.

**Windows code signing is live as of v1.0.3 (2026-08-04) via Azure Trusted Signing:** account `blanc-signing`, certificate profile `blanc-profile`, publisher CN **"Bananify Creative"** (org identity validation completed, expires 2028-10-28 — renewal reminders start 60 days out; certificate renewal stops if it lapses). The workflow's signing is tried in order: **Azure Trusted Signing** first (repo secrets `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` for the `blanc-github-signing` service principal, which holds the "Artifact Signing Certificate Profile Signer" role on the account, plus repo *variables* `AZURE_TRUSTED_SIGNING_ENDPOINT`/`AZURE_CODE_SIGNING_ACCOUNT_NAME`/`AZURE_CERTIFICATE_PROFILE_NAME`/`AZURE_PUBLISHER_NAME`, passed via `--config.win.azureSignOptions.*` CLI overrides); then a traditional Authenticode cert via `CSC_LINK`/`CSC_KEY_PASSWORD` if Azure isn't configured; otherwise unsigned with a `::warning::` annotation. A healthy release logs `==> Signing via Azure Trusted Signing (blanc-signing/blanc-profile)` in the windows job — **if the unsigned warning ever reappears, a repo variable or secret has been lost.** The Azure branch requires **all three** of `AZURE_CLIENT_ID`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, and `AZURE_CERTIFICATE_PROFILE_NAME` non-empty before it's attempted — a partially-configured setup must fall through rather than call `Invoke-TrustedSigning` with an empty profile name, which fails hard instead of degrading; this exact failure shipped once before the gate was tightened. Linux AppImages aren't code-signed (no OS-level equivalent to Gatekeeper/SmartScreen to satisfy).

Two electron-builder artifact-naming quirks the workflow's verify/upload steps depend on, found by reading actual CI output rather than the docs: the AppImage gets **no** `-x86_64`/arch suffix when built for the runner's default arch (only a non-default or multi-arch build adds one), and AppImage's block map is embedded in the file itself rather than shipped as a separate `.blockmap` (unlike the mac zip/dmg and the NSIS `.exe`, which do get one) — re-check the real `dist/` output rather than assuming a pattern if this ever needs to change.
