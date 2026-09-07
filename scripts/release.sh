#!/usr/bin/env bash
# Draft-first, fail-closed release pipeline.
#
# Required invariants:
# - one immutable source tag/commit for every platform;
# - notarized macOS and signed Windows artifacts only;
# - every selected platform asset staged in one draft;
# - exact names + SHA-256 checksums verified before publication;
# - no rebuild between staged verification and publication.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="bnfy/blanc"
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
MODE="${BLANC_RELEASE_MODE:-}"
PLATFORM_CSV="${BLANC_RELEASE_PLATFORMS:-}"
MAC_ARCH_CSV="${BLANC_MAC_ARCHES:-}"
MIGRATION_BASE_VERSION="${BLANC_MIGRATION_BASE_VERSION:-1.15.0}"
COSIGN_REDIRECT_PORT="${BLANC_COSIGN_REDIRECT_PORT:-49197}"
RELEASE_OPERATOR="${BLANC_RELEASE_OPERATOR:-terminal}"
NOTES_FILE="docs/press/release-notes/$TAG.md"

if [ "$(uname -s)" = "Darwin" ]; then
  case "$RELEASE_OPERATOR" in
    terminal)
      if [ "${TERM_PROGRAM:-}" != "Apple_Terminal" ] || [ ! -t 0 ] || [ ! -t 1 ]; then
        echo "Terminal mode requires an interactive Terminal.app window." >&2
        echo "For an approved Codex/Claude run, use BLANC_RELEASE_OPERATOR=agent in an interactive unsandboxed PTY." >&2
        exit 1
      fi
      ;;
    agent)
      if [ ! -t 0 ] || [ ! -t 1 ]; then
        echo "Agent mode requires an interactive PTY; background and non-interactive releases are forbidden." >&2
        exit 1
      fi
      ;;
    *)
      echo "BLANC_RELEASE_OPERATOR must be terminal or agent." >&2
      exit 1
      ;;
  esac
fi

case "$COSIGN_REDIRECT_PORT" in
  ''|*[!0-9]*)
    echo "BLANC_COSIGN_REDIRECT_PORT must be a numeric loopback port." >&2
    exit 1
    ;;
esac
if [ "$COSIGN_REDIRECT_PORT" -lt 1024 ] || [ "$COSIGN_REDIRECT_PORT" -gt 65535 ]; then
  echo "BLANC_COSIGN_REDIRECT_PORT must be between 1024 and 65535." >&2
  exit 1
fi
if ! node -e '
  const net = require("node:net");
  const server = net.createServer();
  server.once("error", () => process.exit(1));
  server.listen(Number(process.argv[1]), "127.0.0.1", () => server.close());
' "$COSIGN_REDIRECT_PORT"; then
  echo "Sigstore callback port $COSIGN_REDIRECT_PORT is already in use." >&2
  echo "Set BLANC_COSIGN_REDIRECT_PORT to another free port before starting." >&2
  exit 1
fi

case "$MODE" in
  candidate)
    [[ "$VERSION" == *-* ]] || {
      echo "Candidate mode requires a prerelease package version (for example 1.0.0-rc.1)." >&2
      exit 1
    }
    ;;
  stable)
    [[ "$VERSION" != *-* ]] || {
      echo "Stable mode refuses a prerelease package version: $VERSION" >&2
      exit 1
    }
    ;;
  *)
    echo "BLANC_RELEASE_MODE must be explicitly set to candidate or stable." >&2
    exit 1
    ;;
esac

[ -n "$PLATFORM_CSV" ] || {
  echo "BLANC_RELEASE_PLATFORMS must explicitly list mac and any verified native targets." >&2
  exit 1
}
[ -n "$MAC_ARCH_CSV" ] || {
  echo "BLANC_MAC_ARCHES must explicitly list the verified mac architecture(s): arm64 and/or x64." >&2
  exit 1
}

