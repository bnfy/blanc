#!/bin/bash
# Runs the Android acceptance scenarios on the build server's emulator against a built APK:
#   chromium/tests/android/acceptance/run.sh <ChromePublic.apk> [evidence dir] [extra cucumber args]
# Cucumber comes from ~/acceptance-node (the repository's pinned @cucumber/cucumber 13.3.0).
set -euo pipefail
APK=$1; EVIDENCE=${2:-$HOME/blanc-evidence/android/acceptance}; shift $(( $# > 1 ? 2 : 1 ))
REPO=$(cd "$(dirname "$0")/../../../.." && pwd)
SRC=$HOME/chromium-android/src
export PATH=$SRC/third_party/android_sdk/public/platform-tools:$SRC/third_party/node/linux/node-linux-x64/bin:$PATH
mkdir -p "$EVIDENCE"
adb install -r "$APK" >/dev/null
# The step files import @cucumber/cucumber from the repository root.
[ -e "$REPO/node_modules" ] || ln -s "$HOME/acceptance-node/node_modules" "$REPO/node_modules"
cd "$REPO"
BLANC_ANDROID_REPORT="$EVIDENCE/acceptance.json" "$HOME/acceptance-node/node_modules/.bin/cucumber-js" \
  -c chromium/tests/android/acceptance/cucumber.mjs -p androidSmoke "$@" 2>&1 | tee "$EVIDENCE/acceptance.log"
