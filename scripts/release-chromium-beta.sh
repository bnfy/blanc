#!/usr/bin/env bash
# PHASE 1 DRAFT: offline planning only. No switch or environment value unlocks it.
# Do not turn this into an executable publisher until the runbook's phase-2 gates
# and the upstream branding/Sparkle/signing patches have been reviewed and built.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -ne 1 ] || [ "$1" != "--plan" ]; then
  echo 'BLOCKED: Chromium beta release is a phase-one draft. Use --plan; no builds or service calls are implemented.' >&2
  exit 78
fi
cat <<'PLAN'
PHASE 1 ONLY — future ordered release stages, all disabled:
1. Read docs/chromium-beta-release.md and docs/release-verification.md. Require
   native Terminal/approved agent PTY, op, gh, cosign; no spoofed TERM_PROGRAM.
   Require reviewed beta identity/feed/key, release.json, clean source tree,
   matching HEAD/upstream/ordered patch inventory and exact candidate per arch.
2. Refuse every existing local tag, remote tag or GitHub draft/public release.
   An API failure is not absence: require authenticated explicit 404 for release
   absence; use successful git ls-remote --tags for remote tag absence.
   Check this again immediately before creating the immutable tag/draft.
   No overwrite, force tag, --clobber or latest=true, ever.
3. OP_BIOMETRIC_UNLOCK_ENABLED=true op signin (cancel manual-account prompt).
   node chromium/release/preflight.mjs RELEASE.json LOCAL-INPUTS.json
4. BUILD REQUIRED / DISABLED: approve the scheduled official GN diff and dry-run
   budget; preserve existing caches. Build each selected architecture under the
   extended chromium/tools/build.mjs guard. No output purge or automatic bypass.
   Bind resulting candidate IDs, args, binaries and test evidence to source.
5. BUILD REQUIRED / DISABLED: acceptance and local desktop-sync, real-device
   production Sync, notices/credits, blocker, outbound isolation, coexistence,
   passkeys, no-DRM handoff, hook absence and N -> N+1 updater qualification.
6. SIGN/APPLE REQUIRED / DISABLED: Chromium signing config + Sparkle parts,
   pinned Developer ID and beta profile, then the redacted notarization adapter:
   OP_BIOMETRIC_UNLOCK_ENABLED=true op run --env-file=.env.1password --no-masking --
     <reviewed beta signing/notarization adapter; not implemented>
   Await Accepted, staple app, create/sign/notarize/staple DMG, verify both.
   Never pass secrets through Chromium's logged --notary-arg path.
7. BUILD REQUIRED / DISABLED: verify.mjs RELEASE.json ARCH APP_OR_DMG, then
   Gatekeeper, native launch and final signed-candidate acceptance per architecture.
   Sign final DMG bytes with Sparkle sign_update; verify EdDSA locally; generate
   each appcast with appcast.mjs. Produce full dependency SBOM and acceptance.json.
8. PUBLISH REQUIRED / DISABLED: immutable chromium-beta-2.0.0-beta.N source tag,
   draft in bnfy/blanc with --prerelease --latest=false. Upload exact beta assets.
   Download draft afresh; compare against local bytes; manifest.mjs build;
   shasum -a 256 -c SHA256SUMS; Safari/IPv4 fresh cosign authorization:
   identity anthony@bnfy.me, issuer https://github.com/login/oauth.
   cosign verify-blob with both pins; manifest.mjs verify; upload final metadata.
9. PUBLISH REQUIRED / DISABLED: publish the verified draft with --prerelease
   --latest=false; verify logged-out downloads, full manifest, Sigstore and both
   native DMGs. Run a new fork-specific hosted smoke (not Electron's workflow).
10. FEED REQUIRED / DISABLED: only after public-asset checks, atomically promote
    per-architecture beta appcasts; archive previous feed bytes. Verify beta 1
    discovers the feed. Stable releases.json/changelog/baselines stay untouched.
11. COMPLETE REQUIRED / DISABLED: real N -> N+1 download/install/relaunch on each
    architecture; record evidence. Reconcile an interrupted tag/draft/run before
    continuing; never rerun the complete immutable release.
PLAN
