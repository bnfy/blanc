#!/usr/bin/env bash
# App Store screenshots for Blanc for iPhone. Two steps:
#
# 1. Capture: AppStoreScreenshotsUITests runs the real app from the
#    `-BlancUITestAppStore` seed (The Met's public-domain paintings, Spaces, a
#    MacBook Pro's tabs) on an iPhone 17 Pro Max simulator (Apple's 6.9" size,
#    1320 x 2868), light appearance, English, full signal and battery, iOS's
#    first-run keyboard tips off and Safari closed (so no "◀ Safari" link). The
#    status bar shows the coming minute and the Start Page shot waits for it,
#    so the two clocks agree. Writes docs/ios/app-store/captures/.
# 2. Compose: scripts/ios-app-store-compose.mjs frames each capture with its
#    caption, from the design in docs/ios/app-store/design/ (the Claude Design
#    canvas), into docs/ios/app-store/6.9/ and 6.3/. Needs the licensed
#    Blubird fonts (npm run site:fonts), which are never committed.
#
# Mac only; touches no signing, TestFlight or App Store Connect.
#
#   npm run ios:app-store-screenshots              # capture, then compose
#   npm run ios:app-store-screenshots -- --compose # compose the committed captures
#
# With --ipad, the same two steps make the 13" iPad set instead: the
# captures (AppStoreIPadScreenshotsUITests) on an iPad Pro 13-inch (M5)
# simulator on iOS 27.2 or later, into captures/ipad-13/, and the iPad
# artboards alone into docs/ios/app-store/ipad-13/; the iPhone and Duo sets
# are left as they are.
#
#   npm run ios:app-store-screenshots -- --ipad
#   npm run ios:app-store-screenshots -- --ipad --compose
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${1:-}" = "--ipad" ]; then exec bash "$root/scripts/ios-app-store-screenshots-ipad.sh" "${@:2}"; fi
if [ "${1:-}" = "--compose" ]; then exec node "$root/scripts/ios-app-store-compose.mjs"; fi
out="$root/docs/ios/app-store/captures"
name="Blanc App Store 6.9"
# iOS 26.5, the runtime CI tests on; newer runtimes may not offer this device.
runtime=com.apple.CoreSimulator.SimRuntime.iOS-26-5
derived="$(mktemp -d "${TMPDIR:-/tmp}/blanc-shots.XXXXXX")"
trap 'rm -rf "$derived"' EXIT

udid="${BLANC_SIM_UDID:-}"
[ -n "$udid" ] || udid="$(xcrun simctl list devices available | awk -v n="$name" -F '[()]' 'index($0, "    " n " (") == 1 {print $2; exit}')"
if [ -z "$udid" ]; then
  udid="$(xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max "$runtime")"
fi
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl ui "$udid" appearance light
xcrun simctl terminate "$udid" com.apple.mobilesafari 2>/dev/null || true
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowGestureKeyboardIntroduction -bool true

cd "$root/ios/Blanc"
xcodebuild build-for-testing -project Blanc.xcodeproj -scheme Blanc -destination "id=$udid" \
  -derivedDataPath "$derived" CODE_SIGNING_ALLOWED=NO -quiet
shot_time="$(date -v+1M +%-I:%M)"
xcrun simctl status_bar "$udid" override --time "$shot_time" --dataNetwork wifi --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

# Only the phone captures; duo-closed/ and duo-open/ are taken separately.
mkdir -p "$out" && rm -f "$out"/*.png
TEST_RUNNER_BLANC_SHOTS_DIR="$out" TEST_RUNNER_BLANC_SHOT_TIME="$shot_time" xcodebuild test-without-building \
  -project Blanc.xcodeproj -scheme Blanc -destination "id=$udid" -derivedDataPath "$derived" \
  -only-testing:BlancUITests/AppStoreScreenshotsUITests \
  CODE_SIGNING_ALLOWED=NO

xcrun simctl status_bar "$udid" clear
for f in "$out"/*.png; do
  size="$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{print $2}' | paste -sd x -)"
  [ "$size" = "1320x2868" ] || { echo "$f is $size, expected 1320x2868" >&2; exit 1; }
  echo "$(basename "$f") $size"
done
node "$root/scripts/ios-app-store-compose.mjs"