IFS=',' read -r -a PLATFORMS <<< "$PLATFORM_CSV"
HAS_MAC=false
HAS_WINDOWS=false
HAS_LINUX=false
for platform in "${PLATFORMS[@]}"; do
  case "$platform" in
    mac) HAS_MAC=true ;;
    windows) HAS_WINDOWS=true ;;
    linux) HAS_LINUX=true ;;
    *)
      echo "Unknown release platform '$platform'; use mac,windows,linux." >&2
      exit 1
      ;;
  esac
done
$HAS_MAC || {
  echo "The local release path requires mac in BLANC_RELEASE_PLATFORMS." >&2
  exit 1
}

IFS=',' read -r -a MAC_ARCHES <<< "$MAC_ARCH_CSV"
HAS_MAC_ARM64=false
HAS_MAC_X64=false
for arch in "${MAC_ARCHES[@]}"; do
  case "$arch" in
    arm64) HAS_MAC_ARM64=true ;;
    x64) HAS_MAC_X64=true ;;
    *)
      echo "Unknown mac architecture '$arch'; use arm64,x64." >&2
      exit 1
      ;;
  esac
done
($HAS_MAC_ARM64 || $HAS_MAC_X64) || {
  echo "At least one mac architecture must be selected." >&2
  exit 1
}

HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  arm64)
    $HAS_MAC_ARM64 || {
      echo "The native release host is arm64, but arm64 is not selected for package smoke." >&2
      exit 1
    }
    NATIVE_MAC_ARCH="arm64"
    NATIVE_MAC_DIR="mac-arm64"
    MIGRATION_MAC_SUFFIX="-arm64-mac"
    ;;
  x86_64)
    $HAS_MAC_X64 || {
      echo "The native release host is x64, but x64 is not selected for package smoke." >&2
      exit 1
    }
    NATIVE_MAC_ARCH="x64"
    NATIVE_MAC_DIR="mac"
    MIGRATION_MAC_SUFFIX="-mac"
    ;;
  *)
    echo "Unsupported native Mac release host architecture: $HOST_ARCH" >&2
    exit 1
    ;;
esac
[ -f "$NOTES_FILE" ] || {
  echo "Checked-in release notes are required: $NOTES_FILE" >&2
  exit 1
}

command -v gh >/dev/null || { echo "gh CLI not found." >&2; exit 1; }
command -v op >/dev/null || {
  echo "1Password CLI is required; refusing an unnotarized release build." >&2
  exit 1
}
command -v cosign >/dev/null || {
  echo "cosign is required to sign the release manifest independently of GitHub." >&2
  exit 1
}
[ -n "${BLANC_COSIGN_IDENTITY:-}" ] || {
  echo "BLANC_COSIGN_IDENTITY must be the exact OIDC identity authorized to sign releases." >&2
  exit 1
}
[ -n "${BLANC_COSIGN_OIDC_ISSUER:-}" ] || {
  echo "BLANC_COSIGN_OIDC_ISSUER must name the release signer's OIDC issuer." >&2
  exit 1
}
gh auth status >/dev/null 2>&1 || {
  echo "gh CLI authentication is unavailable in this operator environment." >&2
  if [ "$RELEASE_OPERATOR" = "agent" ]; then
    echo "Confirm the complete release is running outside the agent sandbox before changing GitHub credentials." >&2
  else
    echo "Confirm the cached Terminal session with: gh auth status" >&2
  fi
  exit 1
}

echo "==> Authenticating 1Password CLI through the desktop app"
if [ "$RELEASE_OPERATOR" = "agent" ]; then
  echo "    This command must run outside the agent sandbox. Approve only the expected Codex/Claude identity."
else
  echo "    Approve only a Terminal.app authorization."
fi
if ! OP_BIOMETRIC_UNLOCK_ENABLED=true op signin; then
  echo "1Password desktop authentication failed. Cancel any manual-account prompt; do not add an account." >&2
  exit 1
fi

echo "==> Preparing Blanc $VERSION ($TAG), mode=$MODE, platforms=$PLATFORM_CSV, mac=$MAC_ARCH_CSV"

