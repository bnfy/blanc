---
name: releasing-blanc
description: Full runbook for cutting a Blanc desktop release — scripts/release.sh mechanics and its required BLANC_* env vars, macOS notarization via 1Password, the Touch ID provisioning profile and signing-certificate pinning, the Windows/Linux GitHub Actions build with Azure Trusted Signing, resuming past flakes, and the mandatory post-publication verification, records, site deploy and updater handoffs. Use when running npm run release, debugging a signing/notarization failure, rotating the Developer ID certificate or provisioning profile, or changing the release workflow.
---

# Releasing Blanc

**Released versions are immutable**: always bump to a new version, and never
overwrite assets. The pipeline is draft-first and fail-closed. Nothing is
tagged or published until every gate passes, and a failure before the tag
push leaves nothing public.

This skill summarises the process. The authoritative sources are the
**Release-operator protocol** and the **Release completion and takeover
protocol** in `CLAUDE.md` (both mandatory), `docs/release-verification.md`
(read it immediately before every release), and `scripts/release.sh` itself.
Where they disagree with this file, they win.

## 1. Prepare the release (its own PR, squash-merged to `main`)

Title it "Prepare Blanc X.Y.Z" and mirror the previous one (e.g. #767 for
1.32.0). In one commit:

- `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and
  `package-lock.json`). Consider the `electron` devDependency too: it tracks
  Chromium stable, and Chromium can't be swapped out of a running app.
- Bump `build.mac.bundleVersion` above the previous public build (1.31.0 =
  1310, 1.32.0 = 1320). Nothing checks this, and releases are immutable.
- Add `docs/press/release-notes/vX.Y.Z.md`: Added / Changed / Fixed,
  user-facing only, ordinary wrapped markdown like the previous file. Include
  only changes present in the release commit, and keep every claim within
  `docs/marketing-claims.md`.
- Repoint `docs/press/release-notes/unreleased.md` at the new notes.
- Run `npm run compliance:build`, because the version bump makes both
  compliance SBOMs stale.

There is no press-page version to bump: the website derives the version from
`package.json`. Pre-check `npm audit --omit=dev --audit-level=high` and
`npm run compliance:check`. Merge only when every check run on the PR's head
commit has finished green.

## 2. Preflight

- Use a clean throwaway worktree detached at `origin/main`:
  `git fetch origin && git worktree add <dir> origin/main`. Inside it, run
  `npm ci` **and** `npm --prefix site ci`; root `npm ci` alone leaves
  `site:build` failing with `astro: command not found`.
- Confirm that no `vX.Y.Z` tag, draft or release exists. A draft doesn't show
  up under `releases/tags/<tag>`, so list releases instead.
- Confirm `gh auth status`, `op` and `cosign` work, and that no other release
  is running (`ps -eo pid,command | grep -E 'release\.sh|electron-builder'`).
  A second run's `npm ci` deletes `node_modules` under the first.
- A sandboxed `gh auth status` can falsely report a bad token because it
  can't reach the keychain. Retry outside the sandbox, or use the working Git
  credential, before asking anyone to run `gh auth login`.

## 3. Run it

From the worktree, in a **visible, foreground native Terminal.app window**:

```bash
BLANC_RELEASE_OPERATOR=terminal \
BLANC_COSIGN_IDENTITY='anthony@bnfy.me' \
BLANC_COSIGN_OIDC_ISSUER='https://github.com/login/oauth' \
BLANC_RELEASE_MODE=stable \
BLANC_RELEASE_PLATFORMS=mac,windows,linux \
BLANC_MAC_ARCHES=arm64,x64 \
npm run release
```

- **Required:** `BLANC_RELEASE_MODE` (`stable`, or `candidate` for an
  `X.Y.Z-rc.N` version, published with `--prerelease`), `BLANC_MAC_ARCHES`,
  `BLANC_COSIGN_IDENTITY` and `BLANC_COSIGN_OIDC_ISSUER`. The script exits
  immediately without any of them.
- **Both Mac architectures ship in every release.** Apple Silicon is the
  default build and the one smoke-tested locally; Intel ships alongside it.
  A single architecture is refused unless `BLANC_MAC_ARCH_WAIVER` gives the
  reason, which also goes in the release incident.
- **Operator:** `terminal` is the default. `agent` needs an interactive,
  unsandboxed PTY the user has approved. If the harness rejects agent mode
  once, explain it once, then launch the complete terminal-mode command in
  Terminal.app yourself, so the user doesn't have to type it.
- **Never background it.** Without a TTY, cosign switches to a device code
  that expires in 300 seconds (this killed v1.2.0). An agent can wrap the
  command as `script -q <log> npm run release; echo $? > <exit-file>` inside
  the Terminal window and tail the log. Strip carriage returns with
  `sed -l`, not `tr`, which buffers. Never pipe through `tee` without
  `pipefail`.
- **Optional:** `BLANC_COSIGN_REDIRECT_PORT` (default 49197), and
  `BLANC_MIGRATION_BASE_VERSION`, whose default is advanced to the new
  version in each release's record PR.

**The user is needed twice:**

1. **1Password, at the start.** The script runs
   `OP_BIOMETRIC_UNLOCK_ENABLED=true op signin` itself. Approve it only if the
   prompt names the actual operator. Never run a separate sign-in, and cancel
   if `op` offers to add an account by hand.
2. **Sigstore, about 30 minutes in**, after the Windows/Linux build. A fresh
   OIDC page opens in Safari with a callback on `127.0.0.1:49197`. Tell the
   user the moment it opens. If it times out, cosign falls back to
   `Enter verification code:` in the Terminal window and waits indefinitely.
   Open that flow's `redirect_uri=urn%3Aietf…` link from the log in Safari;
   the user signs in as `bnfy` and pastes the code into Terminal. Never
   authorize it in Blanc.

**During notarization, look at process names only**
(`ps -axo pid=,ppid=,etime=,comm=`). The notarization library passes Apple's
app-specific password in `notarytool`'s arguments. If it ever reaches a log or
tool output, revoke it and replace the `Apple Notarization` item in 1Password
before another release.

## What the script does, in order

1. **Refuses** an existing tag or release for the version, dirty release
   sources, or a HEAD that isn't exactly `origin/main`.
2. Runs `op signin`, then `npm ci` and the **press verification gate**
   (`release:verify:press`): substrate and Windows-icon checks, unit tests,
   the acceptance dry run and desktop run, the desktop smokes (Favorites
   picker, wallpaper, cold launch, browser shortcuts, Web Store, OAuth,
   modified links, DNS), the security audit, and the site build.
3. Preflights the macOS identity and provisioning profile, then builds
   notarized macOS artifacts for both architectures inside
   `op run --env-file=.env.1password`. If `op` is missing it refuses; it
   never publishes an unnotarized build.
4. **Packaged checks** on the signed build: fuses, byte-identical blocker
   payloads, compliance payloads, first run, release regressions, Workspace
   quit/restart, two live-favicon matrices, and migration from the public
   `MIGRATION_BASE_VERSION`.
5. Pushes the immutable source tag and creates the draft release with the
   complete macOS asset set. It uses `gh release create` directly, because
   electron-builder's own publisher races its uploads and can leave
   `latest-mac.yml` or a blockmap missing.
6. Dispatches `.github/workflows/release-windows-linux.yml` against the tag
   and watches it.
7. Downloads the full draft, validates it against the expected manifest,
   generates the SBOM and `SHA256SUMS`, signs them with Sigstore, and verifies
   the bundle against the pinned identity and issuer.
8. Publishes the verified draft, smoke-checks every download URL while logged
   out, and refreshes `site/src/data/releases.json`.

## When something fails

- **Before the tag push, flake:** rerun just the failed check against the
  same `dist/`. If it passes and shows no bug, rerun the same command with
  `BLANC_RELEASE_RESUME_FROM=<step>` and
  `BLANC_RELEASE_RESUME_REASON='<failure and passing rerun>'`. Steps are
  `fuses`, `blocker-payloads`, `compliance`, `first-run`, `regressions`,
  `workspaces`, `favicons-primary`, `favicons-additional` and `migration`.
  This reuses the stamped build instead of rebuilding and re-notarizing.
  Press-gate and build failures can't be resumed this way.
- **Before the tag push, real bug:** stop and ask the user. Fix it in its own
  PR, then rerun the same version, which is allowed because no tag exists.
  Before relaunching, list every commit that landed on main since the failed
  attempt's source, and raise any new ones.
- **After the tag or draft exists:** never rerun `npm run release`, delete the
  tag, or overwrite assets; the tag and draft are evidence. Stop, report
  exactly where it failed, and ask. `docs/release-verification.md` describes
  finishing a failed Sigstore step by hand, in the script's order.
- **Common first-attempt gates:** a new high-severity advisory in production
  dependencies (usually fixed with a lockfile-only
  `npm audit fix --omit=dev`, committed to main); a fresh worktree without
  `npm --prefix site ci`.

## 4. After publication (the release isn't finished yet)

Follow the **Release completion and takeover protocol** in `CLAUDE.md`. In
short:

1. **Independent verification** from a fresh, empty download directory:
   `gh release download vX.Y.Z`, then
   `node scripts/verify-release-manifest.mjs --dir <dir> --version X.Y.Z --platforms mac,windows,linux --mac-arches arm64,x64`,
   `shasum -a 256 -c SHA256SUMS`, and `cosign verify-blob` against the pinned
   identity and issuer. The two-architecture norm is 18 assets and 17
   manifest artifacts.
2. **Both Mac DMGs** (`Blanc-X.Y.Z-arm64.dmg` is Apple Silicon,
   `Blanc-X.Y.Z.dmg` is Intel): mount each read-only, then run
   `spctl --assess --type execute` and
   `codesign --verify --deep --strict --verbose=2` on `Blanc.app`, confirm
   the Developer ID (team XYGUCY4498) and the pinned leaf certificate, run
   `xcrun stapler validate`, and check the architecture and
   CFBundleVersion. Check that `windows-signature.json` matches the
   installer's SHA-256.
3. **Hosted checks:**
   `gh workflow run prerelease-smoke.yml --ref vX.Y.Z -f release_version=X.Y.Z`,
   then wait for all five jobs. The Apple Silicon job's `stapler validate` can
   fail on a runner network error (`NSURLErrorDomain -1005`); it's read-only,
   so rerun just that job.
4. **Records PR** from a separate clean worktree:
   - a dated incident in `docs/release-incidents/`, linking any evidence the
     release gate requires;
   - the public baseline in `CLAUDE.md` and `AGENTS.md`, kept byte-identical;
   - the capability boundaries in `docs/marketing-claims.md`;
   - `site/src/data/releases.json` (`npm run site:changelog`), plus the
     Feature Roadmap and `release-feature-names.json` (see `site/CLAUDE.md`);
   - the Bangs page re-pinned to the new tag,
     `npm run site:bangs -- --ref vX.Y.Z --release vX.Y.Z`. Its data test
     requires the newest tag in `releases.json`, so it fails until this runs;
   - the next default `MIGRATION_BASE_VERSION` in `scripts/release.sh`, and
     its assertion in `test/unit/release-manifest.test.js`.

   Run `npm run site:changelog:check` and `npm run site:build`.
5. **Site deploy:** `npm run site:deploy`, **only from a clean checkout at
   `origin/main`**. A production Pages deploy ships whatever the local tree
   contains, and a stale checkout has silently rolled the live site back
   before. Confirm that
   `wrangler pages deployment list --project-name=blancbrowser` shows that
   commit as Production on branch `main`, and check the live homepage and
   `/changelog`.
6. **Updater handoffs (macOS and Windows):** each counts only when it starts
   inside the previous public Blanc, which finds, downloads and installs the
   update through **Restart Now**. Opening an installer directly never
   counts. Record them as pending until the user reports each one.
7. **r/blancbrowser release post:** after the site deploy, draft a post for
   Blanc's own subreddit in the format of the v1.36.0 post in
   `docs/reddit-community/r-blancbrowser-setup.md` (title naming the main
   changes, Release flair, a link to the version's `/changelog#vX-Y-Z`
   anchor). Check every claim against the new release with
   `docs/marketing-claims.md`. The owner approves the exact text and posts
   it; Claude can't open reddit.com.

