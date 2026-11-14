#!/usr/bin/env bash
# The A1 gate on the emulator (docs/superpowers/plans/2026-11-04-android-a1-island.md, Task 8):
# the Robolectric tests, the Island's insets at three screen sizes, the Sunrise menu, the pages
# in six languages and the outbound gate, with evidence in ~/blanc-evidence/android/a1/.
# Run on the build server from ~/chromium-android/src with the emulator up.
set -uo pipefail
TREE="${BLANC_TREE:-$HOME/blanc}"
EVIDENCE="${BLANC_EVIDENCE:-$HOME/blanc-evidence/android/a1}"
APK=out/AndroidDebugX64/apks/ChromePublic.apk
export PATH="$PWD/third_party/android_sdk/public/platform-tools:$PWD/third_party/node/linux/node-linux-x64/bin:$HOME/depot_tools:$PATH"
# These checks start on the Start Page, not the first-minute walkthrough (FirstMinute.SKIP_FILE; walkthrough.mjs
# tests the card and puts the file back).
adb shell touch /data/local/tmp/blanc-walkthrough-off && adb shell chmod 644 /data/local/tmp/blanc-walkthrough-off
mkdir -p "$EVIDENCE"
failed=()
run() { local name=$1; shift; echo "== $name"; if "$@" > "$EVIDENCE/$name.log" 2>&1; then echo pass; else echo FAIL; failed+=("$name"); fi; tail -12 "$EVIDENCE/$name.log" | grep -E "^(pass|FAIL)|PASSED|FAILED|verdict" || true; }
run junit out/AndroidDebugX64/bin/run_blanc_android_junit_tests
# Three phones: the emulator's own (360 × 640 dp), a tall one (411 × 914 dp) and a small one (360 × 640 dp, 2x).
for screen in 1080x1920@480 1080x2400@420 720x1280@320; do
  size=${screen%@*}; density=${screen#*@}
  adb shell wm size "$size"; adb shell wm density "$density"
  run "insets-$size" node "$TREE/chromium/tests/android/island-insets.mjs" --apk "$APK" --evidence "$EVIDENCE/insets-$size"
done
adb shell wm size reset; adb shell wm density reset
run menu node "$TREE/chromium/tests/android/island-menu.mjs" --apk "$APK" --evidence "$EVIDENCE/menu"
run pages node "$TREE/chromium/tests/android/pages-phone.mjs" --apk "$APK" --evidence "$EVIDENCE/pages"
run outbound node "$TREE/chromium/tests/android/outbound-gate.mjs" --apk "$APK" --avd android_36_google_apis_x64 --evidence "$EVIDENCE/outbound"
sha256sum "$APK" > "$EVIDENCE/apk.sha256"
if ((${#failed[@]})); then echo "A1 gate: FAIL (${failed[*]})"; exit 1; fi
echo "A1 gate: pass"
