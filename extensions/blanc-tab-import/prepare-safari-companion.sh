#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR=${1:-"$SCRIPT_DIR/safari"}
SAFARI_SOURCE=$(mktemp -d "${TMPDIR:-/tmp}/blanc-tab-import-safari.XXXXXX")
trap 'rm -rf "$SAFARI_SOURCE"' EXIT HUP INT TERM

# A machine can have full Xcode installed while xcode-select still points at
# the standalone Command Line Tools. Prefer stable Xcode, then the beta, only
# when the caller has not already chosen DEVELOPER_DIR.
if ! xcrun --find safari-web-extension-packager >/dev/null 2>&1 \
  && ! xcrun --find safari-web-extension-converter >/dev/null 2>&1 \
  && [ -z "${DEVELOPER_DIR:-}" ]; then
  for XCODE_APP in /Applications/Xcode.app /Applications/Xcode-beta.app; do
    if [ -d "$XCODE_APP/Contents/Developer" ]; then
      DEVELOPER_DIR="$XCODE_APP/Contents/Developer"
      export DEVELOPER_DIR
      break
    fi
  done
fi

# Safari rejects Firefox's browser_specific_settings manifest member. Keep the
# implementation shared, but stage the reviewed Safari-only manifest before
# asking Xcode to generate the containing app.
cp -R "$SCRIPT_DIR/web-extension/." "$SAFARI_SOURCE/"
cp "$SCRIPT_DIR/manifest.safari.json" "$SAFARI_SOURCE/manifest.json"

if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  PACKAGER=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  # Xcode releases before Apple renamed the utility.
  PACKAGER=safari-web-extension-converter
else
  echo "Safari Web Extension Packager requires a full Xcode installation." >&2
  exit 1
fi

xcrun "$PACKAGER" "$SAFARI_SOURCE" \
  --project-location "$OUTPUT_DIR" \
  --app-name "Blanc Tab Importer" \
  --bundle-identifier "me.bnfy.blanc.tab-importer" \
  --swift \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

node "$SCRIPT_DIR/configure-safari-project.mjs" "$OUTPUT_DIR"

echo "Created the standalone Safari companion project in $OUTPUT_DIR"