Apart from that r/blancbrowser post, no posts or launch channels go out as
part of a release.

## macOS signing details

- **Notarization:** credentials come from the 1Password item **"Apple
  Notarization"** (vault Dev, `username`/`password`) plus a literal
  `APPLE_TEAM_ID`, which electron-builder's `@electron/notarize`
  integration detects. The log never mentions notarization, so verify the
  artifacts instead (section 4).
- **Hardened runtime:** only Electron's required JIT and unsigned-memory
  allowances. Library validation stays on everywhere except
  `Blanc Helper (Plugin).app`, whose single exception loads 1Password's
  separately signed native bridge.
- **Provisioning profile and certificate pin:** the build embeds
  `build/embedded.provisionprofile` for the restricted WebAuthn
  `keychain-access-groups` entitlement (Touch ID passkeys).
  `build.mac.identity` pins the signing certificate by SHA-1 fingerprint.
  `scripts/preflight-mac-signing.mjs` and `scripts/after-sign-verify.js`
  fail the build unless the certificate that actually signed the app is in an
  unexpired, all-devices Developer ID profile. Every current Developer ID
  certificate expires **2027-02-01**, so rotate the certificate and the
  profile together before then and update the pin. `CLAUDE.md` has the full
  rationale; `test/unit/webauthn-packaging.test.js` guards the wiring.

