#!/usr/bin/env bash
# The App Store app preview for Blanc for iPhone: AppStorePreviewUITests plays
# a short tour of the real app (the Island, swiping it between tabs, pull to
# refresh, the tab grid, Spaces, a computer's tabs and the Start Page) on the
# same iPhone 17 Pro Max simulator as the screenshots, while simctl records
# the screen. The recording is then cut to Apple's 6.9" preview format
# (886 x 1920, 30 fps, H.264 at about 11 Mbps, a silent stereo AAC track, 15
# to 30 seconds), with the captions in docs/ios/app-store/preview/captions.json
# set over it in Blubird (rendered locally; the licensed fonts are never
# committed). Writes docs/ios/app-store/preview/blanc-preview.mp4 and its
# poster frame. Mac only; touches no signing or App Store Connect.
#
#   npm run ios:app-store-preview
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/docs/ios/app-store/preview"
name="Blanc App Store 6.9"
runtime=com.apple.CoreSimulator.SimRuntime.iOS-26-5
work="$(mktemp -d "${TMPDIR:-/tmp}/blanc-preview.XXXXXX")"
trap 'kill "${rec:-}" "${tests:-}" 2>/dev/null || true; rm -rf "$work"' EXIT

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
bar() {
  xcrun simctl status_bar "$udid" override --time "$1" --dataNetwork wifi --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
}
bar "$(date +%-I:%M)"

cd "$root/ios/Blanc"
TEST_RUNNER_BLANC_PREVIEW_DIR="$work" xcodebuild test \
  -project Blanc.xcodeproj -scheme Blanc \
  -destination "id=$udid" \
  -only-testing:BlancUITests/AppStorePreviewUITests \
  CODE_SIGNING_ALLOWED=NO > "$work/test.log" 2>&1 &
tests=$!
until [ -e "$work/ready" ]; do
  kill -0 "$tests" 2>/dev/null || { tail -40 "$work/test.log" >&2; echo "the preview test stopped before it was ready" >&2; exit 1; }
  sleep 0.2
done
# The test is ready early in a minute; the whole tour fits inside it, so the
# status bar matches the Start Page's clock at the end.
bar "$(date +%-I:%M)"
xcrun simctl io "$udid" recordVideo --codec=h264 --force "$work/raw.mov" 2>"$work/rec.log" &
rec=$!
until grep -q "Recording started" "$work/rec.log" 2>/dev/null; do sleep 0.1; done
touch "$work/recording"
wait "$tests" || { tail -40 "$work/test.log" >&2; echo "the preview test failed" >&2; exit 1; }
kill -INT "$rec"; wait "$rec" || true
rec=
xcrun simctl status_bar "$udid" clear

mkdir -p "$out"
# BLANC_PREVIEW_KEEP=<dir> keeps the raw recording and its marks for re-cutting.
if [ -n "${BLANC_PREVIEW_KEEP:-}" ]; then mkdir -p "$BLANC_PREVIEW_KEEP"; cp "$work/raw.mov" "$work/marks" "$BLANC_PREVIEW_KEEP/"; fi
node "$root/scripts/ios-app-store-preview-cut.mjs" "$work/raw.mov" "$work/marks" "$out"
