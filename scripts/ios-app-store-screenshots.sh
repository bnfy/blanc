#!/usr/bin/env bash
# App Store screenshots for Blanc for iPhone (M18 design §10), captured from
# the real app by AppStoreScreenshotsUITests on an iPhone 17 Pro Max
# simulator (Apple's 6.9" size, 1320 x 2868), light appearance, English, with
# the status bar at the current time (so it matches the Start Page clock) and
# full signal and battery, and iOS's first-run keyboard tip turned off. Writes the PNGs to
# docs/ios/app-store/. Mac only; touches no signing, TestFlight or App Store
# Connect.
#
#   npm run ios:app-store-screenshots
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/docs/ios/app-store"
name="Blanc App Store 6.9"
# iOS 26.5, the runtime CI tests on; newer runtimes may not offer this device.
runtime=com.apple.CoreSimulator.SimRuntime.iOS-26-5

udid="$(xcrun simctl list devices available | awk -v n="$name" -F '[()]' 'index($0, "    " n " (") == 1 {print $2; exit}')"
if [ -z "$udid" ]; then
  udid="$(xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max "$runtime")"
fi
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl ui "$udid" appearance light
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowGestureKeyboardIntroduction -bool true
xcrun simctl status_bar "$udid" override --time "$(date +%-I:%M)" --dataNetwork wifi --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100

rm -rf "$out" && mkdir -p "$out"
cd "$root/ios/Blanc"
TEST_RUNNER_BLANC_SHOTS_DIR="$out" xcodebuild test \
  -project Blanc.xcodeproj -scheme Blanc \
  -destination "id=$udid" \
  -only-testing:BlancUITests/AppStoreScreenshotsUITests \
  CODE_SIGNING_ALLOWED=NO

xcrun simctl status_bar "$udid" clear
for f in "$out"/*.png; do
  size="$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{print $2}' | paste -sd x -)"
  [ "$size" = "1320x2868" ] || { echo "$f is $size, expected 1320x2868" >&2; exit 1; }
  echo "$(basename "$f") $size"
done