## Windows and Linux

`release.sh` builds macOS locally, then dispatches
`.github/workflows/release-windows-linux.yml`. Its NSIS build runs on
`windows-latest` and its AppImage on `ubuntu-latest`. Both upload to the same
draft, and duplicate uploads fail rather than overwrite.

- **Windows signing is fail-closed.**
  - The repo variable `WINDOWS_EXPECTED_PUBLISHER` must hold the exact
    Authenticode subject
    (`CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US`).
  - **Azure Trusted Signing** is used when its whole configuration is
    present: account `blanc-signing`, profile `blanc-profile`, publisher
    "Bananify Creative". That means the secrets `AZURE_TENANT_ID`,
    `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`, plus the endpoint, account,
    profile and publisher variables.
  - A complete `CSC_LINK`/`CSC_KEY_PASSWORD` pair is the fallback.
  - Missing or partial configuration fails the job. Public releases never
    fall back to unsigned artifacts.
  - A healthy run logs
    `==> Signing via Azure Trusted Signing (blanc-signing/blanc-profile)`.
    The signature must be valid and timestamped, with exactly that subject;
    `windows-signature.json` records it against the installer's SHA-256.
- **Private Windows/Linux candidates:**
  `gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f platform=windows`
  builds and signs without a tag or public updater entry. Installing that
  installer never proves the updater handoff.
- **Linux:** AppImages have no OS-level publisher signature; the
  authenticated manifest is their publisher check.
- **Artifact naming quirks the workflow depends on:** an AppImage built for
  the runner's default architecture has **no** `-x86_64` suffix, and its
  block map is embedded rather than a separate `.blockmap` (unlike the Mac
  zip/DMG and the NSIS `.exe`). Check the real `dist/` output before changing
  either.