# Released and staged versions are immutable. A failed draft remains evidence
# of that attempt; fix forward with a new rc.N/version rather than overwriting.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null ||
   git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1 ||
   gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Tag or release $TAG already exists. Bump package.json; never overwrite release assets." >&2
  exit 1
fi

RELEASE_SOURCES=(
  src
  build
  test
  scripts
  site
  spec
  settings-schema
  tokens
  copy
  adblock
  compliance
  docs/press
  docs/grants
  README.md
  SECURITY.md
  package.json
  package-lock.json
  .github/workflows
  "$NOTES_FILE"
)
if ! git diff --cached --quiet HEAD -- "${RELEASE_SOURCES[@]}" ||
   ! git diff --quiet -- "${RELEASE_SOURCES[@]}" ||
   [ -n "$(git ls-files --others --exclude-standard -- "${RELEASE_SOURCES[@]}")" ]; then
  echo "Release sources are dirty. Commit every release input before staging." >&2
  exit 1
fi

git fetch origin --quiet
LOCAL_HEAD="$(git rev-parse HEAD)"
if [ "$LOCAL_HEAD" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD is not origin/main. Push the exact release commit first." >&2
  exit 1
fi

echo "==> Installing locked dependencies and running the press verification gate"
npm ci
npm ci --prefix site
npm run release:verify:press

echo "==> Preflighting the macOS identity and provisioning profile"
node scripts/preflight-mac-signing.mjs

echo "==> Cleaning and building notarized macOS artifacts"
echo "    1Password desktop-app integration is forced for this command."
echo "    Cancel any manual-account prompt; the desktop authorization is the only valid path."
rm -rf dist
MAC_BUILD_ARGS=()
$HAS_MAC_ARM64 && MAC_BUILD_ARGS+=(--arm64)
$HAS_MAC_X64 && MAC_BUILD_ARGS+=(--x64)
if ! OP_BIOMETRIC_UNLOCK_ENABLED=true \
  op run --env-file=.env.1password --no-masking -- \
  npx electron-builder --mac "${MAC_BUILD_ARGS[@]}" --publish never; then
  echo "Signed/notarized macOS build failed. Nothing has been published." >&2
  exit 1
fi

echo "==> Verifying hardened Electron fuses in packaged binaries"
$HAS_MAC_ARM64 && node scripts/verify-electron-fuses.mjs \
  "dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc"
$HAS_MAC_X64 && node scripts/verify-electron-fuses.mjs \
  "dist/mac/Blanc.app/Contents/MacOS/Blanc"

echo "==> Verifying byte-identical blocker payloads in packaged apps"
$HAS_MAC_ARM64 && node scripts/verify-packaged-adblock.js \
  "dist/mac-arm64/Blanc.app/Contents/Resources/app.asar"
$HAS_MAC_X64 && node scripts/verify-packaged-adblock.js \
  "dist/mac/Blanc.app/Contents/Resources/app.asar"

echo "==> Verifying packaged compliance payloads"
$HAS_MAC_ARM64 && node scripts/verify-packaged-compliance.js \
  "dist/mac-arm64/Blanc.app/Contents/Resources"
$HAS_MAC_X64 && node scripts/verify-packaged-compliance.js \
  "dist/mac/Blanc.app/Contents/Resources"

MAC_ASSETS=("dist/latest-mac.yml")
if $HAS_MAC_ARM64; then
  MAC_ASSETS+=(
    "dist/Blanc-$VERSION-arm64-mac.zip"
    "dist/Blanc-$VERSION-arm64-mac.zip.blockmap"
    "dist/Blanc-$VERSION-arm64.dmg"
    "dist/Blanc-$VERSION-arm64.dmg.blockmap"
  )
fi
if $HAS_MAC_X64; then
  MAC_ASSETS+=(
    "dist/Blanc-$VERSION-mac.zip"
    "dist/Blanc-$VERSION-mac.zip.blockmap"
    "dist/Blanc-$VERSION.dmg"
    "dist/Blanc-$VERSION.dmg.blockmap"
  )
fi
for asset in "${MAC_ASSETS[@]}"; do
  [ -s "$asset" ] || { echo "Expected macOS artifact missing: $asset" >&2; exit 1; }
done

echo "==> Smoke-testing the signed packaged first-run experience"
BLANC_PACKAGED_EXECUTABLE="$PWD/dist/$NATIVE_MAC_DIR/Blanc.app/Contents/MacOS/Blanc" \
  npm run test:packaged:first-run

echo "==> Smoke-testing packaged release regressions"
BLANC_PACKAGED_EXECUTABLE="$PWD/dist/$NATIVE_MAC_DIR/Blanc.app/Contents/MacOS/Blanc" \
  npm run test:packaged:regressions

echo "==> Checking live favicon compatibility — primary 26-site matrix"
BLANC_FAVICON_MATRIX=primary \
  BLANC_PACKAGED_EXECUTABLE="$PWD/dist/$NATIVE_MAC_DIR/Blanc.app/Contents/MacOS/Blanc" \
  npm run test:packaged:favicons-live

echo "==> Checking live favicon compatibility — additional 25-site matrix"
BLANC_FAVICON_MATRIX=additional \
  BLANC_PACKAGED_EXECUTABLE="$PWD/dist/$NATIVE_MAC_DIR/Blanc.app/Contents/MacOS/Blanc" \
  npm run test:packaged:favicons-live

echo "==> Verifying migration from public Stable v$MIGRATION_BASE_VERSION"
MIGRATION_DIR="$(mktemp -d)"
cleanup_migration() { rm -rf "$MIGRATION_DIR"; }
trap cleanup_migration EXIT
curl --fail --silent --show-error --location \
  "https://github.com/$REPO/releases/download/v$MIGRATION_BASE_VERSION/Blanc-$MIGRATION_BASE_VERSION$MIGRATION_MAC_SUFFIX.zip" \
  --output "$MIGRATION_DIR/stable.zip"
ditto -x -k "$MIGRATION_DIR/stable.zip" "$MIGRATION_DIR/stable"
BLANC_STABLE_EXECUTABLE="$MIGRATION_DIR/stable/Blanc.app/Contents/MacOS/Blanc" \
  BLANC_CANDIDATE_EXECUTABLE="$PWD/dist/$NATIVE_MAC_DIR/Blanc.app/Contents/MacOS/Blanc" \
  npm run test:packaged:migration
rm -rf "$MIGRATION_DIR"
trap - EXIT

# A draft release's requested tag is not exposed as a Git ref. Publish the
# immutable source tag first so native workflow runners can check out the
# exact commit while every release asset remains private in the draft.
echo "==> Publishing immutable source tag for native builders"
git tag "$TAG" "$LOCAL_HEAD"
git push origin "refs/tags/$TAG"

CREATE_ARGS=(
  release create "$TAG"
  "${MAC_ASSETS[@]}"
  --repo "$REPO"
  --title "$VERSION"
  --target "$LOCAL_HEAD"
  --notes-file "$NOTES_FILE"
  --draft
)
if [ "$MODE" = "candidate" ]; then CREATE_ARGS+=(--prerelease); fi

echo "==> Creating authenticated draft release"
gh "${CREATE_ARGS[@]}"
DRAFT_CREATED=true
VERIFY_DIR="$(mktemp -d)"
cleanup() { rm -rf "$VERIFY_DIR"; }
trap cleanup EXIT

WORKFLOW_PLATFORM=""
if $HAS_WINDOWS && $HAS_LINUX; then
  WORKFLOW_PLATFORM="all"
elif $HAS_WINDOWS; then
  WORKFLOW_PLATFORM="windows"
elif $HAS_LINUX; then
  WORKFLOW_PLATFORM="linux"
fi

if [ -n "$WORKFLOW_PLATFORM" ]; then
  echo "==> Dispatching native $WORKFLOW_PLATFORM build(s) against $TAG"
  DISPATCHED_AT=$(date -u +%s)
  EXPECTED_RUN_TITLE="Release $TAG ($WORKFLOW_PLATFORM)"
  gh workflow run release-windows-linux.yml \
    --repo "$REPO" \
    -f mode=release \
    -f tag="$TAG" \
    -f platform="$WORKFLOW_PLATFORM"

  RUN_ID=""
  for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    RUN_ID=$(gh run list \
      --repo "$REPO" \
      --workflow=release-windows-linux.yml \
      --event workflow_dispatch \
      --limit 10 \
      --json databaseId,createdAt,displayTitle \
      --jq "map(select(.displayTitle == \"$EXPECTED_RUN_TITLE\" and (.createdAt | fromdateiso8601) >= ($DISPATCHED_AT - 5))) | first | .databaseId // empty")
    [ -n "$RUN_ID" ] && break
    sleep 2
  done
  [ -n "$RUN_ID" ] || {
    echo "Workflow dispatch did not register. Draft remains unpublished." >&2
    exit 1
  }

  echo "==> Waiting for native build run $RUN_ID"
  gh run watch "$RUN_ID" --repo "$REPO" --exit-status || {
    echo "Native build failed. Draft remains unpublished." >&2
    exit 1
  }
fi

echo "==> Downloading the authenticated draft asset set"
gh release download "$TAG" --repo "$REPO" --dir "$VERIFY_DIR"
node scripts/verify-release-manifest.mjs \
  --dir "$VERIFY_DIR" \
  --version "$VERSION" \
  --platforms "$PLATFORM_CSV" \
  --mac-arches "$MAC_ARCH_CSV"
cp compliance/runtime-sbom.cdx.json "$VERIFY_DIR/Blanc-$VERSION.cdx.json"
node scripts/create-checksums.mjs "$VERIFY_DIR"
echo "==> Signing the complete checksum manifest through Sigstore"
echo "    Safari will open for the GitHub approval; complete the fresh page immediately."
PATH="$PWD/scripts/release-bin:$PATH" cosign sign-blob --yes \
  --oidc-redirect-url "http://127.0.0.1:$COSIGN_REDIRECT_PORT/auth/callback" \
  --bundle "$VERIFY_DIR/SHA256SUMS.sigstore.json" \
  "$VERIFY_DIR/SHA256SUMS"
cosign verify-blob \
  --bundle "$VERIFY_DIR/SHA256SUMS.sigstore.json" \
  --certificate-identity "$BLANC_COSIGN_IDENTITY" \
  --certificate-oidc-issuer "$BLANC_COSIGN_OIDC_ISSUER" \
  "$VERIFY_DIR/SHA256SUMS"
node scripts/verify-release-manifest.mjs \
  --dir "$VERIFY_DIR" \
  --version "$VERSION" \
  --platforms "$PLATFORM_CSV" \
  --mac-arches "$MAC_ARCH_CSV"
gh release upload "$TAG" \
  "$VERIFY_DIR/SHA256SUMS" \
  "$VERIFY_DIR/SHA256SUMS.sigstore.json" \
  "$VERIFY_DIR/Blanc-$VERSION.cdx.json" \
  --repo "$REPO"

echo "==> Publishing the already-verified draft"
if [ "$MODE" = "candidate" ]; then
  gh release edit "$TAG" --repo "$REPO" --draft=false --prerelease
else
  gh release edit "$TAG" --repo "$REPO" --draft=false --prerelease=false --latest
fi

echo "==> Logged-out download smoke"
while IFS= read -r url; do
  [ -n "$url" ] || continue
  curl --fail --silent --show-error --location --head "$url" >/dev/null
done < <(gh api "repos/$REPO/releases/tags/$TAG" --jq '.assets[].browser_download_url')

if npm run site:changelog; then
  echo "==> Changelog refreshed. Verify the staged site, then promote it before outreach."
else
  echo "==> Warning: changelog refresh failed after publication; fix forward before outreach." >&2
fi

echo "==> Published and smoke-checked: https://github.com/$REPO/releases/tag/$TAG"
