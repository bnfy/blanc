#!/usr/bin/env bash
# The 13" iPad App Store screenshots for Blanc for iPad, run as
# `npm run ios:app-store-screenshots -- --ipad`. Two steps, as for the iPhone
# (scripts/ios-app-store-screenshots.sh):
#
# 1. Capture: AppStoreIPadScreenshotsUITests runs the real app from the
#    `-BlancUITestAppStore` seed (three more paintings for the wider grid)
#    on an iPad Pro 13-inch (M5) simulator (Apple's 13" size), turned to
#    landscape, light appearance, English, full signal and
#    battery, the keyboard's first-run tips off and Safari closed. The status
#    bar shows the coming minute and the Start Page shot waits for it.
#    XCUITest saves a turned screen as portrait pixels with an EXIF rotation,
#    so each capture is turned upright here. Writes
#    docs/ios/app-store/captures/ipad-13/.
# 2. Compose: the canvas's iPad artboards alone, into docs/ios/app-store/ipad-13/
#    (scripts/ios-app-store-compose.mjs --only ipad-13).
#
# The simulator is its own, "Blanc App Store iPad 13" (an iPad Pro 13-inch
# (M5) on the newest iOS 27.2 or later, made on first use), set to Full Screen
# Apps: in Windowed Apps the status bar names the app and a resize grip sits
# in the corner, and the test runner can tile beside Blanc. A device-wide
# setting, so other simulators are left alone. BLANC_SIM_UDID picks another
# simulator, which gets the same setting.
#
#   npm run ios:app-store-screenshots -- --ipad            # capture, then compose
#   npm run ios:app-store-screenshots -- --ipad --compose  # compose the committed captures
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
compose() { node "$root/scripts/ios-app-store-compose.mjs" --only ipad-13; }
if [ "${1:-}" = "--compose" ]; then compose; exit; fi
out="$root/docs/ios/app-store/captures/ipad-13"
derived="$(mktemp -d "${TMPDIR:-/tmp}/blanc-ipad-shots.XXXXXX")"
trap 'rm -rf "$derived"' EXIT

name="Blanc App Store iPad 13"
udid="${BLANC_SIM_UDID:-}"
[ -n "$udid" ] || udid="$(xcrun simctl list devices available | awk -v n="$name" -F '[()]' 'index($0, "    " n " (") == 1 {print $2; exit}')"
if [ -z "$udid" ]; then
  # The newest iOS runtime, 27.2 or later (the owner allows no older one).
  runtime="$(xcrun simctl list -j runtimes available | node -e '
    const { runtimes } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ok = runtimes.map((r) => [r.identifier, /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+)-(\d+)$/.exec(r.identifier)])
      .filter(([, m]) => m && (+m[1] > 27 || (+m[1] === 27 && +m[2] >= 2)))
      .sort(([, a], [, b]) => (b[1] - a[1]) || (b[2] - a[2]));
    if (ok.length) console.log(ok[0][0]);')"
  [ -n "$runtime" ] || { echo "No iOS 27.2 or later simulator runtime" >&2; exit 1; }
  udid="$(xcrun simctl create "$name" com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB "$runtime")"
fi
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
# Full Screen Apps (Settings > Multitasking & Gestures), applied by a restart.
if [ "$(xcrun simctl spawn "$udid" defaults read com.apple.springboard SBMedusaMultitaskingEnabled 2>/dev/null)" != 0 ]; then
  xcrun simctl spawn "$udid" defaults write com.apple.springboard SBMedusaMultitaskingEnabled -bool false
  xcrun simctl spawn "$udid" defaults write com.apple.springboard SBChamoisWindowingEnabled -bool false
  xcrun simctl shutdown "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
fi
xcrun simctl ui "$udid" appearance light
xcrun simctl terminate "$udid" com.apple.mobilesafari 2>/dev/null || true
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowContinuousPathIntroduction -bool true
xcrun simctl spawn "$udid" defaults write com.apple.keyboard.preferences DidShowGestureKeyboardIntroduction -bool true

cd "$root/ios/Blanc"
xcodebuild build-for-testing -project Blanc.xcodeproj -scheme Blanc -destination "id=$udid" \
  -derivedDataPath "$derived" CODE_SIGNING_ALLOWED=NO -quiet
shot_time="$(date -v+1M +%-I:%M)"
trap 'xcrun simctl status_bar "$udid" clear 2>/dev/null; rm -rf "$derived"' EXIT
xcrun simctl status_bar "$udid" override --time "$shot_time" --dataNetwork wifi --wifiBars 3 \
  --batteryState charged --batteryLevel 100

mkdir -p "$out" && rm -f "$out"/*.png
TEST_RUNNER_BLANC_SHOTS_DIR="$out" TEST_RUNNER_BLANC_SHOT_TIME="$shot_time" xcodebuild test-without-building \
  -project Blanc.xcodeproj -scheme Blanc -destination "id=$udid" -derivedDataPath "$derived" \
  -only-testing:BlancUITests/AppStoreIPadScreenshotsUITests \
  CODE_SIGNING_ALLOWED=NO

for f in "$out"/*.png; do
  magick "$f" -auto-orient -strip "$f"
  got="$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{print $2}' | paste -sd x -)"
  [ "$got" = "2752x2064" ] || { echo "$f is $got, expected 2752x2064" >&2; exit 1; }
  echo "$(basename "$f") $got"
done
compose
