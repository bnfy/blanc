#!/usr/bin/env bash
# Archive Blanc for iPhone and upload it to App Store Connect for TestFlight.
#
#   npm run ios:testflight              # archive, sign, upload
#   npm run ios:testflight -- --export  # archive and sign an .ipa, no upload
#
# Signing is automatic: xcodebuild authenticates with the App Store Connect API
# key "Blanc iOS" (Admin; 1Password vault Dev, read through ios/.env.1password),
# makes the App Store profile and signs with Apple's cloud-managed distribution
# certificate, so no certificate or profile lives on this Mac. The key is
# written to a private temporary directory for xcodebuild and removed on exit.
# Every upload gets a new build number (UTC minutes), because App Store Connect
# refuses a build number it has seen for the same version.
# Never submits for App Review. See docs/ios/app-store-connect.md.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="upload"
case "${1:-}" in
  '') ;;
  --export) MODE="export" ;;
  *) echo "usage: $0 [--export]" >&2; exit 2 ;;
esac

# Only an iOS 27.1 SDK build fills the iPhone Duo's inner display; an older one
# is letterboxed there (Duo-1, design 2026-10-29 §4.5).
SDK_VERSION=$(xcrun --sdk iphoneos --show-sdk-version)
SDK_MAJOR=${SDK_VERSION%%.*}
SDK_MINOR=${SDK_VERSION#*.}; SDK_MINOR=${SDK_MINOR%%.*}
if [ "$SDK_MAJOR" -lt 27 ] || { [ "$SDK_MAJOR" -eq 27 ] && [ "$SDK_MINOR" -lt 1 ]; }; then
  echo "Xcode's iOS SDK is $SDK_VERSION; App Store builds need the iOS 27.1 SDK or later," >&2
  echo "or Blanc is letterboxed on iPhone Duo. Select Xcode 27.1 with xcode-select." >&2
  exit 1
fi

if [ -z "${ASC_KEY_P8:-}" ]; then
  exec op run --env-file=ios/.env.1password --no-masking -- "$PWD/scripts/ios-testflight.sh" "$@"
fi
: "${ASC_KEY_ID:?}" "${ASC_ISSUER_ID:?}"

if [ "${BLANC_IOS_ALLOW_DIRTY:-0}" != "1" ] && [ -n "$(git status --porcelain -- ios)" ]; then
  echo "ios/ has uncommitted changes; a TestFlight build must match a commit." >&2
  echo "Set BLANC_IOS_ALLOW_DIRTY=1 to build anyway." >&2
  exit 1
fi

BUILD_NUMBER="${BLANC_IOS_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"
OUT="dist/ios/$BUILD_NUMBER"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

( umask 077; printf '%s\n' "$ASC_KEY_P8" > "$WORK/AuthKey_$ASC_KEY_ID.p8" )
AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$WORK/AuthKey_$ASC_KEY_ID.p8"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

cp ios/Blanc/ExportOptions-AppStore.plist "$WORK/ExportOptions.plist"
if [ "$MODE" = export ]; then
  plutil -replace destination -string export "$WORK/ExportOptions.plist"
fi

mkdir -p "$OUT"
echo "Archiving Blanc $(git rev-parse --short HEAD), build $BUILD_NUMBER"
xcodebuild archive \
  -project ios/Blanc/Blanc.xcodeproj \
  -scheme Blanc \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Blanc.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  "${AUTH[@]}"

echo "Exporting ($MODE)"
xcodebuild -exportArchive \
  -archivePath "$OUT/Blanc.xcarchive" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  "${AUTH[@]}"

if [ "$MODE" = upload ]; then
  echo "Uploaded build $BUILD_NUMBER. It appears in App Store Connect → TestFlight after processing."
else
  echo "Signed .ipa in $OUT/export"
fi
